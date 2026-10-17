import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AttachmentBuilder, WebhookClient } from 'discord.js'
import { db, getMetadata, setMetadata } from '../db'

export const LAST_BACKUP_KEY = 'last_backup_timestamp'
const DEFAULT_INTERVAL_HOURS = 24

let scheduledTimer: ReturnType<typeof setTimeout> | null = null
let periodicInterval: ReturnType<typeof setInterval> | null = null
let isBackingUp = false

/**
 * Returns the configured Discord backup webhook URL, if any.
 */
export function getBackupWebhookUrl(): string | undefined {
  return (
    process.env.BACKUP_WEBHOOK_URL?.trim() ||
    process.env.DISCORD_BACKUP_WEBHOOK_URL?.trim() ||
    undefined
  )
}

/**
 * Returns the backup interval in milliseconds (default 24 hours).
 */
export function getBackupIntervalMs(): number {
  const hours = Number(process.env.BACKUP_INTERVAL_HOURS)
  const validHours = !isNaN(hours) && hours > 0 ? hours : DEFAULT_INTERVAL_HOURS
  return validHours * 60 * 60 * 1000
}

/**
 * Takes a safe, consistent snapshot of the SQLite database using SQLite's VACUUM INTO,
 * capturing all committed transactions (including WAL data).
 */
export async function createDatabaseBackup(): Promise<{ buffer: Buffer; filename: string }> {
  const now = new Date()
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `sqlite-backup-${dateStr}.db`
  const tempPath = join(
    tmpdir(),
    `cluelessbot-backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`
  )

  try {
    // VACUUM INTO creates a clean, checkpointed standalone SQLite file
    db.exec(`VACUUM INTO '${tempPath.replace(/'/g, "''")}';`)
    const buffer = await readFile(tempPath)
    return { buffer, filename }
  } finally {
    await unlink(tempPath).catch(() => {})
  }
}

/**
 * Sends a database file buffer to a Discord webhook URL.
 */
export async function sendBackupToWebhook(
  webhookUrl: string,
  fileBuffer: Buffer,
  filename: string
): Promise<void> {
  const sizeFormatted = (fileBuffer.byteLength / 1024).toFixed(1) + ' KB'
  const timestamp = Math.floor(Date.now() / 1000)
  const content = `📦 **SQLite Database Backup**\n📅 Date: <t:${timestamp}:F> (<t:${timestamp}:R>)\n📊 Size: \`${sizeFormatted}\``

  try {
    const webhook = new WebhookClient({ url: webhookUrl })
    await webhook.send({
      content,
      files: [
        new AttachmentBuilder(fileBuffer, {
          name: filename,
          description: 'CluelessBot SQLite Database Backup',
        }),
      ],
    })
  } catch (err: any) {
    // If WebhookClient fails due to URL validation (e.g. non-standard or proxy URLs), fall back to fetch + FormData
    if (err?.code === 'WebhookURLInvalid') {
      const formData = new FormData()
      formData.append('content', content)
      formData.append('files[0]', new Blob([fileBuffer]), filename)

      const response = await fetch(webhookUrl, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Webhook fetch failed: ${response.status} ${response.statusText}`)
      }
      return
    }

    throw err
  }
}

/**
 * Performs a single backup run. If webhook is configured, snapshots DB, sends to webhook,
 * and records last backup timestamp in bot_metadata.
 */
export async function performBackup(): Promise<boolean> {
  const webhookUrl = getBackupWebhookUrl()
  if (!webhookUrl) {
    console.warn('[Backup] No BACKUP_WEBHOOK_URL configured. Skipping backup.')
    return false
  }

  if (isBackingUp) {
    console.warn('[Backup] Backup is already in progress, skipping overlapping run.')
    return false
  }

  isBackingUp = true
  try {
    console.log('[Backup] Starting SQLite database backup...')
    const { buffer, filename } = await createDatabaseBackup()
    await sendBackupToWebhook(webhookUrl, buffer, filename)

    setMetadata(LAST_BACKUP_KEY, String(Date.now()))
    console.log(`[Backup] SQLite database backup successfully sent to Discord webhook (${filename}, ${(buffer.byteLength / 1024).toFixed(1)} KB).`)
    return true
  } catch (err) {
    console.error('[Backup] Failed to send database backup to Discord webhook:', err)
    return false
  } finally {
    isBackingUp = false
  }
}

function scheduleNextRun(delayMs: number): void {
  if (scheduledTimer) {
    clearTimeout(scheduledTimer)
    scheduledTimer = null
  }

  scheduledTimer = setTimeout(async () => {
    scheduledTimer = null
    const success = await performBackup()
    const intervalMs = getBackupIntervalMs()
    // If failed, retry in 5 minutes; if succeeded, schedule for the next interval
    const nextDelay = success ? intervalMs : Math.min(5 * 60 * 1000, intervalMs)
    scheduleNextRun(nextDelay)
  }, delayMs)
}

/**
 * Periodic tick to guard against system clock jumps, sleep, or timer drift.
 */
function checkBackupSchedule(): void {
  const webhookUrl = getBackupWebhookUrl()
  if (!webhookUrl) return

  const lastBackupStr = getMetadata(LAST_BACKUP_KEY)
  const lastBackupTime = lastBackupStr ? Number(lastBackupStr) : 0
  const intervalMs = getBackupIntervalMs()
  const elapsed = Date.now() - lastBackupTime

  if (elapsed >= intervalMs) {
    console.log('[Backup] Backup is due (elapsed time exceeded interval). Executing now.')
    performBackup().then((success) => {
      const nextDelay = success ? intervalMs : Math.min(5 * 60 * 1000, intervalMs)
      scheduleNextRun(nextDelay)
    })
  }
}

/**
 * Initializes the daily SQLite database backup service.
 */
export function initBackup(): void {
  const webhookUrl = getBackupWebhookUrl()
  if (!webhookUrl) {
    console.log('[Backup] No BACKUP_WEBHOOK_URL configured in environment. Daily backup service is disabled.')
    return
  }

  const intervalMs = getBackupIntervalMs()
  const lastBackupStr = getMetadata(LAST_BACKUP_KEY)
  const lastBackupTime = lastBackupStr ? Number(lastBackupStr) : 0
  const elapsed = Date.now() - lastBackupTime

  console.log(`[Backup] Initialized. Backup interval: ${(intervalMs / (1000 * 60 * 60)).toFixed(1)} hours.`)

  if (!lastBackupTime || elapsed >= intervalMs) {
    // Initial run on startup if never backed up or interval has elapsed
    console.log('[Backup] No recent backup found. Triggering initial backup in 2 seconds...')
    scheduleNextRun(2_000)
  } else {
    const remainingMs = Math.max(1_000, intervalMs - elapsed)
    const minutesRemaining = Math.round(remainingMs / (1000 * 60))
    console.log(`[Backup] Last backup was at ${new Date(lastBackupTime).toISOString()}. Next backup scheduled in ~${minutesRemaining} minutes.`)
    scheduleNextRun(remainingMs)
  }

  // Periodic safety check every 15 minutes
  if (!periodicInterval) {
    periodicInterval = setInterval(checkBackupSchedule, 15 * 60 * 1000)
  }
}

/**
 * Stops scheduled backup timers and checks.
 */
export function stopBackup(): void {
  if (scheduledTimer) {
    clearTimeout(scheduledTimer)
    scheduledTimer = null
  }
  if (periodicInterval) {
    clearInterval(periodicInterval)
    periodicInterval = null
  }
}

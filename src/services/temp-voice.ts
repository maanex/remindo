import { ChannelType, PermissionFlagsBits, type Client, type VoiceChannel } from 'discord.js'
import { db, type TemporaryChannel } from '../db'

const DELETION_GRACE_PERIOD_MS = 30_000 // 30 seconds

const deletionTimers = new Map<string, NodeJS.Timeout>()

// --- Database Helpers ---

export function addTemporaryChannel(id: string, ownerId: string, guildId: string): void {
  db.query(`
    INSERT OR REPLACE INTO temporary_channel (id, owner_id, guild_id, created_at)
    VALUES ($id, $owner_id, $guild_id, $created_at)
  `).run({
    $id: id,
    $owner_id: ownerId,
    $guild_id: guildId,
    $created_at: Date.now(),
  })
}

export function removeTemporaryChannel(id: string): void {
  cancelDeletion(id)
  db.query(`DELETE FROM temporary_channel WHERE id = $id`).run({ $id: id })
}

export function isTemporaryChannel(id: string): boolean {
  const row = db.query(`SELECT 1 FROM temporary_channel WHERE id = $id`).get({ $id: id })
  return !!row
}

export function getTemporaryChannelsByOwner(guildId: string, ownerId: string): TemporaryChannel[] {
  return db.query(`
    SELECT * FROM temporary_channel 
    WHERE guild_id = $guild_id AND owner_id = $owner_id
  `).all({
    $guild_id: guildId,
    $owner_id: ownerId,
  }) as TemporaryChannel[]
}

export function getAllTemporaryChannels(): TemporaryChannel[] {
  return db.query(`SELECT * FROM temporary_channel`).all() as TemporaryChannel[]
}

// --- Timers & Deletion Lifecycle ---

export function scheduleDeletion(channel: VoiceChannel, delayMs = DELETION_GRACE_PERIOD_MS): void {
  if (deletionTimers.has(channel.id)) {
    return
  }

  const timer = setTimeout(async () => {
    deletionTimers.delete(channel.id)

    try {
      // Re-fetch channel to get fresh member list
      const freshChannel = await channel.guild.channels.fetch(channel.id).catch(() => null)
      if (freshChannel && freshChannel.isVoiceBased()) {
        if (freshChannel.members.size === 0) {
          removeTemporaryChannel(channel.id)
          await freshChannel.delete().catch(() => null)
        }
      } else {
        removeTemporaryChannel(channel.id)
      }
    } catch (err) {
      removeTemporaryChannel(channel.id)
    }
  }, delayMs)

  deletionTimers.set(channel.id, timer)
}

export function cancelDeletion(channelId: string): void {
  const timer = deletionTimers.get(channelId)
  if (timer) {
    clearTimeout(timer)
    deletionTimers.delete(channelId)
  }
}

// --- Channel Creation Helper ---

export function generateChannelName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let suffix = ''
  for (let i = 0; i < 2; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)]
  }
  return `channel-${suffix}`
}

export async function createTemporaryVoiceChannel(params: {
  guild: VoiceChannel['guild']
  categoryId: string
  member: NonNullable<VoiceChannel['members']['first']>
}): Promise<VoiceChannel> {
  const { guild, categoryId, member } = params

  const channel = await guild.channels.create({
    name: generateChannelName(),
    type: ChannelType.GuildVoice,
    parent: categoryId,
    userLimit: 16,
    bitrate: guild.maximumBitrate,
    permissionOverwrites: [
      {
        id: member.id,
        allow: [PermissionFlagsBits.ManageChannels],
      },
    ],
  })

  addTemporaryChannel(channel.id, member.id, guild.id)
  return channel
}

// --- Startup Cleanup & Monitoring ---

export async function initTempVoice(client: Client): Promise<void> {
  const channels = getAllTemporaryChannels()

  for (const record of channels) {
    try {
      const channel = await client.channels.fetch(record.id).catch(() => null)
      if (!channel || !channel.isVoiceBased()) {
        removeTemporaryChannel(record.id)
        continue
      }

      const voiceChannel = channel as VoiceChannel
      if (voiceChannel.members.size === 0) {
        removeTemporaryChannel(record.id)
        await voiceChannel.delete().catch(() => null)
      }
    } catch {
      removeTemporaryChannel(record.id)
    }
  }
}


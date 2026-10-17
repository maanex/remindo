import { ChannelType, PermissionFlagsBits, type Client, type VoiceChannel } from 'discord.js'
import { db, type TemporaryChannel } from '../db'

const DELETION_GRACE_PERIOD_MS = 10_000 // 10 seconds

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
          await freshChannel.delete().catch((err) => {
            console.error(`Failed to delete temporary channel ${channel.id}:`, err)
          })
          removeTemporaryChannel(channel.id)
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
  const botId = guild.client.user?.id ?? guild.members.me?.id

  const channel = await guild.channels.create({
    name: generateChannelName(),
    type: ChannelType.GuildVoice,
    parent: categoryId,
    userLimit: 16,
    bitrate: guild.maximumBitrate,
    permissionOverwrites: [
      ...(botId
        ? [
            {
              id: botId,
              allow: [PermissionFlagsBits.ManageChannels],
            },
          ]
        : []),
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

export async function cleanupOrphanedChannels(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    try {
      const channels = await guild.channels.fetch().catch(() => null)
      if (!channels) continue

      // Find all categories containing a hub channel (starts with ➕)
      const hubCategoryIds = new Set<string>()
      for (const ch of channels.values()) {
        if (ch && ch.isVoiceBased() && ch.parentId && ch.name.trim().startsWith('➕')) {
          hubCategoryIds.add(ch.parentId)
        }
      }

      // Check all channels in those categories matching channel-xx
      for (const ch of channels.values()) {
        if (!ch || !ch.isVoiceBased() || !ch.parentId) continue
        if (hubCategoryIds.has(ch.parentId) && /^channel-[a-z0-9]{2}$/.test(ch.name)) {
          const voiceCh = ch as VoiceChannel
          if (voiceCh.members.size === 0) {
            await voiceCh.delete().catch(() => null)
            removeTemporaryChannel(voiceCh.id)
          }
        }
      }
    } catch (err) {
      console.error(`Failed to cleanup orphaned channels in guild ${guild.id}:`, err)
    }
  }
}

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
        await voiceChannel.delete().catch(() => null)
        removeTemporaryChannel(record.id)
      }
    } catch {
      removeTemporaryChannel(record.id)
    }
  }

  // Also clean up any orphaned empty temp channels created previously that aren't in DB
  await cleanupOrphanedChannels(client)
}


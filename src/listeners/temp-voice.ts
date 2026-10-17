import { type Channel, type VoiceChannel, type VoiceState } from 'discord.js'
import { cancelDeletion, createTemporaryVoiceChannel, getTemporaryChannelsByOwner, isTemporaryChannel, removeTemporaryChannel, scheduleDeletion } from '../services/temp-voice'

export async function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  const member = newState.member ?? oldState.member
  if (!member || member.user.bot) return

  // 1. If someone left or moved away from a temporary channel
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    if (isTemporaryChannel(oldState.channelId)) {
      const oldChannel = oldState.channel
      if (oldChannel && oldChannel.isVoiceBased() && oldChannel.members.size === 0) {
        scheduleDeletion(oldChannel as VoiceChannel)
      }
    }
  }

  // 2. If someone joined an existing temporary channel that had a pending deletion, cancel it
  if (newState.channelId && isTemporaryChannel(newState.channelId)) {
    cancelDeletion(newState.channelId)
  }

  // 3. If someone joined or switched into a hub channel
  const currentChannel = newState.channel
  if (currentChannel && currentChannel.isVoiceBased()) {
    const isHub = currentChannel.name.trim().startsWith('➕')

    if (isHub) {
      // Must be inside a category
      const categoryId = currentChannel.parentId
      if (!categoryId) {
        return
      }

      const guild = currentChannel.guild

      // Check if user has existing temporary channels in this guild
      const existingOwned = getTemporaryChannelsByOwner(guild.id, member.id)
      for (const owned of existingOwned) {
        try {
          const ch = await guild.channels.fetch(owned.id).catch(() => null)
          if (ch && ch.isVoiceBased()) {
            // If empty, delete instantly
            if (ch.members.size === 0) {
              removeTemporaryChannel(owned.id)
              await ch.delete().catch(() => null)
            }
            // If occupied, ignore and leave it alone
          } else {
            removeTemporaryChannel(owned.id)
          }
        } catch {
          removeTemporaryChannel(owned.id)
        }
      }

      // Create new temporary channel in the same category
      try {
        const newVoice = await createTemporaryVoiceChannel({
          guild,
          categoryId,
          member,
        })

        // Move the member to the newly created channel
        await newState.setChannel(newVoice).catch(async (err) => {
          console.error(`Failed to move member ${member.id} to new temp channel:`, err)
          // If moving failed, schedule deletion as safety net
          scheduleDeletion(newVoice)
        })
      } catch (err) {
        console.error('Failed to create temporary voice channel:', err)
      }
    }
  }
}

export function handleChannelDelete(channel: Channel): void {
  if (isTemporaryChannel(channel.id)) {
    removeTemporaryChannel(channel.id)
  }
}


import { describe, expect, it, mock } from 'bun:test'
import { ChannelType, PermissionFlagsBits } from 'discord.js'
import { createTemporaryVoiceChannel, isTemporaryChannel, removeTemporaryChannel } from './temp-voice'

describe('createTemporaryVoiceChannel', () => {
  it('grants ManageChannels to both the bot and the member', async () => {
    let capturedOptions: any = null

    const fakeGuild = {
      id: 'guild-123',
      maximumBitrate: 96000,
      client: {
        user: { id: 'bot-999' },
      },
      members: {
        me: { id: 'bot-999' },
      },
      channels: {
        create: mock(async (options: any) => {
          capturedOptions = options
          return {
            id: 'temp-ch-123',
            guild: fakeGuild,
          }
        }),
      },
    }

    const fakeMember = {
      id: 'user-456',
    }

    const channel = await createTemporaryVoiceChannel({
      guild: fakeGuild as any,
      categoryId: 'category-789',
      member: fakeMember as any,
    })

    expect(channel.id).toBe('temp-ch-123')
    expect(capturedOptions).toBeDefined()
    expect(capturedOptions.type).toBe(ChannelType.GuildVoice)
    expect(capturedOptions.parent).toBe('category-789')
    expect(capturedOptions.permissionOverwrites).toEqual([
      {
        id: 'bot-999',
        allow: [PermissionFlagsBits.ManageChannels],
      },
      {
        id: 'user-456',
        allow: [PermissionFlagsBits.ManageChannels],
      },
    ])

    // Cleanup DB entry created by addTemporaryChannel
    expect(isTemporaryChannel('temp-ch-123')).toBe(true)
    removeTemporaryChannel('temp-ch-123')
    expect(isTemporaryChannel('temp-ch-123')).toBe(false)
  })

  it('falls back to guild.members.me.id if client.user is not yet available', async () => {
    let capturedOptions: any = null

    const fakeGuild = {
      id: 'guild-123',
      maximumBitrate: 96000,
      client: {
        user: null,
      },
      members: {
        me: { id: 'bot-member-888' },
      },
      channels: {
        create: mock(async (options: any) => {
          capturedOptions = options
          return {
            id: 'temp-ch-456',
            guild: fakeGuild,
          }
        }),
      },
    }

    const fakeMember = {
      id: 'user-456',
    }

    await createTemporaryVoiceChannel({
      guild: fakeGuild as any,
      categoryId: 'category-789',
      member: fakeMember as any,
    })

    expect(capturedOptions.permissionOverwrites).toEqual([
      {
        id: 'bot-member-888',
        allow: [PermissionFlagsBits.ManageChannels],
      },
      {
        id: 'user-456',
        allow: [PermissionFlagsBits.ManageChannels],
      },
    ])

    removeTemporaryChannel('temp-ch-456')
  })
})

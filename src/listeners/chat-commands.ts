import { MessageFlags, type Message } from 'discord.js'
import { resolveTimeRules } from '../lib/resolve-time'
import { createReminder } from '../lib/create-reminder'
import { renderCordoComponents } from '../lib/cordo'
import { truncateString } from '../lib/text'

export type ParsedChatReminder = {
  when: string
  title?: string
}

export async function splitTimeAndTitle(input: string): Promise<ParsedChatReminder> {
  if (input.includes(';')) {
    const [ when, ...titleParts ] = input.split(';')
    return {
      when: when!.trim(),
      title: titleParts.join(';').trim() || undefined
    }
  }

  const parts = input.trim().split(' ')

  if (parts.length === 1) {
    return {
      when: parts[0]!
    }
  }

  if (/^(\d+)([a-zA-Z]+)+$/.test(parts[0]!) && !/^(\d+)([a-zA-Z]+)+$/.test(parts[1] ?? '') && !input.toLowerCase().includes(' and ') && !input.toLowerCase().includes(' und ')) {
    return {
      when: parts[0]!,
      title: parts.slice(1).join(' ').trim() || undefined
    }
  }

  const outer = await resolveTimeRules(input, { maxItems: 10 })
  const largestI = Math.max(...outer.map(e => e.labelStart), parts[0]!.length)
  return largestI <= 0 ? {
    when: input.trim()
  } : {
    when: input.slice(0, largestI).trim(),
    title: input.slice(largestI).trim() || undefined
  }
}

async function react(message: Message, emoji = '❌'): Promise<void> {
  try {
    await message.react(emoji)
  } catch {}
}

export async function handleChatMessage(message: Message): Promise<void> {
  if (message.author.bot)
    return
  const lowerStart = message.content.trim().toLowerCase()
  if (!lowerStart.startsWith('!remindme') && !lowerStart.startsWith('!rm') && !lowerStart.startsWith('!remindkev'))
    return

  // content without !remindme or !rm prefix
  const content = message.content.slice(message.content.split(' ')[0]!.length).trim()
  if (!content)
    return react(message, '❔')

  const parsed = await splitTimeAndTitle(content)
  if (!parsed?.when)
    return react(message)

  if (!parsed.title && message.reference?.messageId) {
    try {
      const refMessage = await message.channel.messages.fetch(message.reference.messageId)
      if (refMessage?.content)
        parsed.title = `[${truncateString(refMessage.content, 200).trim()}](${refMessage.url})`
    } catch {}
  }

  // console.log(await resolveTimeRules(parsed.when, { maxItems: 10 }))

  try {
    const result = await createReminder({
      whenInput: parsed.when,
      title: parsed.title,
      channelId: message.channelId,
      guildId: message.guildId ?? null,
      userId: message.author.id,
      sourceId: message.id,
    })

    await message.reply({
      components: renderCordoComponents(result.components) as any,
      flags: MessageFlags.IsComponentsV2,
      failIfNotExists: false,
      allowedMentions: { repliedUser: false },
    })
  } catch {
    return react(message)
  }
}

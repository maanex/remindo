import { MessageFlags, type Message } from 'discord.js'
import { resolveTimeRules } from '../lib/resolve-time'
import { createReminder } from '../lib/create-reminder'
import { renderCordoComponents } from '../lib/cordo'

export type ParsedChatReminder = {
  when: string
  title?: string
}

async function splitTimeAndTitle(input: string): Promise<ParsedChatReminder> {
  const parts = input.trim().split(' ')

  if (parts.length === 1) {
    return {
      when: parts[0]!
    }
  }

  let previousResule: string | null = null
  let largestI = 0
  for (let i = 1; i <= parts.length; i++) {
    if (i - largestI > 3) break // if the three last words didn't affect the result at all we can stop checking probably

    const whenCandidate = parts.slice(0, i).join(' ')
    const resolvedEntries = await resolveTimeRules(whenCandidate, { maxItems: 10 })

    // resule is a new word i made up
    const resule = [
      String(resolvedEntries.length),
      ...resolvedEntries.map(e => `${e.time}${e.rrule??'-'}`)
    ].join(',')
    if (resule !== previousResule && resolvedEntries.every(e => e.time > Date.now())) {
      previousResule = resule
      largestI = i
    }

    // console.log(resule, new Date(resolvedEntries[0]!.time))
  }

  return {
    when: parts.slice(0, largestI).join(' ').trim(),
    title: parts.slice(largestI).join(' ').trim() || undefined
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
    })
  } catch {
    return react(message)
  }
}

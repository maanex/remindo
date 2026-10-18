import { button, section, text, type CordoComponent } from "cordo/components"
import { goto } from "cordo/functions"
import { resolveTimeRules } from "./resolve-time"
import { registerReminder } from "../services/reminders"

export type CreateReminderParams = {
  whenInput: string
  title?: string | null
  channelId: string | null
  guildId: string | null
  userId: string
  sourceId?: string | null
  referenceDate?: Date
}

export type CreateReminderResult = {
  registeredIds: string[]
  registeredTimes: number[]
  detectedRrule: string | null
  messageText: string
  components: CordoComponent[]
}

export async function createReminder(params: CreateReminderParams): Promise<CreateReminderResult> {
  if (!params.channelId)
    throw new Error('❌ Unable to determine channel to set reminder in.')

  const resolvedEntries = await resolveTimeRules(params.whenInput, {
    referenceDate: params.referenceDate ?? new Date(),
    maxItems: 10,
  })

  if (resolvedEntries.length === 0)
    throw new Error(`❌ Unable to parse time \`${params.whenInput}\`.`)

  const registeredIds: string[] = []
  const registeredTimes: number[] = []
  let detectedRrule: string | null = null

  for (const entry of resolvedEntries) {
    if (entry.rrule)
      detectedRrule = entry.rrule

    const id = await registerReminder({
      time: entry.time,
      title: params.title ?? undefined,
      channel_id: params.channelId,
      guild_id: params.guildId ?? null,
      source_id: params.sourceId ?? null,
      rrule: entry.rrule,
      user_id: params.userId,
    })

    registeredIds.push(id)
    registeredTimes.push(entry.time)
  }

  const subParam = registeredIds.join(',')
  const subscribeButton = button()
    // .label('Remind me too')
    .emoji({ id: '1561476169767854190' })
    .onClick(goto(`reminders/${subParam}/subscribe`, { private: true, asReply: true }))

  const recurrenceNote = detectedRrule ? ' 🔄' : ''
  const topic = params.title ? `about **${params.title}** ` : ''

  const messageText = registeredTimes.length === 1
    ? `I'll remind you ${topic}<t:${Math.floor(registeredTimes[0]! / 1000)}:R>${recurrenceNote}`
    : [
        `I'll remind you ${topic}${recurrenceNote}`,
        ...registeredTimes.slice(0, 10).map(t => `- <t:${Math.floor(t / 1000)}:R>`),
        ...(registeredTimes.length > 10 ? [`- ... and ${registeredTimes.length - 10} more`] : []),
      ].join('\n')

  // const components = container(
  //   text(messageText),
  //   subscribeButton,
  // )
  const components = [
    section(
      text(messageText)
    ).decorate(subscribeButton)
  ]

  return {
    registeredIds,
    registeredTimes,
    detectedRrule,
    messageText,
    components,
  }
}

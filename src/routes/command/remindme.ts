import { enforcePrivateResponse, text } from "cordo/components"
import { defineCordoCommand, defineCordoRoute } from "cordo/core"
import { ackAndFetchReply } from "../../lib/cordo"
import { createReminder } from "../../lib/create-reminder"

const route = defineCordoRoute(async i => {
  if (i.source !== 'command') return

  const whenInput = (i.command.options.when as string).trim()
  const title = i.command.options.about ? String(i.command.options.about).trim() : undefined

  const channelId = i.channel?.id ?? i.rawInteraction.channel_id ?? null
  const guildId = i.guild?.id ?? i.rawInteraction.guild_id ?? null

  let sourceId = i.command.type === 'message'
    ? i.command.target.id
    : (await ackAndFetchReply(i))?.id ?? null

  try {
    const result = await createReminder({
      whenInput,
      title,
      channelId,
      guildId,
      userId: i.user.id,
      sourceId,
    })

    i.render(...result.components)
  } catch (err: any) {
    i.render(
      enforcePrivateResponse(),
      text(err?.message || '❌ Failed to create reminder.'),
    )
  }
})

export default defineCordoCommand({
  type: 'chat',
  name: 'remindme',
  description: 'Set a reminder',
  limitInstallTypes: ['guild', 'user'],
  limitContexts: ['guild', 'dm', 'group'],
  options: [
    {
      type: 'string',
      name: 'when',
      description: 'When should I remind you? (e.g. "in 10m", "tomorrow at 5pm", "every monday at 9am")',
      required: true,
    },
    {
      type: 'string',
      name: 'about',
      description: 'What do you want to be reminded about?',
      required: false,
    },
  ],
  route,
})


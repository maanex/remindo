import { button, container, section, text } from "cordo/components"
import { defineCordoCommand, defineCordoRoute } from "cordo/core"
import { goto, run } from "cordo/functions"
import type { TextChannel } from "discord.js"
import { formatReminderTimestamp } from "../../lib/format-timestamp"
import { formatRecurrence } from "../../lib/recurrence"
import { truncateString } from "../../lib/text"
import { formatReminderTitle, getDiscordClient, getRemindersForUser } from "../../services/reminders"

const route = defineCordoRoute(async i => {
  const reminders = await getRemindersForUser(i.user.id)

  if (!reminders || reminders.length === 0) {
    i.render(
      container(
        text('Your Reminders').size('h3'),
        text('*You currently have no active reminders.*'),
      ),
    )
    return
  }

  const isEditing = i.locals.has('edit')
  const client = getDiscordClient()

  const reminderItems = reminders.map(r => {
    const timeTag = formatReminderTimestamp(r.time)
    const truncatedTitle = truncateString(r.title ?? '', 25)
    const titleText = formatReminderTitle(truncatedTitle || null, r.snooze_count)
    const recurrenceInfo = r.rrule ? ` \`🔄 ${formatRecurrence(r.rrule)}\`` : ''

    const channel = client?.channels?.resolve?.(r.channel_id) as TextChannel | null | undefined
    const targetGuild = r.guild_id ?? channel?.guildId ?? (i.location === 'guild' && i.channel?.id === r.channel_id ? i.guild.id : null)
    const jumpScope = targetGuild ?? '@me'

    const line = `${timeTag} ${titleText}${recurrenceInfo}`
    const jumpUrl = r.source_id
      ? `https://discord.com/channels/${jumpScope}/${r.channel_id}/${r.source_id}`
      : `https://discord.com/channels/${jumpScope}/${r.channel_id}`

    const formatted = `[**🡥**](${jumpUrl}) ${line}`

    if (!isEditing)
      return text(formatted)

    return section(
      text(formatted),
    ).decorate(
      button()
        .emoji('❌')
        .style('secondary')
        .onClick(goto(`reminders/${r.id}/cancel`, { private: true })),
    )
  }).slice(0, isEditing ? 10 : 25)

  const header = isEditing
    ? text('Your Reminders').size('h3')
    : section(
        text('Your Reminders').size('h3'),
      ).decorate(
        button()
          .label('Edit')
          .style('secondary')
          .onClick(
            run('utils/with-local-true/edit', { wait: true }),
            goto('command/reminders', { private: true }),
          ),
      )

  i.render(
    container(
      header,
      ...reminderItems,
    ),
  )
})

export default defineCordoCommand({
  type: 'chat',
  name: 'reminders',
  description: 'View and manage your active reminders',
  limitInstallTypes: ['guild', 'user'],
  limitContexts: ['guild', 'dm', 'group'],
  private: true,
  route,
})

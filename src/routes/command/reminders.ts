import { button, container, row, section, text } from "cordo/components"
import { defineCordoCommand, defineCordoRoute } from "cordo/core"
import { goto, run } from "cordo/functions"
import { formatReminderTimestamp } from "../../lib/format-timestamp"
import { formatRecurrence } from "../../lib/recurrence"
import { truncateString } from "../../lib/text"
import { formatReminderTitle, getReminderJumpUrl, getRemindersForUser } from "../../services/reminders"

const route = defineCordoRoute(async i => {
  const reminders = await getRemindersForUser(i.user.id)
  const hasReminders = reminders.length > 0
  const isEditing = hasReminders && i.locals.has('edit')

  const reminderItems = reminders.map(r => {
    const timeTag = formatReminderTimestamp(r.time)
    const truncatedTitle = truncateString(r.title ?? '', 25)
    const titleText = formatReminderTitle(truncatedTitle || null, r.snooze_count)
    const recurrenceInfo = r.rrule ? ` \`🔄 ${formatRecurrence(r.rrule)}\`` : ''

    const fallbackGuild = i.location === 'guild' && i.channel?.id === r.channel_id ? i.guild.id : null
    const jumpUrl = getReminderJumpUrl(r, fallbackGuild)
    const formatted = `[**🡥**](${jumpUrl}) ${timeTag} ${titleText}${recurrenceInfo}`

    if (!isEditing)
      return text(formatted)

    return section(
      text(formatted),
    ).decorate(
      button()
        .emoji('❌')
        .style('secondary')
        .onClick(
          run(`reminders/${r.id}/cancel`, { wait: true }),
          run('utils/with-local-true/edit', { wait: true }),
          goto('.', { private: true }),
        ),
    )
  }).slice(0, isEditing ? 10 : 25)

  const editButton = isEditing
    ? button()
        .label('Done')
        .style('primary')
        .onClick(goto('.', { private: true }))
    : button()
        .label('Edit')
        .style('secondary')
        .onClick(
          run('utils/with-local-true/edit', { wait: true }),
          goto('.', { private: true }),
        )

  const icalButton = button()
    .label('Ical Link')
    .style('secondary')
    .disabled(isEditing)
    .onClick(goto('reminders/ical-links'))

  i.render(
    container(
      text('Your Reminders').size('h3'),
      ...(hasReminders
        ? reminderItems
        : [ text('*You currently have no active reminders.*') ]),
      hasReminders
        ? row(editButton, icalButton)
        : row(icalButton),
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

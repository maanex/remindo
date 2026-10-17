import { enforcePrivateResponse, text } from "cordo/components"
import { defineCordoRoute } from "cordo/core"
import { buildReminderComponents, getReminder, registerReminder } from "../../../services/reminders"
import { ms } from "../../../lib/ms"


export default defineCordoRoute(async i => {
  const reminderId = i.params.id
  if (!reminderId)
    return

  if (i.locals.has('text')) {
    i.render(
      enforcePrivateResponse(),
      text(i.locals.get('text')!),
    )
    return
  }

  const reminder = await getReminder(reminderId)
  if (!reminder) {
    i.ack()
    i.locals.set('text', 'Looks like this reminder is a relic of the past...'),
    i.goto('.', { private: true, asReply: true })
    return
  }

  // Only subscribers are allowed to snooze
  if (!reminder.subscribers.includes(i.user.id)) {
    i.ack()
    i.locals.set('text', 'Vro, this is not your reminder!')
    i.goto('.', { private: true, asReply: true })
    return
  }

  // Handle dropdown selection submit
  if (i.source === 'select') {
    const delay = i.selected?.[0] ?? ms('10m').toString()
    const delayMs = delay === 'surprise'
      ? Math.floor(Math.random() * Math.random() * ms('10d')) + ms('10m')
      : parseInt(delay, 10)
    const snoozeTime = Date.now() + delayMs
    const nextSnoozeCount = (reminder.snooze_count ?? 0) + 1

    // Keep pure original title in DB, track count via snooze_count column
    const newId = await registerReminder({
      time: snoozeTime,
      title: reminder.title,
      channel_id: reminder.channel_id,
      guild_id: reminder.guild_id,
      source_id: reminder.source_id,
      snooze_count: nextSnoozeCount,
      user_id: i.user.id,
    })

    const delayMinutes = Math.floor(delayMs / 1000 / 60)
    const delayLabel = delay === 'surprise'
      ? 'some time'
      : delayMinutes >= 60*24
        ? `${delayMinutes / 60 / 24} day${delayMinutes > 60*24 ? 's' : ''}`
        : delayMinutes >= 60
          ? `${delayMinutes / 60} hour${delayMinutes > 60 ? 's' : ''}`
          : `${delayMinutes} minutes`

    const snoozeText = `Snoozed for ${delayLabel}`
    i.render(...buildReminderComponents({ ...reminder, id: newId }, { snoozeText }))
    return
  }

  // Button click: render the select menu
  i.render(...buildReminderComponents(reminder, { snoozeOpen: true }))
})

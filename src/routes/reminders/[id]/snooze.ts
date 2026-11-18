import { enforcePrivateResponse, modal, text, textInput } from "cordo/components"
import { defineCordoRoute } from "cordo/core"
import { goto } from "cordo/functions"
import { buildReminderComponents, getReminder, registerReminder, type ReminderData } from "../../../services/reminders"
import { resolveTimeRules } from "../../../lib/resolve-time"
import { ms } from "../../../lib/ms"


// Keep pure original title in DB, track count via snooze_count column
async function snooze(reminder: ReminderData, userId: string, delayMs: number, snoozeText: string) {
  const newId = await registerReminder({
    time: Date.now() + delayMs,
    title: reminder.title,
    channel_id: reminder.channel_id,
    guild_id: reminder.guild_id,
    source_id: reminder.source_id,
    snooze_count: (reminder.snooze_count ?? 0) + 1,
    user_id: userId,
  })
  return buildReminderComponents({ ...reminder, id: newId }, { snoozeText })
}

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

  // Handle custom duration modal submit
  if (i.source === 'modal') {
    const input = String(i.selected.get('duration') ?? '').trim()
    const [ entry ] = input ? await resolveTimeRules(input, { maxItems: 1 }) : []
    const delayMs = entry ? entry.time - Date.now() : 0

    if (delayMs <= 0) {
      i.render(...buildReminderComponents(reminder, {
        snoozeOpen: true,
        snoozePlaceholder: "Couldn't parse that, try again",
      }))
      return
    }

    i.render(...await snooze(reminder, i.user.id, delayMs, `Snoozed: ${input}`))
    return
  }

  // Handle dropdown selection submit
  if (i.source === 'select') {
    const delay = i.selected?.[0] ?? ms('10m').toString()

    if (delay === 'custom') {
      i.prompt(
        modal(
          textInput()
            .as('duration')
            .withLabel('Snooze for')
            .placeholder('e.g. 45m, 1h30m, tomorrow at 9am')
            .max(100)
            .required()
        )
          .title('Custom snooze duration')
          .onSubmit(goto(`reminders/${reminder.id}/snooze`))
      )
      return
    }

    const delayMs = delay === 'surprise'
      ? Math.floor(Math.random() * Math.random() * ms('10d')) + ms('10m')
      : parseInt(delay, 10)
    const delayMinutes = Math.floor(delayMs / 1000 / 60)
    const delayLabel = delay === 'surprise'
      ? 'some time'
      : delayMinutes >= 60*24
        ? `${delayMinutes / 60 / 24} day${delayMinutes > 60*24 ? 's' : ''}`
        : delayMinutes >= 60
          ? `${delayMinutes / 60} hour${delayMinutes > 60 ? 's' : ''}`
          : `${delayMinutes} minutes`
    i.render(...await snooze(reminder, i.user.id, delayMs, `Snoozed for ${delayLabel}`))
    return
  }

  // Button click: render the select menu
  i.render(...buildReminderComponents(reminder, { snoozeOpen: true }))
})

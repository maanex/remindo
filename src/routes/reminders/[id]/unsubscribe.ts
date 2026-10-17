import { enforcePrivateResponse, text } from "cordo/components"
import { defineCordoRoute } from "cordo/core"
import { getReminder, unsubscribeUser } from "../../../services/reminders"

export default defineCordoRoute(async i => {
  const param = i.params.id
  if (!param) return

  const ids = param.split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) return

  let unsubscribedCount = 0
  for (const id of ids) {
    const reminder = await getReminder(id)
    if (reminder && reminder.subscribers.includes(i.user.id)) {
      await unsubscribeUser(i.user.id, id)
      unsubscribedCount++
    }
  }

  if (unsubscribedCount === 0) {
    i.render(
      enforcePrivateResponse(),
      text('You are no longer subscribed to this reminder.'),
    )
    return
  }

  i.render(
    enforcePrivateResponse(),
    text(ids.length > 1
      ? `Successfully unsubscribed from ${unsubscribedCount} reminder${unsubscribedCount > 1 ? 's' : ''}!`
      : 'Successfully unsubscribed from this reminder!'),
  )
})

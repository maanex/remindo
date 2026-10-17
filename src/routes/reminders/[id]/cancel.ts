import "cordo/components"
import { defineCordoRoute } from "cordo/core"
import { unsubscribeUser } from "../../../services/reminders"

export default defineCordoRoute(async i => {
  const reminderId = i.params.id
  if (reminderId) {
    await unsubscribeUser(i.user.id, reminderId)
  }

  // Keep edit mode on
  i.locals.set('edit', true)
  // Refresh the reminders view
  await i.goto('command/reminders', { private: true })
})


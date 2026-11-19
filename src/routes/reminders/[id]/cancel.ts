import { defineCordoRoute } from "cordo/core"
import { unsubscribeUser } from "../../../services/reminders"

// Used as a `run` step from the reminders list; the caller re-renders the list afterwards
export default defineCordoRoute(async i => {
  const reminderId = i.params.id
  if (reminderId) {
    await unsubscribeUser(i.user.id, reminderId)
  }
})

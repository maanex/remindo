import { button, container, enforcePrivateResponse, section, text } from "cordo/components"
import { defineCordoRoute } from "cordo/core"
import { goto } from "cordo/functions"
import { getReminder, subscribeUser } from "../../../services/reminders"

export default defineCordoRoute(async i => {
  const param = i.params.id
  if (!param) return

  const ids = param.split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) return

  const reminders = (await Promise.all(ids.map(id => getReminder(id)))).filter(Boolean)
  if (reminders.length === 0) {
    i.render(
      enforcePrivateResponse(),
      text('Looks like this reminder is a relic of the past...'),
    )
    return
  }

  // If user is already subscribed to all, allow them to unsubscribe
  const isSubscribedToAll = reminders.every(r => r!.subscribers.includes(i.user.id))
  if (isSubscribedToAll) {
    i.render(
      enforcePrivateResponse(),
      container(
        section(
          text(reminders.length > 1
            ? 'You are already subscribed to these reminders!'
            : 'You are already subscribed to this reminder!'),
        ).decorate(
          button()
            .label('Unsubscribe')
            .style('secondary')
            .onClick(goto(`reminders/${param}/unsubscribe`, { private: true })),
        ),
      ),
    )
    return
  }

  // Not yet subscribed: subscribe the user to all
  for (const rem of reminders) {
    await subscribeUser(i.user.id, rem!.id)
  }

  i.render(
    enforcePrivateResponse(),
    container(
      section(
        text(reminders.length > 1
          ? `Successfully subscribed to all ${reminders.length} reminders!`
          : 'Successfully subscribed to this reminder!'),
      ).decorate(
        button()
          .label('Unsubscribe')
          .style('secondary')
          .onClick(goto(`reminders/${param}/unsubscribe`, { private: true })),
      ),
    ),
  )
})

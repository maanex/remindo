declare module "cordo" {
  export type DynamicTypes = {
    Route: `command/remindme` | `command/reminders` | `utils/with-local-true/${string}` | `reminders/${string}/cancel` | `reminders/${string}/snooze` | `reminders/${string}/subscribe` | `reminders/${string}/unsubscribe` | `command/define`
  }
}

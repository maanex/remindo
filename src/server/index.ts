import { Hono } from 'hono'
import { buildIcalendar, verifyIcalToken, type IcalScope } from '../lib/ical'
import { getReminderJumpUrl, getRemindersByScope } from '../services/reminders'

export const app = new Hono()

app.get('/', c => c.text('ok'))

function getCalendarName(scope: IcalScope): string {
  if (scope.channelId && !scope.userId) return 'Channel Reminders'
  if (scope.guildId && scope.userId) return 'My Server Reminders'
  if (scope.guildId) return 'Server Reminders'
  return 'My Reminders'
}

app.get('/ical/:token', async c => {
  // calendar apps sometimes like a file extension, accept it optionally
  const token = c.req.param('token').replace(/\.ics$/i, '')
  const scope = await verifyIcalToken(token)
  if (!scope)
    return c.text('Invalid calendar link', 404)

  const reminders = getRemindersByScope(scope)
  const ics = buildIcalendar({
    name: getCalendarName(scope),
    events: reminders.map(r => {
      const url = getReminderJumpUrl(r)
      return {
        uid: `${r.id}@cluelessbot`,
        start: r.time,
        summary: r.title || 'Reminder',
        description: url,
        url,
        rrule: r.rrule,
        createdAt: r.created_at,
      }
    }),
  })

  return c.body(ics, 200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'inline; filename="reminders.ics"',
    'Cache-Control': 'no-cache',
  })
})

export function initServer() {
  const port = Number(process.env.PORT || 3000)
  const server = Bun.serve({ port, fetch: app.fetch })
  console.log(`HTTP server listening on :${server.port}`)
  return server
}

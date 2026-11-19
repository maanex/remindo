# bjhfuhufhefuhduahuh

Discord bot for reminders. Handles one-offs, recurring schedules, and natural language times.

## Setup

```bash
bun install
```

Create a `.env` file:

```env
CLIENT_ID=...
DISCORD_API_KEY=...
PUBLIC_KEY=...
DATABASE_URL=sqlite.db # optional
BACKUP_WEBHOOK_URL=https://discord.com/api/webhooks/... # optional: daily SQLite backup destination
PORT=3000 # optional: HTTP server port (serves /ical/{token})
PUBLIC_URL=https://bot.example.com # public base URL used for generated calendar links
ICAL_JWT_SECRET=... # optional: secret for signing calendar links (auto-generated and stored in the db if unset)
```

## Run

```bash
bun run dev
```

## Usage

- Slash command: `/remindme <when> [about]`
- Text prefix: `!rm <when> [about]` (or `!remindme`)
- List/manage: `/reminders`
- Calendar feed: `/reminders` → **Ical Link** gives subscribable iCal URLs


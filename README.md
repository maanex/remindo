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
```

## Run

```bash
bun run dev
```

## Usage

- Slash command: `/remindme <when> [about]`
- Text prefix: `!rm <when> [about]` (or `!remindme`)
- List/manage: `/reminders`


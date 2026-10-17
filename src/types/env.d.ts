
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DATABASE_URL?: string
      CLIENT_ID: string
      DISCORD_API_KEY: string
      PUBLIC_KEY: string
      BACKUP_WEBHOOK_URL?: string
      DISCORD_BACKUP_WEBHOOK_URL?: string
      BACKUP_INTERVAL_HOURS?: string
    }
  }
}
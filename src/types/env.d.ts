
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DATABASE_URL?: string
      CLIENT_ID: string
      DISCORD_API_KEY: string
      PUBLIC_KEY: string
    }
  }
}
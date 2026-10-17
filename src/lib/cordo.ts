import type { RouteRequest } from "cordo/core"
import { Extend as CompExtend } from "cordo/components"
import { Extend as CoreExtend } from "cordo/core"

/**
 * Renders an array of Cordo components into raw Discord API component structures.
 */
export function renderCordoComponents(components: any[]): any[] {
  let rendered: any[] = []
  CoreExtend.runInCordoContext(() => {
    rendered = CompExtend.renderComponentList(components, null, [], {})
  })
  return rendered
}

export type FetchedMessage = {
  id: string
  channel_id: string
  content?: string
  [key: string]: any
}

/**
 * Fetches the original interaction response message from Discord's interaction webhook endpoint.
 * Works universally across gateway and HTTP callback setups without requiring bot authorization.
 */
export async function fetchReply(i: RouteRequest, retries = 5, delayMs = 60): Promise<FetchedMessage | null> {
  const appId = i.rawInteraction.application_id
  const token = i.rawInteraction.token
  if (!appId || !token) return null

  const url = `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url)
      if (res.ok) {
        return (await res.json()) as FetchedMessage
      }
    } catch {
      // Ignore network errors while polling
    }
    if (attempt < retries - 1) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }

  return null
}

/**
 * Acknowledges (defers) the interaction and returns the created placeholder message.
 */
export async function ackAndFetchReply(i: RouteRequest): Promise<FetchedMessage | null> {
  i.ack()
  return fetchReply(i)
}


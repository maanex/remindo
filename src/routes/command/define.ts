import { container, enforcePrivateResponse, spacer, text } from "cordo/components"
import { defineCordoCommand, defineCordoRoute } from "cordo/core"
import { truncateString } from "../../lib/text"

type UrbanDefinition = {
  defid: number
  word: string
  author: string
  permalink: string
  definition: string
  example: string
  thumbs_up: number
  thumbs_down: number
  written_on?: string
}

type UrbanResponse = {
  list: UrbanDefinition[]
}

export function cleanUrbanText(input: string): string {
  if (!input) return ''
  return input
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/[\[\]]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function fetchUrbanDefinitions(term: string): Promise<UrbanDefinition[]> {
  const url = new URL('https://api.urbandictionary.com/v0/define')
  url.searchParams.set('term', term)

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'CluelessBot/1.0',
    },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok)
    throw new Error(`Urban Dictionary API returned status ${res.status}`)

  const data = (await res.json()) as UrbanResponse
  return data.list ?? []
}

const route = defineCordoRoute(async i => {
  if (i.source !== 'command') return

  const term = String(i.command.options.term ?? '').trim()
  if (!term) {
    i.render(
      enforcePrivateResponse(),
      text('❌ Please provide a word or phrase to look up.'),
    )
    return
  }

  i.ack()

  try {
    const definitions = await fetchUrbanDefinitions(term)

    if (definitions.length === 0) {
      i.render(text('couldn\'t resolve the given term :('))
      return
    }

    const entry = definitions[0]!
    const cleanedDef = truncateString(cleanUrbanText(entry.definition), 2000)
    const cleanedExample = entry.example ? truncateString(cleanUrbanText(entry.example), 1000) : ''

    i.render(
      container(
        text(`definition for [__${entry.word}__](${entry.permalink}) from *${entry.author ?? '?'}*`).size('h3'),
        // text('definition').bold(),
        text(cleanedDef || '*No definition provided.*'),
        spacer().size('small'),
        text('example').bold(),
        text(cleanedExample),
      ).accentColor(0x00ff00)
    )
  } catch (err: any) {
    i.render(
      enforcePrivateResponse(),
      text(err?.message || '❌ Failed to look up Urban Dictionary definition.'),
    )
  }
})

export default defineCordoCommand({
  type: 'chat',
  name: 'define',
  description: 'Look up a definition on Urban Dictionary',
  limitInstallTypes: ['guild', 'user'],
  limitContexts: ['guild', 'dm', 'group'],
  options: [
    {
      type: 'string',
      name: 'term',
      description: 'The word or phrase to look up',
      required: true,
    },
  ],
  route,
})

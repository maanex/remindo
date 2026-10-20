import { enforcePrivateResponse, gallery, image, text } from "cordo/components"
import { defineCordoAutocomplete, defineCordoCommand, defineCordoRoute } from "cordo/core"
import { truncateString } from "../../lib/text"
import { autocompleteXkcd, resolveBestXkcd } from "../../services/xkcd"

export function cleanAltText(alt: string): string {
  if (!alt) return ''
  return alt
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

const route = defineCordoRoute(async i => {
  if (i.source !== 'command') return

  const input = String(
    i.command.options.comic ??
    i.command.options.query ??
    i.command.options.term ??
    ''
  ).trim()

  if (!input) {
    i.render(
      enforcePrivateResponse(),
      text('❌ Please provide a comic number, title, or search query.'),
    )
    return
  }

  i.ack()

  try {
    const comic = await resolveBestXkcd(input)

    if (!comic) {
      i.render(
        enforcePrivateResponse(),
        text(`❌ Couldn't find any XKCD comic matching "${input}".`),
      )
      return
    }

    const cleanedAlt = truncateString(cleanAltText(comic.alt), 1000)
    const caption = `[#${comic.num}: ${comic.title}](https://xkcd.com/${comic.num}/)${cleanedAlt ? `\n*${cleanedAlt}*` : ''}`

    i.render(
      gallery(image(comic.img).description(cleanedAlt)),
      text(caption),
    )
  } catch (err: any) {
    i.render(
      enforcePrivateResponse(),
      text(err?.message || '❌ Failed to look up XKCD comic.'),
    )
  }
})

export default defineCordoCommand({
  type: 'chat',
  name: 'xkcd',
  description: 'Search and display an XKCD comic by number, title, or description',
  limitInstallTypes: ['guild', 'user'],
  limitContexts: ['guild', 'dm', 'group'],
  options: [
    {
      type: 'string',
      name: 'comic',
      description: 'The comic number, title, or keywords to search for',
      required: true,
      choices: defineCordoAutocomplete(async (val) => {
        return await autocompleteXkcd(String(val ?? ''))
      }),
    },
  ],
  route,
})

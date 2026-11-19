import { modal, text } from "cordo/components"
import { defineCordoRoute } from "cordo/core"
import { buildIcalUrl } from "../../lib/ical"
import { getDiscordClient } from "../../services/reminders"

export default defineCordoRoute(async i => {
  const userId = i.user.id
  const guildId = i.location === 'guild' ? i.guild.id : null
  const channelId = i.rawInteraction.channel?.id ?? i.rawInteraction.channel_id ?? null

  // Discord's partial interaction guild has no name, so fall back to the bot's guild cache
  const guildName = guildId
    ? ((i.rawInteraction.guild as { name?: string } | undefined)?.name
      ?? getDiscordClient()?.guilds.cache.get(guildId)?.name
      ?? null)
    : null
  const channelName = i.rawInteraction.channel?.name ?? null

  const sections: string[] = [
    'Subscribe to these links in your calendar app to see your reminders there. Anyone with a link can view its reminders, so keep them to yourself.',
    `### All your reminders\n\`\`\`\n${await buildIcalUrl({ userId })}\n\`\`\``,
  ]

  if (guildId) {
    sections.push(`### Your reminders in ${guildName ?? 'this server'}\n\`\`\`\n${await buildIcalUrl({ userId, guildId })}\n\`\`\``)
  }

  if (channelId) {
    sections.push(`### All reminders in ${channelName ? `#${channelName}` : 'this channel'}\n-# Includes reminders from everyone, not just yours.\n\`\`\`\n${await buildIcalUrl({ channelId })}\n\`\`\``)
  }

  i.prompt(
    modal(
      ...sections.map(s => text(s)),
    ).title('Calendar Links'),
  )
})

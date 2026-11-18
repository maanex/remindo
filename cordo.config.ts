import { defineCordoConfig } from 'cordo/core'
import { InteractionResponseType, InteractionType, MessageFlags } from 'discord.js'


export default defineCordoConfig({
  paths: {
    root: '.',
    routes: './src/routes',
    lockfile: './cordo.lock',
    types: './src/types/cordo.ts',
  },
  client: {
    id: process.env.CLIENT_ID,
  },
  omitWarnings: [
    'placeholderTextAppearance',
  ],
  hooks: {
    // Cordo always answers modal submits with a new message. When the modal was opened from a
    // component on an existing message, update that message instead (unless it's an ephemeral reply).
    onBeforeRespond: (payload, { interaction }) => {
      if (
        payload?.type === InteractionResponseType.ChannelMessageWithSource
        && interaction.type === InteractionType.ModalSubmit
        && 'message' in interaction && interaction.message
        && !((payload.data?.flags ?? 0) & MessageFlags.Ephemeral)
      ) {
        return { ...payload, type: InteractionResponseType.UpdateMessage }
      }
      return payload
    },
  },
  functDefaultFlags: {
    run: {
      privateErrorMessage: true,
    },
  },
})


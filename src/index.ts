import "cordo/components"
import { Cordo } from "cordo/core"
import { useWithDiscordJs } from "cordo/plugin/djs"
import { Client, Events, GatewayIntentBits, Partials } from "discord.js"
import { initReminders } from "./services/reminders"
import { handleChatMessage } from "./listeners/chat-commands"
import { initTempVoice } from "./services/temp-voice"
import { handleChannelDelete, handleVoiceStateUpdate } from "./listeners/temp-voice"

await Cordo.mountCordo({
  client: {
    id: String(process.env.CLIENT_ID),
    token: String(process.env.DISCORD_API_KEY),
  }
});
await Cordo.syncCommands();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [
    Partials.Channel,
  ],
});

useWithDiscordJs(client);
client.on(Events.MessageCreate, handleChatMessage);
client.on(Events.VoiceStateUpdate, handleVoiceStateUpdate);
client.on(Events.ChannelDelete, handleChannelDelete);

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user?.tag}`);
  initReminders(client);
  initTempVoice(client);
});

client.login(process.env.DISCORD_API_KEY)


import "cordo/components"
import { Cordo } from "cordo/core"
import { useWithDiscordJs } from "cordo/plugin/djs"
import { Client, Events, GatewayIntentBits, Partials } from "discord.js"
import { initReminders } from "./services/reminders"
import { handleChatMessage } from "./listeners/chat-commands"

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
  ],
  partials: [
    Partials.Channel,
  ],
});

useWithDiscordJs(client);
client.on(Events.MessageCreate, handleChatMessage);

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user?.tag}`);
  initReminders(client);
});

client.login(process.env.DISCORD_API_KEY)


require("dotenv").config();
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { loadCommands } = require("./loaders/commandLoader");
const { loadComponents } = require("./loaders/componentLoader");
const { loadEvents } = require("./loaders/eventLoader");
const { loadJobs } = require("./loaders/jobLoader");
const logger = require("./lib/logger");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent, // Required for activity tracking
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.GuildMember,
    Partials.User,
    Partials.Reaction,
  ],
});

loadCommands(client);
loadComponents(client);
loadEvents(client);
loadJobs(client);

process.on("unhandledRejection", (error) =>
  logger.error("Unhandled rejection", { error: error.message }),
);
process.on("uncaughtException", (error) =>
  logger.error("Uncaught exception", { error: error.message }),
);

client.login(process.env.DISCORD_TOKEN);

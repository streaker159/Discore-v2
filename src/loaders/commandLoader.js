const path = require("path");
const { Collection } = require("discord.js");
const { walkFiles } = require("./fileWalker");
const logger = require("../lib/logger");

function loadCommands(client) {
  client.commands = new Collection();
  const commandsRoot = path.join(__dirname, "..", "commands");
  const files = walkFiles(commandsRoot);

  for (const file of files) {
    const command = require(file);
    if (
      !command?.data?.name ||
      typeof command.execute !== "function" ||
      command.disabled
    ) {
      if (command?.disabled)
        logger.info("Skipped disabled command", { name: command?.data?.name });
      else logger.warn("Skipped invalid command", { file });
      continue;
    }
    client.commands.set(command.data.name, command);
    logger.info("Loaded command", { name: command.data.name });
  }

  return client.commands;
}

module.exports = { loadCommands };

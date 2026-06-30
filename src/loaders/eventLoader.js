const path = require("path");
const { walkFiles } = require("./fileWalker");
const logger = require("../lib/logger");

function loadEvents(client) {
  const eventsRoot = path.join(__dirname, "..", "events");
  const files = walkFiles(eventsRoot);

  for (const file of files) {
    let event;
    try {
      event = require(file);
    } catch (err) {
      logger.error("EVENT LOADER CRASH on require", {
        file,
        error: err.message,
      });
      console.error("[EVENT_LOADER CRASH]", file, err.message);
      continue;
    }
    if (!event?.name || typeof event.execute !== "function") {
      logger.warn("Skipped invalid event", { file });
      continue;
    }

    if (event.once)
      client.once(event.name, (...args) => event.execute(...args, client));
    else client.on(event.name, (...args) => event.execute(...args, client));
    logger.info("Loaded event", { name: event.name, file });

    // Extra debug for AI translation event
    if (event.name === "messageReactionAdd") {
      logger.info("EVENT LOADER: messageReactionAdd loaded from file", {
        file,
      });
      console.log("[EVENT_LOADER] messageReactionAdd sourced from:", file);
    }
  }
}

module.exports = { loadEvents };

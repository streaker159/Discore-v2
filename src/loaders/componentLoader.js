const path = require("path");
const { Collection } = require("discord.js");
const { walkFiles } = require("./fileWalker");
const logger = require("../lib/logger");

function loadComponents(client) {
  client.components = new Collection();
  const componentsRoot = path.join(__dirname, "..", "components");
  const files = walkFiles(componentsRoot);

  for (const file of files) {
    const component = require(file);
    if (
      (!component.customId && !component.customIdPrefix) ||
      typeof component.execute !== "function"
    ) {
      logger.warn("Skipped invalid component", { file });
      continue;
    }
    const key = component.customId || component.customIdPrefix;
    client.components.set(key, component);
    logger.info("Loaded component", { key });
  }

  return client.components;
}

function findComponent(client, customId) {
  if (client.components.has(customId)) return client.components.get(customId);
  // Among all prefix-matching components, pick the one with the longest prefix
  // so that e.g. "event:edit:modal:" wins over "event:edit:" for modal submits
  let best = null;
  let bestLen = -1;
  for (const component of client.components.values()) {
    if (
      component.customIdPrefix &&
      customId.startsWith(component.customIdPrefix)
    ) {
      if (component.customIdPrefix.length > bestLen) {
        bestLen = component.customIdPrefix.length;
        best = component;
      }
    }
  }
  return best;
}

module.exports = { loadComponents, findComponent };

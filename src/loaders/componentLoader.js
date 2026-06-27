"use strict";

const path = require("path");
const { Collection } = require("discord.js");
const { walkFiles } = require("./fileWalker");
const logger = require("../lib/logger");

/**
 * Load all button/select/modal components.
 *
 * Supports:
 * - exact customId: "appeal_open"
 * - dynamic IDs using colon: "appeal_open:MOD-006"
 * - customIdPrefix: "appeal_open:"
 * - arrays of components exported from one file
 */
function loadComponents(client) {
  client.components = new Collection();

  const componentsRoot = path.join(__dirname, "..", "components");
  const files = walkFiles(componentsRoot);

  for (const file of files) {
    let raw;

    try {
      delete require.cache[require.resolve(file)];
      raw = require(file);
    } catch (error) {
      logger.error("Failed to load component file", {
        file,
        error: error.message,
      });
      continue;
    }

    const components = Array.isArray(raw) ? raw : [raw];

    for (const component of components) {
      const hasExecute = typeof component?.execute === "function";
      const key =
        component?.customId ||
        component?.customIdPrefix ||
        component?.id ||
        component?.name;

      if (!key || !hasExecute) {
        logger.warn("Skipped invalid component", { file });
        continue;
      }

      client.components.set(key, component);

      /**
       * Also auto-register colon prefix.
       *
       * Example:
       * component.customId = "appeal_open"
       * button id = "appeal_open:MOD-006"
       *
       * This makes old files work without adding customIdPrefix manually.
       */
      if (component.customId && !component.customId.includes(":")) {
        const prefixKey = `${component.customId}:`;

        if (!client.components.has(prefixKey)) {
          client.components.set(prefixKey, {
            ...component,
            customIdPrefix: prefixKey,
          });
        }
      }

      if (component.id && !component.id.includes(":")) {
        const prefixKey = `${component.id}:`;

        if (!client.components.has(prefixKey)) {
          client.components.set(prefixKey, {
            ...component,
            customIdPrefix: prefixKey,
          });
        }
      }

      if (component.name && !component.name.includes(":")) {
        const prefixKey = `${component.name}:`;

        if (!client.components.has(prefixKey)) {
          client.components.set(prefixKey, {
            ...component,
            customIdPrefix: prefixKey,
          });
        }
      }

      logger.info("Loaded component", { key });
    }
  }

  return client.components;
}

/**
 * Find a component handler for an interaction customId.
 *
 * Lookup order:
 * 1. exact match: "appeal_open"
 * 2. exact dynamic fallback base: "appeal_open" from "appeal_open:MOD-006"
 * 3. explicit prefix handlers: "appeal_open:"
 * 4. longest customIdPrefix match
 */
function findComponent(client, customId) {
  if (!client?.components || !customId) {
    return null;
  }

  // 1. Exact full customId
  if (client.components.has(customId)) {
    return client.components.get(customId);
  }

  // 2. Colon base fallback
  // appeal_open:MOD-006 -> appeal_open
  const baseId = String(customId).split(":")[0];

  if (baseId && client.components.has(baseId)) {
    return client.components.get(baseId);
  }

  // 3. Colon prefix fallback
  // appeal_open:MOD-006 -> appeal_open:
  const colonPrefix = `${baseId}:`;

  if (baseId && client.components.has(colonPrefix)) {
    return client.components.get(colonPrefix);
  }

  // 4. Longest explicit prefix match
  let best = null;
  let bestLen = -1;

  for (const component of client.components.values()) {
    const prefix = component?.customIdPrefix;

    if (prefix && customId.startsWith(prefix)) {
      if (prefix.length > bestLen) {
        bestLen = prefix.length;
        best = component;
      }
    }
  }

  return best;
}

module.exports = {
  loadComponents,
  findComponent,
};

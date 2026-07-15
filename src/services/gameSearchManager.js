"use strict";

const { fetchGames } = require("./conGamesApi");
const {
  buildGameFoundEmbed,
  buildTimeoutEmbed,
  buildErrorEmbed,
} = require("../embeds/gameFinderEmbeds");
const logger = require("../lib/logger");

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_SEARCH_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const MIN_DELAY_MS = 1500; // never below 1.5s

// ── Search criteria used for deduplication ──────────────────────────────────
const TARGET_TITLE = "WORLD WAR 3 (4X SPEED)";
const TARGET_SCENARIO = "5976";
const TARGET_TIME_SCALE = 0.25;

// ── Polling delay helper ────────────────────────────────────────────────────
function getNextPollDelay() {
  const useShortDelay = Math.random() < 0.2;

  if (useShortDelay) {
    return Math.floor(1500 + Math.random() * 1500); // 1.5s – 3s
  }

  return Math.floor(3000 + Math.random() * 4000); // 3s – 7s
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Validation ──────────────────────────────────────────────────────────────
function isValidMatch(properties) {
  return (
    properties.title === TARGET_TITLE &&
    properties.scenarioID === TARGET_SCENARIO &&
    Number(properties.timeScale) === TARGET_TIME_SCALE &&
    properties.state === "readytojoin" &&
    Number(properties.openSlots) > 0 &&
    properties.passwordset !== "yes"
  );
}

// ── Search Manager (singleton) ──────────────────────────────────────────────
class GameSearchManager {
  constructor() {
    /**
     * Map of active searches keyed by userId.
     * Each value:
     * {
     *   userId: string,
     *   interaction: object,        // original interaction (for getUser)
     *   interactionToken: string,   // interaction token for webhook edits
     *   applicationId: string,
     *   cancelled: boolean,
     *   startedAt: number,
     *   timeoutTimer: NodeJS.Timeout | null,
     *   baselineIds: Set<string>,
     * }
     */
    this.activeSearches = new Map();
  }

  /**
   * Check if a user already has an active search.
   */
  hasActiveSearch(userId) {
    return this.activeSearches.has(userId);
  }

  /**
   * Get an active search for a user, or null.
   */
  getActiveSearch(userId) {
    return this.activeSearches.get(userId) || null;
  }

  /**
   * Start a new search for a user.
   * @param {object} interaction — the ChatInputCommandInteraction
   */
  async startSearch(interaction) {
    const userId = interaction.user.id;

    if (this.hasActiveSearch(userId)) {
      return { ok: false, reason: "alreadySearching" };
    }

    // ── Fetch baseline ──────────────────────────────────────────────
    let baselineIds;
    try {
      const firstGames = await fetchGames();
      baselineIds = new Set(
        firstGames.map((game) => String(game.properties.gameID)),
      );
    } catch (err) {
      logger.error("Game finder: baseline fetch failed", {
        error: err.message,
        userId,
      });
      return { ok: false, reason: "baselineFailed", error: err.message };
    }

    // ── Create search state ─────────────────────────────────────────
    const state = {
      userId,
      interaction,
      interactionToken: interaction.token,
      applicationId: interaction.applicationId,
      cancelled: false,
      startedAt: Date.now(),
      timeoutTimer: null,
      baselineIds,
    };

    // ── Timeout guard ──────────────────────────────────────────────
    state.timeoutTimer = setTimeout(() => {
      this._handleTimeout(userId);
    }, MAX_SEARCH_DURATION_MS);

    this.activeSearches.set(userId, state);

    // ── Start polling loop (fire and forget) ────────────────────────
    this._pollingLoop(userId).catch((err) => {
      logger.error("Game finder: polling loop crashed", {
        error: err.message,
        userId,
      });
      this._cleanup(userId);
    });

    logger.info("Game finder: search started", { userId });
    return { ok: true };
  }

  /**
   * Stop an active search for a user (manual stop).
   */
  stopSearch(userId) {
    const state = this.activeSearches.get(userId);
    if (!state) return false;

    state.cancelled = true;
    this._cleanup(userId);
    logger.info("Game finder: search stopped manually", { userId });
    return true;
  }

  // ── Private: polling loop ──────────────────────────────────────────────
  async _pollingLoop(userId) {
    const state = this.activeSearches.get(userId);
    if (!state) return;

    let backoffMultiplier = 0;

    while (!state.cancelled) {
      // ── Wait (with early-exit check) ─────────────────────────────
      const delay = Math.max(
        MIN_DELAY_MS,
        getNextPollDelay() * Math.pow(2, backoffMultiplier),
      );
      const maxWait = MAX_SEARCH_DURATION_MS - (Date.now() - state.startedAt);
      if (maxWait <= 0) break;

      await sleep(Math.min(delay, Math.max(MIN_DELAY_MS, maxWait)));

      if (state.cancelled) break;

      // ── Check if total time elapsed ─────────────────────────────
      if (Date.now() - state.startedAt >= MAX_SEARCH_DURATION_MS) {
        break;
      }

      // ── Fetch ────────────────────────────────────────────────────
      let games;
      try {
        games = await fetchGames();
        backoffMultiplier = 0; // reset on success
      } catch (err) {
        logger.warn("Game finder: poll fetch error", {
          error: err.message,
          userId,
        });

        // ── Fatal errors — stop immediately ──────────────────
        if (
          err.message.includes("401") ||
          err.message.includes("403") ||
          err.message.includes("authentication failed")
        ) {
          await this._updateMessage(
            userId,
            buildErrorEmbed(
              "The Conflict of Nations API returned an authentication error. The search cannot continue.",
            ),
          );
          this._cleanup(userId);
          return;
        }

        // ── Rate-limit — honour Retry-After ───────────────────
        if (err.retryAfter != null) {
          await sleep(err.retryAfter);
        } else {
          backoffMultiplier = Math.min(backoffMultiplier + 1, 5);
        }
        continue;
      }

      if (!state || state.cancelled) break;

      // ── Detect new games ─────────────────────────────────────────
      const newGames = games.filter((game) => {
        const props = game.properties;
        const gameId = String(props.gameID);

        return !state.baselineIds.has(gameId) && isValidMatch(props);
      });

      if (newGames.length > 0) {
        // Pick the newest one
        const foundGame = newGames.sort(
          (a, b) => Number(b.properties.crdate) - Number(a.properties.crdate),
        )[0];

        await this._updateMessage(
          userId,
          buildGameFoundEmbed(foundGame.properties),
        );
        this._cleanup(userId);
        logger.info("Game finder: match found", {
          userId,
          gameId: foundGame.properties.gameID,
        });
        return;
      }
    }

    // ── If we exited the loop without finding a match, it may be timeout ──
    if (state && !state.cancelled) {
      this._handleTimeout(userId);
    }
  }

  // ── Private: handle timeout ────────────────────────────────────────────
  async _handleTimeout(userId) {
    const state = this.activeSearches.get(userId);
    if (!state || state.cancelled) return;

    state.cancelled = true;
    await this._updateMessage(userId, buildTimeoutEmbed());
    this._cleanup(userId);
    logger.info("Game finder: search timed out", { userId });
  }

  // ── Private: update the Discord message ─────────────────────────────────
  async _updateMessage(userId, embed) {
    const state = this.activeSearches.get(userId);
    if (!state) return;

    // _updateMessage is only called for final results (match found,
    // timeout, or fatal error) — always strip the Stop button.
    const components = [];

    try {
      const { WebhookClient } = require("discord.js");
      const webhook = new WebhookClient({
        id: state.applicationId,
        token: state.interactionToken,
      });

      await webhook.editMessage("@original", {
        embeds: [embed],
        components,
      });
    } catch (err) {
      logger.error("Game finder: failed to edit message", {
        error: err.message,
        userId,
      });
    }
  }

  // ── Private: cleanup ───────────────────────────────────────────────────
  _cleanup(userId) {
    const state = this.activeSearches.get(userId);
    if (!state) return;

    if (state.timeoutTimer) {
      clearTimeout(state.timeoutTimer);
      state.timeoutTimer = null;
    }

    this.activeSearches.delete(userId);
  }
}

// ── Singleton instance ──────────────────────────────────────────────────────
const manager = new GameSearchManager();

module.exports = manager;

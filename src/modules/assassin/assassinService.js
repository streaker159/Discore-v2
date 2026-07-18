"use strict";

const db = require("./assassinDb");
const logger = require("../../lib/logger");
const {
  buildGameboardEmbed,
  buildKillAnnouncementEmbed,
  buildAssassinWinnerEmbed,
  buildTargetSurvivedEmbed,
  buildAssassinDmEmbed,
  buildTargetDmEmbed,
  buildSignupEmbed,
} = require("./assassinEmbeds");
const {
  getSignOnAttachment,
  getGameStartedAttachment,
  getEliminatedAttachment,
  getChampionAttachment,
  getTargetSurvivedAttachment,
} = require("./assassinAssets");
const { isOnCooldown, setCooldown } = require("./assassinCooldown");
const { updateLeaderboard } = require("./assassinLeaderboard");

const DEBUG = process.env.DEBUG_ASSASSIN === "true";

// ── Config ─────────────────────────────────────────────────────────────────

async function getConfig(guildId) {
  return db.findConfig(guildId);
}

async function ensureConfig(guildId) {
  let config = await db.findConfig(guildId);
  if (!config) config = await db.upsertConfig(guildId, {});
  return config;
}

// ── Setup Validation ───────────────────────────────────────────────────────

function validateSetup(config) {
  const issues = [];
  if (!config.gameChannelId) issues.push("No game channel selected.");
  if (config.minPlayers < 2) issues.push("Min players must be at least 2.");
  if (config.minPlayers > 20) issues.push("Max players is 20.");
  if (config.killCooldownSeconds < 30)
    issues.push("Kill cooldown must be at least 30 seconds.");
  if (config.killCooldownSeconds > 600)
    issues.push("Kill cooldown must be at most 10 minutes.");
  return issues;
}

// ── Signup Phase ───────────────────────────────────────────────────────────

async function createSignup(guildId, client) {
  const config = await getConfig(guildId);
  if (!config || !config.enabled) return null;

  const existing = await db.findActiveGame(guildId);
  if (existing) return null; // Already has an active game

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;

  const channel = guild.channels.cache.get(config.gameChannelId);
  if (!channel) return null;

  const game = await db.createGame({
    guildId,
    status: "SIGNUPS",
    startedBy: guild.ownerId, // Will be overridden by who clicked
    gameChannelId: config.gameChannelId,
    totalPlayers: 0,
    playersAlive: 0,
  });

  if (!game) return null;

  const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
  } = require("discord.js");
  const joinButton = new ButtonBuilder()
    .setCustomId("assassin:join")
    .setLabel("Join")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("🔪");
  const row = new ActionRowBuilder().addComponents(joinButton);

  const embed = buildSignupEmbed(game, 0, config.minPlayers ?? 4);

  let message;
  try {
    const signOnImage = getSignOnAttachment();
    message = await channel.send({
      embeds: [embed],
      components: [row],
      files: [signOnImage],
    });
  } catch {
    // If image fails, retry without it
    try {
      message = await channel.send({
        embeds: [embed],
        components: [row],
      });
    } catch (err) {
      logger.error("[Assassin] Failed to send signup message", {
        error: err.message,
      });
      return null;
    }
  }

  await db.updateGame(game.id, { signupMessageId: message.id });

  if (DEBUG)
    logger.info("[Assassin] Signups created", { guildId, gameId: game.id });
  return game;
}

async function joinGame(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  const game = await db.findActiveGame(guildId);
  if (!game || game.status !== "SIGNUPS") {
    return { success: false, reason: "No signups are open right now." };
  }

  const existing = await db.findPlayer(game.id, userId);
  if (existing) {
    return { success: false, reason: "You are already in this game." };
  }

  // Add player (role not assigned until hunt begins)
  await db.addPlayer({
    gameId: game.id,
    userId,
    role: "ASSASSIN", // Placeholder, will be reassigned in beginHunt
    status: "ALIVE",
  });

  const newTotal = game.totalPlayers + 1;
  await db.updateGame(game.id, {
    totalPlayers: newTotal,
    playersAlive: newTotal,
  });

  // Update signup embed
  const config = await getConfig(guildId);
  if (game.signupMessageId && config?.gameChannelId) {
    try {
      const guild = interaction.client.guilds.cache.get(guildId);
      if (guild) {
        const channel = guild.channels.cache.get(config.gameChannelId);
        if (channel) {
          const msg = await channel.messages
            .fetch(game.signupMessageId)
            .catch(() => null);
          if (msg) {
            const embed = buildSignupEmbed(
              game,
              newTotal,
              config.minPlayers ?? 4,
            );
            await msg.edit({ embeds: [embed] }).catch(() => {});
          }
        }
      }
    } catch {}
  }

  if (DEBUG)
    logger.info("[Assassin] Player joined", {
      guildId,
      userId,
      gameId: game.id,
    });
  return { success: true, players: newTotal };
}

// ── Begin Hunt ─────────────────────────────────────────────────────────────

async function beginHunt(guildId, client) {
  const config = await getConfig(guildId);
  if (!config?.enabled)
    return { success: false, reason: "Assassin is not enabled." };

  const game = await db.findActiveGame(guildId);
  if (!game || game.status !== "SIGNUPS") {
    return { success: false, reason: "No game in signups phase." };
  }

  if (game.totalPlayers < (config.minPlayers ?? 4)) {
    return {
      success: false,
      reason: `Need at least ${config.minPlayers} players.`,
    };
  }

  // Fetch all joined players
  const players = await db.findPlayersByGame(game.id);
  if (players.length < 2) {
    return { success: false, reason: "Not enough players." };
  }

  // Randomly assign roles: 1 TARGET, rest ASSASSINS
  const shuffled = players.sort(() => Math.random() - 0.5);
  const target = shuffled[0];

  const guild = client?.guilds?.cache?.get(guildId);
  if (!guild) return { success: false, reason: "Guild not found." };

  const channel = guild.channels.cache.get(config.gameChannelId);
  if (!channel) return { success: false, reason: "Game channel not found." };

  // ── DO ALL PERSISTENT WORK BEFORE CHANGING STATUS ──
  // If anything fails, the game stays in SIGNUPS and admin can retry.

  // Update target's role
  const prisma = require("../../lib/prisma");
  await prisma.$executeRawUnsafe(
    `UPDATE "AssassinPlayer" SET "role" = CAST('TARGET' AS "AssassinRole") WHERE "id" = $1`,
    target.id,
  );

  // Get display names for the DM (only show names, not who is target)
  const playerMentions = [];
  for (const p of players) {
    try {
      const member = await guild.members.fetch(p.userId).catch(() => null);
      playerMentions.push(member ? `<@${p.userId}>` : `Unknown (${p.userId})`);
    } catch {
      playerMentions.push(`<@${p.userId}>`);
    }
  }

  // Send DMs to each player
  for (const p of players) {
    try {
      const member = await guild.members.fetch(p.userId).catch(() => null);
      if (!member) continue;

      const isTarget = p.id === target.id;
      const embed = isTarget
        ? buildTargetDmEmbed(playerMentions)
        : buildAssassinDmEmbed(playerMentions);

      if (config.dmEnabled) {
        try {
          await member.send({ embeds: [embed] }).catch(async () => {
            if (channel) {
              await channel
                .send({
                  content: `<@${p.userId}> I couldn't DM you. Here are your instructions:`,
                  embeds: [embed],
                })
                .catch(() => {});
            }
          });
        } catch {}
      } else {
        await channel
          .send({
            content: `<@${p.userId}> Here are your Assassin instructions:`,
            embeds: [embed],
          })
          .catch(() => {});
      }
    } catch (err) {
      logger.warn("[Assassin] Failed to notify player", {
        userId: p.userId,
        error: err.message,
      });
    }
  }

  // Delete the signup message
  if (game.signupMessageId) {
    try {
      const signupMsg = await channel.messages
        .fetch(game.signupMessageId)
        .catch(() => null);
      if (signupMsg) await signupMsg.delete().catch(() => {});
    } catch {}
  }

  const gameboardEmbed = buildGameboardEmbed(game, players, [], guild);

  // Post the gameboard with the "game started" image
  let gameboardMsg;
  try {
    const startedImage = getGameStartedAttachment();
    gameboardMsg = await channel.send({
      embeds: [gameboardEmbed],
      files: [startedImage],
    });
  } catch {
    try {
      gameboardMsg = await channel.send({ embeds: [gameboardEmbed] });
    } catch {}
  }

  if (!gameboardMsg) {
    return { success: false, reason: "Failed to post gameboard." };
  }

  // Mirror to leaderboard channel if set
  if (
    config.leaderboardChannelId &&
    config.leaderboardChannelId !== config.gameChannelId
  ) {
    const lbChannel = guild.channels.cache.get(config.leaderboardChannelId);
    if (lbChannel) {
      try {
        await lbChannel.send({ embeds: [gameboardEmbed] });
      } catch {}
    }
  }

  // ── ONLY NOW SET THE GAME TO ACTIVE — everything above succeeded ──
  await db.updateGame(game.id, {
    startedAt: new Date(),
    status: "ACTIVE",
    gameboardMessageId: gameboardMsg.id,
  });

  if (DEBUG)
    logger.info("[Assassin] Hunt begun", {
      guildId,
      gameId: game.id,
      targetId: target.userId,
    });
  return { success: true, game: await db.findGame(game.id) };
}

// ── Handle Kill (called from messageReactionAdd) ───────────────────────────

async function handleKill(reaction, user, client) {
  // Fetch partials so message and guild are available
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch {
    return;
  }

  const guildId = reaction.message.guild?.id;
  const messageAuthorId = reaction.message.author?.id;

  if (user.bot) return;
  if (!guildId || !messageAuthorId) return;

  const userId = user.id;

  // Cooldown check
  if (isOnCooldown(guildId, userId)) return;

  // Find active game
  const game = await db.findActiveGame(guildId);
  if (!game || game.status !== "ACTIVE") return;

  // Find the reactor (killer) in the game
  const reactor = await db.findPlayer(game.id, userId);
  if (!reactor || reactor.status !== "ALIVE") return;

  // Only ASSASSINS can kill
  if (reactor.role !== "ASSASSIN") return;

  // Can't kill yourself
  if (userId === messageAuthorId) return;

  // Find the target (message author) in the game
  const targetPlayer = await db.findPlayer(game.id, messageAuthorId);
  if (!targetPlayer || targetPlayer.status !== "ALIVE") return;

  // Must be a different player in the same game
  if (reactor.id === targetPlayer.id) return;

  // Set cooldown for the attempt
  setCooldown(guildId, userId);

  // ── One-Shot Logic ──
  if (targetPlayer.role === "TARGET") {
    // 🏆 KILLER WINS — Target found!
    await db.eliminatePlayer(game.id, messageAuthorId, userId); // Mark target as dead
    await db.incrementKill(game.id, userId);

    const newAlive = game.playersAlive - 1;
    await db.updateGame(game.id, {
      status: "COMPLETED",
      winnerId: userId,
      endedAt: new Date(),
      playersAlive: newAlive,
    });

    // Update stats
    await updatePlayerStats(guildId, userId, true, true);
    await updatePlayerStats(guildId, messageAuthorId, false, false);

    // Post winner announcement
    try {
      const channel = client?.channels?.cache?.get(game.gameChannelId);
      if (channel) {
        const winnerEmbed = buildAssassinWinnerEmbed(userId, messageAuthorId);
        const guild = client?.guilds?.cache?.get(guildId);
        let championAttachment;
        if (guild) {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            championAttachment = await getChampionAttachment(
              member.user.displayAvatarURL({ extension: "png", size: 256 }),
            );
          }
        }
        const files = championAttachment ? [championAttachment] : [];
        await channel.send({ embeds: [winnerEmbed], files }).catch(() => {});
      }
    } catch (err) {
      logger.error("[Assassin] Failed to post winner announcement", {
        error: err.message,
      });
    }

    // Give role
    const config = await getConfig(guildId);
    if (config?.winnerRoleId) {
      try {
        const guild = client?.guilds?.cache?.get(guildId);
        if (guild) {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member)
            await member.roles.add(config.winnerRoleId).catch(() => {});
        }
      } catch {}
    }

    // Update leaderboard
    updateLeaderboard(guildId, client).catch(() => {});

    // Update gameboard to final state
    await updateGameboard(guildId, client);

    setImmediate(() => cleanupGameAfterDelay(guildId, game.id, client));

    if (DEBUG)
      logger.info("[Assassin] Target killed — game over", {
        guildId,
        winner: userId,
      });
  } else {
    // ❌ WRONG TARGET — Killer eliminated (one-shot miss)
    const eliminated = await db.eliminateKiller(game.id, userId);
    if (eliminated === 0) return; // Already dead (race condition)

    const newAlive = game.playersAlive - 1;
    await db.updateGame(game.id, { playersAlive: newAlive });

    // Update stats for the eliminated killer
    const stats = await db.findStats(guildId, userId);
    await db.upsertStats(guildId, userId, {
      gamesPlayed: (stats?.gamesPlayed ?? 0) + 1,
      wrongKills: (stats?.wrongKills ?? 0) + 1,
      lastPlayedAt: new Date(),
    });

    // Post kill announcement with eliminated image
    try {
      const channel = client.channels.cache.get(game.gameChannelId);
      if (channel) {
        const killEmbed = buildKillAnnouncementEmbed(
          userId,
          messageAuthorId,
          newAlive,
        );
        const guild = client.guilds.cache.get(guildId);
        let eliminatedAttachment;
        if (guild) {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            eliminatedAttachment = await getEliminatedAttachment(
              member.user.displayAvatarURL({ extension: "png", size: 256 }),
            );
          }
        }
        const files = eliminatedAttachment ? [eliminatedAttachment] : [];
        await channel.send({ embeds: [killEmbed], files }).catch(() => {});
      }
    } catch (err) {
      logger.error("[Assassin] Failed to post elimination announcement", {
        error: err.message,
      });
    }

    // Check win condition: only target + 0 or 1 assassins remain?
    await checkGameEnd(game.id, guildId, client);

    // Update gameboard
    await updateGameboard(guildId, client);

    if (DEBUG)
      logger.info("[Assassin] Wrong target — killer eliminated", {
        guildId,
        killer: userId,
      });
  }
}

// ── Check if game should end (target survived) ─────────────────────────────

async function checkGameEnd(gameId, guildId, client) {
  const game = await db.findGame(gameId);
  if (!game || game.status !== "ACTIVE") return;

  const aliveAssassins = await db.countAliveAssassins(gameId);
  const target = await db.findTargetInGame(gameId);

  if (aliveAssassins === 0 && target) {
    // Target survived — all assassins eliminated
    await endGameTargetSurvived(gameId, guildId, target.userId, client);
  }
}

// ── Target Survived Victory ────────────────────────────────────────────────

async function endGameTargetSurvived(gameId, guildId, targetId, client) {
  const game = await db.updateGame(gameId, {
    status: "COMPLETED",
    winnerId: targetId,
    endedAt: new Date(),
  });
  if (!game) return;

  // Update target stats
  await updatePlayerStats(guildId, targetId, true, true);

  // Post winner announcement
  try {
    const channel = client.channels.cache.get(game.gameChannelId);
    if (channel) {
      const winnerEmbed = buildTargetSurvivedEmbed(targetId);
      const guild = client.guilds.cache.get(guildId);
      let survivedAttachment;
      if (guild) {
        const member = await guild.members.fetch(targetId).catch(() => null);
        if (member) {
          survivedAttachment = await getTargetSurvivedAttachment(
            member.user.displayAvatarURL({ extension: "png", size: 256 }),
          );
        }
      }
      const files = survivedAttachment ? [survivedAttachment] : [];
      await channel.send({ embeds: [winnerEmbed], files }).catch(() => {});
    }
  } catch {}

  // Give role
  const config = await getConfig(guildId);
  if (config?.winnerRoleId) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        const member = await guild.members.fetch(targetId).catch(() => null);
        if (member) await member.roles.add(config.winnerRoleId).catch(() => {});
      }
    } catch {}
  }

  updateLeaderboard(guildId, client).catch(() => {});
  await updateGameboard(guildId, client);
  setImmediate(() => cleanupGameAfterDelay(guildId, gameId, client));
}

// ── Update Player Stats ────────────────────────────────────────────────────

async function updatePlayerStats(guildId, userId, won, playedTargetRole) {
  const existing = await db.findStats(guildId, userId);
  const data = {
    gamesPlayed: (existing?.gamesPlayed ?? 0) + 1,
    lastPlayedAt: new Date(),
  };
  if (won) {
    data.gamesWon = (existing?.gamesWon ?? 0) + 1;
  }
  if (playedTargetRole && won) {
    data.survivedGames = (existing?.survivedGames ?? 0) + 1;
  }
  await db.upsertStats(guildId, userId, data);
}

// ── Gameboard Update ───────────────────────────────────────────────────────

async function updateGameboard(guildId, client) {
  const game = await db.findActiveGame(guildId);
  if (!game || !game.gameboardMessageId) return;

  const config = await getConfig(guildId);
  const guild = client?.guilds?.cache?.get(guildId);
  if (!guild) return;

  const alivePlayers = await db.findAlivePlayers(game.id);
  const allPlayers = await db.findPlayersByGame(game.id);
  const deadPlayers = allPlayers.filter((p) => p.status === "DEAD");
  const embed = buildGameboardEmbed(game, alivePlayers, deadPlayers, guild);

  // Try to find the gameboard message in the leaderboard channel first,
  // then fall back to the game channel
  const channelsToTry = [
    config?.leaderboardChannelId,
    game.gameChannelId,
  ].filter(Boolean);

  let updated = false;
  for (const chanId of channelsToTry) {
    const channel = guild.channels.cache.get(chanId);
    if (!channel) continue;
    try {
      const msg = await channel.messages
        .fetch(game.gameboardMessageId)
        .catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed] }).catch(() => {});
        updated = true;
        break;
      }
    } catch {}
  }

  if (!updated) {
    // Message not found anywhere — repost to leaderboard channel if available
    const fallbackChanId = config?.leaderboardChannelId || game.gameChannelId;
    const fallbackChannel = guild.channels.cache.get(fallbackChanId);
    if (fallbackChannel) {
      try {
        const newMsg = await fallbackChannel.send({ embeds: [embed] });
        await db.updateGame(game.id, { gameboardMessageId: newMsg.id });
      } catch {}
    }
  }
}

// ── Cancel Game ────────────────────────────────────────────────────────────

async function cancelGame(guildId, client) {
  const game = await db.findActiveGame(guildId);
  if (!game) return false;

  await db.updateGame(game.id, { status: "CANCELLED", endedAt: new Date() });

  const guild = client?.guilds?.cache?.get(guildId);

  // DM all signed-up players
  try {
    const players = await db.findPlayersByGame(game.id);
    for (const p of players) {
      try {
        const member = guild
          ? await guild.members.fetch(p.userId).catch(() => null)
          : null;
        if (member) {
          await member
            .send(
              `🚫 **The Assassin game has been cancelled.**\nThank you for signing up — keep an eye out for the next game!`,
            )
            .catch(() => {});
        }
      } catch {}
    }
  } catch {}

  // Notify game channel
  try {
    const channel = client?.channels?.cache?.get(game.gameChannelId);
    if (channel) {
      const { EmbedBuilder } = require("discord.js");
      const embed = new EmbedBuilder()
        .setTitle("🚫 Game Cancelled")
        .setDescription(
          "The Assassin game has been cancelled by an admin. All players have been notified.\n\nKeep an eye out for the next game!",
        )
        .setColor(0xff0000);
      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  } catch {}

  await updateGameboard(guildId, client);
  return true;
}

// ── Cleanup (delete old games) ─────────────────────────────────────────────

async function cleanupGameAfterDelay(guildId, gameId, client) {
  // Update gameboard one final time
  setTimeout(async () => {
    try {
      await updateGameboard(guildId, client);
    } catch {}
  }, 2000);
}

// ── Reset ──────────────────────────────────────────────────────────────────

async function resetConfig(guildId) {
  await db.deleteOldGames(
    guildId,
    ["SIGNUPS", "ACTIVE", "COMPLETED", "CANCELLED"],
    new Date(),
  );
  await db.deleteConfig(guildId);
}

module.exports = {
  getConfig,
  ensureConfig,
  validateSetup,
  createSignup,
  joinGame,
  beginHunt,
  handleKill,
  cancelGame,
  updateGameboard,
  resetConfig,
  updatePlayerStats,
  checkGameEnd,
};

"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const {
  addResult,
  pushLiveEmbed,
  getScoreboardById,
  createScoreboard,
  renameScoreboard,
  setTheme,
  setDescription,
  setTitle,
  setRoleImage,
} = require("../../../modules/scoreboards/service");
const { assertCanManage } = require("../../../lib/scoreboardGuard");
const {
  buildBoardPanelEmbed,
} = require("../../../modules/scoreboards/dashboardEmbeds");
const panelState = require("../../../modules/scoreboards/panelState");
const { getScoreTypes } = require("../../../modules/scoreboards/scoreTypes");

// ─── helpers ──────────────────────────────────────────────────────────────────

function getIconUrls(interaction) {
  const guildIconUrl =
    interaction.guild?.iconURL({ size: 128, extension: "png" }) ?? undefined;
  const discoreIconUrl =
    interaction.client.user?.displayAvatarURL({ size: 64, extension: "png" }) ??
    undefined;
  return { guildIconUrl, discoreIconUrl };
}

async function refreshBoardPanelFromModal(interaction, boardId) {
  const board = await prisma.scoreboard.findUnique({
    where: { id: boardId },
    include: { entries: true },
  });
  if (!board) {
    return interaction.editReply({
      content: "⚠️ Scoreboard no longer exists.",
      embeds: [],
      components: [],
    });
  }

  const { guildIconUrl, discoreIconUrl } = getIconUrls(interaction);
  const scoreTypes = await getScoreTypes(board.id).catch(() => []);
  const state = panelState.get(interaction.user.id, interaction.guildId);
  const selectedScoreTypeName = state?.selectedScoreTypeName || "Overall";

  const embed = await buildBoardPanelEmbed({
    board,
    entryCount: board.entries?.length || 0,
    scoreTypeCount: scoreTypes.length,
    selectedScoreTypeName,
    selectedTargetLabel: state?.selectedTargetLabel,
    canManage: true,
    guildIconUrl,
    discoreIconUrl,
  });

  const {
    buildBoardPanelComponents,
  } = require("../../../modules/scoreboards/panelComponents");
  const components = buildBoardPanelComponents(board, true, scoreTypes);

  return interaction.editReply({ embeds: [embed], components });
}

// ─── modal handlers ───────────────────────────────────────────────────────────

module.exports = [
  // ── Create Scoreboard ────────────────────────────────────────────────
  {
    customIdPrefix: "sb:modal:create",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const name = interaction.fields.getTextInputValue("name").trim();
      const description =
        interaction.fields.getTextInputValue("description")?.trim() || null;

      if (!name || name.length < 1 || name.length > 100) {
        return interaction.reply({
          content: "❌ Name must be between 1 and 100 characters.",
          flags: 64,
        });
      }

      await interaction.deferUpdate();

      try {
        // Check duplicate
        const existing = await prisma.scoreboard.findFirst({
          where: {
            guildId: interaction.guildId,
            name: { equals: name, mode: "insensitive" },
          },
        });
        if (existing) {
          return interaction.editReply({
            content: `❌ A scoreboard named **${name}** already exists.`,
          });
        }

        const board = await createScoreboard({
          guildId: interaction.guildId,
          name,
          metric: "WIN_LOSS",
          type: "USER",
          channelId: interaction.channelId,
          description,
          createdBy: interaction.user.id,
          hasCategories: false,
        });

        // Post live embed in channel
        try {
          const channel = await interaction.client.channels.fetch(
            interaction.channelId,
          );
          if (channel) {
            const {
              buildScoreboardPage,
            } = require("../../../modules/scoreboards/service");
            const { embed } = buildScoreboardPage(
              { ...board, entries: [] },
              1,
              { guildIconUrl: getIconUrls(interaction).guildIconUrl },
            );
            const msg = await channel
              .send({ embeds: [embed] })
              .catch(() => null);
            if (msg) {
              await prisma.scoreboard.update({
                where: { id: board.id },
                data: { messageId: msg.id },
              });
            }
          }
        } catch {}

        // Open board panel
        const { guildIconUrl, discoreIconUrl } = getIconUrls(interaction);
        const freshBoard = await prisma.scoreboard.findUnique({
          where: { id: board.id },
          include: { entries: true },
        });
        const {
          openBoardPanel,
        } = require("../../commands/public/scoreboard/scoreboard");
        return openBoardPanel(
          interaction,
          freshBoard,
          true,
          guildIconUrl,
          discoreIconUrl,
        );
      } catch (err) {
        return interaction.editReply({
          content: `❌ Failed to create scoreboard: ${err.message}`,
        });
      }
    },
  },

  // ── Submit Points ───────────────────────────────────────────────────
  {
    customIdPrefix: "sb:modal:points:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];
      const amountStr = interaction.fields.getTextInputValue("amount").trim();
      const reason =
        interaction.fields.getTextInputValue("reason")?.trim() || null;

      const delta = parseInt(amountStr, 10);
      if (isNaN(delta) || delta === 0) {
        return interaction.reply({
          content: "❌ Please enter a valid non-zero number for points.",
          flags: 64,
        });
      }

      const state = panelState.get(interaction.user.id, interaction.guildId);
      if (!state?.selectedTargetId) {
        return interaction.reply({
          content: "⚠️ No target selected. Please select a target first.",
          flags: 64,
        });
      }

      await interaction.deferUpdate();

      try {
        const board = await prisma.scoreboard.findUnique({
          where: { id: boardId },
          include: { entries: true },
        });
        if (!board || board.isArchived) {
          return interaction.editReply({
            content: "⚠️ This scoreboard no longer exists or is archived.",
          });
        }

        const scoreTypeRaw =
          state.selectedScoreTypeId && state.selectedScoreTypeId !== "overall"
            ? state.selectedScoreTypeName
            : null;

        const result = await addResult({
          guildId: interaction.guildId,
          scoreboardName: board.name,
          targetId: state.selectedTargetId,
          targetType: state.selectedTargetType,
          targetName: state.selectedTargetLabel,
          action: "POINT",
          delta,
          adminId: interaction.user.id,
          guild: interaction.guild,
          category: null,
          scoreType: scoreTypeRaw,
        });

        pushLiveEmbed(interaction.client, result.board).catch(() => {});

        await refreshBoardPanelFromModal(interaction, boardId);

        const sign = delta >= 0 ? `+${delta}` : String(delta);
        return interaction.followUp({
          content: `✅ **${sign} points** recorded for ${state.selectedTargetLabel} on **${result.board.liveTitle || result.board.name}**.`,
          flags: 64,
        });
      } catch (err) {
        return interaction.followUp({
          content: `❌ ${err.message}`,
          flags: 64,
        });
      }
    },
  },

  // ── Set Title ───────────────────────────────────────────────────────
  {
    customIdPrefix: "sb:modal:settitle:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];
      const title = interaction.fields.getTextInputValue("title").trim();

      if (!title) {
        return interaction.reply({
          content: "❌ Title cannot be empty.",
          flags: 64,
        });
      }

      await interaction.deferUpdate();

      try {
        const board = await prisma.scoreboard.findUnique({
          where: { id: boardId },
        });
        if (!board) {
          return interaction.editReply({
            content: "⚠️ Scoreboard no longer exists.",
          });
        }

        await setTitle({
          guildId: interaction.guildId,
          name: board.name,
          title,
        });

        return refreshBoardPanelFromModal(interaction, boardId);
      } catch (err) {
        return interaction.editReply({ content: `❌ ${err.message}` });
      }
    },
  },

  // ── Set Description ─────────────────────────────────────────────────
  {
    customIdPrefix: "sb:modal:setdesc:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];
      const description = interaction.fields
        .getTextInputValue("description")
        .trim();

      if (!description) {
        return interaction.reply({
          content: "❌ Description cannot be empty.",
          flags: 64,
        });
      }

      await interaction.deferUpdate();

      try {
        const board = await prisma.scoreboard.findUnique({
          where: { id: boardId },
        });
        if (!board) {
          return interaction.editReply({
            content: "⚠️ Scoreboard no longer exists.",
          });
        }

        await setDescription({
          guildId: interaction.guildId,
          name: board.name,
          description,
        });

        return refreshBoardPanelFromModal(interaction, boardId);
      } catch (err) {
        return interaction.editReply({ content: `❌ ${err.message}` });
      }
    },
  },

  // ── Rename Board ────────────────────────────────────────────────────
  {
    customIdPrefix: "sb:modal:rename:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];
      const newName = interaction.fields.getTextInputValue("name").trim();

      if (!newName || newName.length < 1) {
        return interaction.reply({
          content: "❌ Name cannot be empty.",
          flags: 64,
        });
      }

      await interaction.deferUpdate();

      try {
        const board = await prisma.scoreboard.findUnique({
          where: { id: boardId },
        });
        if (!board) {
          return interaction.editReply({
            content: "⚠️ Scoreboard no longer exists.",
          });
        }

        await renameScoreboard({
          guildId: interaction.guildId,
          oldName: board.name,
          newName,
        });

        return refreshBoardPanelFromModal(interaction, boardId);
      } catch (err) {
        return interaction.editReply({ content: `❌ ${err.message}` });
      }
    },
  },

  // ── Set Theme ───────────────────────────────────────────────────────
  {
    customIdPrefix: "sb:modal:settheme:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];
      const color = interaction.fields.getTextInputValue("color").trim();

      if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
        return interaction.reply({
          content: "❌ Invalid hex colour. Use format `#FF5733`.",
          flags: 64,
        });
      }

      await interaction.deferUpdate();

      try {
        const board = await prisma.scoreboard.findUnique({
          where: { id: boardId },
        });
        if (!board) {
          return interaction.editReply({
            content: "⚠️ Scoreboard no longer exists.",
          });
        }

        await setTheme({
          guildId: interaction.guildId,
          name: board.name,
          color,
        });

        return refreshBoardPanelFromModal(interaction, boardId);
      } catch (err) {
        return interaction.editReply({ content: `❌ ${err.message}` });
      }
    },
  },

  // ── Set Image ───────────────────────────────────────────────────────
  {
    customIdPrefix: "sb:modal:setimage:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];
      const url = interaction.fields.getTextInputValue("url").trim();

      const remove = url.toLowerCase() === "remove";

      if (!remove && !url.startsWith("https://")) {
        return interaction.reply({
          content:
            "❌ Image URL must start with `https://` or type `remove` to clear the image.",
          flags: 64,
        });
      }

      await interaction.deferUpdate();

      try {
        const board = await prisma.scoreboard.findUnique({
          where: { id: boardId },
        });
        if (!board) {
          return interaction.editReply({
            content: "⚠️ Scoreboard no longer exists.",
          });
        }

        await setRoleImage({
          guildId: interaction.guildId,
          name: board.name,
          imageUrl: remove ? null : url,
        });

        return refreshBoardPanelFromModal(interaction, boardId);
      } catch (err) {
        return interaction.editReply({ content: `❌ ${err.message}` });
      }
    },
  },
];

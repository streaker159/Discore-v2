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
  // ── Edit Score Entry ────────────────────────────────────────────────
  {
    customIdPrefix: "sb:modal:editentry:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      const state = panelState.get(interaction.user.id, interaction.guildId);
      if (!state?.selectedTargetId) {
        return interaction.reply({
          content: "⚠️ Session expired. Please reopen the scoreboard panel.",
          flags: 64,
        });
      }

      const winsVal = parseInt(
        interaction.fields.getTextInputValue("wins").trim(),
        10,
      );
      const lossesVal = parseInt(
        interaction.fields.getTextInputValue("losses").trim(),
        10,
      );
      const pointsVal = parseInt(
        interaction.fields.getTextInputValue("points").trim(),
        10,
      );
      const winStreakVal = parseInt(
        interaction.fields.getTextInputValue("win_streak")?.trim() || "0",
        10,
      );
      const lossStreakVal = parseInt(
        interaction.fields.getTextInputValue("loss_streak")?.trim() || "0",
        10,
      );

      if (
        isNaN(winsVal) ||
        isNaN(lossesVal) ||
        isNaN(pointsVal) ||
        winsVal < 0 ||
        lossesVal < 0
      ) {
        return interaction.reply({
          content: "❌ Wins, losses, and points must be non-negative numbers.",
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

        const { editEntry } = require("../../../modules/scoreboards/service");
        const result = await editEntry({
          guildId: interaction.guildId,
          scoreboardName: board.name,
          targetId: state.selectedTargetId,
          targetType: state.selectedTargetType,
          wins: winsVal,
          losses: lossesVal,
          points: pointsVal,
          winStreak: isNaN(winStreakVal) ? undefined : winStreakVal,
          lossStreak: isNaN(lossStreakVal) ? undefined : lossStreakVal,
          adminId: interaction.user.id,
        });

        pushLiveEmbed(interaction.client, result.board).catch(() => {});

        await refreshBoardPanelFromModal(interaction, boardId);

        return interaction.followUp({
          content: `✅ Entry for ${state.selectedTargetLabel} updated: \`${winsVal}W / ${lossesVal}L / ${pointsVal}pts\`.`,
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
        } = require("../../../commands/public/scoreboard/scoreboard");
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

  // ── Add Score Type ─────────────────────────────────────────────────
  {
    customIdPrefix: "sb:modal:addscoretype:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];
      const typeName = interaction.fields.getTextInputValue("typename").trim();

      if (!typeName || typeName.length < 1 || typeName.length > 32) {
        return interaction.reply({
          content: "❌ Score type name must be between 1 and 32 characters.",
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

        const {
          findOrCreateScoreType,
        } = require("../../../modules/scoreboards/scoreTypes");
        const scoreType = await findOrCreateScoreType(
          interaction.guildId,
          boardId,
          typeName,
        );

        // Auto-select this new type in the panel state
        panelState.patch(interaction.user.id, interaction.guildId, {
          selectedScoreTypeId: scoreType.id,
          selectedScoreTypeName: scoreType.name,
        });

        await refreshBoardPanelFromModal(interaction, boardId);

        return interaction.followUp({
          content: `✅ Score type **${scoreType.name}** created and selected. You can now add wins/losses filtered by this type.`,
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

  // ── Upload Image (file upload modal) ──────────────────────────────
  {
    customIdPrefix: "sb:modal:uploadimage:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      // Extract uploaded file
      const attachment = interaction.fields
        .getUploadedFiles("scoreboard_image_upload")
        ?.first();

      if (!attachment) {
        return interaction.reply({
          content:
            "❌ No file uploaded. Please upload a PNG, JPG, JPEG, or WEBP image.",
          flags: 64,
        });
      }

      const filename = (
        attachment.name ||
        attachment.filename ||
        "upload"
      ).toLowerCase();
      const contentType =
        attachment.contentType || attachment.content_type || "";

      // Validate file extension
      const allowedExts = [".png", ".jpg", ".jpeg", ".webp"];
      const hasValidExt = allowedExts.some((ext) => filename.endsWith(ext));
      const hasValidType = ["image/png", "image/jpeg", "image/webp"].includes(
        contentType,
      );

      if (!hasValidExt && !hasValidType) {
        return interaction.reply({
          content:
            "❌ That file type is not supported. Please upload PNG, JPG, JPEG, or WEBP.",
          flags: 64,
        });
      }

      const maxSizeMB = parseInt(process.env.SCOREBOARD_IMAGE_MAX_MB, 10) || 5;
      const maxSizeBytes = maxSizeMB * 1024 * 1024;
      const fileSize = attachment.size || 0;

      if (fileSize > maxSizeBytes) {
        return interaction.reply({
          content: `❌ That image is too large. Maximum size is ${maxSizeMB} MB.`,
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

        const imageUrl = attachment.url || attachment.proxy_url;
        if (!imageUrl) {
          return interaction.editReply({
            content:
              "❌ Could not read the upload URL. Please try another image.",
          });
        }

        // Store the image URL on the scoreboard
        const {
          setRoleImage,
        } = require("../../../modules/scoreboards/service");
        await setRoleImage({
          guildId: interaction.guildId,
          name: board.name,
          imageUrl,
        });

        // Push live embed update
        const freshBoard = await prisma.scoreboard.findUnique({
          where: { id: boardId },
          include: { entries: true },
        });
        pushLiveEmbed(interaction.client, freshBoard).catch(() => {});

        // Refresh customize panel
        await refreshBoardPanelFromModal(interaction, boardId);

        return interaction.followUp({
          content: `✅ Image **${filename}** set as scoreboard thumbnail.`,
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

  // ── Set Image URL (legacy, kept for backward compat) ───────────────
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

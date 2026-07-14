"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const {
  addResult,
  pushLiveEmbed,
  getScoreboardById,
  buildInteractiveShowEmbed,
  buildShowComponents,
  repairLiveEmbed,
  listActiveScoreboards,
  deleteScoreboard,
} = require("../../../modules/scoreboards/service");
const { assertCanManage } = require("../../../lib/scoreboardGuard");
const {
  buildBoardPanelEmbed,
  buildConfirmationEmbed,
} = require("../../../modules/scoreboards/dashboardEmbeds");
const {
  buildDashboardEmbed,
} = require("../../../modules/scoreboards/dashboardEmbeds");
const {
  buildDashboardSelectMenus,
  buildDashboardButtons,
  buildBoardPanelComponents,
} = require("../../../modules/scoreboards/panelComponents");
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

async function refreshBoardPanel(interaction, boardId) {
  const perms = await assertCanManage(interaction);
  if (perms) {
    return interaction.reply({ ...perms, flags: 64 });
  }
  const board = await prisma.scoreboard.findUnique({
    where: { id: boardId },
    include: { entries: true },
  });
  if (!board) {
    return interaction.update({
      content: "⚠️ This scoreboard no longer exists.",
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

  const components = buildBoardPanelComponents(board, true, scoreTypes);
  return interaction.update({ embeds: [embed], components });
}

// ─── dashboard button handlers ────────────────────────────────────────────────

module.exports = [
  // ── Create Scoreboard ──────────────────────────────────────────────────
  {
    customId: "sb:dashboard:create",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const modal = new ModalBuilder()
        .setCustomId("sb:modal:create")
        .setTitle("Create Scoreboard")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("name")
              .setLabel("Scoreboard Name")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(100),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("description")
              .setLabel("Description / Season Info (optional)")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(500),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  // ── Scores button ───────────────────────────────────────────────────────
  {
    customId: "sb:dashboard:scores",
    async execute(interaction) {
      return interaction.reply({
        content:
          "Use `/scores @user` or `/scores @role` to view scores across all scoreboards.",
        flags: 64,
      });
    },
  },

  // ── Refresh dashboard ──────────────────────────────────────────────────
  {
    customId: "sb:dashboard:refresh",
    async execute(interaction) {
      const boards = await listActiveScoreboards(interaction.guildId);
      const archivedCount = await prisma.scoreboard.count({
        where: { guildId: interaction.guildId, isArchived: true },
      });
      const { guildIconUrl, discoreIconUrl } = getIconUrls(interaction);

      const embed = await buildDashboardEmbed({
        activeBoards: boards,
        archivedCount,
        guildId: interaction.guildId,
        guildIconUrl,
        discoreIconUrl,
      });

      const { componentRow } = buildDashboardSelectMenus(boards, 0);
      const buttonRows = buildDashboardButtons(boards.length > 0);

      const components = [];
      if (componentRow) components.push(componentRow);
      components.push(...buttonRows);

      return interaction.update({ embeds: [embed], components });
    },
  },

  // ── Close dashboard ────────────────────────────────────────────────────
  {
    customId: "sb:dashboard:close",
    async execute(interaction) {
      return interaction.update({
        content: "✅ Scoreboard dashboard closed.",
        embeds: [],
        components: [],
      });
    },
  },

  // ── View Archives ──────────────────────────────────────────────────────
  {
    customId: "sb:dashboard:viewarchives",
    async execute(interaction) {
      const archived = await prisma.scoreboard.findMany({
        where: { guildId: interaction.guildId, isArchived: true },
        include: { entries: true },
        orderBy: { archivedAt: "desc" },
        take: 25,
      });

      if (!archived.length) {
        return interaction.reply({
          content: "No archived scoreboards.",
          flags: 64,
        });
      }

      const lines = archived.map(
        (b) =>
          `📦 **${b.liveTitle || b.name}** — ${b.entries.length} entries (archived: <t:${Math.floor(new Date(b.archivedAt || b.createdAt).getTime() / 1000)}:R>)`,
      );

      const embed = new EmbedBuilder()
        .setColor(0x1a7a9e)
        .setTitle("📦 Archived Scoreboards")
        .setDescription(lines.join("\n") || "None")
        .setFooter({ text: "Use /scoreboard to manage active boards" });

      return interaction.reply({ embeds: [embed], flags: 64 });
    },
  },

  // ── Dashboard select: open board ───────────────────────────────────────
  {
    customIdPrefix: "sb:dashboard_select:",
    async execute(interaction) {
      const boardId = interaction.values?.[0];
      if (!boardId) return;

      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const board = await prisma.scoreboard.findUnique({
        where: { id: boardId },
        include: { entries: true },
      });
      if (!board) {
        return interaction.update({
          content: "⚠️ That scoreboard no longer exists.",
          embeds: [],
          components: [],
        });
      }

      const { guildIconUrl, discoreIconUrl } = getIconUrls(interaction);
      const {
        openBoardPanel,
      } = require("../../../commands/public/scoreboard/scoreboard");
      return openBoardPanel(
        interaction,
        board,
        true,
        guildIconUrl,
        discoreIconUrl,
      );
    },
  },

  // ── Board panel: add win ───────────────────────────────────────────────
  {
    customIdPrefix: "sb:panel:addwin:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      const state = panelState.get(interaction.user.id, interaction.guildId);
      if (!state?.selectedTargetId) {
        return interaction.reply({
          content:
            "⚠️ Please select a target (user or role) first using the dropdown above.",
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
          action: "WIN",
          adminId: interaction.user.id,
          guild: interaction.guild,
          category: null,
          scoreType: scoreTypeRaw,
        });

        pushLiveEmbed(interaction.client, result.board).catch(() => {});

        await refreshBoardPanel(interaction, boardId);

        return interaction.followUp({
          content: `✅ **1 win** added for ${state.selectedTargetLabel} on **${result.board.liveTitle || result.board.name}**.`,
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

  // ── Board panel: add loss ──────────────────────────────────────────────
  {
    customIdPrefix: "sb:panel:addloss:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      const state = panelState.get(interaction.user.id, interaction.guildId);
      if (!state?.selectedTargetId) {
        return interaction.reply({
          content:
            "⚠️ Please select a target (user or role) first using the dropdown above.",
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
          action: "LOSS",
          adminId: interaction.user.id,
          guild: interaction.guild,
          category: null,
          scoreType: scoreTypeRaw,
        });

        pushLiveEmbed(interaction.client, result.board).catch(() => {});

        await refreshBoardPanel(interaction, boardId);

        return interaction.followUp({
          content: `✅ **1 loss** added for ${state.selectedTargetLabel} on **${result.board.liveTitle || result.board.name}**.`,
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

  // ── Board panel: points modal ──────────────────────────────────────────
  {
    customIdPrefix: "sb:panel:points:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const state = panelState.get(interaction.user.id, interaction.guildId);
      if (!state?.selectedTargetId) {
        return interaction.reply({
          content:
            "⚠️ Please select a target (user or role) first using the dropdown above.",
          flags: 64,
        });
      }

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      const modal = new ModalBuilder()
        .setCustomId(`sb:modal:points:${boardId}`)
        .setTitle("Add / Subtract Points")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("amount")
              .setLabel("Points (negative to subtract)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder("e.g. 10 or -5"),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("reason")
              .setLabel("Reason (optional)")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(200),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  // ── Board panel: show public ───────────────────────────────────────────
  {
    customIdPrefix: "sb:panel:public:",
    async execute(interaction) {
      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      const board = await getScoreboardById(boardId);
      if (!board) {
        return interaction.reply({
          content: "⚠️ This scoreboard no longer exists.",
          flags: 64,
        });
      }

      await interaction.deferReply();

      const { guildIconUrl, discoreIconUrl } = getIconUrls(interaction);
      const scoreTypes = await getScoreTypes(board.id).catch(() => []);
      const hasScoreTypes = scoreTypes.length > 0;

      const viewMode = hasScoreTypes
        ? "flat"
        : board.hasCategories
          ? "combined"
          : "flat";

      const {
        embed,
        page,
        totalPages,
        scoreTypes: resultScoreTypes,
        hasScoreTypes: resultHasScoreTypes,
      } = await buildInteractiveShowEmbed(board, viewMode, 1, "WINS", {
        guildIconUrl,
        discoreIconUrl,
      });

      const components = buildShowComponents(
        board.id,
        page,
        totalPages,
        board.metric,
        "WINS",
        viewMode,
        board,
        {
          scoreTypes: resultScoreTypes || scoreTypes,
          hasScoreTypes: resultHasScoreTypes ?? hasScoreTypes,
        },
      );

      return interaction.editReply({ embeds: [embed], components });
    },
  },

  // ── Board panel: refresh ───────────────────────────────────────────────
  {
    customIdPrefix: "sb:panel:refresh:",
    async execute(interaction) {
      const parts = interaction.customId.split(":");
      const boardId = parts[3];
      return refreshBoardPanel(interaction, boardId);
    },
  },

  // ── Board panel: customize ─────────────────────────────────────────────
  {
    customIdPrefix: "sb:panel:customize:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sb:customize:settitle:${boardId}`)
          .setLabel("Set Title")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("📝"),
        new ButtonBuilder()
          .setCustomId(`sb:customize:setdesc:${boardId}`)
          .setLabel("Set Description")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("📄"),
        new ButtonBuilder()
          .setCustomId(`sb:customize:rename:${boardId}`)
          .setLabel("Rename Board")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("✏️"),
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sb:customize:settheme:${boardId}`)
          .setLabel("Set Theme")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("🎨"),
        new ButtonBuilder()
          .setCustomId(`sb:customize:setimage:${boardId}`)
          .setLabel("Set Image")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("🖼️"),
        new ButtonBuilder()
          .setCustomId(`sb:panel:back:${boardId}`)
          .setLabel("Back")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("⬅️"),
      );

      const embed = new EmbedBuilder()
        .setColor(0x1a7a9e)
        .setTitle("🎨 Customize Scoreboard")
        .setDescription(
          "Choose an option below to customise this scoreboard.\n\n" +
            "• **Set Title** — Change the live embed title\n" +
            "• **Set Description** — Update season info\n" +
            "• **Rename Board** — Change the internal board name\n" +
            "• **Set Theme** — Change the embed colour\n" +
            "• **Set Image** — Set a thumbnail image",
        );

      return interaction.update({ embeds: [embed], components: [row1, row2] });
    },
  },

  // ── Board panel: advanced ──────────────────────────────────────────────
  {
    customIdPrefix: "sb:panel:advanced:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sb:adv:repair:${boardId}`)
          .setLabel("Repair Live")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🧰"),
        new ButtonBuilder()
          .setCustomId(`sb:adv:delete:${boardId}`)
          .setLabel("Delete Board")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🗑️"),
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sb:panel:back:${boardId}`)
          .setLabel("Back")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("⬅️"),
      );

      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("🛠️ Advanced Options")
        .setDescription(
          "⚠️ **Dangerous operations ahead.**\n\n" +
            "• **Repair Live** — Fix or recreate the live scoreboard message\n" +
            "• **Delete Board** — Permanently delete this scoreboard and all entries",
        );

      return interaction.update({ embeds: [embed], components: [row1, row2] });
    },
  },

  // ── Board panel: back to dashboard ─────────────────────────────────────
  {
    customIdPrefix: "sb:panel:back:",
    async execute(interaction) {
      const boards = await listActiveScoreboards(interaction.guildId);
      const archivedCount = await prisma.scoreboard.count({
        where: { guildId: interaction.guildId, isArchived: true },
      });
      const { guildIconUrl, discoreIconUrl } = getIconUrls(interaction);

      const embed = await buildDashboardEmbed({
        activeBoards: boards,
        archivedCount,
        guildId: interaction.guildId,
        guildIconUrl,
        discoreIconUrl,
      });

      const { componentRow } = buildDashboardSelectMenus(boards, 0);
      const buttonRows = buildDashboardButtons(boards.length > 0);

      const components = [];
      if (componentRow) components.push(componentRow);
      components.push(...buttonRows);

      return interaction.update({ embeds: [embed], components });
    },
  },

  // ── Customize: set title modal ─────────────────────────────────────────
  {
    customIdPrefix: "sb:customize:settitle:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      const modal = new ModalBuilder()
        .setCustomId(`sb:modal:settitle:${boardId}`)
        .setTitle("Set Title")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("title")
              .setLabel("New Title")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(200),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  // ── Customize: set description modal ───────────────────────────────────
  {
    customIdPrefix: "sb:customize:setdesc:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      const modal = new ModalBuilder()
        .setCustomId(`sb:modal:setdesc:${boardId}`)
        .setTitle("Set Description")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("description")
              .setLabel("Description / Season Info")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(500),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  // ── Customize: rename modal ────────────────────────────────────────────
  {
    customIdPrefix: "sb:customize:rename:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      const modal = new ModalBuilder()
        .setCustomId(`sb:modal:rename:${boardId}`)
        .setTitle("Rename Board")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("name")
              .setLabel("New Name")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(100),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  // ── Customize: set theme modal ─────────────────────────────────────────
  {
    customIdPrefix: "sb:customize:settheme:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      const modal = new ModalBuilder()
        .setCustomId(`sb:modal:settheme:${boardId}`)
        .setTitle("Set Theme Colour")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("color")
              .setLabel("Hex Color (e.g. #FF5733)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder("#1a7a9e"),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  // ── Customize: set image modal ─────────────────────────────────────────
  {
    customIdPrefix: "sb:customize:setimage:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      const modal = new ModalBuilder()
        .setCustomId(`sb:modal:setimage:${boardId}`)
        .setTitle("Set Image URL")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("url")
              .setLabel("Image URL (https://...) or 'remove' to clear")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder("https://example.com/image.png"),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  // ── Advanced: repair ───────────────────────────────────────────────────
  {
    customIdPrefix: "sb:adv:repair:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      await interaction.deferUpdate();

      const status = await repairLiveEmbed(interaction.client, boardId);
      const msgs = {
        REPAIRED: "✅ Live message repaired — recreated.",
        OK: "✅ Scoreboard is healthy. Nothing to repair.",
        NO_CHANNEL: "⚠️ No live channel configured.",
        CHANNEL_MISSING: "❌ The configured channel no longer exists.",
        NO_PERMS: "❌ Missing Send Messages permission in the channel.",
      };

      return interaction.editReply({
        content: msgs[status] || `Repair result: ${status}`,
        embeds: [],
        components: [],
      });
    },
  },

  // ── Advanced: delete board confirmation ────────────────────────────────
  {
    customIdPrefix: "sb:adv:delete:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      const board = await prisma.scoreboard.findUnique({
        where: { id: boardId },
        include: { entries: true },
      });
      if (!board) {
        return interaction.update({
          content: "⚠️ This scoreboard no longer exists.",
          embeds: [],
          components: [],
        });
      }

      const embed = buildConfirmationEmbed({
        title: "🗑️ Delete Scoreboard?",
        description: `Are you sure you want to permanently delete **${board.liveTitle || board.name}**?`,
        warning: `This will remove ${board.entries.length} entries permanently. This action cannot be undone.`,
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sb:adv:confirmdelete:${boardId}`)
          .setLabel("Confirm Delete")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🗑️"),
        new ButtonBuilder()
          .setCustomId(`sb:panel:back:${boardId}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary),
      );

      return interaction.update({ embeds: [embed], components: [row] });
    },
  },

  // ── Advanced: confirm delete ───────────────────────────────────────────
  {
    customIdPrefix: "sb:adv:confirmdelete:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      const board = await prisma.scoreboard.findUnique({
        where: { id: boardId },
      });
      if (!board) {
        return interaction.update({
          content: "⚠️ Scoreboard already deleted.",
          embeds: [],
          components: [],
        });
      }

      await deleteScoreboard({
        guildId: interaction.guildId,
        name: board.name,
      });

      return interaction.update({
        content: `🗑️ Scoreboard **${board.name}** has been permanently deleted.`,
        embeds: [],
        components: [],
      });
    },
  },

  // ── User select handler ────────────────────────────────────────────────
  {
    customIdPrefix: "sb:panel:usertarget:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];
      const selectedUser = interaction.users?.first();
      if (!selectedUser) return;

      panelState.patch(interaction.user.id, interaction.guildId, {
        selectedTargetId: selectedUser.id,
        selectedTargetType: "USER",
        selectedTargetLabel: `<@${selectedUser.id}>`,
      });

      return refreshBoardPanel(interaction, boardId);
    },
  },

  // ── Role select handler ────────────────────────────────────────────────
  {
    customIdPrefix: "sb:panel:roletarget:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];
      const selectedRole = interaction.roles?.first();
      if (!selectedRole) return;

      panelState.patch(interaction.user.id, interaction.guildId, {
        selectedTargetId: selectedRole.id,
        selectedTargetType: "ROLE",
        selectedTargetLabel: `<@&${selectedRole.id}>`,
      });

      return refreshBoardPanel(interaction, boardId);
    },
  },

  // ── Score type select handler ──────────────────────────────────────────
  {
    customIdPrefix: "sb:panel:scoretype:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];
      const value = interaction.values?.[0];

      if (value === "overall") {
        panelState.patch(interaction.user.id, interaction.guildId, {
          selectedScoreTypeId: null,
          selectedScoreTypeName: "Overall",
        });
      } else {
        const scoreTypes = await getScoreTypes(boardId).catch(() => []);
        const type = scoreTypes.find((t) => t.id === value);
        panelState.patch(interaction.user.id, interaction.guildId, {
          selectedScoreTypeId: value,
          selectedScoreTypeName: type?.name || "Unknown",
        });
      }

      return refreshBoardPanel(interaction, boardId);
    },
  },
];

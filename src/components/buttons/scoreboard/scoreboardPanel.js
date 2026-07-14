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
  editEntry,
  pushLiveEmbed,
  pushEntryLiveEmbed,
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
  const board = await prisma.scoreboard.findUnique({
    where: { id: boardId },
    include: { entries: true },
  });
  if (!board) {
    const gonePayload = {
      content: "⚠️ This scoreboard no longer exists.",
      embeds: [],
      components: [],
    };
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(gonePayload).catch(() => {});
    }
    return interaction.update(gonePayload).catch(() => {});
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
  const payload = { embeds: [embed], components };
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload).catch(() => {});
  }
  return interaction.update(payload).catch(() => {});
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

        // Update live scoreboard embed in the target channel
        const liveBoard = await prisma.scoreboard.findUnique({
          where: { id: boardId },
          include: { entries: true },
        });
        if (liveBoard?.channelId) {
          pushLiveEmbed(interaction.client, liveBoard).catch(() => {});
          // Also update per-entry live embeds for role boards
          const freshEntry = liveBoard.entries.find(
            (e) => e.targetId === state.selectedTargetId,
          );
          if (freshEntry) {
            pushEntryLiveEmbed(
              interaction.client,
              interaction.guild,
              liveBoard,
              freshEntry,
            ).catch(() => {});
          }
        }

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

        // Update live scoreboard embed in the target channel
        const liveBoard = await prisma.scoreboard.findUnique({
          where: { id: boardId },
          include: { entries: true },
        });
        if (liveBoard?.channelId) {
          pushLiveEmbed(interaction.client, liveBoard).catch(() => {});
          const freshEntry = liveBoard.entries.find(
            (e) => e.targetId === state.selectedTargetId,
          );
          if (freshEntry) {
            pushEntryLiveEmbed(
              interaction.client,
              interaction.guild,
              liveBoard,
              freshEntry,
            ).catch(() => {});
          }
        }

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
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      const board = await getScoreboardById(boardId);
      if (!board) {
        return interaction.reply({
          content: "⚠️ This scoreboard no longer exists.",
          flags: 64,
        });
      }

      // Show a channel select to choose where to post the scoreboard
      const { ChannelSelectMenuBuilder, ChannelType } = require("discord.js");
      const channelRow = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`sb:panel:public_channel:${boardId}`)
          .setPlaceholder(
            "Select a channel or thread to post the scoreboard...",
          )
          .setChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.PublicThread,
            ChannelType.PrivateThread,
          ),
      );

      const cancelRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sb:panel:back:${boardId}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("⬅️"),
      );

      const embed = new EmbedBuilder()
        .setColor(0x1a7a9e)
        .setTitle("📢 Post Scoreboard")
        .setDescription(
          `Select a **channel or thread** below to post the **${board.liveTitle || board.name}** scoreboard.`,
        )
        .setFooter({
          text: "The scoreboard embed with interactive controls will be posted there.",
        });

      return interaction.update({
        embeds: [embed],
        components: [channelRow, cancelRow],
      });
    },
  },

  // ── Board panel: public channel selected ───────────────────────────────
  {
    customIdPrefix: "sb:panel:public_channel:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];
      const targetChannel = interaction.channels?.first();
      if (!targetChannel) {
        return interaction.update({
          content: "⚠️ No channel selected.",
          embeds: [],
          components: [],
        });
      }

      const board = await getScoreboardById(boardId);
      if (!board) {
        return interaction.update({
          content: "⚠️ This scoreboard no longer exists.",
          embeds: [],
          components: [],
        });
      }

      // Check bot permissions in the target channel
      const botMember = interaction.guild?.members?.me;
      const permsInChannel = targetChannel.permissionsFor(
        botMember ?? interaction.client.user,
      );
      if (
        !permsInChannel?.has("SendMessages") ||
        !permsInChannel?.has("EmbedLinks")
      ) {
        return interaction.update({
          content: `❌ Missing permissions in ${targetChannel}. I need **Send Messages** and **Embed Links** permissions.`,
          embeds: [],
          components: [],
        });
      }

      await interaction.deferUpdate();

      try {
        const { guildIconUrl, discoreIconUrl } = getIconUrls(interaction);
        const scoreTypes = await getScoreTypes(board.id).catch(() => []);
        const hasScoreTypes = scoreTypes.length > 0;

        const viewMode = hasScoreTypes
          ? "flat"
          : board.hasCategories
            ? "combined"
            : "flat";

        const {
          embed: scoreboardEmbed,
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

        const msg = await targetChannel
          .send({ embeds: [scoreboardEmbed], components })
          .catch((err) => {
            throw new Error(`Failed to send message: ${err.message}`);
          });

        // Update board's channelId and messageId so repair/push works
        await prisma.scoreboard
          .update({
            where: { id: board.id },
            data: { channelId: targetChannel.id, messageId: msg.id },
          })
          .catch(() => {});

        const successEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("✅ Scoreboard Posted")
          .setDescription(
            `Scoreboard **${board.liveTitle || board.name}** has been posted in ${targetChannel}.\n\n[🔗 Jump to message](${msg.url})`,
          );

        return interaction.editReply({
          embeds: [successEmbed],
          components: [],
        });
      } catch (err) {
        return interaction.editReply({
          content: `❌ Failed to post scoreboard: ${err.message}`,
          embeds: [],
          components: [],
        });
      }
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

      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sb:customize:addscoretype:${boardId}`)
          .setLabel("Add Score Type")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🏷️"),
        new ButtonBuilder()
          .setCustomId(`sb:customize:removeimage:${boardId}`)
          .setLabel("Remove Image")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🗑️"),
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
            "• **Set Image** — Upload a thumbnail image\n" +
            "• **Add Score Type** — Create categories like 4x, 1x, Apocalypse\n" +
            "• **Remove Image** — Clear the current image",
        );

      return interaction.update({
        embeds: [embed],
        components: [row1, row2, row3],
      });
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

  // ── Customize: set image (file upload) ────────────────────────────────
  {
    customIdPrefix: "sb:customize:setimage:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      const { FileUploadBuilder, LabelBuilder } = require("discord.js");

      const label = new LabelBuilder()
        .setLabel("Scoreboard Image")
        .setDescription(
          "Upload a PNG, JPG, JPEG, or WEBP image to use as this scoreboard thumbnail. Max 5 MB.",
        )
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId("scoreboard_image_upload")
            .setRequired(true)
            .setMinValues(1)
            .setMaxValues(1),
        );

      const modal = new ModalBuilder()
        .setCustomId(`sb:modal:uploadimage:${boardId}`)
        .setTitle("Upload Scoreboard Image")
        .addComponents(label);

      return interaction.showModal(modal);
    },
  },

  // ── Customize: add score type modal ───────────────────────────────────
  {
    customIdPrefix: "sb:customize:addscoretype:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      const modal = new ModalBuilder()
        .setCustomId(`sb:modal:addscoretype:${boardId}`)
        .setTitle("Add Score Type")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("typename")
              .setLabel("Score Type Name (e.g. WW3 4X, Apocalypse)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(32)
              .setPlaceholder("e.g. WW3 1X, WW3 4X, Apocalypse"),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  // ── Customize: remove image ───────────────────────────────────────────
  {
    customIdPrefix: "sb:customize:removeimage:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

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
          setRoleImage,
        } = require("../../../modules/scoreboards/service");
        await setRoleImage({
          guildId: interaction.guildId,
          name: board.name,
          imageUrl: null,
        });

        pushLiveEmbed(interaction.client, {
          ...board,
          roleImageUrl: null,
          entries: await prisma.scoreboardEntry.findMany({
            where: { scoreboardId: boardId },
          }),
        }).catch(() => {});

        await refreshBoardPanel(interaction, boardId);

        return interaction.followUp({
          content: "✅ Image removed from scoreboard.",
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

  // ── Advanced: repair ───────────────────────────────────────────────────
  {
    customIdPrefix: "sb:adv:repair:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      await interaction.deferUpdate();

      try {
        // Step 1: Repair the main board-level live embed
        const boardStatus = await repairLiveEmbed(interaction.client, boardId);

        // Step 2: Fetch fresh board data with entries for per-entry repairs
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

        // Step 3: Repair per-entry live embeds (role boards etc)
        let entryRepairs = 0;
        let entryFailures = 0;
        for (const entry of board.entries) {
          try {
            if (entry.liveChannelId && entry.liveMessageId) {
              // Try to update existing entry embed, if it fails, recreate it
              const ch = await interaction.client.channels
                .fetch(entry.liveChannelId)
                .catch(() => null);
              if (ch) {
                let msg = await ch.messages
                  .fetch(entry.liveMessageId)
                  .catch(() => null);
                if (!msg) {
                  // Message deleted/missing — recreate via pushEntryLiveEmbed
                  await pushEntryLiveEmbed(
                    interaction.client,
                    interaction.guild,
                    board,
                    entry,
                  );
                  entryRepairs++;
                }
              }
            }
          } catch {
            entryFailures++;
          }
        }

        // Build result message
        const msgs = {
          REPAIRED: "✅ Live message repaired — recreated.",
          OK: "✅ Scoreboard is healthy. Nothing to repair.",
          NO_CHANNEL: "⚠️ No live channel configured.",
          CHANNEL_MISSING: "❌ The configured channel no longer exists.",
          NO_PERMS: "❌ Missing Send Messages permission in the channel.",
        };

        const boardResult = msgs[boardStatus] || `Board repair: ${boardStatus}`;
        const entryResult =
          entryRepairs > 0
            ? `\n✅ ${entryRepairs} per-entry embeds repaired.`
            : entryFailures > 0
              ? `\n⚠️ ${entryFailures} per-entry embeds failed to repair.`
              : "";

        return interaction.editReply({
          content: boardResult + entryResult,
          embeds: [],
          components: [],
        });
      } catch (err) {
        return interaction.editReply({
          content: `❌ Repair failed: ${err.message}`,
          embeds: [],
          components: [],
        });
      }
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

  // ── Board panel: edit entry modal ─────────────────────────────────────
  {
    customIdPrefix: "sb:panel:editentry:",
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

      // Find the current entry to pre-fill
      const board = await prisma.scoreboard.findUnique({
        where: { id: boardId },
        include: { entries: true },
      });
      if (!board) {
        return interaction.reply({
          content: "⚠️ This scoreboard no longer exists.",
          flags: 64,
        });
      }

      const entry = board.entries.find(
        (e) => e.targetId === state.selectedTargetId,
      );

      const modal = new ModalBuilder()
        .setCustomId(`sb:modal:editentry:${boardId}`)
        .setTitle("Edit Score Entry")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("wins")
              .setLabel("Wins")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(entry?.wins ?? 0)),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("losses")
              .setLabel("Losses")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(entry?.losses ?? 0)),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("points")
              .setLabel("Points")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(entry?.points ?? 0)),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("win_streak")
              .setLabel("Win Streak")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setValue(String(entry?.winStreak ?? 0)),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("loss_streak")
              .setLabel("Loss Streak")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setValue(String(entry?.lossStreak ?? 0)),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  // ── Board panel: delete entry confirmation ────────────────────────────
  {
    customIdPrefix: "sb:panel:deleteentry:",
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

      const board = await prisma.scoreboard.findUnique({
        where: { id: boardId },
        include: { entries: true },
      });
      if (!board) {
        return interaction.reply({
          content: "⚠️ This scoreboard no longer exists.",
          flags: 64,
        });
      }

      const entry = board.entries.find(
        (e) => e.targetId === state.selectedTargetId,
      );
      if (!entry) {
        return interaction.reply({
          content: `⚠️ No entry found for ${state.selectedTargetLabel} on this scoreboard.`,
          flags: 64,
        });
      }

      const embed = buildConfirmationEmbed({
        title: "🗑️ Delete Entry?",
        description: `Are you sure you want to remove **${state.selectedTargetLabel || entry.targetId}** from **${board.liveTitle || board.name}**?`,
        warning: `Current stats: ${entry.wins}W / ${entry.losses}L / ${entry.points}pts · This cannot be undone.`,
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sb:panel:confirmdeleteentry:${boardId}`)
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

  // ── Board panel: confirm delete entry ─────────────────────────────────
  {
    customIdPrefix: "sb:panel:confirmdeleteentry:",
    async execute(interaction) {
      const perms = await assertCanManage(interaction);
      if (perms) return interaction.reply({ ...perms, flags: 64 });

      const parts = interaction.customId.split(":");
      const boardId = parts[3];

      const state = panelState.get(interaction.user.id, interaction.guildId);
      if (!state?.selectedTargetId) {
        return interaction.update({
          content: "⚠️ Session expired. Please reopen the scoreboard panel.",
          embeds: [],
          components: [],
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
          deleteEntry: deleteEntryService,
        } = require("../../../modules/scoreboards/service");
        const updatedBoard = await deleteEntryService({
          guildId: interaction.guildId,
          scoreboardName: board.name,
          targetId: state.selectedTargetId,
          adminId: interaction.user.id,
        });

        pushLiveEmbed(interaction.client, updatedBoard).catch(() => {});

        // Clear target selection
        panelState.patch(interaction.user.id, interaction.guildId, {
          selectedTargetId: null,
          selectedTargetType: null,
          selectedTargetLabel: null,
        });

        await refreshBoardPanel(interaction, boardId);

        return interaction.followUp({
          content: `✅ Entry for ${state.selectedTargetLabel} removed from **${board.liveTitle || board.name}**.`,
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

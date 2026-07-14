"use strict";

const { SlashCommandBuilder } = require("discord.js");
const prisma = require("../../../lib/prisma");
const {
  listActiveScoreboards,
} = require("../../../modules/scoreboards/service");
const { assertCanManage } = require("../../../lib/scoreboardGuard");
const {
  buildDashboardEmbed,
  buildBoardPanelEmbed,
} = require("../../../modules/scoreboards/dashboardEmbeds");
const { getScoreTypes } = require("../../../modules/scoreboards/scoreTypes");
const panelState = require("../../../modules/scoreboards/panelState");
const {
  buildDashboardSelectMenus,
  buildDashboardButtons,
  buildBoardPanelComponents,
} = require("../../../modules/scoreboards/panelComponents");

// ─── helpers ──────────────────────────────────────────────────────────────────

function getIconUrls(interaction) {
  const guildIconUrl =
    interaction.guild?.iconURL({ size: 128, extension: "png" }) ?? undefined;
  const discoreIconUrl =
    interaction.client.user?.displayAvatarURL({
      size: 64,
      extension: "png",
    }) ?? undefined;
  return { guildIconUrl, discoreIconUrl };
}

/**
 * Open a board control panel (ephemeral).
 */
async function openBoardPanel(
  interaction,
  board,
  canManage,
  guildIconUrl,
  discoreIconUrl,
) {
  const scoreTypes = await getScoreTypes(board.id).catch(() => []);
  const scoreTypeCount = scoreTypes.length;

  // Store panel state
  panelState.set(interaction.user.id, interaction.guildId, {
    boardId: board.id,
    selectedTargetId: null,
    selectedTargetType: null,
    selectedTargetLabel: null,
    selectedScoreTypeId: null,
    selectedScoreTypeName: "Overall",
  });

  const embed = await buildBoardPanelEmbed({
    board,
    entryCount: board.entries?.length || 0,
    scoreTypeCount,
    selectedScoreTypeName: "Overall",
    canManage,
    guildIconUrl,
    discoreIconUrl,
  });

  const components = buildBoardPanelComponents(board, canManage, scoreTypes);

  const payload = { embeds: [embed], components };
  if (interaction.deferred || interaction.replied) {
    return interaction
      .editReply(payload)
      .catch(() => interaction.followUp({ ...payload, flags: 64 }));
  }
  return interaction.reply({ ...payload, flags: 64 });
}

// ─── autocomplete ─────────────────────────────────────────────────────────────

async function autocomplete(interaction) {
  const focusedOpt = interaction.options.getFocused(true);
  const focused = (focusedOpt?.value || "").toLowerCase();

  if (focusedOpt?.name === "name") {
    const boards = await prisma.scoreboard.findMany({
      where: { guildId: interaction.guildId, isArchived: false },
      include: { entries: true },
      orderBy: { name: "asc" },
    });

    const filtered = boards
      .filter((b) => b.name.toLowerCase().includes(focused))
      .slice(0, 25);

    const choices = filtered.map((b) => {
      const modeLabel = b.metric === "POINTS" ? "Points" : "Win/Loss";
      const typeLabel =
        b.type === "ROLE" ? "Roles" : b.type === "CUSTOM" ? "Custom" : "Users";
      return {
        name: `${b.liveTitle || b.name}  (${modeLabel} · ${typeLabel} · ${b.entries.length} entries)`,
        value: b.name,
      };
    });

    return interaction.respond(choices).catch(() => {});
  }

  await interaction.respond([]).catch(() => {});
}

// ─── main command ─────────────────────────────────────────────────────────────

module.exports = {
  scope: "PUBLIC",
  autocomplete,
  data: new SlashCommandBuilder()
    .setName("scoreboard")
    .setDescription(
      "Open the Scoreboard Control Centre to manage your server's scoreboards.",
    )
    .addStringOption((o) =>
      o
        .setName("name")
        .setDescription("Jump directly to a specific scoreboard")
        .setRequired(false)
        .setAutocomplete(true),
    ),

  async execute(interaction) {
    const boardName = interaction.options.getString("name");
    const { guildIconUrl, discoreIconUrl } = getIconUrls(interaction);

    // If name provided, open that board directly
    if (boardName) {
      const canManage = !(await assertCanManage(interaction));
      const board = await prisma.scoreboard.findFirst({
        where: {
          guildId: interaction.guildId,
          name: { equals: boardName, mode: "insensitive" },
          isArchived: false,
        },
        include: { entries: true },
      });

      if (!board) {
        return interaction.reply({
          content: `❌ No active scoreboard named **${boardName}** found.`,
          flags: 64,
        });
      }

      return openBoardPanel(
        interaction,
        board,
        canManage,
        guildIconUrl,
        discoreIconUrl,
      );
    }

    // Otherwise show dashboard
    const boards = await listActiveScoreboards(interaction.guildId);
    const archivedCount = await prisma.scoreboard.count({
      where: { guildId: interaction.guildId, isArchived: true },
    });

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

    return interaction.reply({ embeds: [embed], components, flags: 64 });
  },
};

// Export helpers for use by component handlers
module.exports.openBoardPanel = openBoardPanel;
module.exports.getIconUrls = getIconUrls;

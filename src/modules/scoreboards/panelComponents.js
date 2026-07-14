"use strict";

const {
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
} = require("discord.js");

const DASHBOARD_PAGE_SIZE = 25;

/**
 * Build the scoreboard selection dropdown for the dashboard.
 */
function buildDashboardSelectMenus(boards, page = 0) {
  const start = page * DASHBOARD_PAGE_SIZE;
  const slice = boards.slice(start, start + DASHBOARD_PAGE_SIZE);
  const totalPages = Math.max(
    1,
    Math.ceil(boards.length / DASHBOARD_PAGE_SIZE),
  );

  if (!slice.length) return { componentRow: null, totalPages, page };

  const select = new StringSelectMenuBuilder()
    .setCustomId(`sb:dashboard_select:${page}`)
    .setPlaceholder("Select a scoreboard to manage...")
    .addOptions(
      slice.map((b) => {
        const label = (b.liveTitle || b.name).substring(0, 100);
        const desc =
          `${b.metric === "POINTS" ? "Points" : "W/L"} · ${b.entries?.length || 0} entries`.substring(
            0,
            100,
          );
        return new StringSelectMenuOptionBuilder()
          .setLabel(label)
          .setDescription(desc)
          .setValue(b.id);
      }),
    );

  return {
    componentRow: new ActionRowBuilder().addComponents(select),
    totalPages,
    page,
  };
}

/**
 * Build the dashboard action buttons.
 */
function buildDashboardButtons(hasBoards) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sb:dashboard:create")
      .setLabel("Create Scoreboard")
      .setStyle(ButtonStyle.Success)
      .setEmoji("➕"),
    new ButtonBuilder()
      .setCustomId("sb:dashboard:scores")
      .setLabel("Scores")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📊"),
    new ButtonBuilder()
      .setCustomId("sb:dashboard:refresh")
      .setLabel("Refresh")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔄"),
    new ButtonBuilder()
      .setCustomId("sb:dashboard:close")
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("✖️"),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sb:dashboard:viewarchives")
      .setLabel("Archives")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("📦")
      .setDisabled(!hasBoards),
  );

  return [row1, row2];
}

/**
 * Build the board control panel components.
 */
function buildBoardPanelComponents(board, canManage, scoreTypes = []) {
  const rows = [];

  // Score type dropdown — always visible
  {
    const options = [
      new StringSelectMenuOptionBuilder()
        .setLabel("Overall (no category)")
        .setDescription("Add wins/losses without a category")
        .setValue("overall")
        .setDefault(true),
    ];
    for (const t of scoreTypes.slice(0, 23)) {
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(t.name.substring(0, 25))
          .setDescription(`Filter by ${t.name}`)
          .setValue(t.id),
      );
    }
    const typeRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`sb:panel:scoretype:${board.id}`)
        .setPlaceholder("Score type (e.g. 4x, 1x, Apocalypse)...")
        .addOptions(options),
    );
    rows.push(typeRow);
  }

  // Target selection row
  if (board.type === "USER") {
    const userRow = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`sb:panel:usertarget:${board.id}`)
        .setPlaceholder("Select a user target..."),
    );
    rows.push(userRow);
  } else if (board.type === "ROLE") {
    const roleRow = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(`sb:panel:roletarget:${board.id}`)
        .setPlaceholder("Select a role target..."),
    );
    rows.push(roleRow);
  }

  if (canManage) {
    // Score action buttons row 1
    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sb:panel:addwin:${board.id}`)
        .setLabel("+ Win")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🏆"),
      new ButtonBuilder()
        .setCustomId(`sb:panel:addloss:${board.id}`)
        .setLabel("+ Loss")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("💀"),
      new ButtonBuilder()
        .setCustomId(`sb:panel:points:${board.id}`)
        .setLabel("Points +/-")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("✏️"),
    );
    rows.push(actionRow);

    // Edit / Delete entry buttons row
    const entryRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sb:panel:editentry:${board.id}`)
        .setLabel("Edit Entry")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🧾"),
      new ButtonBuilder()
        .setCustomId(`sb:panel:deleteentry:${board.id}`)
        .setLabel("Delete Entry")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🗑️"),
    );
    rows.push(entryRow);

    // Management buttons row 1
    const mgmtRow1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sb:panel:public:${board.id}`)
        .setLabel("Show Public")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("📢"),
      new ButtonBuilder()
        .setCustomId(`sb:panel:refresh:${board.id}`)
        .setLabel("Refresh")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🔄"),
      new ButtonBuilder()
        .setCustomId(`sb:panel:customize:${board.id}`)
        .setLabel("Customize")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🎨"),
    );
    rows.push(mgmtRow1);

    // Management buttons row 2
    const mgmtRow2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sb:panel:advanced:${board.id}`)
        .setLabel("Advanced")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🛠️"),
      new ButtonBuilder()
        .setCustomId(`sb:panel:back:${board.id}`)
        .setLabel("Back")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("⬅️"),
    );
    rows.push(mgmtRow2);
  } else {
    const viewRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sb:panel:public:${board.id}`)
        .setLabel("Show Public")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("📢"),
      new ButtonBuilder()
        .setCustomId(`sb:panel:back:${board.id}`)
        .setLabel("Back")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("⬅️"),
    );
    rows.push(viewRow);
  }

  return rows;
}

module.exports = {
  buildDashboardSelectMenus,
  buildDashboardButtons,
  buildBoardPanelComponents,
  DASHBOARD_PAGE_SIZE,
};

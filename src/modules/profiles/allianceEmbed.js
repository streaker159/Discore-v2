const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const ALLIANCE_COLOR = 0x0f3460; // deep navy
const VICTORY_COLOR = 0x22c55e;
const DEFEAT_COLOR = 0xef4444;

function n(val, fallback = "N/A") {
  return val != null ? String(val) : fallback;
}

const RESULT_EMOJI = { VICTORY: "🟢", DEFEAT: "🔴", DRAW: "🟡" };

function buildAllianceEmbed(alliance) {
  const totalGames =
    (alliance.discoreWins ?? 0) + (alliance.discoreLosses ?? 0);
  const discoreWR =
    totalGames > 0
      ? `${((alliance.discoreWins / totalGames) * 100).toFixed(1)}%`
      : "N/A";

  const tagBadge = alliance.tag ? ` [${alliance.tag}]` : "";
  const verified = "✅"; // Alliances are always verified once registered

  const embed = new EmbedBuilder()
    .setColor(ALLIANCE_COLOR)
    .setTitle(`${verified} ${alliance.name}${tagBadge}`)
    .setTimestamp();

  if (alliance.logoUrl) embed.setThumbnail(alliance.logoUrl);
  if (alliance.bannerUrl) embed.setImage(alliance.bannerUrl);

  // Description + tags
  let desc = "";
  if (alliance.tags?.length) {
    desc += alliance.tags.map((t) => `\`${t}\``).join("  ") + "\n\n";
  }
  if (alliance.description) desc += alliance.description + "\n";
  if (alliance.discordInvite)
    desc += `\n🔗 [Join Discord](${alliance.discordInvite})`;
  if (!alliance.isPublic) desc += "\n🔒 *Private profile*";
  if (desc) embed.setDescription(desc.trim());

  // ── OFFICIAL STATS (IN-GAME) ─────────────────────────────
  embed.addFields(
    { name: "\u200b", value: "**🏛️ Official Stats (In-Game)**", inline: false },
    { name: "Rank", value: n(alliance.officialRank), inline: true },
    { name: "Elo", value: n(alliance.officialElo), inline: true },
    { name: "Wins", value: n(alliance.officialWins, "0"), inline: true },
    { name: "Losses", value: n(alliance.officialLosses, "0"), inline: true },
    {
      name: "Members",
      value:
        alliance.officialMembers != null
          ? `${alliance.officialMembers}${alliance.officialMaxMembers ? ` / ${alliance.officialMaxMembers}` : ""}`
          : "N/A",
      inline: true,
    },
    { name: "Country", value: n(alliance.country), inline: true },
    { name: "Founded", value: n(alliance.founded), inline: true },
  );

  // ── DISCORE VERIFIED STATS ────────────────────────────────
  embed.addFields(
    { name: "\u200b", value: "**✅ Discore Verified Stats**", inline: false },
    {
      name: "Discore Rank",
      value: alliance.discoreRank ? `#${alliance.discoreRank}` : "Unranked",
      inline: true,
    },
    { name: "Discore Elo", value: n(alliance.discoreElo), inline: true },
    {
      name: "Verified Wins",
      value: n(alliance.discoreWins, "0"),
      inline: true,
    },
    {
      name: "Verified Losses",
      value: n(alliance.discoreLosses, "0"),
      inline: true,
    },
    {
      name: "Season Record",
      value: n(alliance.seasonRecord, "0W – 0L"),
      inline: true,
    },
    { name: "Win Rate", value: discoreWR, inline: true },
  );

  // ── RECENT MATCHES ────────────────────────────────────────
  if (alliance.recentMatches?.length) {
    const lines = alliance.recentMatches.map((m) => {
      const emoji = RESULT_EMOJI[m.result] ?? "⚪";
      const tag = m.opponentTag ? ` [${m.opponentTag}]` : "";
      const time = `<t:${Math.floor(new Date(m.occurredAt).getTime() / 1000)}:R>`;
      return `${emoji} **${m.result}** vs **${m.opponentName}${tag}** ${time}`;
    });
    embed.addFields({
      name: "⚔️ Recent Verified Matches",
      value: lines.join("\n"),
      inline: false,
    });
  }

  embed.setFooter({ text: "Discore • Alliance System" });
  return embed;
}

function buildAllianceButtons(
  allianceId,
  viewerDiscordId,
  ownerId,
  managerRoleId,
  memberRoles,
) {
  const isManager =
    viewerDiscordId === ownerId ||
    (managerRoleId && memberRoles?.includes(managerRoleId));

  const row = new ActionRowBuilder();

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`profile:alliance:stats:${allianceId}`)
      .setLabel("⚔️ View Battle Stats")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`profile:alliance:members:${allianceId}`)
      .setLabel("👥 View Members")
      .setStyle(ButtonStyle.Secondary),
  );

  if (isManager) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`profile:alliance:update:${allianceId}`)
        .setLabel("📸 Update Profile")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`profile:alliance:edit:${allianceId}`)
        .setLabel("✏️ Edit Details")
        .setStyle(ButtonStyle.Secondary),
    );
  }

  return [row];
}

// Ephemeral parse-preview
function buildAllianceParsePreviewEmbed(parsed, screenshotCount) {
  const embed = new EmbedBuilder()
    .setColor(0x0e7490)
    .setTitle("🔍 Alliance Data Extracted")
    .setDescription(
      `Found the following from **${screenshotCount}** screenshot(s). Confirm or edit before saving.`,
    )
    .addFields(
      { name: "Name", value: n(parsed.name), inline: true },
      { name: "Rank", value: n(parsed.rank), inline: true },
      { name: "Elo", value: n(parsed.elo), inline: true },
      { name: "Wins", value: n(parsed.wins, "0"), inline: true },
      { name: "Losses", value: n(parsed.losses, "0"), inline: true },
      {
        name: "Members",
        value:
          parsed.members != null
            ? `${parsed.members}${parsed.maxMembers ? `/${parsed.maxMembers}` : ""}`
            : "N/A",
        inline: true,
      },
      { name: "Country", value: n(parsed.country), inline: true },
      { name: "Founded", value: n(parsed.founded), inline: true },
    )
    .setFooter({ text: "Use the buttons below to confirm, edit, or cancel." });
  return embed;
}

function buildAllianceParsePreviewButtons(token) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`profile:alliance:confirm:${token}`)
      .setLabel("✅ Confirm & Save")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`profile:alliance:editdetails:${token}`)
      .setLabel("✏️ Edit Details")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`profile:alliance:cancel:${token}`)
      .setLabel("✖ Cancel")
      .setStyle(ButtonStyle.Danger),
  );
  return [row];
}

module.exports = {
  buildAllianceEmbed,
  buildAllianceButtons,
  buildAllianceParsePreviewEmbed,
  buildAllianceParsePreviewButtons,
};

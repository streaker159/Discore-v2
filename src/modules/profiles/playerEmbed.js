const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const PROFILE_COLOR = 0x1a3a5c; // dark navy
const STATS_COLOR = 0x0e7490; // teal

function n(val, fallback = "N/A") {
  return val != null ? String(val) : fallback;
}

function pct(val, fallback = "N/A") {
  return val != null ? `${val}%` : fallback;
}

function buildPlayerEmbed(profile, discordUser) {
  const name =
    profile.gameUsername || discordUser?.username || "Unknown Player";
  const rank = profile.inGameRank ? ` — ${profile.inGameRank}` : "";
  const elo = n(profile.discoreElo);

  const embed = new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle(`🎖️ ${name}${rank}`)
    .setTimestamp();

  // Avatar thumbnail
  if (discordUser)
    embed.setThumbnail(discordUser.displayAvatarURL({ size: 128 }));

  // ── HEADER LINE ──────────────────────────────────────────
  let desc = `Discord: <@${profile.discordId}>`;
  if (profile.game) desc += `  •  Game: **${profile.game}**`;
  if (!profile.isPublic) desc += "\n🔒 *Private profile*";
  embed.setDescription(desc);

  // ── CURRENT ALLIANCE ─────────────────────────────────────
  if (profile.currentAlliance) {
    const tag = profile.currentAllianceTag
      ? ` [${profile.currentAllianceTag}]`
      : "";
    const joined = profile.currentAllianceJoinedAt
      ? `<t:${Math.floor(profile.currentAllianceJoinedAt.getTime() / 1000)}:d>`
      : "Unknown";
    embed.addFields({
      name: "🏰 Current Alliance",
      value: `**${profile.currentAlliance}${tag}**\nJoined: ${joined}`,
      inline: false,
    });
  }

  // ── PREVIOUS ALLIANCES ───────────────────────────────────
  const history = profile.allianceHistory?.filter((h) => h.leftAt != null);
  if (history?.length) {
    const lines = history.slice(0, 4).map((h) => {
      const tag = h.allianceTag ? ` [${h.allianceTag}]` : "";
      const from = `<t:${Math.floor(new Date(h.joinedAt).getTime() / 1000)}:d>`;
      const to = `<t:${Math.floor(new Date(h.leftAt).getTime() / 1000)}:d>`;
      return `• **${h.allianceName}${tag}** ${from} – ${to}`;
    });
    embed.addFields({
      name: "📋 Previous Alliances",
      value: lines.join("\n"),
      inline: false,
    });
  }

  // ── OFFICIAL STATS (2-col grid) ─────────────────────────
  embed.addFields(
    { name: "\u200b", value: "**🛡️ Official Stats**", inline: false },
    { name: "Level", value: n(profile.level), inline: true },
    {
      name: "XP",
      value:
        profile.xpCurrent != null
          ? `${profile.xpCurrent.toLocaleString()} / ${n(profile.xpMax?.toLocaleString())}`
          : "N/A",
      inline: true,
    },
    {
      name: "K/D Ratio",
      value: profile.kdRatio != null ? profile.kdRatio.toFixed(2) : "N/A",
      inline: true,
    },
    {
      name: "Provinces Taken",
      value: n(profile.provincesTaken?.toLocaleString()),
      inline: true,
    },
    {
      name: "Provinces Lost",
      value: n(profile.provincesLost?.toLocaleString()),
      inline: true,
    },
    { name: "Games Joined", value: n(profile.gamesJoined), inline: true },
    {
      name: "Solo Victories",
      value: n(profile.soloVictories, "0"),
      inline: true,
    },
    {
      name: "Coalition Victories",
      value: n(profile.coalitionVictories, "0"),
      inline: true,
    },
    {
      name: "Overall Rank",
      value: n(profile.overallRank?.toLocaleString()),
      inline: true,
    },
    { name: "Member Since", value: n(profile.memberSince), inline: true },
    { name: "Last Online", value: n(profile.lastOnline), inline: true },
    {
      name: "Platform",
      value:
        profile.playedOnPC != null || profile.playedOnMobile != null
          ? `PC ${pct(profile.playedOnPC)} / Mobile ${pct(profile.playedOnMobile)}`
          : "N/A",
      inline: true,
    },
  );

  // ── DISCORE VERIFIED STATS ────────────────────────────────
  embed.addFields(
    { name: "\u200b", value: "**✅ Discore Stats**", inline: false },
    { name: "Discore Elo", value: elo, inline: true },
    { name: "Role", value: n(profile.role), inline: true },
    {
      name: "Performance Score",
      value:
        profile.performanceScore != null
          ? `${profile.performanceScore} / 100`
          : "N/A",
      inline: true,
    },
  );

  // ── COMBAT STYLE ─────────────────────────────────────────
  if (profile.combatStyle || profile.playstyle) {
    embed.addFields({
      name: "⚔️ Combat Style / Recruitment Snapshot",
      value: profile.combatStyle || profile.playstyle || "Not set",
      inline: false,
    });
  }

  embed.setFooter({ text: "Discore • Profile System" });
  return embed;
}

function buildPlayerButtons(profileDiscordId, viewerDiscordId) {
  const isOwn = profileDiscordId === viewerDiscordId;
  const row = new ActionRowBuilder();

  if (isOwn) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("profile:player:update")
        .setLabel("📸 Update Profile")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("profile:player:edit")
        .setLabel("✏️ Edit Stats")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("profile:player:privacy")
        .setLabel("🔒 Privacy")
        .setStyle(ButtonStyle.Secondary),
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`profile:player:view:${profileDiscordId}`)
        .setLabel("🔄 Refresh")
        .setStyle(ButtonStyle.Secondary),
    );
  }

  return [row];
}

// Ephemeral "parse preview" embed shown before confirmation
function buildParsePreviewEmbed(parsed, screenshotCount) {
  const embed = new EmbedBuilder()
    .setColor(STATS_COLOR)
    .setTitle("🔍 Profile Data Extracted")
    .setDescription(
      `I found the following data from **${screenshotCount}** screenshot(s). Review and confirm, or edit before saving.`,
    )
    .addFields(
      { name: "Username", value: n(parsed.gameUsername), inline: true },
      { name: "Rank", value: n(parsed.inGameRank), inline: true },
      {
        name: "Alliance",
        value: parsed.allianceName
          ? `${parsed.allianceName}${parsed.allianceTag ? ` [${parsed.allianceTag}]` : ""}`
          : "N/A",
        inline: true,
      },
      { name: "Level", value: n(parsed.level), inline: true },
      {
        name: "K/D Ratio",
        value: parsed.kdRatio != null ? String(parsed.kdRatio) : "N/A",
        inline: true,
      },
      {
        name: "Units Killed",
        value: n(parsed.unitsKilled?.toLocaleString?.() ?? parsed.unitsKilled),
        inline: true,
      },
      {
        name: "Provinces Taken",
        value: n(
          parsed.provincesTaken?.toLocaleString?.() ?? parsed.provincesTaken,
        ),
        inline: true,
      },
      { name: "Games Joined", value: n(parsed.gamesJoined), inline: true },
      {
        name: "Overall Rank",
        value: n(parsed.overallRank?.toLocaleString?.() ?? parsed.overallRank),
        inline: true,
      },
    )
    .setFooter({ text: "Use the buttons below to confirm, edit, or cancel." });

  return embed;
}

function buildParsePreviewButtons(token) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`profile:player:confirm:${token}`)
      .setLabel("✅ Confirm & Save")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`profile:player:editbasic:${token}`)
      .setLabel("✏️ Edit Basic Stats")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`profile:player:editcombat:${token}`)
      .setLabel("✏️ Edit Combat Stats")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`profile:player:cancel:${token}`)
      .setLabel("✖ Cancel")
      .setStyle(ButtonStyle.Danger),
  );
  return [row];
}

module.exports = {
  buildPlayerEmbed,
  buildPlayerButtons,
  buildParsePreviewEmbed,
  buildParsePreviewButtons,
};

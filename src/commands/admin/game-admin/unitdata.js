"use strict";

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { requireBotAdmin } = require("../../../lib/ownerGuard");
const { getGameChoices } = require("../../../modules/gameData/wikiSources");
const { syncGame, syncPage, approveDraft, getSyncStatus, initializeDataSources } = require("../../../modules/gameData/unitImportService");
const repo = require("../../../modules/gameData/unitRepository");

const gameChoices = getGameChoices();

module.exports = {
  scope: "BOT_OWNER",
  data: new SlashCommandBuilder()
    .setName("unitdata")
    .setDescription("Owner-only unit database import and management.")
    .addSubcommand((s) =>
      s.setName("sync-game").setDescription("Sync all unit data for a game from wiki API.")
        .addStringOption((o) => o.setName("game").setDescription("Game to sync").setRequired(true).addChoices(...gameChoices))
    )
    .addSubcommand((s) =>
      s.setName("sync-page").setDescription("Sync a single wiki page.")
        .addStringOption((o) => o.setName("game").setDescription("Game").setRequired(true).addChoices(...gameChoices))
        .addStringOption((o) => o.setName("page").setDescription("Wiki page title (e.g. Mobile Radar)").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("status").setDescription("Show sync status for all games.")
    )
    .addSubcommand((s) =>
      s.setName("preview").setDescription("Preview pending import drafts.")
        .addStringOption((o) => o.setName("game").setDescription("Filter by game").addChoices(...gameChoices))
    )
    .addSubcommand((s) =>
      s.setName("approve").setDescription("Approve a draft into the verified database.")
        .addStringOption((o) => o.setName("draft_id").setDescription("Draft ID to approve").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("reject").setDescription("Reject a draft.")
        .addStringOption((o) => o.setName("draft_id").setDescription("Draft ID to reject").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("init").setDescription("Initialize game data source records.")
    ),
  async execute(interaction) {
    const ok = await requireBotAdmin(interaction);
    if (!ok) return;
    const sub = interaction.options.getSubcommand();

    if (sub === "init") {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      await initializeDataSources();
      return interaction.editReply({ content: "✅ Game data sources initialized." });
    }

    if (sub === "sync-game") {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const gameKey = interaction.options.getString("game", true);
      const result = await syncGame(gameKey);
      if (!result.ok) return interaction.editReply({ content: `❌ Sync failed: ${result.error}` });

      const embed = new EmbedBuilder().setTitle("📚 Unit Data Sync Complete").setColor(0x1a7a9e)
        .addFields(
          { name: "Game", value: result.game, inline: true },
          { name: "Source", value: result.source, inline: true },
          { name: "Pages Scanned", value: String(result.pagesScanned), inline: true },
          { name: "Tables Found", value: String(result.tablesFound), inline: true },
          { name: "Draft Units Created", value: String(result.draftCount), inline: true },
          { name: "Low Confidence", value: String(result.lowConfidence), inline: true },
        )
        .setFooter({ text: "Use /unitdata preview to review drafts" }).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === "sync-page") {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const gameKey = interaction.options.getString("game", true);
      const page = interaction.options.getString("page", true);
      const result = await syncPage(gameKey, page);
      if (!result.ok) return interaction.editReply({ content: `❌ Page sync failed: ${result.error}` });
      return interaction.editReply({ content: `✅ Page **${result.page}** synced. ${result.draftCount} drafts created (${result.lowConfidence} low confidence).` });
    }

    if (sub === "status") {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const statuses = await getSyncStatus();
      if (statuses.length === 0) return interaction.editReply({ content: "No game data sources configured. Run `/unitdata init` first." });

      const embed = new EmbedBuilder().setTitle("📊 Unit Data Status").setColor(0x1a7a9e);
      for (const s of statuses) {
        embed.addFields({
          name: s.game, value: [
            `Source: ${s.sourceName} (${s.sourceType})`,
            `Last Sync: ${s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : "Never"}`,
            `Pending Drafts: ${s.draftsPending}`,
            `Verified Units: ${s.verifiedUnits}`,
            s.lastError ? `Last Error: ${s.lastError.slice(0, 100)}` : "",
          ].filter(Boolean).join("\n"), inline: false,
        });
      }
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === "preview") {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const gameKey = interaction.options.getString("game");
      const drafts = gameKey ? await repo.getDrafts(gameKey) : await repo.getAllDrafts();
      if (drafts.length === 0) return interaction.editReply({ content: "No pending drafts to preview." });

      const embed = new EmbedBuilder().setTitle(`📋 Pending Drafts (${drafts.length})`).setColor(0x1a7a9e);
      for (const d of drafts.slice(0, 10)) {
        const u = d.parsedJson || {};
        embed.addFields({
          name: `${u.name || "Unknown"} [${d.confidence}]`,
          value: `Game: ${d.game}\nPage: ${d.sourcePage || "?"}\nID: \`${d.id}\`\nWarnings: ${d.warnings?.length || 0}`, inline: true,
        });
      }
      if (drafts.length > 10) embed.setFooter({ text: `Showing 10 of ${drafts.length} drafts` });
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === "approve") {
      const draftId = interaction.options.getString("draft_id", true);
      if (draftId.toLowerCase() === "all") {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const drafts = await repo.getAllDrafts("PENDING");
        if (drafts.length === 0) return interaction.editReply({ content: "No pending drafts to approve." });
        let ok = 0, fail = 0;
        for (const d of drafts) {
          const r = await approveDraft(d.id);
          r.ok ? ok++ : fail++;
        }
        return interaction.editReply({ content: `✅ Approved ${ok} drafts across all games.` + (fail ? ` ${fail} failed.` : "") });
      }
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const result = await approveDraft(draftId);
      if (!result.ok) return interaction.editReply({ content: `❌ Approval failed: ${result.error}` });
      return interaction.editReply({ content: result.message });
    }

    if (sub === "reject") {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const draftId = interaction.options.getString("draft_id", true);
      const draft = await repo.getDraftById(draftId);
      if (!draft) return interaction.editReply({ content: "Draft not found." });
      await repo.rejectDraft(draftId);
      return interaction.editReply({ content: `🚫 Draft rejected: ${draft.parsedJson?.name || "Unknown"}` });
    }
  },
};
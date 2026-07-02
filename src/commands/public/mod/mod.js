"use strict";

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  executeModAction,
} = require("../../../modules/moderation/services/moderationActionService");
const caseService = require("../../../modules/moderation/services/moderationCaseService");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");
const prisma = require("../../../lib/prisma");
const { requireFeature } = require("../../../lib/premiumGate");
const {
  parseDuration,
  formatDuration,
} = require("../../../modules/moderation/utils/durationParser");

function canUseModeratorActions(interaction) {
  return interaction.memberPermissions?.has(
    PermissionFlagsBits.ModerateMembers,
  );
}

function isPublicLookupSubcommand(sub) {
  return sub === "case" || sub === "cases";
}

function isRevokedOrCleared(moderationCase) {
  return moderationCase?.status === "REVOKED";
}

function getLatestAppeal(moderationCase) {
  const appeals = moderationCase?.appeals || [];
  return (
    appeals
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null
  );
}

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Moderation commands")
    .addSubcommand((sub) =>
      sub
        .setName("warn")
        .setDescription("Warn a user")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to warn").setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Reason for warning")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("mute")
        .setDescription("Mute a user")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to mute").setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Reason for mute")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("duration")
            .setDescription("Duration (e.g., 30m, 1 hour, 7 days, 1 month)"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("timeout")
        .setDescription("Timeout a user (Discord native, max 28 days)")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("User to timeout")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Reason for timeout")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("duration")
            .setDescription("Duration (e.g., 30m, 1 hour, 7 days, max 28 days)")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("ban")
        .setDescription("Ban a user")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to ban").setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Reason for ban")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("duration")
            .setDescription(
              "Duration (e.g., 7 days, 30 days, 1 month, leave empty for permanent)",
            ),
        )
        .addIntegerOption((opt) =>
          opt
            .setName("delete_days")
            .setDescription("Delete messages from last X days (0-7)")
            .setMinValue(0)
            .setMaxValue(7),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("unban")
        .setDescription("Unban a user (creates audit record)")
        .addStringOption((opt) =>
          opt
            .setName("user_id")
            .setDescription("User ID to unban")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Reason for unban")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("probation")
        .setDescription("Place user on probation (optional slowmode & role)")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("User to put on probation")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Reason for probation")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("duration")
            .setDescription("Duration (e.g., 7 days, 30 days, 1 week)")
            .setRequired(true),
        )
        .addRoleOption((opt) =>
          opt
            .setName("restriction_role")
            .setDescription(
              "Role to apply during probation (auto-removed on expiry)",
            ),
        )
        .addChannelOption((opt) =>
          opt
            .setName("slowmode_channel")
            .setDescription("Channel to apply slowmode to during probation"),
        )
        .addIntegerOption((opt) =>
          opt
            .setName("slowmode_seconds")
            .setDescription(
              "Slowmode seconds per message (max 21600 = 6 hours)",
            )
            .setMinValue(1)
            .setMaxValue(21600),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("note")
        .setDescription("Add a staff note to a moderation case")
        .addStringOption((opt) =>
          opt
            .setName("case_id")
            .setDescription("Case ID (MOD-xxxxx)")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("note")
            .setDescription("Note to add to the case")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("export")
        .setDescription("Export full case history as file (Premium)")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("User to export history for")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("case")
        .setDescription("View a moderation case with full details")
        .addStringOption((opt) =>
          opt
            .setName("case_id")
            .setDescription("Case ID (MOD-xxxxx)")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("cases")
        .setDescription("List moderation cases for a user")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to check").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("revoke")
        .setDescription(
          "Revoke/overturn a moderation action (keeps audit record)",
        )
        .addStringOption((opt) =>
          opt
            .setName("case_id")
            .setDescription("Case ID (MOD-xxxxx)")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName("reason").setDescription("Reason for revoking"),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // Public case lookups should be visible to everyone.
    // Moderator actions stay private to staff.
    await interaction.deferReply({
      flags: [MessageFlags.Ephemeral],
      ephemeral: !isPublicLookupSubcommand(sub),
    });

    try {
      const moderatorOnlySubs = new Set([
        "warn",
        "mute",
        "timeout",
        "ban",
        "unban",
        "probation",
        "note",
        "export",
        "revoke",
      ]);

      if (moderatorOnlySubs.has(sub) && !canUseModeratorActions(interaction)) {
        return interaction.editReply({
          content:
            "🚫 You need the Moderate Members permission to use this moderation action.",
        });
      }

      // ═══════════════════════════════════════════════════════
      // WARN
      // ═══════════════════════════════════════════════════════
      if (sub === "warn") {
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason", true);

        let targetMember;
        try {
          targetMember = await interaction.guild.members.fetch(user.id);
        } catch {
          // User not in guild
        }

        const result = await executeModAction({
          guild: interaction.guild,
          moderator: interaction.member,
          targetUser: user,
          targetMember,
          actionType: "WARN",
          reason,
          durationSeconds: null,
          interaction,
        });

        const embed = await createDiscoreEmbed(interaction, {
          title: "✅ Warning Issued",
          description: `${user.tag} has been warned`,
          fields: [
            { name: "Reason", value: reason },
            { name: "Case ID", value: result.case.publicId },
            {
              name: "DM Status",
              value: result.dmSent ? "✅ Sent" : "❌ Failed",
            },
          ],
          color: "#f39c12",
        });

        return interaction.editReply({ embeds: [embed] });
      }

      // ═══════════════════════════════════════════════════════
      // MUTE
      // ═══════════════════════════════════════════════════════
      if (sub === "mute") {
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason", true);
        const durationStr = interaction.options.getString("duration");

        const member = await interaction.guild.members.fetch(user.id);

        let durationSeconds = null;
        if (durationStr) {
          const parsed = parseDuration(durationStr);
          if (parsed.error) {
            return interaction.editReply({ content: `⚠️ ${parsed.error}` });
          }
          durationSeconds = parsed.seconds;
        }

        const result = await executeModAction({
          guild: interaction.guild,
          moderator: interaction.member,
          targetUser: user,
          targetMember: member,
          actionType: "MUTE",
          reason,
          durationSeconds,
          interaction,
        });

        if (result.actionError) {
          return interaction.editReply({
            content: `⚠️ ${result.actionError}`,
          });
        }

        const embed = await createDiscoreEmbed(interaction, {
          title: "✅ Mute Applied",
          description: `${user.tag} has been muted`,
          fields: [
            { name: "Reason", value: reason },
            {
              name: "Duration",
              value: durationSeconds
                ? formatDuration(durationSeconds)
                : "Indefinite",
            },
            { name: "Case ID", value: result.case.publicId },
          ],
          color: "#e67e22",
        });

        return interaction.editReply({ embeds: [embed] });
      }

      // ═══════════════════════════════════════════════════════
      // TIMEOUT
      // ═══════════════════════════════════════════════════════
      if (sub === "timeout") {
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason", true);
        const durationStr = interaction.options.getString("duration", true);

        const maxTimeout = 28 * 86400;
        const parsed = parseDuration(durationStr, maxTimeout);
        if (parsed.error) {
          return interaction.editReply({ content: `⚠️ ${parsed.error}` });
        }

        const member = await interaction.guild.members.fetch(user.id);

        const result = await executeModAction({
          guild: interaction.guild,
          moderator: interaction.member,
          targetUser: user,
          targetMember: member,
          actionType: "TIMEOUT",
          reason,
          durationSeconds: parsed.seconds,
          interaction,
        });

        const embed = await createDiscoreEmbed(interaction, {
          title: "✅ Timeout Applied",
          description: `${user.tag} has been timed out`,
          fields: [
            { name: "Reason", value: reason },
            { name: "Duration", value: formatDuration(parsed.seconds) },
            { name: "Case ID", value: result.case.publicId },
          ],
          color: "#e67e22",
        });

        return interaction.editReply({ embeds: [embed] });
      }

      // ═══════════════════════════════════════════════════════
      // BAN
      // ═══════════════════════════════════════════════════════
      if (sub === "ban") {
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason", true);
        const durationStr = interaction.options.getString("duration");
        const deleteDays = interaction.options.getInteger("delete_days") || 0;

        let targetMember;
        try {
          targetMember = await interaction.guild.members.fetch(user.id);
        } catch {
          // User not in guild
        }

        let durationSeconds = null;
        let durationDisplay = "Permanent";
        if (durationStr) {
          const parsed = parseDuration(durationStr);
          if (parsed.error) {
            return interaction.editReply({ content: `⚠️ ${parsed.error}` });
          }
          durationSeconds = parsed.seconds;
          durationDisplay = formatDuration(parsed.seconds);
        }

        const result = await executeModAction({
          guild: interaction.guild,
          moderator: interaction.member,
          targetUser: user,
          targetMember,
          actionType: "BAN",
          reason,
          durationSeconds,
          deleteMessageSeconds: deleteDays * 86400,
          interaction,
        });

        const embed = await createDiscoreEmbed(interaction, {
          title: "✅ Ban Applied",
          description: `${user.tag} has been banned`,
          fields: [
            { name: "Reason", value: reason },
            {
              name: "Duration",
              value: durationDisplay,
            },
            { name: "Case ID", value: result.case.publicId },
            {
              name: "Messages Deleted",
              value: deleteDays > 0 ? `Last ${deleteDays} day(s)` : "None",
              inline: true,
            },
            {
              name: "DM Status",
              value: result.dmSent ? "✅ Sent" : "❌ Failed",
              inline: true,
            },
          ],
          color: "#e74c3c",
        });

        return interaction.editReply({ embeds: [embed] });
      }

      // ═══════════════════════════════════════════════════════
      // UNBAN (with audit record)
      // ═══════════════════════════════════════════════════════
      if (sub === "unban") {
        const userId = interaction.options.getString("user_id", true);
        const reason = interaction.options.getString("reason", true);

        const result = await executeModAction({
          guild: interaction.guild,
          moderator: interaction.member,
          targetUserId: userId,
          moderatorId: interaction.user.id,
          actionType: "UNBAN",
          reason,
          durationSeconds: null,
          interaction,
        });

        const embed = await createDiscoreEmbed(interaction, {
          title: "✅ User Unbanned",
          description: `User ID: ${userId}`,
          fields: [
            { name: "Reason", value: reason },
            { name: "Case ID", value: result.case.publicId },
          ],
          color: "#2ecc71",
        });

        return interaction.editReply({ embeds: [embed] });
      }

      // ═══════════════════════════════════════════════════════
      // PROBATION
      // ═══════════════════════════════════════════════════════
      if (sub === "probation") {
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason", true);
        const durationStr = interaction.options.getString("duration", true);
        const restrictionRole = interaction.options.getRole("restriction_role");
        const slowmodeChannel =
          interaction.options.getChannel("slowmode_channel");
        const slowmodeSeconds =
          interaction.options.getInteger("slowmode_seconds");

        const parsed = parseDuration(durationStr);
        if (parsed.error) {
          return interaction.editReply({ content: `⚠️ ${parsed.error}` });
        }

        let targetMember;
        try {
          targetMember = await interaction.guild.members.fetch(user.id);
        } catch {
          // User not in guild
        }

        // Build extra probation options for staffNote tracking
        const probationExtras = [];
        if (restrictionRole)
          probationExtras.push(`Probation role: ${restrictionRole.id}`);
        if (slowmodeChannel && slowmodeSeconds) {
          probationExtras.push(`Slowmode channel: ${slowmodeChannel.id}`);
          probationExtras.push(`Slowmode seconds: ${slowmodeSeconds}`);
        }

        const result = await executeModAction({
          guild: interaction.guild,
          moderator: interaction.member,
          targetUser: user,
          targetMember,
          actionType: "PROBATION",
          reason,
          durationSeconds: parsed.seconds,
          probationRoleId: restrictionRole?.id || null,
          probationChannelId: slowmodeChannel?.id || null,
          probationSlowmodeSeconds: slowmodeSeconds || null,
          interaction,
        });

        // Append probation tracking info to staffNote
        if (probationExtras.length > 0) {
          const when = new Date().toISOString();
          const trackingNote = `[${when}] Probation settings:\n${probationExtras.join("\n")}`;
          await prisma.moderationCase.update({
            where: { id: result.case.id },
            data: {
              staffNote: result.case.staffNote
                ? `${result.case.staffNote}\n${trackingNote}`
                : trackingNote,
            },
          });
        }

        const embedFields = [
          { name: "Reason", value: reason },
          { name: "Duration", value: formatDuration(parsed.seconds) },
          { name: "Case ID", value: result.case.publicId },
        ];

        if (restrictionRole) {
          embedFields.push({
            name: "Restriction Role",
            value: `<@&${restrictionRole.id}> — auto-removed on expiry`,
            inline: true,
          });
        }

        if (slowmodeChannel && slowmodeSeconds) {
          embedFields.push({
            name: "Channel Slowmode",
            value: `<#${slowmodeChannel.id}> · ${formatDuration(slowmodeSeconds)} — auto-removed on expiry`,
            inline: true,
          });
        }

        embedFields.push({
          name: "Note",
          value: "This will be visible on their public profile",
        });

        const embed = await createDiscoreEmbed(interaction, {
          title: "✅ Probation Applied",
          description: `${user.tag} is on probation`,
          fields: embedFields,
          color: "#95a5a6",
        });

        return interaction.editReply({ embeds: [embed] });
      }

      // ═══════════════════════════════════════════════════════
      // NOTE — staff notes on cases
      // ═══════════════════════════════════════════════════════
      if (sub === "note") {
        const caseId = interaction.options.getString("case_id", true);
        const note = interaction.options.getString("note", true);

        const moderationCase = await caseService.getCaseByPublicId(caseId);
        if (!moderationCase) {
          return interaction.editReply({
            content: `⚠️ Case **${caseId}** not found.`,
          });
        }

        if (moderationCase.guildId !== interaction.guildId) {
          return interaction.editReply({
            content: `⚠️ Case **${caseId}** belongs to a different server.`,
          });
        }

        const when = new Date().toISOString();
        const noteLine = `[${when}] NOTE by ${interaction.user.id}: ${note}`;
        const staffNote = moderationCase.staffNote
          ? `${moderationCase.staffNote}\n${noteLine}`
          : noteLine;

        await prisma.moderationCase.update({
          where: { id: moderationCase.id },
          data: { staffNote },
        });

        const embed = await createDiscoreEmbed(interaction, {
          title: "📝 Staff Note Added",
          description: `Note added to case **${caseId}**`,
          fields: [
            { name: "Note", value: note },
            {
              name: "Case Action",
              value: `${moderationCase.actionType} — ${moderationCase.status}`,
            },
          ],
          color: "#3498db",
        });

        return interaction.editReply({ embeds: [embed] });
      }

      // ═══════════════════════════════════════════════════════
      // EXPORT — full case history (Premium)
      // ═══════════════════════════════════════════════════════
      if (sub === "export") {
        if (!(await requireFeature(interaction, "moderation.export"))) return;

        const user = interaction.options.getUser("user", true);
        const allCases = await prisma.moderationCase.findMany({
          where: { guildId: interaction.guildId, userId: user.id },
          orderBy: { createdAt: "desc" },
          include: {
            appeals: true,
            roleSnapshot: true,
          },
        });

        // Also fetch transcripts
        const transcripts = await prisma.moderationCaseTranscript.findMany({
          where: {
            guildId: interaction.guildId,
            userId: user.id,
          },
          orderBy: { createdAt: "desc" },
        });

        if (allCases.length === 0 && transcripts.length === 0) {
          return interaction.editReply({
            content: `📋 **${user.tag}** has no moderation history.`,
          });
        }

        // Build export file
        const lines = [];
        lines.push("=".repeat(60));
        lines.push("  DISCORE OFFICIAL · MODERATION HISTORY EXPORT");
        lines.push("=".repeat(60));
        lines.push("");
        lines.push(`User: ${user.tag} (${user.id})`);
        lines.push(
          `Server: ${interaction.guild.name} (${interaction.guildId})`,
        );
        lines.push(
          `Exported by: ${interaction.user.tag} (${interaction.user.id})`,
        );
        lines.push(`Date: ${new Date().toISOString()}`);
        lines.push(`Total Cases: ${allCases.length}`);
        lines.push(`Total Transcripts: ${transcripts.length}`);
        lines.push("");
        lines.push("");

        if (allCases.length > 0) {
          lines.push("─".repeat(60));
          lines.push("  MODERATION CASES");
          lines.push("─".repeat(60));
          lines.push("");

          for (const c of allCases) {
            lines.push(`Case: ${c.publicId}`);
            lines.push(`  Action: ${c.actionType}`);
            lines.push(`  Status: ${c.status}`);
            lines.push(`  Moderator: ${c.moderatorId}`);
            lines.push(`  Reason: ${c.reason || "N/A"}`);
            lines.push(
              `  Duration: ${c.durationSeconds ? formatDuration(c.durationSeconds) : "Permanent"}`,
            );
            if (c.expiresAt)
              lines.push(`  Expires: ${c.expiresAt.toISOString()}`);
            lines.push(`  Created: ${c.createdAt.toISOString()}`);
            if (c.revokedAt)
              lines.push(
                `  Revoked: ${c.revokedAt.toISOString()} by ${c.revokedBy || "Unknown"}`,
              );
            if (c.updatedAt)
              lines.push(`  Last Updated: ${c.updatedAt.toISOString()}`);
            if (c.staffNote) {
              lines.push(`  Staff Notes:`);
              c.staffNote.split("\n").forEach((n) => lines.push(`    ${n}`));
            }
            if (c.appeals && c.appeals.length > 0) {
              lines.push(`  Appeals (${c.appeals.length}):`);
              for (const a of c.appeals) {
                lines.push(
                  `    ${a.publicId} — ${a.status} (${a.createdAt.toISOString()})`,
                );
                if (a.outcome) lines.push(`      Outcome: ${a.outcome}`);
              }
            }
            if (c.roleSnapshot) {
              lines.push(
                `  Role Snapshot: ${c.roleSnapshot.roleIds?.length || 0} roles saved`,
              );
            }
            lines.push("");
          }
        }

        if (transcripts.length > 0) {
          lines.push("─".repeat(60));
          lines.push("  APPEAL TRANSCRIPTS");
          lines.push("─".repeat(60));
          lines.push("");

          for (const t of transcripts) {
            lines.push(`Transcript: ${t.id}`);
            lines.push(`  Case: ${t.caseNumber || "N/A"}`);
            lines.push(`  Appeal: ${t.appealNumber || "N/A"}`);
            lines.push(`  Ticket: ${t.ticketChannelName || "N/A"}`);
            lines.push(`  Outcome: ${t.outcome || "N/A"}`);
            lines.push(`  Messages: ${t.messageCount}`);
            lines.push(`  Opened: ${t.openedAt?.toISOString?.() || "N/A"}`);
            lines.push(`  Closed: ${t.closedAt?.toISOString?.() || "N/A"}`);
            if (t.transcriptText) {
              lines.push("");
              lines.push("  --- Transcript Content ---");
              lines.push(t.transcriptText);
              lines.push("  --- End Transcript ---");
            }
            lines.push("");
          }
        }

        lines.push("=".repeat(60));
        lines.push("  END OF EXPORT");
        lines.push("  Generated by Discore Official");
        lines.push("=".repeat(60));

        const exportText = lines.join("\n");
        const buffer = Buffer.from(exportText, "utf-8");
        const filename = `moderation-history-${user.id}-${Date.now()}.txt`;

        try {
          await interaction.user.send({
            content: `📋 **Moderation history export** for ${user.tag} in **${interaction.guild.name}**`,
            files: [{ attachment: buffer, name: filename }],
          });

          return interaction.editReply({
            content: `✅ Export sent to your DMs. File: **${filename}**`,
          });
        } catch {
          return interaction.editReply({
            content:
              "⚠️ Could not DM you the export. Please enable DMs from server members and try again.",
          });
        }
      }

      // ═══════════════════════════════════════════════════════
      // CASES
      // ═══════════════════════════════════════════════════════
      if (sub === "cases") {
        const user = interaction.options.getUser("user", true);
        const allCases = await caseService.getUserCases(
          interaction.guildId,
          user.id,
        );

        // Revoked cases are treated as cleared and hidden from public case lists.
        const cases = allCases.filter((c) => c.status !== "REVOKED");

        if (cases.length === 0) {
          return interaction.editReply({
            content: `📋 **${user.tag}** has no moderation cases.`,
          });
        }

        // Simple list: ID, Action, Date only
        const casesList = cases
          .slice(0, 25)
          .map((c) => {
            const date = `<t:${Math.floor(c.createdAt.getTime() / 1000)}:d>`;
            const statusIcon = c.status === "ACTIVE" ? "🔴" : "⚪";
            const hasNotes = c.staffNote ? " 📝" : "";
            return `${statusIcon} **${c.publicId}**${hasNotes} • ${c.actionType} • ${date}`;
          })
          .join("\n");

        const embed = await createDiscoreEmbed(interaction, {
          title: `📋 Moderation Cases — ${user.tag}`,
          description: casesList,
          footer: `Showing ${Math.min(cases.length, 25)}/${cases.length} case(s) · 📝 = has staff notes`,
          color: "#e74c3c",
        });

        return interaction.editReply({ embeds: [embed] });
      }

      // ═══════════════════════════════════════════════════════
      // REVOKE
      // ═══════════════════════════════════════════════════════
      if (sub === "revoke") {
        const caseId = interaction.options.getString("case_id", true);
        const reason =
          interaction.options.getString("reason") || "Revoked by moderator";

        const revokedCase = await caseService.revokeCase(
          caseId,
          interaction.user.id,
          interaction.guild,
          reason,
        );

        const embed = await createDiscoreEmbed(interaction, {
          title: "✅ Case Revoked",
          description: `Case **${caseId}** has been revoked`,
          fields: [
            { name: "Reason", value: reason },
            { name: "Action", value: revokedCase.actionType },
            {
              name: "Note",
              value:
                "The case record is preserved for audit purposes but hidden from public listings.",
            },
          ],
          color: "#2ecc71",
        });

        return interaction.editReply({ embeds: [embed] });
      }

      // ═══════════════════════════════════════════════════════
      // CASE (View single case)
      // ═══════════════════════════════════════════════════════
      if (sub === "case") {
        const caseId = interaction.options.getString("case_id", true);
        const moderationCase = await caseService.getCaseByPublicId(caseId);

        // Also try to find a transcript by case number or appeal number
        const transcript = await prisma.moderationCaseTranscript
          .findFirst({
            where: {
              OR: [
                { caseNumber: { equals: caseId, mode: "insensitive" } },
                { appealNumber: { equals: caseId, mode: "insensitive" } },
              ],
            },
            orderBy: { createdAt: "desc" },
          })
          .catch(() => null);

        // If neither case nor transcript found
        if (!moderationCase && !transcript) {
          return interaction.editReply({
            content: `⚠️ Case **${caseId}** not found.`,
          });
        }

        // If we have a transcript but no case (e.g. revoked/deleted case)
        if (!moderationCase && transcript) {
          const embed = new EmbedBuilder()
            .setTitle(
              `📋 Case: ${transcript.appealNumber || transcript.caseNumber || caseId}`,
            )
            .setColor(0x5865f2)
            .addFields(
              {
                name: "Appeal Number",
                value: transcript.appealNumber || "N/A",
                inline: true,
              },
              {
                name: "Case Number",
                value: transcript.caseNumber || "N/A",
                inline: true,
              },
              {
                name: "Outcome",
                value: transcript.outcome || "Unknown",
                inline: true,
              },
              {
                name: "Ticket Channel",
                value: transcript.ticketChannelName || "N/A",
                inline: true,
              },
              {
                name: "User ID",
                value: transcript.userId || "Unknown",
                inline: true,
              },
              {
                name: "Handled By",
                value: transcript.handledById
                  ? `<@${transcript.handledById}>`
                  : "Unknown",
                inline: true,
              },
              {
                name: "Opened",
                value: transcript.openedAt
                  ? `<t:${Math.floor(new Date(transcript.openedAt).getTime() / 1000)}:R>`
                  : "N/A",
                inline: true,
              },
              {
                name: "Closed",
                value: transcript.closedAt
                  ? `<t:${Math.floor(new Date(transcript.closedAt).getTime() / 1000)}:R>`
                  : "N/A",
                inline: true,
              },
              {
                name: "Messages",
                value: String(transcript.messageCount),
                inline: true,
              },
            )
            .setFooter({ text: "Original case was revoked or deleted" })
            .setTimestamp();

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`case:transcript:${transcript.id}`)
              .setLabel("📄 Download Transcript")
              .setStyle(ButtonStyle.Primary),
          );

          return interaction.editReply({ embeds: [embed], components: [row] });
        }

        if (moderationCase.guildId !== interaction.guildId) {
          return interaction.editReply({
            content: `⚠️ Case **${caseId}** belongs to a different server.`,
          });
        }

        if (isRevokedOrCleared(moderationCase)) {
          // If revoked but transcript exists, show transcript info
          if (transcript) {
            const embed = new EmbedBuilder()
              .setTitle(
                `📋 Case: ${transcript.appealNumber || transcript.caseNumber || caseId}`,
              )
              .setDescription(
                "The original moderation case was revoked, but a transcript is available.",
              )
              .setColor(0x5865f2)
              .addFields(
                {
                  name: "Outcome",
                  value: transcript.outcome || "Unknown",
                  inline: true,
                },
                {
                  name: "Messages",
                  value: String(transcript.messageCount),
                  inline: true,
                },
                {
                  name: "Closed",
                  value: transcript.closedAt
                    ? `<t:${Math.floor(new Date(transcript.closedAt).getTime() / 1000)}:R>`
                    : "N/A",
                  inline: true,
                },
              )
              .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`case:transcript:${transcript.id}`)
                .setLabel("📄 Download Transcript")
                .setStyle(ButtonStyle.Primary),
            );

            return interaction.editReply({
              embeds: [embed],
              components: [row],
            });
          }

          return interaction.editReply({
            content: `📋 Case **${caseId}** has been revoked and is no longer on the public record.`,
          });
        }

        const embed = await createDiscoreEmbed(interaction, {
          title: `📋 Case ${moderationCase.publicId}`,
          fields: [
            {
              name: "User",
              value: `<@${moderationCase.userId}>`,
              inline: true,
            },
            { name: "Action", value: moderationCase.actionType, inline: true },
            { name: "Status", value: moderationCase.status, inline: true },
            {
              name: "Moderator",
              value: `<@${moderationCase.moderatorId}>`,
              inline: true,
            },
            {
              name: "Reason",
              value: moderationCase.reason || "No reason provided",
            },
            {
              name: "Duration",
              value: moderationCase.durationSeconds
                ? formatDuration(moderationCase.durationSeconds)
                : "Permanent",
              inline: true,
            },
            {
              name: "Created",
              value: `<t:${Math.floor(moderationCase.createdAt.getTime() / 1000)}:R>`,
              inline: true,
            },
          ],
          color: moderationCase.status === "ACTIVE" ? "#e74c3c" : "#95a5a6",
        });

        // Show staff notes
        if (moderationCase.staffNote) {
          const notePreview =
            moderationCase.staffNote.length > 1024
              ? moderationCase.staffNote.slice(0, 1021) + "..."
              : moderationCase.staffNote;
          embed.addFields({
            name: "📝 Staff Notes",
            value: notePreview,
          });
        }

        const latestAppeal = getLatestAppeal(moderationCase);

        if (latestAppeal) {
          embed.addFields({
            name: "Latest Appeal",
            value:
              `**${latestAppeal.publicId}** — ${latestAppeal.status}` +
              (latestAppeal.outcome ? `\n${latestAppeal.outcome}` : ""),
          });
        }

        // Add transcript download button if transcript exists
        if (transcript) {
          embed.addFields({
            name: "Transcript",
            value: `${transcript.messageCount} messages · Download available`,
            inline: false,
          });
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`case:transcript:${transcript.id}`)
              .setLabel("📄 Download Transcript")
              .setStyle(ButtonStyle.Primary),
          );
          return interaction.editReply({ embeds: [embed], components: [row] });
        }

        return interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error("[Mod Command Error]", error);

      // Check if interaction has already been replied to
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: `⚠️ **Error:** ${error.message}`,
        });
      }

      return interaction.reply({
        content: `⚠️ **Error:** ${error.message}`,
        flags: [MessageFlags.Ephemeral],
      });
    }
  },
};

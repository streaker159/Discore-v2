"use strict";

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const {
  executeModAction,
} = require("../../../modules/moderation/services/moderationActionService");
const caseService = require("../../../modules/moderation/services/moderationCaseService");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");
const prisma = require("../../../lib/prisma");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Moderation commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
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
            .setDescription("Duration (e.g., 30m, 1 hour, 7 days)"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("timeout")
        .setDescription("Timeout a user (Discord native)")
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
            .setDescription("Duration (e.g., 30m, 1 hour, 7 days)")
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
              "Duration (e.g., 7 days, 30 days, leave empty for permanent)",
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
        .setDescription("Unban a user")
        .addStringOption((opt) =>
          opt
            .setName("user_id")
            .setDescription("User ID to unban")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName("reason").setDescription("Reason for unban"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("probation")
        .setDescription("Place user on probation (visible on profile)")
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
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("case")
        .setDescription("View a moderation case")
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
        .setDescription("Revoke/overturn a moderation action")
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

    // Defer reply immediately to prevent timeout
    await interaction.deferReply({ ephemeral: true });

    try {
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
          const {
            parseDuration,
          } = require("../../../modules/moderation/utils/durationParser");
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
          return interaction.reply({
            content: `⚠️ ${result.actionError}`,
            ephemeral: true,
          });
        }

        const {
          formatDuration,
        } = require("../../../modules/moderation/utils/durationParser");
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

        const {
          parseDuration,
          formatDuration,
        } = require("../../../modules/moderation/utils/durationParser");
        const parsed = parseDuration(durationStr);
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

        let targetMember;
        try {
          targetMember = await interaction.guild.members.fetch(user.id);
        } catch {
          // User not in guild
        }

        let durationSeconds = null;
        let durationDisplay = "Permanent";
        if (durationStr) {
          const {
            parseDuration,
            formatDuration,
          } = require("../../../modules/moderation/utils/durationParser");
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
              name: "DM Status",
              value: result.dmSent ? "✅ Sent" : "❌ Failed",
            },
          ],
          color: "#e74c3c",
        });

        return interaction.editReply({ embeds: [embed] });
      }

      // ═══════════════════════════════════════════════════════
      // UNBAN
      // ═══════════════════════════════════════════════════════
      if (sub === "unban") {
        const userId = interaction.options.getString("user_id", true);
        const reason =
          interaction.options.getString("reason") || "No reason provided";

        await interaction.guild.members.unban(userId, reason);

        const embed = await createDiscoreEmbed(interaction, {
          title: "✅ User Unbanned",
          description: `User ID: ${userId}`,
          fields: [{ name: "Reason", value: reason }],
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

        const {
          parseDuration,
          formatDuration,
        } = require("../../../modules/moderation/utils/durationParser");
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

        const result = await executeModAction({
          guild: interaction.guild,
          moderator: interaction.member,
          targetUser: user,
          targetMember,
          actionType: "PROBATION",
          reason,
          durationSeconds: parsed.seconds,
          interaction,
        });

        const embed = await createDiscoreEmbed(interaction, {
          title: "✅ Probation Applied",
          description: `${user.tag} is on probation`,
          fields: [
            { name: "Reason", value: reason },
            { name: "Duration", value: formatDuration(parsed.seconds) },
            { name: "Case ID", value: result.case.publicId },
            {
              name: "Note",
              value: "This will be visible on their public profile",
            },
          ],
          color: "#95a5a6",
        });

        return interaction.editReply({ embeds: [embed] });
      }

      // ═══════════════════════════════════════════════════════
      // CASES
      // ═══════════════════════════════════════════════════════
      if (sub === "cases") {
        const user = interaction.options.getUser("user", true);
        const cases = await caseService.getUserCases(
          interaction.guildId,
          user.id,
        );

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
            return `${statusIcon} **${c.publicId}** • ${c.actionType} • ${date}`;
          })
          .join("\n");

        const embed = await createDiscoreEmbed(interaction, {
          title: `📋 Moderation Cases — ${user.tag}`,
          description: casesList,
          footer: `Showing ${Math.min(cases.length, 25)}/${cases.length} case(s)`,
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
        );

        const embed = await createDiscoreEmbed(interaction, {
          title: "✅ Case Revoked",
          description: `Case **${caseId}** has been revoked`,
          fields: [
            { name: "Reason", value: reason },
            { name: "Action", value: revokedCase.actionType },
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

        const {
          formatDuration,
        } = require("../../../modules/moderation/utils/durationParser");

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

        if (moderationCase.appeals && moderationCase.appeals.length > 0) {
          const latestAppeal = moderationCase.appeals[0];
          embed.addFields({
            name: "Latest Appeal",
            value: `${latestAppeal.publicId} - ${latestAppeal.status}`,
          });
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
        ephemeral: true,
      });
    }
  },
};

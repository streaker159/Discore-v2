"use strict";

const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { requireBotOwner } = require("../../../lib/ownerGuard");
const {
  grantPremium,
  revokePremium,
  createPremiumCode,
} = require("../../../modules/premium/service");
const {
  buildPremiumAdminDashboard,
} = require("../../../modules/premium/adminDashboard");

function cleanGuildId(value, fallback = "") {
  const id = String(value || fallback || "").trim();
  return id === "none" ? "" : id;
}

function intValue(value, fallback) {
  const parsed = parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function shortInput(id, label, value = "", required = true) {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setRequired(required)
    .setMaxLength(100);

  if (value) input.setValue(String(value));
  return new ActionRowBuilder().addComponents(input);
}

async function replyDashboard(interaction, guildId, content) {
  const payload = await buildPremiumAdminDashboard(interaction, guildId);
  return interaction.editReply({
    content,
    embeds: payload.embeds,
    components: payload.components,
  });
}

function getField(interaction, id) {
  return interaction.fields.getTextInputValue(id)?.trim();
}

module.exports = {
  customIdPrefix: "premium_admin:",
  async execute(interaction) {
    if (!(await requireBotOwner(interaction))) return;

    const [, action, rawGuildId] = interaction.customId.split(":");
    const guildId = cleanGuildId(rawGuildId, interaction.guildId);

    if (action === "setguild") {
      const modal = new ModalBuilder()
        .setCustomId("premium_admin:setguild_modal")
        .setTitle("Premium Admin: Set Guild");
      modal.addComponents(shortInput("guild_id", "Guild ID", guildId));
      return interaction.showModal(modal);
    }

    if (action === "grant") {
      const modal = new ModalBuilder()
        .setCustomId("premium_admin:grant_modal")
        .setTitle("Premium Admin: Grant");
      modal.addComponents(
        shortInput("guild_id", "Guild ID", guildId),
        shortInput(
          "duration_unit",
          "DAYS, WEEKS, MONTHS, or LIFETIME",
          "MONTHS",
        ),
        shortInput("duration_value", "Duration amount", "1"),
        shortInput("monthly_ai_credits", "Monthly AI credits", "2000"),
        shortInput("extra_ai_credits", "Bonus AI credits now", "0"),
      );
      return interaction.showModal(modal);
    }

    if (action === "revoke") {
      const modal = new ModalBuilder()
        .setCustomId("premium_admin:revoke_modal")
        .setTitle("Premium Admin: Revoke");
      modal.addComponents(
        shortInput("guild_id", "Guild ID", guildId),
        shortInput("confirm", "Type REVOKE to confirm", "", true),
      );
      return interaction.showModal(modal);
    }

    if (action === "createcode") {
      const modal = new ModalBuilder()
        .setCustomId("premium_admin:createcode_modal")
        .setTitle("Premium Admin: Create Code");
      modal.addComponents(
        shortInput("tier", "PRO or LIFETIME", "PRO"),
        shortInput("code", "Custom code, or blank for random", "", false),
        shortInput("max_uses", "Maximum uses", "1"),
        shortInput("days", "Premium days, ignored for LIFETIME", "30"),
        shortInput(
          "expires_in_days",
          "Code expires in days, blank = never",
          "",
          false,
        ),
      );
      return interaction.showModal(modal);
    }

    if (action === "refresh") {
      await interaction.deferUpdate();
      const payload = await buildPremiumAdminDashboard(interaction, guildId);
      return interaction.editReply({
        embeds: payload.embeds,
        components: payload.components,
      });
    }

    if (action === "setguild_modal") {
      const targetGuildId = cleanGuildId(getField(interaction, "guild_id"));
      await interaction.deferReply({ flags: 64 });
      return replyDashboard(
        interaction,
        targetGuildId,
        "Premium dashboard updated.",
      );
    }

    if (action === "grant_modal") {
      const targetGuildId = cleanGuildId(getField(interaction, "guild_id"));
      const durationUnit = String(
        getField(interaction, "duration_unit") || "MONTHS",
      ).toUpperCase();
      const allowedUnits = new Set(["DAYS", "WEEKS", "MONTHS", "LIFETIME"]);
      if (!targetGuildId || !allowedUnits.has(durationUnit)) {
        return interaction.reply({
          content:
            "Use a valid guild ID and duration unit: DAYS, WEEKS, MONTHS, or LIFETIME.",
          flags: 64,
        });
      }

      await interaction.deferReply({ flags: 64 });
      const premium = await grantPremium({
        guildId: targetGuildId,
        durationUnit,
        durationValue: intValue(getField(interaction, "duration_value"), 1),
        monthlyAiAllowance: intValue(
          getField(interaction, "monthly_ai_credits"),
          2000,
        ),
        extraAiCredits: intValue(getField(interaction, "extra_ai_credits"), 0),
        method: "MANUAL",
        grantedBy: interaction.user.id,
      });

      const expires = premium.expiresAt
        ? `<t:${Math.floor(premium.expiresAt.getTime() / 1000)}:F>`
        : "Never";
      return replyDashboard(
        interaction,
        targetGuildId,
        `Granted ${premium.tier} to ${targetGuildId}. Expires: ${expires}`,
      );
    }

    if (action === "revoke_modal") {
      const targetGuildId = cleanGuildId(getField(interaction, "guild_id"));
      const confirm = String(
        getField(interaction, "confirm") || "",
      ).toUpperCase();
      if (!targetGuildId || confirm !== "REVOKE") {
        return interaction.reply({
          content:
            "Revoke cancelled. Enter a guild ID and type REVOKE to confirm.",
          flags: 64,
        });
      }

      await interaction.deferReply({ flags: 64 });
      const premium = await revokePremium(targetGuildId, interaction.user.id);
      return replyDashboard(
        interaction,
        targetGuildId,
        `Revoked premium for ${premium.guildId}.`,
      );
    }

    if (action === "createcode_modal") {
      const tier = String(getField(interaction, "tier") || "PRO").toUpperCase();
      if (tier !== "PRO" && tier !== "LIFETIME") {
        return interaction.reply({
          content: "Tier must be PRO or LIFETIME.",
          flags: 64,
        });
      }

      await interaction.deferReply({ flags: 64 });
      const code = await createPremiumCode({
        code: getField(interaction, "code")?.toUpperCase(),
        type: "TRIAL",
        tier,
        maxUses: intValue(getField(interaction, "max_uses"), 1),
        trialDays: intValue(getField(interaction, "days"), 30),
        expiresInDays: getField(interaction, "expires_in_days")
          ? intValue(getField(interaction, "expires_in_days"), 1)
          : undefined,
      });

      const duration =
        code.tier === "LIFETIME"
          ? "Lifetime"
          : `${code.trialDays || 30} day(s)`;
      const expires = code.expiresAt
        ? `<t:${Math.floor(code.expiresAt.getTime() / 1000)}:F>`
        : "Never";
      return replyDashboard(
        interaction,
        guildId,
        `Created code ${code.code}. Tier: ${code.tier}. Uses: ${code.maxUses}. Duration: ${duration}. Code expires: ${expires}`,
      );
    }

    return interaction.reply({
      content: "Unknown premium admin action.",
      flags: 64,
    });
  },
};

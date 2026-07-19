const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { requireBotOwner } = require("../../../lib/ownerGuard");
const {
  grantPremium,
  revokePremium,
  createPremiumCode,
  getPremiumStatus,
  getAiCreditStatus,
} = require("../../../modules/premium/service");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");

module.exports = {
  scope: "BOT_OWNER",
  data: new SlashCommandBuilder()
    .setName("premium-admin")
    .setDescription("Owner-only premium controls.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName("dashboard")
        .setDescription("View premium and AI state for a guild.")
        .addStringOption((o) =>
          o.setName("guild_id").setDescription("Guild ID").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("grant")
        .setDescription("Grant premium and AI credits to a guild.")
        .addStringOption((o) =>
          o.setName("guild_id").setDescription("Guild ID").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("duration_unit")
            .setDescription("Grant duration")
            .setRequired(true)
            .addChoices(
              { name: "Days", value: "DAYS" },
              { name: "Weeks", value: "WEEKS" },
              { name: "Months", value: "MONTHS" },
              { name: "Lifetime", value: "LIFETIME" },
            ),
        )
        .addIntegerOption((o) =>
          o
            .setName("duration_value")
            .setDescription("How many days/weeks/months. Ignored for lifetime.")
            .setMinValue(1),
        )
        .addIntegerOption((o) =>
          o
            .setName("monthly_ai_credits")
            .setDescription("Monthly AI allowance. Defaults to 2000.")
            .setMinValue(0),
        )
        .addIntegerOption((o) =>
          o
            .setName("extra_ai_credits")
            .setDescription("One-time bonus AI credits to add now.")
            .setMinValue(0),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("revoke")
        .setDescription("Revoke premium.")
        .addStringOption((o) =>
          o.setName("guild_id").setDescription("Guild ID").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("create-code")
        .setDescription("Create a redeemable premium code.")
        .addStringOption((o) =>
          o
            .setName("tier")
            .setDescription("Tier")
            .setRequired(true)
            .addChoices(
              { name: "PRO", value: "PRO" },
              { name: "LIFETIME", value: "LIFETIME" },
            ),
        )
        .addStringOption((o) =>
          o.setName("code").setDescription("Optional custom code"),
        )
        .addIntegerOption((o) =>
          o.setName("max_uses").setDescription("Maximum uses"),
        )
        .addIntegerOption((o) =>
          o
            .setName("days")
            .setDescription("Premium duration in days. Defaults to 30.")
            .setMinValue(1),
        )
        .addIntegerOption((o) =>
          o
            .setName("expires_in_days")
            .setDescription("Optional code expiry window in days")
            .setMinValue(1),
        ),
    ),
  async execute(interaction) {
    if (!(await requireBotOwner(interaction))) return;
    const sub = interaction.options.getSubcommand();
    let message;

    if (sub === "dashboard") {
      const guildId = interaction.options.getString("guild_id", true);
      const [status, aiCredits] = await Promise.all([
        getPremiumStatus(guildId),
        getAiCreditStatus(guildId),
      ]);
      const premium = status.premium;
      message = [
        `Guild: **${guildId}**`,
        `Premium: **${status.isActive ? status.tier : "FREE"}**`,
        premium?.expiresAt
          ? `Expires: <t:${Math.floor(premium.expiresAt.getTime() / 1000)}:F>`
          : "Expires: Never / not set",
        `Monthly AI allowance: **${aiCredits.monthlyAllowance.toLocaleString()}**`,
        `Monthly AI remaining: **${aiCredits.monthlyRemaining.toLocaleString()}**`,
        `Extra AI credits: **${aiCredits.extraCredits.toLocaleString()}**`,
        "Use `/premium-admin grant` to set premium time and AI amounts, `/premium-admin create-code` to generate codes, or `/premium-admin revoke` to lock a server.",
      ].join("\n");
    } else if (sub === "grant") {
      const premium = await grantPremium({
        guildId: interaction.options.getString("guild_id", true),
        durationUnit: interaction.options.getString("duration_unit", true),
        durationValue: interaction.options.getInteger("duration_value") || 1,
        monthlyAiAllowance:
          interaction.options.getInteger("monthly_ai_credits") ?? 2000,
        extraAiCredits: interaction.options.getInteger("extra_ai_credits") || 0,
        method: "MANUAL",
        grantedBy: interaction.user.id,
      });
      message = [
        `Granted **${premium.tier}** to guild **${premium.guildId}**.`,
        premium.expiresAt
          ? `Expires: <t:${Math.floor(premium.expiresAt.getTime() / 1000)}:F>`
          : "Expires: Never",
        `Monthly AI allowance: **${premium.monthlyAiAllowance.toLocaleString()}**`,
        `Extra AI credits now available: **${premium.extraAiCredits.toLocaleString()}**`,
      ].join("\n");
    } else if (sub === "revoke") {
      const premium = await revokePremium(
        interaction.options.getString("guild_id", true),
        interaction.user.id,
      );
      message = `Revoked premium for guild **${premium.guildId}**.`;
    } else {
      const code = await createPremiumCode({
        code: interaction.options.getString("code")?.toUpperCase(),
        type: "TRIAL",
        tier: interaction.options.getString("tier", true),
        maxUses: interaction.options.getInteger("max_uses") || 1,
        trialDays: interaction.options.getInteger("days") || 30,
        expiresInDays: interaction.options.getInteger("expires_in_days"),
      });
      message = [
        `Created code **${code.code}** for **${code.tier}**.`,
        `Uses: **${code.maxUses}**`,
        code.tier === "LIFETIME"
          ? "Duration: **Lifetime**"
          : `Duration: **${code.trialDays || 30} day(s)**`,
        code.expiresAt
          ? `Code expires: <t:${Math.floor(code.expiresAt.getTime() / 1000)}:F>`
          : "Code expires: Never",
      ].join("\n");
    }

    const embed = await createDiscoreEmbed(interaction, {
      title: "💎 Premium Admin",
      description: message,
    });
    return interaction.reply({ embeds: [embed], flags: 64 });
  },
};

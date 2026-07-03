const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { requireBotOwner } = require("../../../lib/ownerGuard");
const {
  grantPremium,
  revokePremium,
  createPremiumCode,
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
        .setName("grant")
        .setDescription("Grant premium to a guild.")
        .addStringOption((o) =>
          o.setName("guild_id").setDescription("Guild ID").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("tier")
            .setDescription("Tier")
            .setRequired(true)
            .addChoices(
              { name: "PRO", value: "PRO" },
              { name: "LIFETIME", value: "LIFETIME" },
            ),
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
        .setDescription("Create a premium code.")
        .addStringOption((o) =>
          o.setName("code").setDescription("Code").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Type")
            .setRequired(true)
            .addChoices(
              { name: "LIFETIME", value: "LIFETIME" },
              { name: "TRIAL", value: "TRIAL" },
              { name: "DISCOUNT", value: "DISCOUNT" },
            ),
        )
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
        .addIntegerOption((o) =>
          o.setName("max_uses").setDescription("Maximum uses"),
        )
        .addIntegerOption((o) =>
          o.setName("trial_days").setDescription("Trial days"),
        ),
    ),
  async execute(interaction) {
    if (!(await requireBotOwner(interaction))) return;
    const sub = interaction.options.getSubcommand();
    let message;

    if (sub === "grant") {
      const premium = await grantPremium({
        guildId: interaction.options.getString("guild_id", true),
        tier: interaction.options.getString("tier", true),
        method: "MANUAL",
        grantedBy: interaction.user.id,
      });
      message = `Granted **${premium.tier}** to guild **${premium.guildId}**.`;
    } else if (sub === "revoke") {
      const premium = await revokePremium(
        interaction.options.getString("guild_id", true),
        interaction.user.id,
      );
      message = `Revoked premium for guild **${premium.guildId}**.`;
    } else {
      const code = await createPremiumCode({
        code: interaction.options.getString("code", true).toUpperCase(),
        type: interaction.options.getString("type", true),
        tier: interaction.options.getString("tier", true),
        maxUses: interaction.options.getInteger("max_uses") || 1,
        trialDays: interaction.options.getInteger("trial_days"),
      });
      message = `Created code **${code.code}** for **${code.tier}**.`;
    }

    const embed = await createDiscoreEmbed(interaction, {
      title: "💎 Premium Admin",
      description: message,
    });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

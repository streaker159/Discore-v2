const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} = require("discord.js");
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const { parseDateTime, detectTimezone } = require("../../../lib/timeParser");
const { getGuildSettings } = require("../../../lib/embedBuilder");
const {
  createBattleSignup,
  getSignup,
  buildBattleSignupEmbed,
  battleSignupButtons,
} = require("../../../modules/battleSignup/service");

// customId format: battle:create:{tagOnCreate}:{tagOnStart}
module.exports = {
  customIdPrefix: "battle:create:",
  async execute(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const parts = interaction.customId.split(":");
    const tagOnCreate = parts[2] !== "0" ? parts[2] : null;
    const tagOnStart = parts[3] !== "0" ? parts[3] : null;

    const game = interaction.fields.getTextInputValue("game").trim();
    const description =
      interaction.fields.getTextInputValue("description").trim() || null;
    const mode = interaction.fields.getTextInputValue("mode").trim() || null;
    const rawTime = interaction.fields.getTextInputValue("datetime").trim();
    const teamSizeRaw = interaction.fields
      .getTextInputValue("team_size")
      .trim();

    const teamSize = parseInt(teamSizeRaw, 10);
    if (Number.isNaN(teamSize) || teamSize < 1 || teamSize > 100) {
      return interaction.editReply({
        content: "⚠️ Team size must be a number between 1 and 100.",
      });
    }

    const settings = await getGuildSettings(interaction.guildId);
    const timezone = detectTimezone(rawTime, settings?.timezone || "UTC");
    const parsed = parseDateTime(rawTime, { timezone });

    if (!parsed.ok) {
      return interaction.editReply({
        content: `⚠️ Couldn't understand that time: **${parsed.reason}**\n\nTry something like:\n• \`3pm today\`\n• \`tomorrow 6pm UTC\`\n• \`5am 04/07/2026\`\n• \`in 2 hours\``,
      });
    }

    const signup = await createBattleSignup({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      captainId: interaction.user.id,
      game,
      description,
      mode,
      scheduledAt: parsed.date,
      teamSize,
      tagOnCreate,
      tagOnStart,
    });

    const full = await getSignup(signup.id);
    const embed = await buildBattleSignupEmbed(interaction, full);

    // If a tag-on-create role is set, send the ping as a separate message then the embed
    let content = tagOnCreate
      ? `<@&${tagOnCreate}> — New battle signup!`
      : undefined;

    const message = await interaction.channel.send({
      content,
      embeds: [embed],
      components: battleSignupButtons(signup.id),
    });
    await prisma.battleSignup
      .update({ where: { id: signup.id }, data: { messageId: message.id } })
      .catch(() => {});

    const t = parsed.discord;
    await interaction.editReply({
      content: `✅ Battle signup posted!\n> Time shown in everyone's **local Discord timezone** as ${t.full} (${t.relative})\n> ID: \`${signup.id}\``,
    });
  },
};

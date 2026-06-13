const prisma = require("../../../lib/prisma");
const { parseDateTime, detectTimezone } = require("../../../lib/timeParser");
const { getGuildSettings } = require("../../../lib/embedBuilder");
const {
  getSignup,
  updateSignup,
  buildBattleSignupEmbed,
  battleSignupButtons,
} = require("../../../modules/battleSignup/service");

// customId format: battle:settings:modal:{signupId}
module.exports = {
  customIdPrefix: "battle:settings:modal:",
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const signupId = interaction.customId.split(":")[3];
    const signup = await getSignup(signupId);
    if (!signup) return interaction.editReply({ content: "Signup not found." });

    if (
      signup.captainId !== interaction.user.id &&
      !interaction.memberPermissions?.has(8n)
    ) {
      return interaction.editReply({
        content: "Only the captain or an admin can edit this signup.",
      });
    }

    const newTitle =
      interaction.fields.getTextInputValue("title").trim() || signup.title;
    const newMode =
      interaction.fields.getTextInputValue("mode").trim() || signup.mode;
    const rawTime = interaction.fields.getTextInputValue("datetime").trim();
    const teamSizeRaw = interaction.fields
      .getTextInputValue("team_size")
      .trim();

    const updateData = {
      title: newTitle || null,
      mode: newMode || null,
    };

    if (teamSizeRaw) {
      const ts = parseInt(teamSizeRaw, 10);
      if (Number.isNaN(ts) || ts < 1 || ts > 100) {
        return interaction.editReply({
          content: "⚠️ Team size must be a number between 1 and 100.",
        });
      }
      updateData.teamSize = ts;
    }

    if (rawTime) {
      const settings = await getGuildSettings(interaction.guildId);
      const timezone = detectTimezone(rawTime, settings?.timezone || "UTC");
      const parsed = parseDateTime(rawTime, { timezone });
      if (!parsed.ok) {
        return interaction.editReply({
          content: `⚠️ Couldn't understand that time: **${parsed.reason}**`,
        });
      }
      updateData.scheduledAt = parsed.date;
    }

    await updateSignup(signupId, updateData);
    const updated = await getSignup(signupId);
    const embed = await buildBattleSignupEmbed(interaction, updated);

    // Try to edit the live message in the channel
    if (updated.messageId && updated.channelId) {
      const ch = await interaction.client.channels
        .fetch(updated.channelId)
        .catch(() => null);
      if (ch) {
        const msg = await ch.messages
          .fetch(updated.messageId)
          .catch(() => null);
        if (msg)
          await msg
            .edit({
              embeds: [embed],
              components: battleSignupButtons(signupId),
            })
            .catch(() => {});
      }
    }

    await interaction.editReply({ content: "✅ Battle signup updated!" });
  },
};

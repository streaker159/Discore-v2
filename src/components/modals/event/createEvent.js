const prisma = require("../../../lib/prisma");
const { parseDateTime, detectTimezone } = require("../../../lib/timeParser");
const { getGuildSettings } = require("../../../lib/embedBuilder");
const {
  createEvent,
  getEvent,
  buildEventEmbed,
  eventButtons,
} = require("../../../modules/events/service");

// customId format: event:create:{tagOnCreate}:{tagOnStart}
module.exports = {
  customIdPrefix: "event:create:",
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const parts = interaction.customId.split(":");
    const tagOnCreate = parts[2] !== "0" ? parts[2] : null;
    const tagOnStart = parts[3] !== "0" ? parts[3] : null;

    const title = interaction.fields.getTextInputValue("title").trim();
    const rawTime = interaction.fields.getTextInputValue("datetime").trim();
    const description =
      interaction.fields.getTextInputValue("description").trim() || null;
    const location =
      interaction.fields.getTextInputValue("location").trim() || null;
    const imageUrl =
      interaction.fields.getTextInputValue("image").trim() || null;

    // Validate image URL format if provided
    if (
      imageUrl &&
      !/^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(imageUrl)
    ) {
      return interaction.editReply({
        content:
          "⚠️ Image URL must be a direct link ending in `.png`, `.jpg`, `.jpeg`, `.gif`, or `.webp`.",
      });
    }

    const settings = await getGuildSettings(interaction.guildId);
    const timezone = detectTimezone(rawTime, settings?.timezone || "UTC");
    const parsed = parseDateTime(rawTime, { timezone });

    if (!parsed.ok) {
      return interaction.editReply({
        content: `⚠️ Couldn't understand that time: **${parsed.reason}**\n\nExamples:\n• \`tomorrow 8pm UTC\`\n• \`in 3 hours\`\n• \`5pm 04/07/2026\`\n• \`next Friday 9pm Paris time\``,
      });
    }

    const event = await createEvent({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      createdBy: interaction.user.id,
      title,
      description,
      location,
      imageUrl,
      scheduledAt: parsed.date,
      tagOnCreate,
      tagOnStart,
    });

    const full = await getEvent(event.id);
    const embed = await buildEventEmbed(interaction, full);

    const content = tagOnCreate
      ? `<@&${tagOnCreate}> — 📅 New event!`
      : undefined;
    const message = await interaction.channel.send({
      content,
      embeds: [embed],
      components: eventButtons(event.id),
    });
    await prisma.event
      .update({ where: { id: event.id }, data: { messageId: message.id } })
      .catch(() => {});

    const t = parsed.discord;
    await interaction.editReply({
      content: `✅ Event posted!\n> Time shows in everyone's **local timezone** as ${t.full} (${t.relative})\n> ID: \`${event.id}\``,
    });
  },
};

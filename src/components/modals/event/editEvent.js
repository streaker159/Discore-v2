const { parseDateTime, detectTimezone } = require("../../../lib/timeParser");
const { getGuildSettings } = require("../../../lib/embedBuilder");
const { PermissionFlagsBits } = require("discord.js");
const {
  getEvent,
  updateEvent,
  buildEventEmbed,
  eventButtons,
} = require("../../../modules/events/service");

function canManageEvent(interaction, event) {
  if (event.createdBy === interaction.user.id) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))
    return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
    return true;
  return false;
}

// customId format: event:edit:modal:{eventId}
module.exports = {
  customIdPrefix: "event:edit:modal:",
  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const eventId = interaction.customId.split(":")[3];
    const event = await getEvent(eventId);
    if (!event)
      return interaction.editReply({ content: "⚠️ Event not found." });

    if (!canManageEvent(interaction, event)) {
      return interaction.editReply({
        content:
          "Only the event creator or a server admin (Manage Server / Administrator) can edit this event.",
      });
    }

    const newTitle = interaction.fields.getTextInputValue("title").trim();
    const rawTime = interaction.fields.getTextInputValue("datetime").trim();
    const newDesc = interaction.fields.getTextInputValue("description").trim();
    const newLoc = interaction.fields.getTextInputValue("location").trim();
    const newImage = interaction.fields.getTextInputValue("image").trim();

    const updateData = {
      title: newTitle || event.title,
      description: newDesc || null,
      location: newLoc || null,
    };

    if (newImage) {
      if (!/^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(newImage)) {
        return interaction.editReply({
          content:
            "⚠️ Image URL must be a direct link ending in `.png`, `.jpg`, `.jpeg`, `.gif`, or `.webp`.",
        });
      }
      updateData.imageUrl = newImage;
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

    await updateEvent(eventId, updateData);
    const updated = await getEvent(eventId);
    const embed = await buildEventEmbed(interaction, updated);
    const isEnded = ["COMPLETED", "CANCELLED"].includes(updated.status);

    // Edit live message
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
              components: eventButtons(eventId, isEnded),
            })
            .catch(() => {});
      }
    }

    await interaction.editReply({ content: "✅ Event updated!" });
  },
};

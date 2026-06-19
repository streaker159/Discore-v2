const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const { getEvent } = require("../../../modules/events/service");

function canManageEvent(interaction, event) {
  if (event.createdBy === interaction.user.id) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))
    return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
    return true;
  return false;
}

// customId: event:edit:{eventId}
// Note: event:edit:modal: is handled separately in modals/event/editEvent.js
module.exports = {
  customIdPrefix: "event:edit:",
  async execute(interaction) {
    const eventId = interaction.customId.replace("event:edit:", "");
    const event = await getEvent(eventId);
    if (!event)
      return interaction.reply({
        content: "⚠️ Event not found.",
        ephemeral: true,
      });

    if (!canManageEvent(interaction, event)) {
      return interaction.reply({
        content:
          "Only the event creator or a server admin (Manage Server / Administrator) can edit this event.",
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`event:edit:modal:${eventId}`)
      .setTitle("Edit Event");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Title (blank = keep current)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(event.title),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("datetime")
          .setLabel("New time (blank = keep current)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder("e.g. tomorrow 8pm UTC, in 3 hours"),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Description (blank = clear)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setValue(event.description || ""),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("location")
          .setLabel("Location (blank = clear)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(event.location || ""),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("image")
          .setLabel("Banner image URL (blank = keep current)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(event.imageUrl || ""),
      ),
    );

    await interaction.showModal(modal);
  },
};

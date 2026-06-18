const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require("discord.js");
const {
  getEvent,
  getUpcomingEvents,
  buildEventEmbed,
  eventButtons,
} = require("../../../modules/events/service");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("event")
    .setDescription("Create and manage server events.")
    .addSubcommand((s) =>
      s
        .setName("create")
        .setDescription("Open the event creation form.")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Event type")
            .addChoices(
              { name: "Event", value: "EVENT" },
              { name: "Battle", value: "BATTLE" },
              { name: "Training", value: "TRAINING" },
              { name: "Custom", value: "CUSTOM" },
            ),
        )
        .addRoleOption((o) =>
          o
            .setName("tag_on_create")
            .setDescription("Role to ping when event is posted (optional)"),
        )
        .addRoleOption((o) =>
          o
            .setName("tag_on_start")
            .setDescription("Role to ping when event starts (optional)"),
        ),
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription("Show upcoming and live events."),
    )
    .addSubcommand((s) =>
      s
        .setName("show")
        .setDescription("Show a specific event by ID.")
        .addStringOption((o) =>
          o.setName("id").setDescription("Event ID").setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── show ──────────────────────────────────────────────────────────────
    if (sub === "show") {
      const event = await getEvent(interaction.options.getString("id", true));
      if (!event)
        return interaction.reply({
          content: "Event not found.",
          ephemeral: true,
        });
      const isEnded = ["COMPLETED", "CANCELLED"].includes(event.status);
      const embed = await buildEventEmbed(interaction, event);
      return interaction.reply({
        embeds: [embed],
        components: eventButtons(event.id, isEnded),
      });
    }

    // ── list ───────────────────────────────────────────────────────────────
    if (sub === "list") {
      const events = await getUpcomingEvents(interaction.guildId);
      if (!events.length) {
        return interaction.reply({
          content: "📭 No upcoming events found.",
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("📅 Upcoming Events")
        .setFooter({ text: "Powered by Discore" })
        .setTimestamp();

      for (const ev of events.slice(0, 10)) {
        const unix = Math.floor(new Date(ev.scheduledAt).getTime() / 1000);
        const going = ev.rsvps.filter((r) => r.status === "GOING").length;
        const badge = ev.status === "LIVE" ? "🔴 LIVE" : "🟢 Upcoming";
        embed.addFields({
          name: `${badge} — ${ev.title}`,
          value: `<t:${unix}:F> (<t:${unix}:R>)\n${ev.location ? `📍 ${ev.location}\n` : ""}✅ ${going} going  ·  ID: \`${ev.publicId ?? ev.id}\``,
          inline: false,
        });
      }

      if (events.length > 10) {
        embed.setDescription(
          `Showing 10 of ${events.length} events. Use \`/event show <id>\` for details.`,
        );
      }

      return interaction.reply({ embeds: [embed] });
    }

    // ── create — open modal ────────────────────────────────────────────────
    const tagCreate = interaction.options.getRole("tag_on_create")?.id || "0";
    const tagStart = interaction.options.getRole("tag_on_start")?.id || "0";
    const eventType = interaction.options.getString("type") ?? "EVENT";

    const modal = new ModalBuilder()
      .setCustomId(`event:create:${tagCreate}:${tagStart}:${eventType}`)
      .setTitle("Create Event");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Event Title")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("datetime")
          .setLabel("When? (time shown in each user's local timezone)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("e.g. tomorrow 8pm UTC, in 3 hours, 5pm 04/07/2026"),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Description (optional)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(1000),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("location")
          .setLabel("Location or link (optional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder("e.g. Discord Stage, https://meet.google.com/..."),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("image")
          .setLabel("Banner image URL (optional, paste a direct link)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder("https://example.com/banner.png"),
      ),
    );

    await interaction.showModal(modal);
  },
};

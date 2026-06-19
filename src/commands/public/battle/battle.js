"use strict";

const { SlashCommandBuilder } = require("discord.js");

/**
 * Battle signups are now handled by the event system.
 * Use: /event create type:battle
 *
 * This command is kept as a stub to guide users.
 */
module.exports = {
  scope: "PUBLIC",
  enabled: false, // disabled — handled by /event create type:battle
  data: new SlashCommandBuilder()
    .setName("battle")
    .setDescription("[Moved] Battle signups are now part of /event create."),

  async execute(interaction) {
    return interaction.reply({
      content:
        "⚔️ **Battle signups have moved!**\n" +
        "Use `/event create` and choose **type: Battle** to create a battle signup.\n\n" +
        "All the same features are there — RSVP, reminders, role pings, and images.",
      ephemeral: true,
    });
  },
};

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("battle")
    .setDescription("Create and manage battle signups.")
    .addSubcommand((s) =>
      s
        .setName("create")
        .setDescription("Open the battle signup form.")
        .addRoleOption((o) =>
          o
            .setName("tag_on_create")
            .setDescription("Role to ping when signup is posted (optional)"),
        )
        .addRoleOption((o) =>
          o
            .setName("tag_on_start")
            .setDescription("Role to ping when battle starts (optional)"),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("show")
        .setDescription("Show battle signup by ID.")
        .addStringOption((o) =>
          o.setName("id").setDescription("Battle signup ID").setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "show") {
      const signup = await getSignup(interaction.options.getString("id", true));
      if (!signup)
        return interaction.reply({
          content: "Battle signup not found.",
          ephemeral: true,
        });
      const embed = await buildBattleSignupEmbed(interaction, signup);
      return interaction.reply({
        embeds: [embed],
        components: battleSignupButtons(signup.id),
      });
    }

    // sub === 'create' — encode optional tag roles into the modal customId
    const tagCreate = interaction.options.getRole("tag_on_create")?.id || "0";
    const tagStart = interaction.options.getRole("tag_on_start")?.id || "0";

    const modal = new ModalBuilder()
      .setCustomId(`battle:create:${tagCreate}:${tagStart}`)
      .setTitle("Create Battle Signup");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("game")
          .setLabel("Game")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("e.g. Clash of Clans"),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Description (optional)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(1000)
          .setPlaceholder("e.g. AvA vs Rivals — need full team, no reserves!"),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("mode")
          .setLabel("Mode / Type (optional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder("e.g. 4x, AvA, Training"),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("datetime")
          .setLabel("When? (your timezone is auto-detected)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("e.g. 3pm today, tomorrow 6pm UTC, 5am 04/07/2026"),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("team_size")
          .setLabel("Team Size (per side)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("e.g. 5"),
      ),
    );

    await interaction.showModal(modal);
  },
};

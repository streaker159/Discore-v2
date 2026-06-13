const { SlashCommandBuilder } = require("discord.js");
const { requireBotAdmin } = require("../../../lib/ownerGuard");
const prisma = require("../../../lib/prisma");
const { createDiscoreEmbed } = require("../../../lib/embedBuilder");
const { ensureGame } = require("../../../modules/gameData/service");

module.exports = {
  scope: "BOT_OWNER",
  data: new SlashCommandBuilder()
    .setName("game-admin")
    .setDescription("Owner-only game data tools.")
    .addSubcommand((s) =>
      s
        .setName("add-unit")
        .setDescription("Add a unit.")
        .addStringOption((o) =>
          o.setName("game").setDescription("Game slug").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("name").setDescription("Unit name").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("description").setDescription("Description"),
        )
        .addStringOption((o) =>
          o.setName("category").setDescription("Category / doctrine"),
        )
        .addStringOption((o) => o.setName("icon").setDescription("Icon URL"))
        .addStringOption((o) =>
          o.setName("aliases").setDescription("Comma-separated aliases"),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("add-building")
        .setDescription("Add a building.")
        .addStringOption((o) =>
          o.setName("game").setDescription("Game slug").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("name").setDescription("Building name").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("description").setDescription("Description"),
        )
        .addStringOption((o) => o.setName("icon").setDescription("Icon URL"))
        .addStringOption((o) =>
          o.setName("aliases").setDescription("Comma-separated aliases"),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("add-research")
        .setDescription("Add a research item.")
        .addStringOption((o) =>
          o.setName("game").setDescription("Game slug").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("name").setDescription("Research name").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("description").setDescription("Description"),
        )
        .addStringOption((o) => o.setName("icon").setDescription("Icon URL"))
        .addStringOption((o) =>
          o.setName("aliases").setDescription("Comma-separated aliases"),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("add-resource")
        .setDescription("Add a resource.")
        .addStringOption((o) =>
          o.setName("game").setDescription("Game slug").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("name").setDescription("Resource name").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("description").setDescription("Description"),
        )
        .addStringOption((o) => o.setName("icon").setDescription("Icon URL")),
    )
    .addSubcommand((s) =>
      s
        .setName("disable")
        .setDescription("Disable a game data record.")
        .addStringOption((o) =>
          o.setName("game").setDescription("Game slug").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Type")
            .setRequired(true)
            .addChoices(
              { name: "Unit", value: "unit" },
              { name: "Building", value: "building" },
              { name: "Resource", value: "resource" },
              { name: "Research", value: "research" },
            ),
        )
        .addStringOption((o) =>
          o.setName("name").setDescription("Record name").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("approve-draft")
        .setDescription("Approve a draft record.")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Type")
            .setRequired(true)
            .addChoices(
              { name: "Unit", value: "unit" },
              { name: "Building", value: "building" },
              { name: "Research", value: "research" },
            ),
        )
        .addStringOption((o) =>
          o.setName("id").setDescription("Record ID").setRequired(true),
        ),
    ),
  async execute(interaction) {
    if (!(await requireBotAdmin(interaction))) return;
    const sub = interaction.options.getSubcommand();

    if (sub === "approve-draft") {
      const type = interaction.options.getString("type", true);
      const id = interaction.options.getString("id", true);
      const model = {
        unit: prisma.unit,
        building: prisma.building,
        research: prisma.research,
      }[type];
      const record = await model.update({
        where: { id },
        data: {
          isDraft: false,
          approvedBy: interaction.user.id,
          approvedAt: new Date(),
        },
      });
      const embed = await createDiscoreEmbed(interaction, {
        title: "✅ Draft approved",
        description: `**${record.name}** is now live.`,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "disable") {
      const game = await ensureGame(
        interaction.options.getString("game", true),
      );
      const type = interaction.options.getString("type", true);
      const name = interaction.options.getString("name", true);
      const model = {
        unit: prisma.unit,
        building: prisma.building,
        resource: prisma.resource,
        research: prisma.research,
      }[type];
      const record = await model.findFirst({
        where: { gameId: game.id, name: { equals: name, mode: "insensitive" } },
      });
      if (!record)
        return interaction.reply({
          content: `No ${type} named "${name}" found.`,
          ephemeral: true,
        });
      await model.update({
        where: { id: record.id },
        data: { isActive: false },
      });
      const embed = await createDiscoreEmbed(interaction, {
        title: "🚫 Record disabled",
        description: `**${record.name}** (${type}) has been disabled and will no longer appear in searches.`,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const game = await ensureGame(interaction.options.getString("game", true));
    const aliases = (interaction.options.getString("aliases") || "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    let record;

    if (sub === "add-unit") {
      record = await prisma.unit.create({
        data: {
          gameId: game.id,
          name: interaction.options.getString("name", true),
          description: interaction.options.getString("description"),
          iconUrl: interaction.options.getString("icon"),
          category: interaction.options.getString("category"),
          aliases,
        },
      });
    } else if (sub === "add-building") {
      record = await prisma.building.create({
        data: {
          gameId: game.id,
          name: interaction.options.getString("name", true),
          description: interaction.options.getString("description"),
          iconUrl: interaction.options.getString("icon"),
          aliases,
        },
      });
    } else if (sub === "add-research") {
      record = await prisma.research.create({
        data: {
          gameId: game.id,
          name: interaction.options.getString("name", true),
          description: interaction.options.getString("description"),
          iconUrl: interaction.options.getString("icon"),
          aliases,
        },
      });
    } else {
      record = await prisma.resource.create({
        data: {
          gameId: game.id,
          name: interaction.options.getString("name", true),
          description: interaction.options.getString("description"),
          iconUrl: interaction.options.getString("icon"),
          aliases: [],
        },
      });
    }

    const embed = await createDiscoreEmbed(interaction, {
      title: "🎮 Game data added",
      description: `Added **${record.name}** to **${game.name}**.`,
    });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

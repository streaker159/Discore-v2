const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { randomUUID } = require("crypto");
const { pendingProfileCache } = require("../../../lib/cache");
const {
  getAllianceProfile,
  canUpdateAlliance,
  setAlliancePrivacy,
  MAX_SCREENSHOTS,
  RATE_LIMIT_HOURS,
} = require("../../../modules/profiles/allianceProfileService");
const {
  parseAllianceScreenshots,
} = require("../../../modules/profiles/screenshotParser");
const {
  buildAllianceEmbed,
  buildAllianceButtons,
  buildAllianceParsePreviewEmbed,
  buildAllianceParsePreviewButtons,
} = require("../../../modules/profiles/allianceEmbed");

const DEFAULT_GAME = "supremacy-ww3";

module.exports = {
  scope: "PUBLIC",
  disabled: true, // Disabled until game API data available
  data: new SlashCommandBuilder()
    .setName("alliance")
    .setDescription("Alliance profile commands.")
    // ── profile ───────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("profile")
        .setDescription("View an alliance profile.")
        .addStringOption((o) =>
          o
            .setName("tag")
            .setDescription("Alliance tag (e.g. WOLF)")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("game")
            .setDescription("Game slug (default: supremacy-ww3)"),
        ),
    )
    // ── setup ─────────────────────────────────────────────
    .addSubcommand((s) => {
      s.setName("setup").setDescription(
        `Create or update your alliance profile from screenshots (max ${MAX_SCREENSHOTS}).`,
      );
      s.addStringOption((o) =>
        o
          .setName("tag")
          .setDescription("Your alliance tag (e.g. WOLF)")
          .setRequired(true),
      );
      // screenshot1 required — must come before all non-required options
      s.addAttachmentOption((o) =>
        o
          .setName("screenshot1")
          .setDescription("Screenshot 1 of your alliance profile")
          .setRequired(true),
      );
      s.addStringOption((o) =>
        o.setName("game").setDescription("Game slug (default: supremacy-ww3)"),
      );
      for (let i = 2; i <= MAX_SCREENSHOTS; i++) {
        s.addAttachmentOption((o) =>
          o
            .setName(`screenshot${i}`)
            .setDescription(`Screenshot ${i} of your alliance profile`)
            .setRequired(false),
        );
      }
      return s;
    })
    // ── privacy ───────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("privacy")
        .setDescription("Set alliance profile visibility (managers only).")
        .addStringOption((o) =>
          o.setName("tag").setDescription("Alliance tag").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("visibility")
            .setDescription("Public or private")
            .setRequired(true)
            .addChoices(
              { name: "Public (default)", value: "public" },
              { name: "Private", value: "private" },
            ),
        )
        .addStringOption((o) => o.setName("game").setDescription("Game slug")),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const game = interaction.options.getString("game") || DEFAULT_GAME;

    // ── /alliance profile ─────────────────────────────────
    if (sub === "profile") {
      const tag = interaction.options.getString("tag", true).toUpperCase();
      const alliance = await getAllianceProfile(tag, game);

      if (!alliance) {
        return interaction.reply({
          content: `⚠️ No alliance profile found for **[${tag}]** in game \`${game}\`.\nUse \`/alliance setup\` to create one.`,
          ephemeral: true,
        });
      }

      if (!alliance.isPublic) {
        const isAdmin = interaction.memberPermissions?.has(
          PermissionFlagsBits.ManageGuild,
        );
        if (!isAdmin && alliance.ownerId !== interaction.user.id) {
          return interaction.reply({
            content: "🔒 That alliance profile is private.",
            ephemeral: true,
          });
        }
      }

      const memberRoles =
        interaction.member?.roles?.cache?.map((r) => r.id) ?? [];
      const embed = buildAllianceEmbed(alliance);
      const rows = buildAllianceButtons(
        alliance.id,
        interaction.user.id,
        alliance.ownerId,
        alliance.managerRoleId,
        memberRoles,
      );
      return interaction.reply({ embeds: [embed], components: rows });
    }

    // ── /alliance setup ───────────────────────────────────
    if (sub === "setup") {
      const tag = interaction.options.getString("tag", true).toUpperCase();

      const attachments = [];
      for (let i = 1; i <= MAX_SCREENSHOTS; i++) {
        const att = interaction.options.getAttachment(`screenshot${i}`);
        if (att) {
          if (!att.contentType?.startsWith("image/")) {
            return interaction.reply({
              content: `⚠️ Screenshot ${i} is not a valid image file.`,
              ephemeral: true,
            });
          }
          attachments.push(att);
        }
      }

      if (!attachments.length) {
        return interaction.reply({
          content:
            "⚠️ Please attach at least one screenshot of your in-game alliance profile.",
          ephemeral: true,
        });
      }

      // Rate limit: existing alliances only
      const existing = await getAllianceProfile(tag, game);
      if (existing) {
        // Only owner or manager can update
        const memberRoles =
          interaction.member?.roles?.cache?.map((r) => r.id) ?? [];
        const isManager =
          existing.ownerId === interaction.user.id ||
          (existing.managerRoleId &&
            memberRoles.includes(existing.managerRoleId)) ||
          interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        if (!isManager) {
          return interaction.reply({
            content: `⚠️ Only the alliance owner or manager can update **[${tag}]**.`,
            ephemeral: true,
          });
        }

        const { canUpdate, hoursLeft } = await canUpdateAlliance(tag, game);
        if (!canUpdate) {
          return interaction.reply({
            content: `⏳ This alliance can only be updated once every **${RATE_LIMIT_HOURS} hours**. Try again in **${hoursLeft}h**.`,
            ephemeral: true,
          });
        }
      }

      await interaction.deferReply({ ephemeral: true });

      const imageUrls = attachments.map((a) => a.url);
      let parsed = await parseAllianceScreenshots(imageUrls);
      if (!parsed) parsed = {};

      // Ensure tag is set
      if (!parsed.tag) parsed.tag = tag;

      const token = randomUUID();
      pendingProfileCache.set(token, {
        discordId: interaction.user.id,
        tag,
        game,
        parsed,
        screenshotUrls: imageUrls,
        isNewAlliance: !existing,
      });

      const hasData = Object.values(parsed).some((v) => v != null && v !== tag);

      if (hasData) {
        const previewEmbed = buildAllianceParsePreviewEmbed(
          parsed,
          attachments.length,
        );
        const rows = buildAllianceParsePreviewButtons(token);
        return interaction.editReply({
          embeds: [previewEmbed],
          components: rows,
        });
      }

      return interaction.editReply({
        content:
          "📸 **Screenshots received!**\n\n" +
          "Automatic stat extraction is not available or returned no data.\n" +
          "Press **✏️ Edit Details** to enter stats manually, then **✅ Confirm & Save**.",
        components: buildAllianceParsePreviewButtons(token),
      });
    }

    // ── /alliance privacy ─────────────────────────────────
    if (sub === "privacy") {
      const tag = interaction.options.getString("tag", true).toUpperCase();
      const vis = interaction.options.getString("visibility", true);
      const alliance = await getAllianceProfile(tag, game);

      if (!alliance) {
        return interaction.reply({
          content: `⚠️ Alliance **[${tag}]** not found.`,
          ephemeral: true,
        });
      }

      const memberRoles =
        interaction.member?.roles?.cache?.map((r) => r.id) ?? [];
      const isManager =
        alliance.ownerId === interaction.user.id ||
        (alliance.managerRoleId &&
          memberRoles.includes(alliance.managerRoleId)) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

      if (!isManager) {
        return interaction.reply({
          content: `⚠️ You don't have permission to change **[${tag}]** settings.`,
          ephemeral: true,
        });
      }

      const isPublic = vis === "public";
      await setAlliancePrivacy(tag, game, isPublic);
      return interaction.reply({
        content: isPublic
          ? `🌐 **[${tag}]** is now public and will appear in leaderboards.`
          : `🔒 **[${tag}]** is now private.`,
        ephemeral: true,
      });
    }
  },
};

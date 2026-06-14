const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { randomUUID } = require("crypto");
const { UserFacingError } = require("../../../lib/errors");
const { pendingProfileCache } = require("../../../lib/cache");
const {
  getPlayerProfile,
  canUpdateProfile,
  setPlayerPrivacy,
  MAX_SCREENSHOTS,
  RATE_LIMIT_HOURS,
} = require("../../../modules/profiles/playerService");
const {
  parsePlayerScreenshots,
} = require("../../../modules/profiles/screenshotParser");
const {
  buildPlayerEmbed,
  buildPlayerButtons,
  buildParsePreviewEmbed,
  buildParsePreviewButtons,
} = require("../../../modules/profiles/playerEmbed");

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("player")
    .setDescription("Player profile commands.")
    // ── profile ─────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("profile")
        .setDescription(
          "View a player profile (your own if no user is specified).",
        )
        .addUserOption((o) =>
          o
            .setName("user")
            .setDescription("Discord user to view (leave blank for yourself)"),
        ),
    )
    // ── update ──────────────────────────────────────────────
    .addSubcommand((s) => {
      s.setName("update").setDescription(
        `Update your profile from screenshots (max ${MAX_SCREENSHOTS}, once per ${RATE_LIMIT_HOURS}h).`,
      );
      for (let i = 1; i <= MAX_SCREENSHOTS; i++) {
        s.addAttachmentOption((o) =>
          o
            .setName(`screenshot${i}`)
            .setDescription(`Screenshot ${i} of your in-game profile`)
            .setRequired(i === 1),
        );
      }
      return s;
    })
    // ── privacy ─────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("privacy")
        .setDescription("Set your profile visibility.")
        .addStringOption((o) =>
          o
            .setName("visibility")
            .setDescription("Public or private")
            .setRequired(true)
            .addChoices(
              { name: "Public (default)", value: "public" },
              { name: "Private", value: "private" },
            ),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── /player profile ──────────────────────────────────────
    if (sub === "profile") {
      const targetUser =
        interaction.options.getUser("user") ?? interaction.user;
      const profile = await getPlayerProfile(targetUser.id);

      if (!profile) {
        return interaction.reply({
          content:
            targetUser.id === interaction.user.id
              ? "⚠️ You don't have a profile yet. Use `/player update` with screenshots to create one."
              : `⚠️ **${targetUser.username}** doesn't have a player profile yet.`,
          ephemeral: true,
        });
      }

      if (!profile.isPublic && targetUser.id !== interaction.user.id) {
        const isAdmin = interaction.memberPermissions?.has(
          PermissionFlagsBits.ManageGuild,
        );
        if (!isAdmin) {
          return interaction.reply({
            content: "🔒 That player has set their profile to private.",
            ephemeral: true,
          });
        }
      }

      const embed = buildPlayerEmbed(profile, targetUser);
      const rows = buildPlayerButtons(targetUser.id, interaction.user.id);
      return interaction.reply({ embeds: [embed], components: rows });
    }

    // ── /player update ────────────────────────────────────────
    if (sub === "update") {
      // Collect attachments
      const attachments = [];
      for (let i = 1; i <= MAX_SCREENSHOTS; i++) {
        const att = interaction.options.getAttachment(`screenshot${i}`);
        if (att) {
          if (!att.contentType?.startsWith("image/")) {
            return interaction.reply({
              content: `⚠️ Screenshot ${i} is not a valid image file. Only PNG/JPG/WEBP are accepted.`,
              ephemeral: true,
            });
          }
          attachments.push(att);
        }
      }

      if (!attachments.length) {
        return interaction.reply({
          content:
            "⚠️ Please attach at least one screenshot of your in-game profile.",
          ephemeral: true,
        });
      }

      // Rate limit check (skip for first-time profile creation)
      const existing = await getPlayerProfile(interaction.user.id);
      if (existing) {
        const { canUpdate, hoursLeft } = await canUpdateProfile(
          interaction.user.id,
        );
        if (!canUpdate) {
          return interaction.reply({
            content: `⏳ You can only update your profile once every **${RATE_LIMIT_HOURS} hours**.\nYou can try again in **${hoursLeft}h**.`,
            ephemeral: true,
          });
        }
      }

      await interaction.deferReply({ ephemeral: true });

      const imageUrls = attachments.map((a) => a.url);

      // Attempt AI-based parsing
      let parsed = await parsePlayerScreenshots(imageUrls);
      if (!parsed) parsed = {};

      // Store pending data temporarily
      const token = randomUUID();
      pendingProfileCache.set(token, {
        discordId: interaction.user.id,
        parsed,
        screenshotUrls: imageUrls,
      });

      const hasData = Object.values(parsed).some((v) => v != null);

      if (hasData) {
        const previewEmbed = buildParsePreviewEmbed(parsed, attachments.length);
        const rows = buildParsePreviewButtons(token);
        return interaction.editReply({
          embeds: [previewEmbed],
          components: rows,
        });
      }

      // AI unavailable or returned nothing
      return interaction.editReply({
        content:
          "📸 **Screenshots received!**\n\n" +
          "Automatic stat extraction is not available right now, or no data could be read.\n" +
          "Press **✏️ Edit Basic Stats** to enter your stats manually, then **✅ Confirm & Save**.",
        components: buildParsePreviewButtons(token),
      });
    }

    // ── /player privacy ───────────────────────────────────────
    if (sub === "privacy") {
      const vis = interaction.options.getString("visibility", true);
      const isPublic = vis === "public";
      await setPlayerPrivacy(interaction.user.id, isPublic);
      return interaction.reply({
        content: isPublic
          ? "🌐 Your profile is now **public** and will appear in leaderboards."
          : "🔒 Your profile is now **private**. Only you and server admins can see it.",
        ephemeral: true,
      });
    }
  },
};

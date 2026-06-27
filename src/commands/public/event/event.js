"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { parseDateTime } = require("../../../lib/timeParser");
const { getGuildSettings } = require("../../../lib/embedBuilder");
const {
  createEvent,
  getEvent,
  buildEventEmbed,
  eventButtons,
  claimNotification,
  getUpcomingEvents,
  COLOR_PRESETS,
} = require("../../../modules/events/service");
const { getGuildPlan } = require("../../../lib/premiumGate");
const prisma = require("../../../lib/prisma");

// Max file size for attachments (8 MB)
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

function isValidImageAttachment(attachment) {
  if (!attachment) return true;
  if (attachment.size > MAX_IMAGE_BYTES) return "too_large";
  const ct = attachment.contentType?.split(";")[0]?.trim().toLowerCase();
  if (!IMAGE_CONTENT_TYPES.includes(ct)) return "wrong_type";
  return true;
}

module.exports = {
  scope: "PUBLIC",
  data: new SlashCommandBuilder()
    .setName("event")
    .setDescription("Create and manage server events.")

    // ── create ──────────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("create")
        .setDescription("Create a new event, battle, or team activity.")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("What kind of event is this?")
            .setRequired(true)
            .addChoices(
              { name: "📅 Event — General server event", value: "EVENT" },
              {
                name: "⚔️ Game Sign-On — Battle/match signup with slots",
                value: "BATTLE",
              },
              { name: "🛡️ Team Event — Team-vs-team activity", value: "TEAM" },
              {
                name: "🌍 Community — Open server-wide event",
                value: "COMMUNITY",
              },
              {
                name: "🎯 Training — Practice or coaching session",
                value: "TRAINING",
              },
              {
                name: "🚀 Game Start — Scheduled game/match launch",
                value: "GAME_START",
              },
              {
                name: "📌 Custom — Set your own label with custom_type",
                value: "CUSTOM",
              },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("title")
            .setDescription("Event title")
            .setRequired(true)
            .setMaxLength(100),
        )
        .addStringOption((o) =>
          o
            .setName("when")
            .setDescription(
              "When? e.g. in 3 hours · tomorrow 8pm UTC · 24/7/26 3pm Paris time · 1800 UTC",
            )
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("description")
            .setDescription("What is this event about? (optional)")
            .setMaxLength(1000),
        )
        .addStringOption((o) =>
          o
            .setName("location")
            .setDescription(
              "Where? Channel name, map location, or a URL (optional)",
            ),
        )
        .addStringOption((o) =>
          o
            .setName("game")
            .setDescription("Game name, e.g. Supremacy 1914 (optional)"),
        )
        .addIntegerOption((o) =>
          o
            .setName("team_size")
            .setDescription(
              "Slots per side — only used for Game Sign-On type (optional)",
            )
            .setMinValue(1)
            .setMaxValue(500),
        )
        .addRoleOption((o) =>
          o.setName("tag_role").setDescription("First role to ping (optional)"),
        )
        .addRoleOption((o) =>
          o
            .setName("tag_role_2")
            .setDescription("Second role to ping (optional)"),
        )
        .addRoleOption((o) =>
          o
            .setName("tag_role_3")
            .setDescription("Third role to ping (optional)"),
        )
        .addBooleanOption((o) =>
          o
            .setName("tag_on_create")
            .setDescription(
              "Ping role(s) when this event is posted? (default: true if role set)",
            ),
        )
        .addBooleanOption((o) =>
          o
            .setName("tag_on_start")
            .setDescription(
              "Ping role(s) when the event goes live? (default: false)",
            ),
        )
        .addStringOption((o) =>
          o
            .setName("reminder_before")
            .setDescription("Send a channel reminder before start? (optional)")
            .addChoices(
              { name: "None", value: "0" },
              { name: "10 minutes", value: "10" },
              { name: "30 minutes", value: "30" },
              { name: "1 hour", value: "60" },
              { name: "3 hours", value: "180" },
              { name: "6 hours", value: "360" },
              { name: "24 hours", value: "1440" },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("delete_after")
            .setDescription(
              "How long after the event starts before the embed is auto-deleted (default: 7 days)",
            )
            .addChoices(
              { name: "Immediately when event starts", value: "0" },
              { name: "1 hour after start", value: "1" },
              { name: "6 hours after start", value: "6" },
              { name: "12 hours after start", value: "12" },
              { name: "1 day after start", value: "24" },
              { name: "3 days after start", value: "72" },
              { name: "7 days after start", value: "168" },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("color")
            .setDescription("Embed accent color (optional)")
            .addChoices(
              { name: "🟣 Blurple (default)", value: "blurple" },
              { name: "🔴 Red", value: "red" },
              { name: "🟠 Orange", value: "orange" },
              { name: "🟡 Yellow", value: "yellow" },
              { name: "🟢 Green", value: "green" },
              { name: "🩵 Teal", value: "teal" },
              { name: "🔵 Blue", value: "blue" },
              { name: "🟤 Purple", value: "purple" },
              { name: "🩷 Pink", value: "pink" },
              { name: "⚪ Grey", value: "grey" },
              {
                name: "🎨 Custom hex — type hex code in title field after picking this",
                value: "custom",
              },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("custom_type")
            .setDescription(
              "Custom event type label — only shown when type is 📌 Custom (e.g. Movie Night)",
            )
            .setMaxLength(40),
        )
        .addAttachmentOption((o) =>
          o
            .setName("thumbnail")
            .setDescription(
              "Small thumbnail image (top-right corner of embed)",
            ),
        )
        .addAttachmentOption((o) =>
          o
            .setName("image")
            .setDescription(
              "Main banner image (full-width at bottom of embed)",
            ),
        ),
    )

    // ── list ────────────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s.setName("list").setDescription("Show upcoming and live events."),
    )

    // ── show ────────────────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("show")
        .setDescription("Show a specific event by ID.")
        .addStringOption((o) =>
          o
            .setName("id")
            .setDescription("Event number (e.g. #1042) or public ID")
            .setRequired(true),
        ),
    )

    // ── delete (admin) ──────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("delete")
        .setDescription(
          "[Admin] Permanently delete an event and all its data by ID.",
        )
        .addStringOption((o) =>
          o
            .setName("id")
            .setDescription("Event number (e.g. #1004) or public ID")
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── delete (admin) ───────────────────────────────────────────────────────
    if (sub === "delete") {
      // Require ManageGuild or Administrator
      if (
        !interaction.memberPermissions?.has(8n) &&
        !interaction.memberPermissions?.has(
          require("discord.js").PermissionFlagsBits.ManageGuild,
        )
      ) {
        return interaction.reply({
          content: "🚫 You need **Manage Server** permission to use this.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const rawId = interaction.options.getString("id", true).replace(/^#/, "");

      // Try by eventNumber first, then by id/publicId
      let event = null;
      const asNum = parseInt(rawId, 10);
      if (!isNaN(asNum)) {
        event = await prisma.event.findFirst({
          where: { guildId: interaction.guildId, eventNumber: asNum },
          select: {
            id: true,
            title: true,
            eventNumber: true,
            publicId: true,
            channelId: true,
            messageId: true,
            status: true,
            guildId: true,
          },
        });
      }
      if (!event) {
        event = await prisma.event.findFirst({
          where: {
            guildId: interaction.guildId,
            OR: [{ id: rawId }, { publicId: rawId }],
          },
          select: {
            id: true,
            title: true,
            eventNumber: true,
            publicId: true,
            channelId: true,
            messageId: true,
            status: true,
            guildId: true,
          },
        });
      }

      if (!event) {
        return interaction.editReply({
          content:
            "⚠️ Event not found. Use the event number (e.g. `#1004`) or public ID.",
        });
      }

      // Best-effort: delete the Discord embed
      if (event.channelId && event.messageId) {
        try {
          const ch =
            interaction.guild.channels.cache.get(event.channelId) ??
            (await interaction.guild.channels
              .fetch(event.channelId)
              .catch(() => null));
          if (ch) {
            const msg = await ch.messages
              .fetch(event.messageId)
              .catch(() => null);
            if (msg) await msg.delete().catch(() => {});
          }
        } catch {
          // ignore — message/channel may already be gone
        }
      }

      // Hard-delete all DB rows
      await prisma
        .$transaction([
          prisma.eventReminder.deleteMany({ where: { eventId: event.id } }),
          prisma.eventNotificationLog.deleteMany({
            where: { eventId: event.id },
          }),
          prisma.eventRsvp.deleteMany({ where: { eventId: event.id } }),
          prisma.event.delete({ where: { id: event.id } }),
        ])
        .catch(() => {});

      const idLabel = event.eventNumber
        ? `#${event.eventNumber}`
        : (event.publicId ?? event.id.slice(0, 6));
      return interaction.editReply({
        content: `🗑️ **${event.title}** (${idLabel}) has been permanently deleted — all RSVP data and reminders removed.`,
      });
    }

    // ── show ─────────────────────────────────────────────────────────────────
    if (sub === "show") {
      const rawId = interaction.options.getString("id", true).replace(/^#/, "");
      const event = await getEvent(rawId, interaction.guildId);
      if (!event)
        return interaction.reply({
          content: "⚠️ Event not found. Check the ID and try again.",
          flags: [MessageFlags.Ephemeral],
        });
      const isEnded = ["COMPLETED", "CANCELLED", "EXPIRED"].includes(
        event.status,
      );
      const embed = await buildEventEmbed(interaction, event);

      // For free tier servers, show event count and upgrade message
      const { tier, limits } = await getGuildPlan(interaction.guildId);
      let extraContent = "";
      if (tier === "FREE") {
        const upcomingCount = await prisma.event.count({
          where: { guildId: interaction.guildId, status: "UPCOMING" },
        });
        extraContent = `📊 **Active Events:** ${upcomingCount}/${limits.liveEvents}\n> 💎 Upgrade to **Discore Pro** for up to 50 events and help support Discore! Use \`/premium info\` to learn more.`;
      }

      return interaction.reply({
        content: extraContent || undefined,
        embeds: [embed],
        components: eventButtons(
          event.id,
          isEnded,
          event.eventType,
          event.teamSize,
        ),
      });
    }

    // ── list ─────────────────────────────────────────────────────────────────
    if (sub === "list") {
      const events = await getUpcomingEvents(interaction.guildId);

      // Get tier info for free tier servers
      const { tier, limits } = await getGuildPlan(interaction.guildId);

      if (!events.length) {
        let noEventsMsg =
          "📭 No upcoming events. Create one with `/event create`.";
        if (tier === "FREE") {
          noEventsMsg += `\n\n📊 **Active Events:** 0/${limits.liveEvents}\n> 💎 Upgrade to **Discore Pro** for up to 50 events and help support Discore! Use \`/premium info\` to learn more.`;
        }
        return interaction.reply({
          content: noEventsMsg,
          flags: [MessageFlags.Ephemeral],
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📅 Upcoming Events")
        .setFooter({ text: "Powered by Discore" })
        .setTimestamp();

      for (const ev of events.slice(0, 10)) {
        const unix = Math.floor(new Date(ev.scheduledAt).getTime() / 1000);
        const going = ev.rsvps.filter((r) => r.status === "GOING").length;
        const badge = ev.status === "LIVE" ? "🟢 LIVE" : "🔵 Upcoming";
        const idLabel = ev.eventNumber
          ? `#${ev.eventNumber}`
          : (ev.publicId ?? ev.id.slice(0, 6));
        embed.addFields({
          name: `${badge} — ${ev.title}`,
          value: `<t:${unix}:F> (<t:${unix}:R>)\n${ev.location ? `📍 ${ev.location}  ` : ""}✅ ${going} going  ·  ID: \`${idLabel}\``,
          inline: false,
        });
      }

      // Build description with event count for free tier
      let description =
        events.length > 10 ? `Showing 10 of ${events.length} events.` : "";
      if (tier === "FREE") {
        const upcomingCount = events.filter(
          (e) => e.status === "UPCOMING",
        ).length;
        const tierInfo = `📊 **Active Events:** ${upcomingCount}/${limits.liveEvents}`;
        description = description ? `${description}\n\n${tierInfo}` : tierInfo;
      }
      if (description) embed.setDescription(description);

      // Add content message for free tier with upgrade prompt
      let extraContent = "";
      if (tier === "FREE") {
        extraContent =
          "> 💎 Upgrade to **Discore Pro** for up to 50 events and help support Discore! Use `/premium info\` to learn more.";
      }

      return interaction.reply({
        content: extraContent || undefined,
        embeds: [embed],
      });
    }

    // ── create ────────────────────────────────────────────────────────────────
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    // ── Premium: live event limit ────────────────────────────────────────────
    const { limits } = await getGuildPlan(interaction.guildId);
    // Only UPCOMING counts toward the limit — once an event starts (LIVE) it no longer blocks new ones
    const liveCount = await prisma.event.count({
      where: { guildId: interaction.guildId, status: "UPCOMING" },
    });
    if (liveCount >= limits.liveEvents) {
      return interaction.editReply({
        content: [
          `🔒 **Scheduled event limit reached.** Your server has **${liveCount}/${limits.liveEvents}** upcoming events.`,
          limits.liveEvents <= 5
            ? `> 💎 Upgrade to **Discore Pro** for up to 50 scheduled events and help support Discore! Use \`/premium info\` to learn more.`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      });
    }

    // Read all options
    const eventType = interaction.options.getString("type", true);
    const title = interaction.options.getString("title", true).trim();
    const rawTime = interaction.options.getString("when", true).trim();
    const desc = interaction.options.getString("description")?.trim() || null;
    const location = interaction.options.getString("location")?.trim() || null;
    const game = interaction.options.getString("game")?.trim() || null;
    const customType =
      interaction.options.getString("custom_type")?.trim() || null;
    const teamSize =
      eventType === "BATTLE"
        ? (interaction.options.getInteger("team_size") ?? null)
        : null;
    const colorChoice = interaction.options.getString("color") || null;
    const tagRole = interaction.options.getRole("tag_role");
    const tagRole2 = interaction.options.getRole("tag_role_2");
    const tagRole3 = interaction.options.getRole("tag_role_3");
    const tagOnCreate = tagRole
      ? (interaction.options.getBoolean("tag_on_create") ?? true)
      : false;
    const tagOnStart = interaction.options.getBoolean("tag_on_start") ?? false;
    const reminderStr = interaction.options.getString("reminder_before") ?? "0";
    const reminderMin = parseInt(reminderStr, 10) || 0;
    const deleteAfterHours = parseInt(
      interaction.options.getString("delete_after") ?? "168",
      10,
    );
    const thumbAttach = interaction.options.getAttachment("thumbnail");
    const imgAttach = interaction.options.getAttachment("image");

    // Build role ID array (dedup, filter null)
    const tagRoleIds = [
      ...new Set([tagRole?.id, tagRole2?.id, tagRole3?.id].filter(Boolean)),
    ];

    // Color: preset key or null (custom means user adds hex manually to title)
    const color = colorChoice && colorChoice !== "custom" ? colorChoice : null;

    // Validate images
    const thumbCheck = isValidImageAttachment(thumbAttach);
    if (thumbCheck === "too_large")
      return interaction.editReply({
        content: "⚠️ Thumbnail is too large. Max 8 MB.",
      });
    if (thumbCheck === "wrong_type")
      return interaction.editReply({
        content: "⚠️ Thumbnail must be PNG, JPG, GIF, or WEBP.",
      });

    const imgCheck = isValidImageAttachment(imgAttach);
    if (imgCheck === "too_large")
      return interaction.editReply({
        content: "⚠️ Banner image is too large. Max 8 MB.",
      });
    if (imgCheck === "wrong_type")
      return interaction.editReply({
        content: "⚠️ Banner must be PNG, JPG, GIF, or WEBP.",
      });

    // Parse time
    const settings = await getGuildSettings(interaction.guildId).catch(
      () => null,
    );
    const parsed = parseDateTime(rawTime, {
      timezone: settings?.timezone || "UTC",
    });
    if (!parsed.ok) {
      return interaction.editReply({
        content: `${parsed.reason}\n\n**Examples:**\n• \`in 3 hours\`\n• \`tomorrow 8pm UTC\`\n• \`24/7/26 3pm Paris time\`\n• \`1800 UTC\``,
      });
    }

    // Create event
    const event = await createEvent({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      createdBy: interaction.user.id,
      title,
      description: desc,
      location,
      game,
      customTypeName: customType,
      eventType,
      teamSize,
      color,
      scheduledAt: parsed.date,
      timezoneUsed: parsed.timezone,
      tagRoleIds,
      tagOnCreate,
      tagOnStart,
      reminderBeforeMinutes: reminderMin > 0 ? reminderMin : null,
      cleanupAfter: new Date(
        parsed.date.getTime() + deleteAfterHours * 60 * 60 * 1000,
      ),
      thumbnailUrl: thumbAttach?.url ?? null,
      imageUrl: imgAttach?.url ?? null,
    });

    const full = await getEvent(event.id);
    const embed = await buildEventEmbed(interaction, full);

    // Post to channel
    const pingIds = tagOnCreate ? tagRoleIds : [];
    const pingContent = pingIds.length
      ? pingIds.map((id) => `<@&${id}>`).join(" ") + " —"
      : undefined;

    const message = await interaction.channel
      .send({
        content: pingContent,
        embeds: [embed],
        components: eventButtons(event.id, false, eventType, teamSize),
        allowedMentions: pingIds.length ? { roles: pingIds } : { parse: [] },
      })
      .catch((err) => {
        throw new Error(`⚠️ Couldn't post the event: ${err.message}`);
      });

    // Save messageId
    await prisma.event
      .update({ where: { id: event.id }, data: { messageId: message.id } })
      .catch(() => {});

    // Dedup notification log
    if (pingIds.length && tagOnCreate) {
      await claimNotification(event.id, interaction.guildId, "CREATE", {
        channelId: interaction.channelId,
        roleId: pingIds[0],
        messageId: message.id,
      });
    }

    const remLabel =
      reminderMin >= 60 ? `${reminderMin / 60}h` : `${reminderMin}m`;
    const idLabel = full.eventNumber
      ? `#${full.eventNumber}`
      : (full.publicId ?? full.id.slice(0, 6));
    const notifLines =
      [
        tagOnCreate && pingIds.length
          ? `📣 Pinged ${pingIds.map((id) => `<@&${id}>`).join(" ")} on creation`
          : null,
        tagOnStart && pingIds.length
          ? `🔔 Will ping ${pingIds.map((id) => `<@&${id}>`).join(" ")} when live`
          : null,
        reminderMin > 0
          ? `⏰ Channel reminder set for ${remLabel} before start`
          : null,
        deleteAfterHours === 0
          ? `🗑️ Embed will be deleted immediately when event starts`
          : `🗑️ Embed auto-deletes ${deleteAfterHours < 24 ? `${deleteAfterHours}h` : `${deleteAfterHours / 24}d`} after start`,
      ]
        .filter(Boolean)
        .join("\n") || "No pings configured";

    return interaction.editReply({
      content: [
        `✅ **${title}** posted!`,
        `> Starts: ${parsed.discord.full} (${parsed.discord.relative})`,
        `> ID: \`${idLabel}\``,
        ``,
        notifLines,
      ].join("\n"),
    });
  },
};

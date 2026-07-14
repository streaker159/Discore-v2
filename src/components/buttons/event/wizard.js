"use strict";

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const prisma = require("../../../lib/prisma");
const {
  createEvent,
  getEvent,
  buildEventEmbed,
  eventButtons,
  COLOR_PRESETS,
  EVENT_TYPES,
} = require("../../../modules/events/service");
const wizardState = require("../../../modules/events/wizardState");
const { getGuildPlan } = require("../../../lib/premiumGate");

const STEPS = {
  TYPE: 1,
  BASIC_INFO: 2,
  TYPE_SETTINGS: 3,
  PINGS: 4,
  STYLE: 5,
  PREVIEW: 6,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWizardData(interaction) {
  return (
    wizardState.get(interaction.user.id, interaction.guildId) || {
      step: STEPS.TYPE,
      eventType: "EVENT",
      title: null,
      when: null,
      description: null,
      location: null,
      game: null,
      teamSize: null,
      customTypeName: null,
      tagRoleIds: [],
      tagOnCreate: false,
      tagOnStart: false,
      reminderBeforeMinutes: null,
      deleteAfterHours: 168,
      color: null,
      thumbnailUrl: null,
      imageUrl: null,
    }
  );
}

function saveWizardData(interaction, data) {
  wizardState.set(interaction.user.id, interaction.guildId, data);
}

const {
  buildStepEmbed,
  buildStepComponents,
} = require("../../../commands/public/event/event");

module.exports = [
  // ── Dashboard: create event → step 1 ──────────────────────────────────
  {
    customId: "event:dashboard:create",
    async execute(interaction) {
      const data = { step: STEPS.TYPE, eventType: "EVENT" };
      saveWizardData(interaction, data);
      const embed = buildStepEmbed(STEPS.TYPE, "EVENT", data);
      const components = buildStepComponents(STEPS.TYPE, null, "EVENT", data);
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ── Dashboard: view events ────────────────────────────────────────────
  {
    customId: "event:dashboard:view",
    async execute(interaction) {
      const events = await prisma.event.findMany({
        where: {
          guildId: interaction.guildId,
          status: { in: ["UPCOMING", "LIVE"] },
        },
        include: { rsvps: true },
        orderBy: { scheduledAt: "asc" },
        take: 10,
      });
      if (!events.length)
        return interaction.reply({
          content: "📭 No upcoming or live events.",
          flags: 64,
        });
      const lines = events.map((e) => {
        const going = e.rsvps.filter((r) => r.status === "GOING").length;
        const ts = Math.floor(new Date(e.scheduledAt).getTime() / 1000);
        return `**${e.title}** — <t:${ts}:R> · ${going} going`;
      });
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📅 Upcoming Events")
        .setDescription(lines.join("\n"));
      return interaction.reply({ embeds: [embed], flags: 64 });
    },
  },

  // ── Dashboard: refresh ────────────────────────────────────────────────
  {
    customId: "event:dashboard:refresh",
    async execute(interaction) {
      const upcomingCount = await prisma.event.count({
        where: {
          guildId: interaction.guildId,
          status: { in: ["UPCOMING", "LIVE"] },
        },
      });
      const draftCount = await prisma.event.count({
        where: { guildId: interaction.guildId, status: "DRAFT" },
      });
      const {
        buildDashboardEmbed,
        buildDashboardButtons,
      } = require("../../../commands/public/event/event");
      const embed = buildDashboardEmbed(upcomingCount, draftCount);
      const components = buildDashboardButtons(upcomingCount + draftCount > 0);
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ── Dashboard: close ──────────────────────────────────────────────────
  {
    customId: "event:dashboard:close",
    async execute(interaction) {
      return interaction.update({
        content: "✅ Event dashboard closed.",
        embeds: [],
        components: [],
      });
    },
  },

  // ── Wizard: type select ───────────────────────────────────────────────
  {
    customIdPrefix: "event:wiz:type",
    async execute(interaction) {
      const value = interaction.values[0];
      const data = getWizardData(interaction);
      data.eventType = value;
      saveWizardData(interaction, data);
      const embed = buildStepEmbed(STEPS.TYPE, value, data);
      const components = buildStepComponents(STEPS.TYPE, null, value, data);
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ── Wizard: next / back ───────────────────────────────────────────────
  {
    customIdPrefix: "event:wiz:next:",
    async execute(interaction) {
      const step = parseInt(interaction.customId.split(":")[3], 10);
      const data = getWizardData(interaction);
      data.step = step;
      saveWizardData(interaction, data);
      const embed = buildStepEmbed(step, data.eventType, data);
      const components = buildStepComponents(step, null, data.eventType, data);
      return interaction.update({ embeds: [embed], components });
    },
  },

  {
    customIdPrefix: "event:wiz:back:",
    async execute(interaction) {
      const step = parseInt(interaction.customId.split(":")[3], 10);
      const data = getWizardData(interaction);
      data.step = step;
      saveWizardData(interaction, data);
      const embed = buildStepEmbed(step, data.eventType, data);
      const components = buildStepComponents(step, null, data.eventType, data);
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ── Wizard: cancel ────────────────────────────────────────────────────
  {
    customId: "event:wiz:cancel",
    async execute(interaction) {
      wizardState.del(interaction.user.id, interaction.guildId);
      return interaction.update({
        content: "✅ Event creation cancelled.",
        embeds: [],
        components: [],
      });
    },
  },

  // ── Wizard: edit basic info modal ─────────────────────────────────────
  {
    customId: "event:wiz:edit_basic",
    async execute(interaction) {
      const data = getWizardData(interaction);
      const modal = new ModalBuilder()
        .setCustomId("event:modal:basic_info")
        .setTitle("Event Basic Info")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("title")
              .setLabel("Title")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(100)
              .setValue(data.title || ""),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("when")
              .setLabel("When (e.g. tomorrow 8pm UTC)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder("tomorrow 8pm UTC, 24/7/26 3pm")
              .setValue(data.whenRaw || ""),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("description")
              .setLabel("Description (optional)")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(1000)
              .setValue(data.description || ""),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("location")
              .setLabel("Location (optional)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setValue(data.location || ""),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("game")
              .setLabel("Game (optional)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setValue(data.game || ""),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  // ── Wizard: set team size modal ───────────────────────────────────────
  {
    customId: "event:wiz:set_teamsize",
    async execute(interaction) {
      const modal = new ModalBuilder()
        .setCustomId("event:modal:teamsize")
        .setTitle("Set Team Size")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("size")
              .setLabel("Slots per side (1-500)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder("e.g. 10"),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  // ── Wizard: set custom type modal ─────────────────────────────────────
  {
    customId: "event:wiz:set_customtype",
    async execute(interaction) {
      const modal = new ModalBuilder()
        .setCustomId("event:modal:customtype")
        .setTitle("Set Custom Type")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("type")
              .setLabel("Custom event type label")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(40)
              .setPlaceholder("e.g. Movie Night"),
          ),
        );
      return interaction.showModal(modal);
    },
  },

  // ── Wizard: toggle ping on create ─────────────────────────────────────
  {
    customId: "event:wiz:toggle_create_ping",
    async execute(interaction) {
      const data = getWizardData(interaction);
      data.tagOnCreate = !data.tagOnCreate;
      saveWizardData(interaction, data);
      const embed = buildStepEmbed(STEPS.PINGS, data.eventType, data);
      const components = buildStepComponents(
        STEPS.PINGS,
        null,
        data.eventType,
        data,
      );
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ── Wizard: toggle ping on start ──────────────────────────────────────
  {
    customId: "event:wiz:toggle_start_ping",
    async execute(interaction) {
      const data = getWizardData(interaction);
      data.tagOnStart = !data.tagOnStart;
      saveWizardData(interaction, data);
      const embed = buildStepEmbed(STEPS.PINGS, data.eventType, data);
      const components = buildStepComponents(
        STEPS.PINGS,
        null,
        data.eventType,
        data,
      );
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ── Wizard: add ping role ─────────────────────────────────────────────
  {
    customId: "event:wiz:add_role",
    async execute(interaction) {
      const data = getWizardData(interaction);
      // Show a RoleSelectMenu
      const { RoleSelectMenuBuilder } = require("discord.js");
      const row = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId("event:wiz:role_select")
          .setPlaceholder("Select a role to ping...")
          .setMaxValues(1),
      );
      const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`event:wiz:back:${STEPS.PINGS}`)
          .setLabel("Back")
          .setStyle(ButtonStyle.Secondary),
      );
      return interaction.update({
        components: [row, backRow],
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("📣 Select Ping Role")
            .setDescription(
              "Choose a role to ping when this event is posted or goes live.",
            ),
        ],
      });
    },
  },

  // ── Wizard: role selected ─────────────────────────────────────────────
  {
    customIdPrefix: "event:wiz:role_select",
    async execute(interaction) {
      const role = interaction.roles?.first();
      if (!role) return;
      const data = getWizardData(interaction);
      const tagRoleIds = data.tagRoleIds || [];
      if (tagRoleIds.length >= 3)
        return interaction.reply({
          content: "Maximum 3 ping roles.",
          flags: 64,
        });
      if (!tagRoleIds.includes(role.id)) tagRoleIds.push(role.id);
      data.tagRoleIds = tagRoleIds;
      saveWizardData(interaction, data);
      const embed = buildStepEmbed(STEPS.PINGS, data.eventType, data);
      const components = buildStepComponents(
        STEPS.PINGS,
        null,
        data.eventType,
        data,
      );
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ── Wizard: clear roles ───────────────────────────────────────────────
  {
    customId: "event:wiz:clear_roles",
    async execute(interaction) {
      const data = getWizardData(interaction);
      data.tagRoleIds = [];
      saveWizardData(interaction, data);
      const embed = buildStepEmbed(STEPS.PINGS, data.eventType, data);
      const components = buildStepComponents(
        STEPS.PINGS,
        null,
        data.eventType,
        data,
      );
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ── Wizard: set reminder select ───────────────────────────────────────
  {
    customId: "event:wiz:set_reminder",
    async execute(interaction) {
      const options = [
        { label: "None", value: "0" },
        { label: "10 minutes", value: "10" },
        { label: "30 minutes", value: "30" },
        { label: "1 hour", value: "60" },
        { label: "6 hours", value: "360" },
        { label: "24 hours", value: "1440" },
      ];
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("event:wiz:reminder_select")
          .setPlaceholder("Reminder before start...")
          .addOptions(
            options.map((o) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(o.label)
                .setValue(o.value),
            ),
          ),
      );
      const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`event:wiz:back:${STEPS.PINGS}`)
          .setLabel("Back")
          .setStyle(ButtonStyle.Secondary),
      );
      return interaction.update({
        components: [row, backRow],
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("⏰ Set Reminder")
            .setDescription("Send a channel reminder before the event starts."),
        ],
      });
    },
  },

  // ── Wizard: reminder selected ─────────────────────────────────────────
  {
    customIdPrefix: "event:wiz:reminder_select",
    async execute(interaction) {
      const val = parseInt(interaction.values[0], 10);
      const data = getWizardData(interaction);
      data.reminderBeforeMinutes = val > 0 ? val : null;
      saveWizardData(interaction, data);
      const embed = buildStepEmbed(STEPS.PINGS, data.eventType, data);
      const components = buildStepComponents(
        STEPS.PINGS,
        null,
        data.eventType,
        data,
      );
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ── Wizard: set auto-delete select ────────────────────────────────────
  {
    customId: "event:wiz:set_autodelete",
    async execute(interaction) {
      const options = [
        { label: "1 hour after start", value: "1" },
        { label: "6 hours after start", value: "6" },
        { label: "1 day after start", value: "24" },
        { label: "3 days after start", value: "72" },
        { label: "7 days after start (default)", value: "168" },
      ];
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("event:wiz:autodelete_select")
          .setPlaceholder("Auto-delete after...")
          .addOptions(
            options.map((o) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(o.label)
                .setValue(o.value),
            ),
          ),
      );
      const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`event:wiz:back:${STEPS.PINGS}`)
          .setLabel("Back")
          .setStyle(ButtonStyle.Secondary),
      );
      return interaction.update({
        components: [row, backRow],
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🗑️ Auto-Delete")
            .setDescription(
              "How long after the event starts before the embed is auto-deleted.",
            ),
        ],
      });
    },
  },

  // ── Wizard: auto-delete selected ──────────────────────────────────────
  {
    customIdPrefix: "event:wiz:autodelete_select",
    async execute(interaction) {
      const val = parseInt(interaction.values[0], 10);
      const data = getWizardData(interaction);
      data.deleteAfterHours = val;
      saveWizardData(interaction, data);
      const embed = buildStepEmbed(STEPS.PINGS, data.eventType, data);
      const components = buildStepComponents(
        STEPS.PINGS,
        null,
        data.eventType,
        data,
      );
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ── Wizard: post now ─────────────────────────────────────────────────
  {
    customId: "event:wiz:post_now",
    async execute(interaction) {
      const data = getWizardData(interaction);
      if (!data.title || !data.when) {
        return interaction.reply({
          content: "❌ Missing title or date. Go back to Step 2.",
          flags: 64,
        });
      }

      await interaction.deferUpdate();

      try {
        const scheduledDate = new Date(data.when);
        if (isNaN(scheduledDate.getTime())) {
          return interaction.editReply({
            content:
              "❌ Invalid date. Go back to Step 2 and re-enter the date/time.",
          });
        }

        const { limits } = await getGuildPlan(interaction.guildId);
        const liveCount = await prisma.event.count({
          where: {
            guildId: interaction.guildId,
            status: { in: ["UPCOMING", "LIVE"] },
          },
        });
        if (liveCount >= limits.liveEvents) {
          return interaction.editReply({
            content: `🔒 Event limit reached (${liveCount}/${limits.liveEvents}).`,
          });
        }

        const event = await createEvent({
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          createdBy: interaction.user.id,
          title: data.title,
          description: data.description || null,
          location: data.location || null,
          game: data.game || null,
          customTypeName: data.customTypeName || null,
          eventType: data.eventType,
          teamSize: data.teamSize || null,
          color: data.color || null,
          scheduledAt: scheduledDate,
          timezoneUsed: data.timezoneUsed || "UTC",
          tagRoleIds: data.tagRoleIds || [],
          tagOnCreate: data.tagOnCreate || false,
          tagOnStart: data.tagOnStart || false,
          reminderBeforeMinutes: data.reminderBeforeMinutes || null,
          cleanupAfter: new Date(
            scheduledDate.getTime() +
              (data.deleteAfterHours || 168) * 60 * 60 * 1000,
          ),
          thumbnailUrl: data.thumbnailUrl || null,
          imageUrl: data.imageUrl || null,
        });

        const full = await getEvent(event.id);
        const embed = await buildEventEmbed(interaction, full);

        const pingIds = data.tagOnCreate ? data.tagRoleIds || [] : [];
        const pingContent = pingIds.length
          ? pingIds.map((id) => `<@&${id}>`).join(" ") + " —"
          : undefined;

        const message = await interaction.channel
          .send({
            content: pingContent,
            embeds: [embed],
            components: eventButtons(
              event.id,
              false,
              data.eventType,
              data.teamSize,
            ),
            allowedMentions: pingIds.length
              ? { roles: pingIds }
              : { parse: [] },
          })
          .catch((err) => {
            throw new Error(`Failed to post: ${err.message}`);
          });

        await prisma.event.update({
          where: { id: event.id },
          data: {
            messageId: message.id,
            status: "UPCOMING",
            dataDeleteAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });

        wizardState.del(interaction.user.id, interaction.guildId);

        const unix = Math.floor(scheduledDate.getTime() / 1000);
        return interaction.editReply({
          content: `✅ **${data.title}** posted!\n> Starts: <t:${unix}:F>`,
          embeds: [],
          components: [],
        });
      } catch (err) {
        return interaction.editReply({
          content: `❌ ${err.message}`,
          embeds: [],
          components: [],
        });
      }
    },
  },

  // ── Wizard: save draft ───────────────────────────────────────────────
  {
    customId: "event:wiz:save_draft",
    async execute(interaction) {
      const data = getWizardData(interaction);
      if (!data.title || !data.when) {
        return interaction.reply({
          content: "❌ Missing title or date. Go back to Step 2.",
          flags: 64,
        });
      }

      await interaction.deferUpdate();

      try {
        const scheduledDate = new Date(data.when);
        if (isNaN(scheduledDate.getTime())) {
          return interaction.editReply({
            content:
              "❌ Invalid date. Go back to Step 2 and re-enter the date/time.",
          });
        }

        const event = await createEvent({
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          createdBy: interaction.user.id,
          title: data.title,
          description: data.description || null,
          location: data.location || null,
          game: data.game || null,
          customTypeName: data.customTypeName || null,
          eventType: data.eventType,
          teamSize: data.teamSize || null,
          color: data.color || null,
          scheduledAt: scheduledDate,
          timezoneUsed: data.timezoneUsed || "UTC",
          tagRoleIds: data.tagRoleIds || [],
          tagOnCreate: data.tagOnCreate || false,
          tagOnStart: data.tagOnStart || false,
          reminderBeforeMinutes: data.reminderBeforeMinutes || null,
          cleanupAfter: new Date(
            scheduledDate.getTime() +
              (data.deleteAfterHours || 168) * 60 * 60 * 1000,
          ),
          thumbnailUrl: data.thumbnailUrl || null,
          imageUrl: data.imageUrl || null,
        });

        await prisma.event.update({
          where: { id: event.id },
          data: { status: "DRAFT", draftedAt: new Date() },
        });

        wizardState.del(interaction.user.id, interaction.guildId);

        return interaction.editReply({
          content: `💾 Draft saved! **${data.title}** — use /event to reopen drafts later.`,
          embeds: [],
          components: [],
        });
      } catch (err) {
        return interaction.editReply({
          content: `❌ ${err.message}`,
          embeds: [],
          components: [],
        });
      }
    },
  },

  // ── Wizard: set color select ──────────────────────────────────────────
  {
    customId: "event:wiz:set_color",
    async execute(interaction) {
      const data = getWizardData(interaction);
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("event:wiz:color_select")
          .setPlaceholder("Choose an embed color...")
          .addOptions(
            Object.keys(COLOR_PRESETS).map((name) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(name.charAt(0).toUpperCase() + name.slice(1))
                .setValue(name)
                .setDefault(name === data.color),
            ),
          ),
      );
      const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`event:wiz:back:${STEPS.STYLE}`)
          .setLabel("Back")
          .setStyle(ButtonStyle.Secondary),
      );
      return interaction.update({
        components: [row, backRow],
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🎨 Set Embed Color")
            .setDescription("Choose the color for this event's embed."),
        ],
      });
    },
  },

  // ── Wizard: color selected ────────────────────────────────────────────
  {
    customIdPrefix: "event:wiz:color_select",
    async execute(interaction) {
      const value = interaction.values[0];
      const data = getWizardData(interaction);
      data.color = value;
      saveWizardData(interaction, data);
      const embed = buildStepEmbed(STEPS.STYLE, data.eventType, data);
      const components = buildStepComponents(
        STEPS.STYLE,
        null,
        data.eventType,
        data,
      );
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ── Wizard: remove thumbnail ─────────────────────────────────────────
  {
    customId: "event:wiz:remove_thumb",
    async execute(interaction) {
      const data = getWizardData(interaction);
      data.thumbnailUrl = null;
      saveWizardData(interaction, data);
      const embed = buildStepEmbed(STEPS.STYLE, data.eventType, data);
      const components = buildStepComponents(
        STEPS.STYLE,
        null,
        data.eventType,
        data,
      );
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ── Wizard: remove banner ────────────────────────────────────────────
  {
    customId: "event:wiz:remove_banner",
    async execute(interaction) {
      const data = getWizardData(interaction);
      data.imageUrl = null;
      saveWizardData(interaction, data);
      const embed = buildStepEmbed(STEPS.STYLE, data.eventType, data);
      const components = buildStepComponents(
        STEPS.STYLE,
        null,
        data.eventType,
        data,
      );
      return interaction.update({ embeds: [embed], components });
    },
  },

  // ── Wizard: upload thumbnail modal ───────────────────────────────────
  {
    customId: "event:wiz:upload_thumb",
    async execute(interaction) {
      const { FileUploadBuilder, LabelBuilder } = require("discord.js");
      const label = new LabelBuilder()
        .setLabel("Event Thumbnail")
        .setDescription(
          "Small image shown in the top-right of the event embed.",
        )
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId("event_thumb_upload")
            .setRequired(true)
            .setMinValues(1)
            .setMaxValues(1),
        );
      const modal = new ModalBuilder()
        .setCustomId("event:modal:upload_thumb")
        .setTitle("Upload Event Thumbnail")
        .addComponents(new ActionRowBuilder().addComponents(label));
      return interaction.showModal(modal);
    },
  },

  // ── Wizard: upload banner modal ──────────────────────────────────────
  {
    customId: "event:wiz:upload_banner",
    async execute(interaction) {
      const { FileUploadBuilder, LabelBuilder } = require("discord.js");
      const label = new LabelBuilder()
        .setLabel("Event Banner")
        .setDescription("Large full-width image shown on the event embed.")
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId("event_banner_upload")
            .setRequired(true)
            .setMinValues(1)
            .setMaxValues(1),
        );
      const modal = new ModalBuilder()
        .setCustomId("event:modal:upload_banner")
        .setTitle("Upload Event Banner")
        .addComponents(new ActionRowBuilder().addComponents(label));
      return interaction.showModal(modal);
    },
  },
];

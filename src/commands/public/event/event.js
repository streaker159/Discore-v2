"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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

const STEPS = {
  TYPE: 1,
  BASIC_INFO: 2,
  TYPE_SETTINGS: 3,
  PINGS: 4,
  STYLE: 5,
  PREVIEW: 6,
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

function buildDashboardEmbed(upcomingCount, draftCount) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📅 Event Control Centre")
    .setDescription(
      "Create and manage server events with the new guided wizard.",
    )
    .addFields(
      {
        name: "📊 Stats",
        value: `🔵 Upcoming: ${upcomingCount}\n📝 Drafts: ${draftCount}`,
        inline: true,
      },
      {
        name: "💡 Quick Help",
        value: "Click **Create Event** to start the step-by-step wizard.",
        inline: false,
      },
    )
    .setFooter({ text: "Powered by Discore" })
    .setTimestamp();
}

function buildDashboardButtons(hasEvents) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("event:dashboard:create")
      .setLabel("Create Event")
      .setStyle(ButtonStyle.Success)
      .setEmoji("➕"),
    new ButtonBuilder()
      .setCustomId("event:dashboard:view")
      .setLabel("View Events")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📋"),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("event:dashboard:refresh")
      .setLabel("Refresh")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔄"),
    new ButtonBuilder()
      .setCustomId("event:dashboard:close")
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("✖️"),
  );
  return [row1, row2];
}

// ─── Wizard Embeds ────────────────────────────────────────────────────────────

function buildStepEmbed(step, eventType, data = {}) {
  const color = 0x5865f2;
  const typeLabel = EVENT_TYPES[eventType || "EVENT"]?.label || "Event";
  const typeIcon = EVENT_TYPES[eventType || "EVENT"]?.icon || "📅";

  switch (step) {
    case STEPS.TYPE: {
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("📅 Create Event — Step 1/6: Event Type")
        .setDescription(
          "Choose what kind of event this is.\n\nUse the dropdown below to pick a type, then click **Next**.",
        );
      return embed;
    }
    case STEPS.BASIC_INFO: {
      const parts = [];
      if (data.title) parts.push(`**Title:** ${data.title}`);
      if (data.when)
        parts.push(`**When:** ${new Date(data.when).toLocaleString()}`);
      if (data.description) parts.push(`**Description:** ${data.description}`);
      if (data.location) parts.push(`**Location:** ${data.location}`);
      if (data.game) parts.push(`**Game:** ${data.game}`);
      const desc = parts.length
        ? parts.join("\n")
        : "_No info set yet. Click **Edit Basic Info**._";
      return new EmbedBuilder()
        .setColor(color)
        .setTitle(
          `📅 Create Event — Step 2/6: Basic Info — ${typeIcon} ${typeLabel}`,
        )
        .setDescription(desc);
    }
    case STEPS.TYPE_SETTINGS: {
      let desc = "";
      if (eventType === "BATTLE") {
        desc = data.teamSize
          ? `**Team Size:** ${data.teamSize} slots`
          : "_No team size set._";
      } else if (eventType === "CUSTOM") {
        desc = data.customTypeName
          ? `**Custom Type:** ${data.customTypeName}`
          : "_No custom label set._";
      } else {
        desc = "No extra settings needed for this event type.";
      }
      return new EmbedBuilder()
        .setColor(color)
        .setTitle(
          `📅 Create Event — Step 3/6: Type Settings — ${typeIcon} ${typeLabel}`,
        )
        .setDescription(desc);
    }
    case STEPS.PINGS: {
      const roles =
        (data.tagRoleIds || []).map((id) => `<@&${id}>`).join(" ") || "_None_";
      const pingCreate = data.tagOnCreate ? "✅ On" : "❌ Off";
      const pingStart = data.tagOnStart ? "✅ On" : "❌ Off";
      const reminder = data.reminderBeforeMinutes
        ? `${data.reminderBeforeMinutes >= 60 ? `${data.reminderBeforeMinutes / 60}h` : `${data.reminderBeforeMinutes}m`} before`
        : "_None_";
      const deleteAfter = data.deleteAfterHours
        ? `${data.deleteAfterHours >= 24 ? `${data.deleteAfterHours / 24}d` : `${data.deleteAfterHours}h`} after start`
        : "7 days (default)";
      return new EmbedBuilder()
        .setColor(color)
        .setTitle(`📣 Create Event — Step 4/6: Pings & Reminders`)
        .setDescription(
          `**Ping Roles:** ${roles}\n**Ping on Post:** ${pingCreate}\n**Ping on Start:** ${pingStart}\n**Reminder:** ${reminder}\n**Auto-Delete:** ${deleteAfter}`,
        );
    }
    case STEPS.STYLE: {
      const colorName = data.color || "Default (blurple)";
      const hasThumb = data.thumbnailUrl ? "✅ Set" : "❌ Not set";
      const hasImage = data.imageUrl ? "✅ Set" : "❌ Not set";
      return new EmbedBuilder()
        .setColor(COLOR_PRESETS[data.color] || 0x5865f2)
        .setTitle(`🎨 Create Event — Step 5/6: Style & Images`)
        .setDescription(
          `**Color:** ${colorName}\n**Thumbnail:** ${hasThumb}\n**Banner:** ${hasImage}`,
        );
    }
    case STEPS.PREVIEW: {
      return new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("📢 Create Event — Step 6/6: Preview & Post")
        .setDescription(
          "Select a channel/thread below to post the event, then click **Post Event**.\n\n**Event Preview:** All fields will appear in the public embed.",
        );
    }
    default:
      return new EmbedBuilder().setDescription("Unknown step.");
  }
}

function buildStepComponents(step, boardId, eventType, data = {}) {
  const rows = [];

  switch (step) {
    case STEPS.TYPE: {
      const options = Object.entries(EVENT_TYPES).map(([key, val]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`${val.icon} ${val.label}`)
          .setValue(key)
          .setDefault(key === (data.eventType || "EVENT")),
      );
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`event:wiz:type`)
            .setPlaceholder("Select event type...")
            .addOptions(options),
        ),
      );
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`event:wiz:next:${STEPS.BASIC_INFO}`)
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!data.eventType),
          new ButtonBuilder()
            .setCustomId("event:wiz:cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      break;
    }
    case STEPS.BASIC_INFO: {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`event:wiz:edit_basic`)
            .setLabel("Edit Basic Info")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📝"),
          new ButtonBuilder()
            .setCustomId(`event:wiz:back:${STEPS.TYPE}`)
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`event:wiz:next:${STEPS.TYPE_SETTINGS}`)
            .setLabel("Next")
            .setStyle(ButtonStyle.Success)
            .setDisabled(!data.title || !data.when),
          new ButtonBuilder()
            .setCustomId("event:wiz:cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      break;
    }
    case STEPS.TYPE_SETTINGS: {
      const btns = [];
      if (eventType === "BATTLE") {
        btns.push(
          new ButtonBuilder()
            .setCustomId("event:wiz:set_teamsize")
            .setLabel("Set Team Size")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("⚔️"),
        );
      } else if (eventType === "CUSTOM") {
        btns.push(
          new ButtonBuilder()
            .setCustomId("event:wiz:set_customtype")
            .setLabel("Set Custom Type")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📌"),
        );
      }
      btns.push(
        new ButtonBuilder()
          .setCustomId(`event:wiz:back:${STEPS.BASIC_INFO}`)
          .setLabel("Back")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`event:wiz:next:${STEPS.PINGS}`)
          .setLabel("Next")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("event:wiz:cancel")
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Danger),
      );
      rows.push(
        new ActionRowBuilder().addComponents(
          btns.length > 5 ? btns.slice(0, 5) : btns,
        ),
      );
      break;
    }
    case STEPS.PINGS: {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("event:wiz:add_role")
            .setLabel("Add Ping Role")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📣"),
          new ButtonBuilder()
            .setCustomId("event:wiz:clear_roles")
            .setLabel("Clear Roles")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("event:wiz:toggle_create_ping")
            .setLabel(`Ping on Post: ${data.tagOnCreate ? "ON" : "OFF"}`)
            .setStyle(
              data.tagOnCreate ? ButtonStyle.Success : ButtonStyle.Secondary,
            ),
          new ButtonBuilder()
            .setCustomId("event:wiz:toggle_start_ping")
            .setLabel(`Ping on Start: ${data.tagOnStart ? "ON" : "OFF"}`)
            .setStyle(
              data.tagOnStart ? ButtonStyle.Success : ButtonStyle.Secondary,
            ),
        ),
      );
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("event:wiz:set_reminder")
            .setLabel("Set Reminder")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("⏰"),
          new ButtonBuilder()
            .setCustomId("event:wiz:set_autodelete")
            .setLabel("Set Auto-Delete")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🗑️"),
        ),
      );
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`event:wiz:back:${STEPS.TYPE_SETTINGS}`)
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`event:wiz:next:${STEPS.STYLE}`)
            .setLabel("Next")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("event:wiz:cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      break;
    }
    case STEPS.STYLE: {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("event:wiz:set_color")
            .setLabel("Set Color")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🎨"),
          new ButtonBuilder()
            .setCustomId("event:wiz:upload_thumb")
            .setLabel("Upload Thumbnail")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🖼️"),
          new ButtonBuilder()
            .setCustomId("event:wiz:upload_banner")
            .setLabel("Upload Banner")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🖼️"),
        ),
      );
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("event:wiz:remove_thumb")
            .setLabel("Remove Thumb")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!data.thumbnailUrl),
          new ButtonBuilder()
            .setCustomId("event:wiz:remove_banner")
            .setLabel("Remove Banner")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!data.imageUrl),
        ),
      );
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`event:wiz:back:${STEPS.PINGS}`)
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`event:wiz:next:${STEPS.PREVIEW}`)
            .setLabel("Next")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("event:wiz:cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      break;
    }
    case STEPS.PREVIEW: {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("event:wiz:post_now")
            .setLabel("Post Event")
            .setStyle(ButtonStyle.Success)
            .setEmoji("📢"),
          new ButtonBuilder()
            .setCustomId("event:wiz:save_draft")
            .setLabel("Save Draft")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("💾"),
        ),
      );
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`event:wiz:back:${STEPS.STYLE}`)
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("event:wiz:cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger),
        ),
      );
      break;
    }
  }

  return rows.filter((r) => r.components?.length);
}

// ─── Command ──────────────────────────────────────────────────────────────────

module.exports = {
  scope: "PUBLIC",
  buildDashboardEmbed,
  buildDashboardButtons,
  buildStepEmbed,
  buildStepComponents,
  data: new SlashCommandBuilder()
    .setName("event")
    .setDescription(
      "Open the Event Control Centre to create and manage events.",
    ),

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

    const embed = buildDashboardEmbed(upcomingCount, draftCount);
    const components = buildDashboardButtons(upcomingCount + draftCount > 0);

    return interaction.reply({ embeds: [embed], components, flags: 64 });
  },
};

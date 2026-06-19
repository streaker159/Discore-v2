// One-shot: replace all corrupted embed builder functions in service.js
"use strict";
const fs = require("fs");
const path = require("path");
const filePath = path.join(__dirname, "../src/modules/events/service.js");
let c = fs.readFileSync(filePath, "utf8");

// ── Fix rsvpList empty string ─────────────────────────────────────────────────
// Replace: if (!items.length) return "*<corrupted>*";
c = c.replace(
  /if \(!items\.length\) return "\*[^"]{0,10}\*";/,
  'if (!items.length) return "*none*";',
);

// ── Replace buildEventEmbed ───────────────────────────────────────────────────
const embedStart = c.indexOf("async function buildEventEmbed(");
const slotBarStart = c.indexOf("/** Visual slot progress bar");
const newEmbed = `async function buildEventEmbed(guildIdOrInteraction, event) {
  const guildId =
    typeof guildIdOrInteraction === "string"
      ? guildIdOrInteraction
      : guildIdOrInteraction.guildId;
  const settings = await getGuildSettings(guildId).catch(() => null);
  const serverIcon = settings?.allianceLogo ?? null;

  const unix = Math.floor(new Date(event.scheduledAt).getTime() / 1000);
  const { icon, label } = getTypeInfo(event);
  const { going, maybe, notGoing } = rsvpCounts(event);
  const color = getEventColor(event);
  const isEnded = ["COMPLETED", "CANCELLED", "EXPIRED"].includes(event.status);
  const isBattle = event.eventType === "BATTLE";
  const fields = [];

  // ── Row 1: Status | Type | When ──────────────────────────────────────────
  fields.push({
    name: "Status",
    value: STATUS_LABELS[event.status] ?? "Unknown",
    inline: true,
  });

  const typeVal = [
    \`\${icon} \${label}\`,
    event.game ? \`\uD83C\uDFAE \${event.game}\` : null,
  ]
    .filter(Boolean)
    .join("\\n");
  fields.push({ name: "Type", value: typeVal, inline: true });

  fields.push({
    name: "When",
    value: \`<t:\${unix}:F>\\n<t:\${unix}:R>\`,
    inline: true,
  });

  // ── Row 2: Location | Reminder (optional inline pair) ────────────────────
  if (event.location) {
    const locVal = event.location.startsWith("http")
      ? \`[\uD83D\uDD17 Open link](\${event.location})\`
      : \`\uD83D\uDCCD \${event.location}\`;
    fields.push({ name: "\uD83D\uDCCD Location", value: locVal, inline: true });
  }
  if (!isEnded && event.reminderBeforeMinutes) {
    const m = event.reminderBeforeMinutes;
    fields.push({
      name: "\u23F0 Channel Reminder",
      value: \`\${m >= 60 ? \`\${m / 60}h\` : \`\${m}m\`} before start\`,
      inline: true,
    });
  }

  // ── Battle slot bar ───────────────────────────────────────────────────────
  if (!isEnded && isBattle && event.teamSize) {
    const bar = buildSlotBar(going, event.teamSize);
    fields.push({
      name: "\u2694\uFE0F Slots",
      value: \`\${bar}\\n**\${going} / \${event.teamSize}** signed on\`,
      inline: false,
    });
  }

  // ── RSVP sections ─────────────────────────────────────────────────────────
  if (!isEnded) {
    if (isBattle) {
      fields.push({
        name: \`\u2705 Available (\${going}\${event.teamSize ? \`/\${event.teamSize}\` : ""})\`,
        value: rsvpList(event, "GOING"),
        inline: false,
      });
      if (maybe > 0)
        fields.push({
          name: \`\uD83D\uDD04 Reserve (\${maybe})\`,
          value: rsvpList(event, "MAYBE"),
          inline: true,
        });
      if (notGoing > 0)
        fields.push({
          name: \`\u274C Not Available (\${notGoing})\`,
          value: rsvpList(event, "NOT_GOING"),
          inline: true,
        });
    } else {
      fields.push({
        name: \`\u2705 Going (\${going})\`,
        value: rsvpList(event, "GOING"),
        inline: false,
      });
      if (maybe > 0)
        fields.push({
          name: \`\uD83E\uDD14 Maybe (\${maybe})\`,
          value: rsvpList(event, "MAYBE"),
          inline: true,
        });
      if (notGoing > 0)
        fields.push({
          name: \`\u274C Not Going (\${notGoing})\`,
          value: rsvpList(event, "NOT_GOING"),
          inline: true,
        });
    }
  } else {
    const goingLabel = isBattle ? "signed on" : "went";
    fields.push({
      name: "\uD83D\uDCCB Final Attendance",
      value: [
        \`\u2705 **\${going}** \${goingLabel}\`,
        maybe > 0 ? \`\uD83D\uDD04 **\${maybe}** reserve\` : null,
        notGoing > 0 ? \`\u274C **\${notGoing}** declined\` : null,
      ]
        .filter(Boolean)
        .join("  \u2022  "),
      inline: false,
    });
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const footerParts = ["Powered by Discore"];
  if (event.eventNumber) footerParts.push(\`#\${event.eventNumber}\`);
  else if (event.publicId) footerParts.push(\`ID: \${event.publicId}\`);
  if (event.timezoneUsed && event.timezoneUsed !== "UTC")
    footerParts.push(\`\uD83C\uDF0D \${event.timezoneUsed}\`);

  const embed = new EmbedBuilder()
    .setTitle(\`\${icon} \${label}: \${event.title}\`)
    .setColor(color)
    .addFields(fields)
    .setFooter({ text: footerParts.join(" \u2022 ") })
    .setTimestamp();

  if (event.description) embed.setDescription(event.description);
  if (event.thumbnailUrl) embed.setThumbnail(event.thumbnailUrl);
  else if (serverIcon) embed.setThumbnail(serverIcon);
  if (event.imageUrl) embed.setImage(event.imageUrl);

  return embed;
}

`;

c = c.slice(0, embedStart) + newEmbed + c.slice(slotBarStart);

// ── Replace buildSlotBar ──────────────────────────────────────────────────────
const slotStart = c.indexOf("/** Visual slot progress bar");
const reminderStart = c.indexOf("function buildEventReminderEmbed(");
const newSlotBar = `/** Visual slot-fill bar — 10 segments using block characters */
function buildSlotBar(filled, total) {
  if (!total || total <= 0) return "";
  const pct = Math.min(1, filled / total);
  const on = Math.round(pct * 10);
  const bar = "\u2588".repeat(on) + "\u2591".repeat(10 - on);
  return \`\\\`[\${bar}]\\\`\`;
}

`;
c = c.slice(0, slotStart) + newSlotBar + c.slice(reminderStart);

// ── Replace buildEventReminderEmbed ──────────────────────────────────────────
const remStart = c.indexOf("function buildEventReminderEmbed(");
const remEnd = c.indexOf("\n// ---", remStart);
const newReminder = `function buildEventReminderEmbed(event, minsUntil) {
  const unix = Math.floor(new Date(event.scheduledAt).getTime() / 1000);
  const { icon, label } = getTypeInfo(event);
  const isBattle = event.eventType === "BATTLE";
  const timeStr =
    minsUntil <= 0
      ? "**starting now!**"
      : \`in **\${minsUntil} minute\${minsUntil !== 1 ? "s" : ""}**\`;

  const embed = new EmbedBuilder()
    .setColor(isBattle ? 0xe74c3c : 0xf1c40f)
    .setTitle(\`\u23F0 \${isBattle ? "Battle" : label} Starting Soon!\`)
    .setDescription(\`**\${icon} \${event.title}**\\n\\nStarts \${timeStr}\`)
    .addFields({ name: "When", value: \`<t:\${unix}:F>\\n<t:\${unix}:R>\`, inline: false })
    .setFooter({ text: "Powered by Discore" })
    .setTimestamp();

  if (event.location)
    embed.addFields({ name: "\uD83D\uDCCD Location", value: event.location, inline: false });
  if (event.thumbnailUrl) embed.setThumbnail(event.thumbnailUrl);
  return embed;
}

`;
c = c.slice(0, remStart) + newReminder + c.slice(remEnd);

fs.writeFileSync(filePath, c, "utf8");
console.log("Done. Checking syntax...");
require(filePath);
console.log("OK");

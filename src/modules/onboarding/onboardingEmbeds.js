"use strict";

const { EmbedBuilder } = require("discord.js");

/**
 * Build the admin dashboard embed.
 */
function buildDashboardEmbed(config, guild, appTypes, stats) {
  const enabled = config?.enabled ?? false;
  const hasPremium = true; // checked before calling this
  const panelChannelId = config?.panelChannelId;
  const reviewChannelId = config?.defaultReviewChannelId;
  const panelMessageId = config?.panelMessageId;

  const statusLine = enabled ? "✅ Enabled" : "⛔ Disabled";
  const premiumLine = hasPremium ? "🟢 Active" : "🔴 Expired";
  const panelLine = panelChannelId
    ? panelMessageId
      ? `📌 <#${panelChannelId}> — Message tracked`
      : `📌 <#${panelChannelId}> — No message`
    : "❌ Not set";
  const reviewLine = reviewChannelId
    ? `📋 <#${reviewChannelId}>`
    : "❌ Not set";
  const appCount = appTypes?.length || 0;
  const openCount = stats?.pendingCount || 0;
  const lastAppNumber = stats?.lastAppNumber || 0;

  const embed = new EmbedBuilder()
    .setTitle("🛡️ Discore Applications Centre")
    .setColor(config?.panelEmbedColor || "#5865F2")
    .setDescription(
      `Manage onboarding applications for **${guild?.name || "this server"}**.\n\n` +
        `**Status:** ${statusLine}\n` +
        `**Premium:** ${premiumLine}\n` +
        `**Panel Channel:** ${panelLine}\n` +
        `**Review Channel:** ${reviewLine}\n` +
        `**Application Types:** ${appCount} / ${config?.maxApplicationTypes || 3} active\n` +
        `**Open Applications:** ${openCount} pending\n` +
        `**Last Application ID:** ${lastAppNumber ? `#${String(lastAppNumber).padStart(4, "0")}` : "N/A"}\n` +
        `**Public Panel:** ${panelMessageId ? "Active" : panelChannelId ? "Missing / Needs Repair" : "Not Published"}\n` +
        `**Data Mode:** Keep submitted records while bot remains in server`,
    )
    .setFooter({
      text:
        config?.showDiscoreBranding !== false
          ? "Discore Onboarding • /onboarding"
          : "Onboarding Control Centre",
    })
    .setTimestamp();

  if (config?.useServerIcon !== false && guild?.iconURL?.()) {
    embed.setThumbnail(guild.iconURL({ size: 128 }));
  }

  return embed;
}

/**
 * Build a simple admin embed (used for subviews).
 */
function buildSimpleEmbed(title, description, color = "#5865F2") {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

/**
 * Build the public panel embed shown in the panel channel.
 */
function buildPublicPanelEmbed(config, guild, appTypes, isLocked = false) {
  const title = config?.panelEmbedTitle || "🛡️ Application Forms";
  const description = isLocked
    ? "🔒 **Premium has expired for this server.**\nApplications are temporarily unavailable.\nPlease contact server staff."
    : config?.panelEmbedDescription ||
      "Select the application that applies to you.\nYour application will be completed privately in DMs and sent to staff for review.";

  const color = isLocked ? "#808080" : config?.panelEmbedColor || "#5865F2";

  const embed = new EmbedBuilder()
    .setTitle(isLocked ? "🔒 Applications Locked" : title)
    .setDescription(description)
    .setColor(color)
    .setFooter({
      text:
        config?.showDiscoreBranding !== false
          ? "Discore Onboarding • Applications are private"
          : "Applications are private",
    })
    .setTimestamp();

  if (config?.useServerIcon !== false && guild?.iconURL?.()) {
    embed.setThumbnail(guild.iconURL({ size: 128 }));
  }

  if (config?.panelThumbnailUrl) {
    embed.setThumbnail(config.panelThumbnailUrl);
  }

  if (config?.panelImageUrl) {
    embed.setImage(config.panelImageUrl);
  }

  if (config?.useServerBanner && guild?.bannerURL?.()) {
    embed.setImage(guild.bannerURL({ size: 512 }));
  }

  return embed;
}

/**
 * Build the DM intro embed when a user starts an application.
 */
function buildDmIntroEmbed(appType, guild) {
  return new EmbedBuilder()
    .setTitle("🛡️ Application Started")
    .setDescription(
      `You are applying for: **${appType?.publicTitle || appType?.name}**\n\n` +
        `Your answers will be sent to staff for review.\n` +
        `You can cancel before submitting.`,
    )
    .setColor(appType?.themeColor || "#5865F2")
    .setFooter({ text: guild?.name || "Application System" })
    .setTimestamp();
}

/**
 * Build a DM instructions embed for a specific page.
 */
function buildDmPageEmbed(
  page,
  pageIndex,
  totalPages,
  appType,
  guild,
  answers = {},
) {
  const fields = [];
  const pageTitle = page?.title || `Step ${pageIndex + 1}`;
  const pageDesc =
    page?.description || `Please fill in the following information.`;

  const description = `**${appType?.publicTitle || "Application"}** — ${pageTitle} (${pageIndex + 1}/${totalPages})\n\n${pageDesc}`;

  const embed = new EmbedBuilder()
    .setTitle(`📝 ${pageTitle}`)
    .setDescription(description)
    .setColor(appType?.themeColor || "#5865F2")
    .setFooter({
      text: `${guild?.name || "Application"} • Page ${pageIndex + 1} of ${totalPages}`,
    })
    .setTimestamp();

  return embed;
}

/**
 * Build a preview embed of application answers before submit.
 */
function buildPreviewEmbed(application, appType, answers, guild) {
  const embed = new EmbedBuilder()
    .setTitle("📋 Application Preview")
    .setColor(appType?.themeColor || "#5865F2")
    .setDescription(
      `**Application:** ${appType?.publicTitle || appType?.name}\n` +
        `**Server:** ${guild?.name || "Unknown"}\n\n` +
        `Please review your answers below. Click **Submit** to send your application for review, or **Edit** to make changes.`,
    )
    .setFooter({ text: "Your application is not yet submitted." })
    .setTimestamp();

  if (answers && answers.length) {
    for (const a of answers) {
      const label = a.fieldLabelSnapshot || "Answer";
      let value = a.answerText || "";
      if (a.selectedOptionValues && a.selectedOptionValues.length) {
        value = a.selectedOptionValues.join(", ");
      }
      if (!value) value = "*(no answer)*";
      // Truncate
      if (value.length > 1024) value = value.slice(0, 1021) + "...";

      embed.addFields({ name: label, value, inline: false });
    }
  }

  return embed;
}

/**
 * Build the staff review card embed shown in the review channel.
 */
function buildReviewCardEmbed(application, appType, answers, notes, guild) {
  const statusEmoji = {
    PENDING: "⏳",
    ACCEPTED: "✅",
    DENIED: "❌",
    NEEDS_CHANGES: "❓",
    DRAFT: "📝",
    CANCELLED: "🚫",
    ARCHIVED: "📦",
    USER_LEFT: "👤",
  };

  const emoji = statusEmoji[application?.status] || "❓";
  const appNum = String(application?.applicationNumber || 0).padStart(4, "0");
  const serverStatus =
    application?.serverMemberStatus === "LEFT_SERVER"
      ? "⚠️ Left Server"
      : "✅ In Server";
  const reviewThreadStatus =
    application?.reviewThreadStatus === "OPEN" ? "🧵 Open" : "❌ None";
  const receiptStatus = "📎 Available";

  // Gather selected roles from answers
  const selectedRoles = [];
  if (answers) {
    for (const a of answers) {
      if (a.selectedRoleIds && a.selectedRoleIds.length) {
        for (const rid of a.selectedRoleIds) {
          selectedRoles.push(`<@&${rid}>`);
        }
      }
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(
      `🛡️ Application #${appNum} — ${appType?.publicTitle || "Application"}`,
    )
    .setColor(appType?.themeColor || "#5865F2")
    .setDescription(
      `**Applicant:** <@${application?.applicantId}>\n` +
        `**Applicant ID:** ${application?.applicantId}\n` +
        `**Application Type:** ${appType?.publicTitle || appType?.name}\n` +
        `**Status:** ${emoji} ${application?.status || "Unknown"}\n` +
        `**Submitted:** ${application?.submittedAt ? new Date(application.submittedAt).toLocaleString() : "N/A"}\n` +
        `**Server Status:** ${serverStatus}\n` +
        `**Review Thread:** ${reviewThreadStatus}\n` +
        `**Receipt:** ${receiptStatus}\n` +
        (application?.decidedById
          ? `**Decided By:** <@${application.decidedById}>\n**Decision:** ${application?.decisionReason || "N/A"}\n`
          : ""),
    )
    .setFooter({ text: `Application #${appNum} • ${guild?.name || ""}` })
    .setTimestamp();

  // Add answer summary (first few)
  if (answers && answers.length) {
    let answerText = "";
    for (const a of answers.slice(0, 6)) {
      const label = a.fieldLabelSnapshot || "Answer";
      let val = a.answerText || "";
      if (a.selectedOptionValues && a.selectedOptionValues.length) {
        val = a.selectedOptionValues.join(", ");
      }
      if (!val) val = "*(no answer)*";
      if (val.length > 150) val = val.slice(0, 147) + "...";
      answerText += `**${label}:** ${val}\n`;
    }
    if (answers.length > 6) {
      answerText += `\n*...and ${answers.length - 6} more answers (use View Full)*`;
    }
    embed.addFields({ name: "📝 Answers", value: answerText || "No answers" });
  }

  // Selected roles
  if (selectedRoles.length) {
    embed.addFields({
      name: "🎖️ Selected Roles To Apply On Approval",
      value: selectedRoles.join(" ") || "None",
    });
  }

  // Files
  const files = [];
  if (answers) {
    for (const a of answers) {
      if (a.fileRefs) {
        let refs;
        try {
          refs =
            typeof a.fileRefs === "string"
              ? JSON.parse(a.fileRefs)
              : a.fileRefs;
        } catch {
          continue;
        }
        if (Array.isArray(refs)) {
          for (const f of refs) {
            if (f?.url) files.push(`[${f.name || "file"}](${f.url})`);
          }
        }
      }
    }
  }
  if (files.length) {
    embed.addFields({ name: "📁 Files", value: files.join("\n") || "None" });
  }

  // Staff notes count
  if (notes && notes.length) {
    embed.addFields({
      name: "📝 Staff Notes",
      value: `${notes.length} note(s) — Latest: ${notes[notes.length - 1]?.noteText?.slice(0, 100) || ""}`,
    });
  }

  return embed;
}

/**
 * Build the full application view embed (ephemeral, for staff).
 */
function buildFullViewEmbed(
  application,
  appType,
  answers,
  notes,
  decisionLogs,
  guild,
) {
  const appNum = String(application?.applicationNumber || 0).padStart(4, "0");

  const embed = new EmbedBuilder()
    .setTitle(`📋 Full Application #${appNum}`)
    .setColor(appType?.themeColor || "#5865F2")
    .setDescription(
      `**Applicant:** <@${application?.applicantId}> (${application?.applicantDisplayNameSnapshot || "Unknown"})\n` +
        `**Type:** ${appType?.publicTitle || appType?.name}\n` +
        `**Status:** ${application?.status}\n` +
        `**Submitted:** ${application?.submittedAt ? new Date(application.submittedAt).toLocaleString() : "N/A"}\n`,
    )
    .setFooter({ text: `Application #${appNum}` })
    .setTimestamp();

  if (answers && answers.length) {
    for (const a of answers) {
      const label = a.fieldLabelSnapshot || "Answer";
      let val = a.answerText || "";
      if (a.selectedOptionValues && a.selectedOptionValues.length) {
        val = a.selectedOptionValues.join(", ");
      }
      if (!val) val = "*(no answer)*";
      if (val.length > 1024) val = val.slice(0, 1021) + "...";

      const fieldType = a.fieldType ? ` [${a.fieldType}]` : "";
      embed.addFields({ name: `${label}${fieldType}`, value, inline: false });
    }
  }

  if (notes && notes.length) {
    const notesText = notes
      .map(
        (n) =>
          `**<@${n.authorId}>** — ${new Date(n.createdAt).toLocaleString()}**\n${n.noteText}`,
      )
      .join("\n\n");
    if (notesText.length > 1024) {
      embed.addFields({
        name: "📝 Staff Notes (truncated)",
        value: notesText.slice(0, 1021) + "...",
      });
    } else {
      embed.addFields({ name: "📝 Staff Notes", value: notesText || "None" });
    }
  }

  if (decisionLogs && decisionLogs.length) {
    const logsText = decisionLogs
      .map(
        (l) =>
          `**${l.action}** by <@${l.actorId}> — ${new Date(l.createdAt).toLocaleString()}${l.reason ? `\nReason: ${l.reason}` : ""}`,
      )
      .join("\n\n");
    if (logsText.length > 1024) {
      embed.addFields({
        name: "📜 Decision History (truncated)",
        value: logsText.slice(0, 1021) + "...",
      });
    } else {
      embed.addFields({
        name: "📜 Decision History",
        value: logsText || "None",
      });
    }
  }

  return embed;
}

/**
 * Helper to format application number.
 */
function formatAppNumber(number) {
  return `#${String(number).padStart(4, "0")}`;
}

/**
 * Build a confirmation embed (used for approve/deny confirmation).
 */
function buildConfirmEmbed(title, description, color = "#5865F2") {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

module.exports = {
  buildDashboardEmbed,
  buildSimpleEmbed,
  buildPublicPanelEmbed,
  buildDmIntroEmbed,
  buildDmPageEmbed,
  buildPreviewEmbed,
  buildReviewCardEmbed,
  buildFullViewEmbed,
  buildConfirmEmbed,
  formatAppNumber,
};

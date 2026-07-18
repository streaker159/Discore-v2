"use strict";

const db = require("./onboardingDb");
const logger = require("../../lib/logger");
const { isOnboardingPremiumActive } = require("./onboardingPremium");
const { getMemberPermissions } = require("./onboardingPermissions");
const {
  buildPublicPanelEmbed,
  buildReviewCardEmbed,
} = require("./onboardingEmbeds");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");

/**
 * Get or create config for a guild.
 */
async function getConfig(guildId) {
  return db.getConfig(guildId);
}

async function ensureConfig(guildId) {
  return db.ensureConfig(guildId);
}

/**
 * Get dashboard stats for a guild.
 */
async function getDashboardStats(guildId) {
  try {
    const pending = await db.getApplicationsByStatus(guildId, "PENDING", 100);
    const latest = await db.getLatestApplications(guildId, 1);
    const lastAppNumber = latest?.[0]?.applicationNumber || 0;
    return {
      pendingCount: pending?.length || 0,
      lastAppNumber,
      totalCount: 0, // could add a count query
    };
  } catch (e) {
    logger.error("[Onboarding] getDashboardStats failed", { error: e.message });
    return { pendingCount: 0, lastAppNumber: 0, totalCount: 0 };
  }
}

/**
 * Publish or repair the public panel embed.
 */
async function publishPanel(guildId, client) {
  try {
    const config = await db.getConfig(guildId);
    if (!config?.panelChannelId)
      return { success: false, error: "Panel channel not configured." };

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return { success: false, error: "Guild not found." };

    const channel = guild.channels.cache.get(config.panelChannelId);
    if (!channel) return { success: false, error: "Panel channel not found." };

    // Check bot permissions
    const botMember = guild.members.me;
    if (!botMember?.permissions?.has(PermissionFlagsBits.SendMessages)) {
      return {
        success: false,
        error: "Bot lacks Send Messages permission in panel channel.",
      };
    }
    if (!botMember?.permissions?.has(PermissionFlagsBits.EmbedLinks)) {
      return {
        success: false,
        error: "Bot lacks Embed Links permission in panel channel.",
      };
    }

    const isLocked = !(await isOnboardingPremiumActive(guildId));
    const appTypes = await db.getApplicationTypes(guildId);
    const enabledTypes = appTypes.filter((t) => t.enabled);

    const embed = buildPublicPanelEmbed(config, guild, enabledTypes, isLocked);
    const components = buildPanelButtons(enabledTypes, isLocked);

    // Try to edit existing message, or send new one
    if (config.panelMessageId) {
      try {
        const msg = await channel.messages.fetch(config.panelMessageId);
        if (msg) {
          await msg.edit({ embeds: [embed], components });
          await db.updateConfig(guildId, { panelMessageId: msg.id });
          return { success: true, messageId: msg.id, action: "updated" };
        }
      } catch {
        // Message deleted, create new
      }
    }

    const newMsg = await channel.send({ embeds: [embed], components });
    await db.updateConfig(guildId, { panelMessageId: newMsg.id });
    return { success: true, messageId: newMsg.id, action: "published" };
  } catch (e) {
    logger.error("[Onboarding] publishPanel failed", {
      guildId,
      error: e.message,
    });
    return { success: false, error: e.message };
  }
}

/**
 * Build action rows for the public panel buttons.
 */
function buildPanelButtons(appTypes, isLocked = false) {
  const rows = [];
  const enabled = isLocked
    ? appTypes // show all but locked
    : appTypes.filter((t) => t.enabled);

  let currentRow = new ActionRowBuilder();
  let btnCount = 0;

  for (const appType of enabled) {
    const styleMap = {
      PRIMARY: ButtonStyle.Primary,
      SECONDARY: ButtonStyle.Secondary,
      SUCCESS: ButtonStyle.Success,
      DANGER: ButtonStyle.Danger,
    };

    const style = isLocked
      ? ButtonStyle.Secondary
      : styleMap[appType.buttonStyle] || ButtonStyle.Primary;

    const label = isLocked
      ? `🔒 ${appType.buttonLabel || appType.publicTitle}`
      : appType.buttonLabel || appType.publicTitle;

    const button = new ButtonBuilder()
      .setCustomId(`onboarding:apply:${appType.id}`)
      .setLabel(label.slice(0, 80))
      .setStyle(style)
      .setDisabled(isLocked);

    if (appType.buttonEmoji) {
      button.setEmoji(appType.buttonEmoji);
    }

    currentRow.addComponents(button);
    btnCount++;

    if (btnCount >= 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
      btnCount = 0;
    }
  }

  if (btnCount > 0) {
    rows.push(currentRow);
  }

  // If no types, add a placeholder
  if (rows.length === 0) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("onboarding:noop")
          .setLabel("No applications configured")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
      ),
    );
  }

  return rows;
}

/**
 * Submit an application to the review channel.
 */
async function submitApplication(applicationId, client) {
  try {
    const application = await db.getApplicationById(applicationId);
    if (!application)
      return { success: false, error: "Application not found." };

    const guildId = application.guildId;

    // Premium re-check: block new submissions from reaching review if
    // premium lapsed while the applicant was mid-flow.
    const premiumActive = await isOnboardingPremiumActive(guildId);
    if (!premiumActive) {
      await db.updateApplication(applicationId, { status: "CANCELLED" });
      return {
        success: false,
        error:
          "Premium has expired for this server. Applications can no longer be submitted.",
      };
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return { success: false, error: "Guild not found." };

    const config = await db.getConfig(guildId);
    const appType = application.applicationTypeId
      ? await db.getApplicationType(application.applicationTypeId)
      : null;

    // Determine review channel
    let reviewChannelId =
      appType?.reviewChannelId || config?.defaultReviewChannelId;

    if (!reviewChannelId && config?.fallbackToAppealsChannel) {
      // Try appeals channel from guild model as fallback
      try {
        const prisma = require("../../lib/prisma");
        const guildData = await prisma.$queryRawUnsafe(
          `SELECT "appealChannelId" FROM "Guild" WHERE "id" = $1`,
          guildId,
        );
        reviewChannelId = guildData?.[0]?.appealChannelId;
      } catch {}
    }

    if (!reviewChannelId) {
      return { success: false, error: "No review channel configured." };
    }

    const channel = guild.channels.cache.get(reviewChannelId);
    if (!channel) return { success: false, error: "Review channel not found." };

    // Get answers
    const answers = await db.getAnswers(applicationId);
    const notes = await db.getStaffNotes(applicationId);

    const embed = buildReviewCardEmbed(
      application,
      appType,
      answers,
      notes,
      guild,
    );
    const components = buildReviewCardButtons(application);

    // Check bot permissions
    const botMember = guild.members.me;
    if (!botMember?.permissions?.has(PermissionFlagsBits.SendMessages)) {
      return {
        success: false,
        error: "Bot lacks Send Messages in review channel.",
      };
    }

    const msg = await channel.send({ embeds: [embed], components });

    // Update application with review message info
    await db.updateApplication(applicationId, {
      reviewChannelId,
      reviewMessageId: msg.id,
      status: "PENDING",
      submittedAt: new Date(),
    });

    // Add decision log
    await db.addDecisionLog({
      applicationId,
      guildId,
      action: "SUBMITTED",
      actorId: application.applicantId,
      reason: "Application submitted by applicant",
    });

    return { success: true, messageId: msg.id };
  } catch (e) {
    logger.error("[Onboarding] submitApplication failed", {
      applicationId,
      error: e.message,
    });
    return { success: false, error: e.message };
  }
}

/**
 * Build review card action rows.
 */
function buildReviewCardButtons(application) {
  const rows = [];

  const isPending = application?.status === "PENDING";
  const isNeedsChanges = application?.status === "NEEDS_CHANGES";
  const isActive = isPending || isNeedsChanges;

  // Row 1: Approve / Deny
  if (isActive) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`onboarding:review:approve:${application.id}`)
          .setLabel("✅ Approve")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`onboarding:review:deny:${application.id}`)
          .setLabel("❌ Deny")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`onboarding:review:note:${application.id}`)
          .setLabel("📝 Add Note")
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  // Row 2: View / Request Changes / Thread
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`onboarding:review:view:${application.id}`)
      .setLabel("👁️ View Full")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`onboarding:review:download:${application.id}`)
      .setLabel("⬇️ Download TXT")
      .setStyle(ButtonStyle.Secondary),
  );

  if (isActive) {
    row2.addComponents(
      new ButtonBuilder()
        .setCustomId(`onboarding:review:changes:${application.id}`)
        .setLabel("❓ Request Changes")
        .setStyle(ButtonStyle.Secondary),
    );
  }

  rows.push(row2);

  // Row 3: Thread / Delete
  const row3 = new ActionRowBuilder();

  if (application?.reviewThreadStatus !== "OPEN") {
    row3.addComponents(
      new ButtonBuilder()
        .setCustomId(`onboarding:review:thread:${application.id}`)
        .setLabel("🧵 Open Review Thread")
        .setStyle(ButtonStyle.Secondary),
    );
  } else {
    row3.addComponents(
      new ButtonBuilder()
        .setCustomId(`onboarding:review:closethread:${application.id}`)
        .setLabel("🔒 Close Thread")
        .setStyle(ButtonStyle.Danger),
    );
  }

  row3.addComponents(
    new ButtonBuilder()
      .setCustomId(`onboarding:review:delete:${application.id}`)
      .setLabel("🗑️ Delete")
      .setStyle(ButtonStyle.Danger),
  );

  rows.push(row3);

  return rows;
}

/**
 * Refresh a review card message after status change.
 */
async function refreshReviewCard(applicationId, client) {
  try {
    const application = await db.getApplicationById(applicationId);
    if (!application?.reviewMessageId || !application?.reviewChannelId) return;

    const guild = client.guilds.cache.get(application.guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(application.reviewChannelId);
    if (!channel) return;

    const msg = await channel.messages
      .fetch(application.reviewMessageId)
      .catch(() => null);
    if (!msg) return;

    const appType = application.applicationTypeId
      ? await db.getApplicationType(application.applicationTypeId)
      : null;
    const answers = await db.getAnswers(applicationId);
    const notes = await db.getStaffNotes(applicationId);

    const embed = buildReviewCardEmbed(
      application,
      appType,
      answers,
      notes,
      guild,
    );
    const components = buildReviewCardButtons(application);

    await msg.edit({ embeds: [embed], components });
  } catch (e) {
    logger.error("[Onboarding] refreshReviewCard failed", {
      applicationId,
      error: e.message,
    });
  }
}

/**
 * Approve an application.
 */
async function approveApplication(applicationId, staffId, reason, client) {
  try {
    const application = await db.getApplicationById(applicationId);
    if (!application)
      return { success: false, error: "Application not found." };

    const guildId = application.guildId;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return { success: false, error: "Guild not found." };

    const appType = application.applicationTypeId
      ? await db.getApplicationType(application.applicationTypeId)
      : null;

    // Update status
    await db.updateApplication(applicationId, {
      status: "ACCEPTED",
      decidedAt: new Date(),
      decidedById: staffId,
      decisionReason: reason || null,
    });

    // Add decision log
    await db.addDecisionLog({
      applicationId,
      guildId,
      action: "APPROVED",
      actorId: staffId,
      reason: reason || null,
    });

    // Apply roles
    const rolesApplied = [];
    const rolesFailed = [];

    if (appType) {
      const member = await guild.members
        .fetch(application.applicantId)
        .catch(() => null);

      if (member) {
        // Give accept roles
        if (appType.acceptRoleIds?.length) {
          for (const roleId of appType.acceptRoleIds) {
            try {
              const role = guild.roles.cache.get(roleId);
              if (
                role &&
                role.position < guild.members.me.roles.highest.position
              ) {
                await member.roles.add(roleId, "Application approved");
                rolesApplied.push(roleId);
              } else {
                rolesFailed.push(roleId);
              }
            } catch {
              rolesFailed.push(roleId);
            }
          }
        }

        // Remove roles
        if (appType.removeRoleIds?.length) {
          for (const roleId of appType.removeRoleIds) {
            try {
              const role = guild.roles.cache.get(roleId);
              if (
                role &&
                role.position < guild.members.me.roles.highest.position
              ) {
                await member.roles.remove(roleId, "Application approved");
              }
            } catch {}
          }
        }

        // Remove pending role
        if (appType.pendingRoleId) {
          try {
            await member.roles.remove(
              appType.pendingRoleId,
              "Application approved",
            );
          } catch {}
        }
      }

      // Apply linked roles from answers
      const answers = await db.getAnswers(applicationId);
      if (answers && member) {
        for (const a of answers) {
          if (a.selectedRoleIds?.length) {
            for (const roleId of a.selectedRoleIds) {
              try {
                const role = guild.roles.cache.get(roleId);
                if (
                  role &&
                  role.position < guild.members.me.roles.highest.position
                ) {
                  await member.roles.add(
                    roleId,
                    "Application approved — selected option role",
                  );
                  rolesApplied.push(roleId);
                }
              } catch {}
            }
          }
        }
      }
    }

    // DM applicant
    if (appType?.sendDmOnDecision !== false) {
      try {
        const user = await client.users.fetch(application.applicantId);
        if (user) {
          await user
            .send({
              embeds: [
                {
                  title: "✅ Application Approved",
                  description:
                    `Your **${appType?.publicTitle || "application"}** has been approved!\n\n` +
                    (reason ? `**Note:** ${reason}` : "Welcome aboard!"),
                  color: 0x57f287,
                  footer: { text: guild.name },
                  timestamp: new Date().toISOString(),
                },
              ],
            })
            .catch(() => {});
        }
      } catch {}
    }

    // Refresh review card
    await refreshReviewCard(applicationId, client);

    return {
      success: true,
      rolesApplied,
      rolesFailed,
    };
  } catch (e) {
    logger.error("[Onboarding] approveApplication failed", {
      applicationId,
      error: e.message,
    });
    return { success: false, error: e.message };
  }
}

/**
 * Deny an application.
 */
async function denyApplication(applicationId, staffId, reason, client) {
  try {
    const application = await db.getApplicationById(applicationId);
    if (!application)
      return { success: false, error: "Application not found." };

    const guildId = application.guildId;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return { success: false, error: "Guild not found." };

    const appType = application.applicationTypeId
      ? await db.getApplicationType(application.applicationTypeId)
      : null;

    // Update status
    await db.updateApplication(applicationId, {
      status: "DENIED",
      decidedAt: new Date(),
      decidedById: staffId,
      decisionReason: reason || null,
    });

    // Add decision log
    await db.addDecisionLog({
      applicationId,
      guildId,
      action: "DENIED",
      actorId: staffId,
      reason: reason || null,
    });

    // Handle denied actions
    if (appType) {
      const member = await guild.members
        .fetch(application.applicantId)
        .catch(() => null);

      if (member) {
        // Remove pending role
        if (appType.pendingRoleId) {
          try {
            await member.roles.remove(
              appType.pendingRoleId,
              "Application denied",
            );
          } catch {}
        }

        // Give denied role
        if (appType.denyRoleId) {
          try {
            const role = guild.roles.cache.get(appType.denyRoleId);
            if (
              role &&
              role.position < guild.members.me.roles.highest.position
            ) {
              await member.roles.add(appType.denyRoleId, "Application denied");
            }
          } catch {}
        }

        // Kick
        if (appType.kickOnDeny) {
          try {
            await member.kick(reason || "Application denied").catch(() => {});
          } catch {}
        }

        // Ban
        if (appType.banOnDeny) {
          try {
            await member
              .ban({ reason: reason || "Application denied" })
              .catch(() => {});
          } catch {}
        }
      }
    }

    // DM applicant
    if (appType?.sendDmOnDecision !== false) {
      try {
        const user = await client.users.fetch(application.applicantId);
        if (user) {
          await user
            .send({
              embeds: [
                {
                  title: "❌ Application Denied",
                  description:
                    `Your **${appType?.publicTitle || "application"}** has been denied.\n\n` +
                    (reason
                      ? `**Reason:** ${reason}`
                      : "Please contact staff for more information."),
                  color: 0xed4245,
                  footer: { text: guild.name },
                  timestamp: new Date().toISOString(),
                },
              ],
            })
            .catch(() => {});
        }
      } catch {}
    }

    // Refresh review card
    await refreshReviewCard(applicationId, client);

    return { success: true };
  } catch (e) {
    logger.error("[Onboarding] denyApplication failed", {
      applicationId,
      error: e.message,
    });
    return { success: false, error: e.message };
  }
}

/**
 * Apply pending role on submission.
 */
async function applyPendingRole(guildId, userId, pendingRoleId, client) {
  try {
    if (!pendingRoleId || !client) return;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    const role = guild.roles.cache.get(pendingRoleId);
    if (
      role &&
      guild.members.me &&
      role.position < guild.members.me.roles.highest.position
    ) {
      await member.roles
        .add(pendingRoleId, "Application submitted")
        .catch(() => {});
    }
  } catch (e) {
    logger.error("[Onboarding] applyPendingRole failed", {
      guildId,
      error: e.message,
    });
  }
}

module.exports = {
  getConfig,
  ensureConfig,
  getDashboardStats,
  publishPanel,
  buildPanelButtons,
  buildReviewCardButtons,
  submitApplication,
  refreshReviewCard,
  approveApplication,
  denyApplication,
  applyPendingRole,
};

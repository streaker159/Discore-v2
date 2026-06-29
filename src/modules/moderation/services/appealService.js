"use strict";

const {
  PermissionFlagsBits,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require("discord.js");

const prisma = require("../../../lib/prisma");
const appealRepo = require("../repositories/appealRepository");
const caseService = require("./moderationCaseService");
const {
  createAppealControlEmbed,
  createAppealTicketEmbed,
  createAppealDecisionEmbed,
  createAppealOutcomeEmbed,
} = require("../embeds/appealEmbed");
const { formatDuration } = require("../utils/durationParser");

const CLOSED_STATUSES = ["ACCEPTED", "REJECTED", "REDUCED", "CLOSED"];

function isClosedStatus(status) {
  return CLOSED_STATUSES.includes(status);
}

function appendNote(existing, label, note, adminId = null) {
  const cleanNote = String(note || "").trim();
  const when = new Date().toISOString();
  const by = adminId ? ` by ${adminId}` : "";
  const line = `[${when}] ${label}${by}: ${cleanNote || "No note provided"}`;

  return existing ? `${existing}\n${line}` : line;
}

async function getDbGuild(guildId) {
  return prisma.guild
    .findUnique({
      where: { id: guildId },
    })
    .catch(() => null);
}

async function fetchChannel(guild, channelId) {
  if (!guild || !channelId) return null;
  return guild.channels.fetch(channelId).catch(() => null);
}

async function getConfiguredAppealCategory(guild, dbGuild) {
  const category = await fetchChannel(guild, dbGuild?.appealCategoryId);
  return category?.type === ChannelType.GuildCategory ? category : null;
}

async function getConfiguredAppealChannel(guild, dbGuild) {
  const channel = await fetchChannel(guild, dbGuild?.appealChannelId);
  return channel?.isTextBased?.() ? channel : null;
}

function getAppealPingRoleId(dbGuild) {
  return dbGuild?.discoreAppealRoleId || dbGuild?.discoreManagerRoleId || null;
}

function createAppealAdminButtons(appealId, disabled = false) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`appeal_accept:${appealId}`)
      .setLabel("Accept Appeal")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId(`appeal_reject:${appealId}`)
      .setLabel("Reject Appeal")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId(`appeal_reduce:${appealId}`)
      .setLabel("Reduce")
      .setEmoji("🔁")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`appeal_bring_member:${appealId}`)
      .setLabel("Bring Member")
      .setEmoji("🎟️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId(`appeal_add_note:${appealId}`)
      .setLabel("Add Note")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId(`appeal_close:${appealId}`)
      .setLabel("Close")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );

  return [row1, row2];
}

async function findAppealControlMessage(guild, appeal) {
  const dbGuild = await getDbGuild(guild.id);
  const controlChannel = await getConfiguredAppealChannel(guild, dbGuild);
  if (!controlChannel) return null;

  const messages = await controlChannel.messages
    .fetch({ limit: 50 })
    .catch(() => null);
  if (!messages) return null;

  return (
    messages.find((message) => {
      if (message.author.id !== guild.client.user.id) return false;

      const content = message.content || "";
      const embed = message.embeds?.[0];
      const title = embed?.title || "";
      const footer = embed?.footer?.text || "";

      return (
        content.includes(appeal.publicId) ||
        title.includes(appeal.publicId) ||
        footer.includes(appeal.publicId)
      );
    }) || null
  );
}

async function updateAppealControlMessage(
  guild,
  appeal,
  removeButtons = false,
) {
  if (!guild || !appeal?.case) return null;

  const message = await findAppealControlMessage(guild, appeal);
  if (!message) return null;

  const ticketChannel = appeal.channelId
    ? await guild.channels.fetch(appeal.channelId).catch(() => null)
    : null;

  const embed = await createAppealControlEmbed(
    appeal,
    appeal.case,
    guild,
    ticketChannel,
  );

  await message.edit({
    embeds: [embed],
    components:
      removeButtons || isClosedStatus(appeal.status)
        ? []
        : createAppealAdminButtons(appeal.publicId),
  });

  return message;
}

async function createAppealTicketChannel(
  guild,
  dbGuild,
  appeal,
  moderationCase,
) {
  const category = await getConfiguredAppealCategory(guild, dbGuild);

  const permissionOverwrites = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: guild.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  const managerRoleId = dbGuild?.discoreManagerRoleId;
  const appealRoleId = dbGuild?.discoreAppealRoleId;

  for (const roleId of [managerRoleId, appealRoleId].filter(Boolean)) {
    if (!permissionOverwrites.some((overwrite) => overwrite.id === roleId)) {
      permissionOverwrites.push({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      });
    }
  }

  const safeAppealId = String(appeal.publicId || "appeal")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");

  const createPayload = {
    name: `appeal-${safeAppealId}`,
    type: ChannelType.GuildText,
    permissionOverwrites,
    reason: `Discore appeal ticket ${appeal.publicId}`,
  };

  if (category?.id) {
    createPayload.parent = category.id;
  }

  const channel = await guild.channels.create(createPayload);

  const ticketEmbed = await createAppealTicketEmbed(
    appeal,
    moderationCase,
    guild,
  );

  await channel.send({
    embeds: [ticketEmbed],
  });

  return channel;
}

async function postAppealControlMessage(
  guild,
  dbGuild,
  appeal,
  moderationCase,
  ticketChannel,
) {
  const controlChannel = await getConfiguredAppealChannel(guild, dbGuild);
  if (!controlChannel) return null;

  const pingRoleId = getAppealPingRoleId(dbGuild);
  const controlEmbed = await createAppealControlEmbed(
    appeal,
    moderationCase,
    guild,
    ticketChannel,
  );

  return controlChannel.send({
    content: `${pingRoleId ? `<@&${pingRoleId}>\n` : ""}🧾 New appeal opened: **${appeal.publicId}**\nTicket: <#${ticketChannel.id}>`,
    embeds: [controlEmbed],
    components: createAppealAdminButtons(appeal.publicId),
    allowedMentions: {
      roles: pingRoleId ? [pingRoleId] : [],
    },
  });
}

/**
 * Create an appeal from a moderation case public ID.
 */
async function createAppeal(casePublicId, userId, appealText, guild) {
  if (!guild) {
    throw new Error("Guild is required to create appeal channel");
  }

  const moderationCase = await caseService.getCaseByPublicId(casePublicId);

  if (!moderationCase) {
    throw new Error("Case not found");
  }

  if (moderationCase.userId !== userId) {
    throw new Error("You can only appeal your own moderation case");
  }

  if (moderationCase.status === "REVOKED") {
    throw new Error("This case has already been revoked");
  }

  const hasOpen = await appealRepo.hasOpenAppeal(moderationCase.id);
  if (hasOpen) {
    throw new Error("This case already has an open appeal");
  }

  const dbGuild = await getDbGuild(guild.id);
  const controlChannel = await getConfiguredAppealChannel(guild, dbGuild);

  if (!controlChannel) {
    throw new Error(
      "Appeals channel is not configured. Run /server channels appeals:#channel.",
    );
  }

  const appeal = await appealRepo.createAppeal({
    caseId: moderationCase.id,
    guildId: moderationCase.guildId,
    userId,
    appealText,
    status: "OPEN",
  });

  await caseService.updateCaseAppealStatus(moderationCase.id, "OPEN");

  try {
    const ticketChannel = await createAppealTicketChannel(
      guild,
      dbGuild,
      appeal,
      moderationCase,
    );

    await appealRepo.updateAppealStatus(appeal.id, "OPEN", {
      channelId: ticketChannel.id,
    });

    const fullAppeal = await appealRepo.getAppealByPublicId(appeal.publicId);

    await postAppealControlMessage(
      guild,
      dbGuild,
      fullAppeal || appeal,
      moderationCase,
      ticketChannel,
    );

    return (
      fullAppeal || {
        ...appeal,
        channelId: ticketChannel.id,
        case: moderationCase,
      }
    );
  } catch (error) {
    console.error(
      "[Appeal] Could not create appeal ticket/control message:",
      error,
    );

    await appealRepo
      .updateAppealStatus(appeal.id, "CLOSED", {
        outcome: "Appeal channel could not be created.",
        closedAt: new Date(),
      })
      .catch(() => {});

    await caseService
      .updateCaseAppealStatus(moderationCase.id, "NONE")
      .catch(() => {});

    throw new Error(
      "Failed to create appeal channel. Please check that Discore has Manage Channels, Send Messages, Embed Links, Read Message History, and View Channel permissions.",
    );
  }
}

function assertAppealCanBeDecided(appeal) {
  if (!appeal) throw new Error("Appeal not found");

  if (isClosedStatus(appeal.status)) {
    throw new Error(`Appeal ${appeal.publicId} is already ${appeal.status}.`);
  }
}

async function updateCaseStaffNote(caseId, label, note, adminId) {
  const moderationCase = await prisma.moderationCase.findUnique({
    where: { id: caseId },
  });

  if (!moderationCase) return null;

  return prisma.moderationCase.update({
    where: { id: caseId },
    data: {
      staffNote: appendNote(moderationCase.staffNote, label, note, adminId),
    },
  });
}

async function dmAppealOutcome(guild, appeal, note) {
  try {
    const user = await guild.client.users.fetch(appeal.userId);
    const embed = createAppealOutcomeEmbed(appeal, note, guild.name);
    await user.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.log("[Appeal] Could not DM appeal outcome:", error.message);
    return false;
  }
}

async function postDecisionToTicketAndDelete(
  guild,
  appeal,
  decision,
  note,
  adminId,
) {
  if (!appeal.channelId) return false;

  const channel = await guild.channels
    .fetch(appeal.channelId)
    .catch(() => null);
  if (!channel || !channel.isTextBased()) return false;

  const embed = createAppealDecisionEmbed(
    appeal,
    decision,
    note,
    guild.name,
    adminId,
  );

  await channel.send({
    content:
      `📌 **Appeal decision recorded.**\n` +
      `This ticket will be deleted in **5 seconds**.`,
    embeds: [embed],
  });

  setTimeout(() => {
    channel
      .delete(`Appeal ${appeal.publicId} ${decision} — cleanup`)
      .catch((error) =>
        console.error(
          "[Appeal] Could not delete appeal ticket:",
          error.message,
        ),
      );
  }, 5000);

  return true;
}

async function acceptAppeal(appealId, adminId, guild, decisionNote = null) {
  const appeal = await appealRepo.getAppealByPublicId(appealId);
  assertAppealCanBeDecided(appeal);

  const note =
    decisionNote ||
    "Appeal accepted. The moderation case was revoked and removed from the public record.";

  // 1. Update appeal record
  await appealRepo.updateAppealStatus(appeal.id, "ACCEPTED", {
    closedAt: new Date(),
    closedBy: adminId,
    outcome: note,
  });

  // 2. Update case staff note and appeal status
  await updateCaseStaffNote(appeal.caseId, "Appeal accepted", note, adminId);
  await caseService.updateCaseAppealStatus(appeal.caseId, "ACCEPTED");

  // 3. Save transcript of the ticket channel
  await saveAppealTranscript(guild, appeal, "ACCEPTED", note, adminId);

  // 4. Do ALL UI/post-decision work BEFORE revokeCase (which wipes DB records)
  await updateAppealControlMessage(guild, appeal, true);
  await dmAppealOutcome(guild, appeal, note);
  await postDecisionToTicketAndDelete(guild, appeal, "ACCEPTED", note, adminId);

  // 5. Revoke case LAST — after all UI work is done.
  //    If this fails, the staff already got confirmation and ticket is deleted.
  try {
    await caseService.revokeCase(appeal.case.publicId, adminId, guild);
  } catch (err) {
    console.error(
      "[Appeal Accept] revokeCase failed (non-fatal):",
      err.message,
    );
  }

  return appeal;
}

// ── Transcript saving ──────────────────────────────────────────────────────

async function saveAppealTranscript(guild, appeal, outcome, note, adminId) {
  if (!appeal.channelId) return;
  try {
    const channel = await guild.channels
      .fetch(appeal.channelId)
      .catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    // Fetch all messages (up to 500)
    const allMessages = [];
    let lastId;
    for (let i = 0; i < 5; i++) {
      const batch = await channel.messages
        .fetch({ limit: 100, before: lastId })
        .catch(() => new Map());
      if (!batch.size) break;
      for (const [, msg] of batch) {
        allMessages.push({
          authorId: msg.author.id,
          authorName:
            msg.author.displayName || msg.author.username || "Unknown",
          content: msg.content || "",
          embeds: msg.embeds.length
            ? msg.embeds.map((e) => ({
                title: e.title,
                description: e.description?.slice(0, 200),
              }))
            : undefined,
          attachments: msg.attachments.size
            ? [...msg.attachments.values()].map((a) => a.url)
            : undefined,
          createdAt: msg.createdAt.toISOString(),
        });
      }
      lastId = batch.last()?.id;
    }
    allMessages.reverse(); // chronological order

    const transcriptJson = JSON.stringify(allMessages);
    const transcriptText = allMessages
      .map(
        (m) => `[${m.createdAt}] ${m.authorName} (${m.authorId}): ${m.content}`,
      )
      .join("\n");

    await prisma.moderationCaseTranscript.create({
      data: {
        guildId: guild.id,
        caseId: appeal.caseId,
        appealId: appeal.publicId,
        caseNumber: appeal.case?.publicId || null,
        appealNumber: appeal.publicId,
        ticketChannelId: appeal.channelId,
        ticketChannelName: channel.name,
        userId: appeal.userId,
        handledById: adminId || null,
        outcome,
        openedAt: appeal.createdAt || new Date(),
        closedAt: new Date(),
        messageCount: allMessages.length,
        transcriptJson,
        transcriptText,
      },
    });
  } catch (err) {
    console.error("[Appeal] Failed to save transcript:", err.message);
    // Don't block the appeal flow — transcript is best-effort
  }
}

async function rejectAppeal(appealId, adminId, reason = null, guild = null) {
  const appeal = await appealRepo.getAppealByPublicId(appealId);
  assertAppealCanBeDecided(appeal);

  const note = reason || "Appeal rejected. The moderation case was upheld.";

  await appealRepo.updateAppealStatus(appeal.id, "REJECTED", {
    closedAt: new Date(),
    closedBy: adminId,
    outcome: note,
  });

  await require("../repositories/moderationCaseRepository").updateCaseStatus(
    appeal.caseId,
    "UPHELD",
  );

  await updateCaseStaffNote(appeal.caseId, "Appeal rejected", note, adminId);
  await caseService.updateCaseAppealStatus(appeal.caseId, "REJECTED");

  // Save transcript before deleting ticket
  if (guild)
    await saveAppealTranscript(guild, appeal, "REJECTED", note, adminId);

  const updated = await appealRepo.getAppealByPublicId(appealId);

  if (guild) {
    await updateAppealControlMessage(guild, updated, true);
    await dmAppealOutcome(guild, updated, note);
    await postDecisionToTicketAndDelete(
      guild,
      updated,
      "REJECTED",
      note,
      adminId,
    );
  }

  return updated;
}

async function reducePunishment(
  appealId,
  adminId,
  newDurationSeconds,
  guild,
  reason = null,
) {
  const appeal = await appealRepo.getAppealByPublicId(appealId);
  assertAppealCanBeDecided(appeal);

  const moderationCase = appeal.case;
  const newExpiresAt = new Date(Date.now() + newDurationSeconds * 1000);
  const durationText = formatDuration(newDurationSeconds);
  const note =
    reason ||
    `Appeal partially accepted. Punishment reduced to ${durationText}.`;

  await require("../repositories/moderationCaseRepository").updateCaseStatus(
    moderationCase.id,
    "ACTIVE",
    {
      durationSeconds: newDurationSeconds,
      expiresAt: newExpiresAt,
    },
  );

  await appealRepo.updateAppealStatus(appeal.id, "REDUCED", {
    closedAt: new Date(),
    closedBy: adminId,
    outcome: `Punishment reduced to ${durationText}.\n\n${note}`,
  });

  await updateCaseStaffNote(
    moderationCase.id,
    "Appeal reduced",
    `Punishment reduced to ${durationText}. ${note}`,
    adminId,
  );

  await caseService.updateCaseAppealStatus(moderationCase.id, "REDUCED");

  // Save transcript before deleting ticket
  if (guild)
    await saveAppealTranscript(
      guild,
      appeal,
      "punishment_reduced",
      note,
      adminId,
    );

  if (guild && moderationCase.actionType === "TIMEOUT") {
    try {
      const member = await guild.members.fetch(moderationCase.userId);
      await member.timeout(
        newDurationSeconds * 1000,
        "Punishment reduced via appeal",
      );
    } catch (error) {
      console.error(
        "[Appeal Reduce] Could not apply reduced timeout:",
        error.message,
      );
    }
  }

  const updated = await appealRepo.getAppealByPublicId(appealId);

  if (guild) {
    await updateAppealControlMessage(guild, updated, true);
    await dmAppealOutcome(
      guild,
      updated,
      `Punishment reduced to ${durationText}.\n\n${note}`,
    );
    await postDecisionToTicketAndDelete(
      guild,
      updated,
      "REDUCED",
      note,
      adminId,
    );
  }

  return updated;
}

async function closeAppeal(appealId, adminId, guild = null, note = null) {
  const appeal = await appealRepo.getAppealByPublicId(appealId);
  assertAppealCanBeDecided(appeal);

  const outcome = note || "Appeal closed by staff without changing the case.";

  await appealRepo.updateAppealStatus(appeal.id, "CLOSED", {
    closedAt: new Date(),
    closedBy: adminId,
    outcome,
  });

  await updateCaseStaffNote(appeal.caseId, "Appeal closed", outcome, adminId);
  await caseService.updateCaseAppealStatus(appeal.caseId, "CLOSED");

  // Save transcript before deleting ticket
  if (guild)
    await saveAppealTranscript(guild, appeal, "closed", outcome, adminId);

  const updated = await appealRepo.getAppealByPublicId(appealId);

  if (guild) {
    await updateAppealControlMessage(guild, updated, true);
    await postDecisionToTicketAndDelete(
      guild,
      updated,
      "CLOSED",
      outcome,
      adminId,
    );
  }

  return updated;
}

async function addStaffNote(appealId, note, adminId = null) {
  const appeal = await appealRepo.getAppealByPublicId(appealId);

  if (!appeal) {
    throw new Error("Appeal not found");
  }

  const saved = await appealRepo.addStaffNote(appeal.id, note);

  if (appeal.caseId) {
    await updateCaseStaffNote(appeal.caseId, "Staff note", note, adminId);
  }

  return saved;
}

async function bringMemberToTicket(appealId, guild, actorId = null) {
  const appeal = await appealRepo.getAppealByPublicId(appealId);
  if (!appeal) throw new Error("Appeal not found");

  if (!appeal.channelId) {
    throw new Error("This appeal does not have a ticket channel.");
  }

  const channel = await guild.channels
    .fetch(appeal.channelId)
    .catch(() => null);
  if (!channel || !channel.isTextBased()) {
    throw new Error("Appeal ticket channel could not be found.");
  }

  let isBanned = false;
  try {
    await guild.bans.fetch(appeal.userId);
    isBanned = true;
  } catch {
    isBanned = false;
  }

  if (isBanned) {
    throw new Error(
      "User is currently banned and cannot see server channels. Temporarily unban them first if staff want them in the ticket.",
    );
  }

  await channel.permissionOverwrites.edit(appeal.userId, {
    [PermissionFlagsBits.ViewChannel]: true,
    [PermissionFlagsBits.SendMessages]: true,
    [PermissionFlagsBits.ReadMessageHistory]: true,
  });

  await channel.send({
    content: `<@${appeal.userId}>, you have been added to this appeal ticket. You can now discuss your appeal with staff directly.`,
  });

  try {
    const user = await guild.client.users.fetch(appeal.userId);
    await user.send(
      `You have been added to your appeal ticket in **${guild.name}**: <#${channel.id}>`,
    );
  } catch {
    // DM failures are fine.
  }

  return { appeal, channel };
}

async function getAppealByPublicId(publicId) {
  return appealRepo.getAppealByPublicId(publicId);
}

module.exports = {
  createAppeal,
  acceptAppeal,
  rejectAppeal,
  reducePunishment,
  closeAppeal,
  addStaffNote,
  bringMemberToTicket,
  getAppealByPublicId,
  createAppealAdminButtons,
  updateAppealControlMessage,
};

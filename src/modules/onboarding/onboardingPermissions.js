"use strict";

const { PermissionFlagsBits } = require("discord.js");
const prisma = require("../../lib/prisma");

/**
 * Check if a member is the server owner.
 */
function isServerOwner(interaction) {
  return interaction.member?.id === interaction.guild?.ownerId;
}

/**
 * Check if a member has Administrator permission.
 */
function isAdministrator(interaction) {
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
    false
  );
}

/**
 * Check if a member has ManageGuild permission.
 */
function hasManageGuild(interaction) {
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false
  );
}

/**
 * Check if the user is the bot owner (uses env).
 */
function isBotOwner(interaction) {
  const ownerIds = (process.env.BOT_OWNER_IDS || process.env.OWNER_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ownerIds.includes(interaction.user.id);
}

/**
 * Get configured onboarding permission roles for a guild.
 */
async function getPermissionRoles(guildId) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "OnboardingPermissionRole" WHERE "guildId" = $1`,
      guildId,
    );
    return rows || [];
  } catch {
    return [];
  }
}

/**
 * Get the effective permission flags for a member by combining all their roles.
 * Returns object with boolean permissions.
 */
async function getMemberPermissions(guildId, member) {
  // Server owner and bot owner always get full access
  if (member?.id === member?.guild?.ownerId) {
    return {
      canManage: true,
      canBuildForms: true,
      canReview: true,
      canApproveDeny: true,
      canOpenThreads: true,
      canDownload: true,
      canDelete: true,
      isFullAccess: true,
    };
  }

  // Administrator permission
  if (member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    return {
      canManage: true,
      canBuildForms: true,
      canReview: true,
      canApproveDeny: true,
      canOpenThreads: true,
      canDownload: true,
      canDelete: true,
      isFullAccess: true,
    };
  }

  // Bot owner
  const ownerIds = (process.env.BOT_OWNER_IDS || process.env.OWNER_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ownerIds.includes(member?.id)) {
    return {
      canManage: true,
      canBuildForms: true,
      canReview: true,
      canApproveDeny: true,
      canOpenThreads: true,
      canDownload: true,
      canDelete: true,
      isFullAccess: true,
    };
  }

  // Check configured role permissions
  const perms = {
    canManage: false,
    canBuildForms: false,
    canReview: false,
    canApproveDeny: false,
    canOpenThreads: false,
    canDownload: false,
    canDelete: false,
    isFullAccess: false,
  };

  // ManageGuild gives manage access
  if (member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
    perms.canManage = true;
    perms.canBuildForms = true;
  }

  // Check role-based permissions
  try {
    const rolePerms = await getPermissionRoles(guildId);
    const memberRoleIds = member?.roles?.cache?.map((r) => r.id) || [];

    for (const rp of rolePerms) {
      if (memberRoleIds.includes(rp.roleId)) {
        if (rp.canManage) perms.canManage = true;
        if (rp.canBuildForms) perms.canBuildForms = true;
        if (rp.canReview) perms.canReview = true;
        if (rp.canApproveDeny) perms.canApproveDeny = true;
        if (rp.canOpenThreads) perms.canOpenThreads = true;
        if (rp.canDownload) perms.canDownload = true;
        if (rp.canDelete) perms.canDelete = true;
      }
    }
  } catch {
    // fall through
  }

  // If canManage, also grant review/approve access
  if (perms.canManage) {
    perms.canReview = true;
    perms.canApproveDeny = true;
    perms.canOpenThreads = true;
    perms.canDownload = true;
  }

  return perms;
}

/**
 * Check if a member has at least basic dashboard access.
 * Anyone with any permission level can view the dashboard.
 */
async function canAccessDashboard(guildId, member) {
  if (isServerOwner({ member, guild: member?.guild })) return true;
  if (isAdministrator({ member, memberPermissions: member?.permissions }))
    return true;
  if (hasManageGuild({ memberPermissions: member?.permissions })) return true;
  if (isBotOwner({ user: member?.user })) return true;

  const perms = await getMemberPermissions(guildId, member);
  return (
    perms.canManage ||
    perms.canBuildForms ||
    perms.canReview ||
    perms.canApproveDeny ||
    perms.canOpenThreads ||
    perms.canDownload ||
    perms.canDelete
  );
}

/**
 * Require a specific permission and reply with error if missing.
 */
async function requirePermission(interaction, permissionKey) {
  const guildId = interaction.guildId;
  if (!guildId) return false;

  const member = interaction.member;
  const perms = await getMemberPermissions(guildId, member);

  if (perms[permissionKey]) return true;

  const messages = {
    canManage: "You need onboarding management permission to do this.",
    canBuildForms: "You need form builder permission to do this.",
    canReview: "You need application review permission to do this.",
    canApproveDeny: "You need approval permission to do this.",
    canOpenThreads: "You need thread management permission to do this.",
    canDownload: "You need download permission to do this.",
    canDelete: "You need delete permission to do this.",
  };

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction
        .followUp({
          content: `🔒 ${messages[permissionKey] || "You don't have permission to do this."}`,
          flags: 64,
        })
        .catch(() => {});
    } else {
      await interaction
        .reply({
          content: `🔒 ${messages[permissionKey] || "You don't have permission to do this."}`,
          flags: 64,
        })
        .catch(() => {});
    }
  } catch {}

  return false;
}

/**
 * Check if a member can view/access a specific application.
 * Reviewers can see all. Applicants can see their own.
 */
async function canViewApplication(guildId, member, application) {
  if (!application) return false;
  // Staff check
  const perms = await getMemberPermissions(guildId, member);
  if (perms.canReview || perms.canManage || perms.canApproveDeny) return true;
  // Applicant check
  if (application.applicantId === member?.id) return true;
  return false;
}

module.exports = {
  isServerOwner,
  isAdministrator,
  hasManageGuild,
  isBotOwner,
  getPermissionRoles,
  getMemberPermissions,
  canAccessDashboard,
  requirePermission,
  canViewApplication,
};

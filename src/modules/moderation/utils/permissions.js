"use strict";

const { PermissionFlagsBits } = require("discord.js");

/**
 * Check if moderator can moderate target user
 * @param {GuildMember} moderator
 * @param {GuildMember} target
 * @param {Guild} guild
 * @returns {{canModerate: boolean, reason: string|null}}
 */
function canModerate(moderator, target, guild) {
  // Cannot moderate server owner
  if (target.id === guild.ownerId) {
    return { canModerate: false, reason: "Cannot moderate the server owner" };
  }

  // Cannot moderate yourself
  if (moderator.id === target.id) {
    return { canModerate: false, reason: "Cannot moderate yourself" };
  }

  // Cannot moderate if target has higher role
  if (target.roles.highest.position >= moderator.roles.highest.position) {
    return {
      canModerate: false,
      reason: "Target has equal or higher role than you",
    };
  }

  // Cannot moderate if target has higher role than bot
  const botMember = guild.members.me;
  if (target.roles.highest.position >= botMember.roles.highest.position) {
    return {
      canModerate: false,
      reason: "Target has equal or higher role than bot",
    };
  }

  return { canModerate: true, reason: null };
}

/**
 * Check if user has moderation permissions
 * @param {GuildMember} member
 * @param {Guild} dbGuild - Database guild record
 * @returns {boolean}
 */
function hasModPermissions(member, dbGuild) {
  // Server owner always has permission
  if (member.id === member.guild.ownerId) return true;

  // Check for required permissions
  if (member.permissions.has(PermissionFlagsBits.ModerateMembers)) return true;

  // Check for Discore Manager role
  if (
    dbGuild?.discoreManagerRoleId &&
    member.roles.cache.has(dbGuild.discoreManagerRoleId)
  ) {
    return true;
  }

  return false;
}

/**
 * Check if user can view moderation cases
 * @param {GuildMember} member
 * @param {Guild} dbGuild
 * @returns {boolean}
 */
function canViewModCases(member, dbGuild) {
  // Same as mod permissions
  return hasModPermissions(member, dbGuild);
}

/**
 * Check if user can handle appeals
 * @param {GuildMember} member
 * @param {Guild} dbGuild
 * @returns {boolean}
 */
function canHandleAppeals(member, dbGuild) {
  // Server owner
  if (member.id === member.guild.ownerId) return true;

  // Administrator permission
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  // Discore Manager role
  if (
    dbGuild?.discoreManagerRoleId &&
    member.roles.cache.has(dbGuild.discoreManagerRoleId)
  ) {
    return true;
  }

  return false;
}

module.exports = {
  canModerate,
  hasModPermissions,
  canViewModCases,
  canHandleAppeals,
};

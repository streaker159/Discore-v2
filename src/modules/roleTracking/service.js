"use strict";

const repo = require("./repositories/trackedRoleRepository");

function getCachedRoleMemberIds(role) {
  if (!role?.members) return [];
  return Array.from(role.members.keys());
}

async function trackRole(guildId, roleId, purpose = "SCOREBOARD") {
  await repo.trackRole(guildId, roleId, purpose);
}

async function untrackRole(guildId, roleId) {
  await repo.untrackRole(guildId, roleId);
}

async function getTrackedRoleMembers(guildId, roleId) {
  return repo.getRoleMembers(guildId, roleId);
}

/**
 * Seed from Discord cache only.
 * IMPORTANT: this never calls guild.members.fetch(), so it never scans the full server.
 * It only adds cached members; it does not delete missing members because cache can be incomplete.
 */
async function seedTrackedRoleFromCachedMembers(guildId, role) {
  if (!role?.id) return 0;

  await repo.trackRole(guildId, role.id, "SCOREBOARD");

  const memberIds = getCachedRoleMemberIds(role);
  for (const userId of memberIds) {
    await repo.upsertRoleMember(guildId, role.id, userId);
  }

  return memberIds.length;
}

async function syncMemberTrackedRoles(member) {
  if (!member?.guild?.id || !member?.id) return;

  const trackedRoles = await repo.getTrackedRoles(member.guild.id);

  for (const tracked of trackedRoles) {
    const hasRole = member.roles.cache.has(tracked.roleId);

    if (hasRole) {
      await repo.upsertRoleMember(member.guild.id, tracked.roleId, member.id);
    } else {
      await repo.removeRoleMember(member.guild.id, tracked.roleId, member.id);
    }
  }
}

async function handleGuildMemberUpdate(oldMember, newMember) {
  if (!newMember?.guild?.id || !newMember?.id) return;

  const trackedRoles = await repo.getTrackedRoles(newMember.guild.id);

  for (const tracked of trackedRoles) {
    const hadRole = oldMember?.roles?.cache?.has(tracked.roleId) ?? false;
    const hasRole = newMember.roles.cache.has(tracked.roleId);

    if (!hadRole && hasRole) {
      await repo.upsertRoleMember(newMember.guild.id, tracked.roleId, newMember.id);
    } else if (hadRole && !hasRole) {
      await repo.removeRoleMember(newMember.guild.id, tracked.roleId, newMember.id);
    }
  }
}

async function handleGuildMemberRemove(member) {
  if (!member?.guild?.id || !member?.id) return;
  await repo.removeUserFromGuild(member.guild.id, member.id);
}

module.exports = {
  trackRole,
  untrackRole,
  getTrackedRoleMembers,
  seedTrackedRoleFromCachedMembers,
  syncMemberTrackedRoles,
  handleGuildMemberUpdate,
  handleGuildMemberRemove,
};

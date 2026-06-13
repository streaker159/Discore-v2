const prisma = require("../lib/prisma");
const logger = require("../lib/logger");

/**
 * Creates a Discord role if it doesn't already exist in the guild.
 * Returns the role ID.
 */
async function ensureRole(guild, name, color, hoist = false) {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) return existing.id;
  const role = await guild.roles.create({
    name,
    color,
    hoist,
    reason: "Discore auto-setup",
  });
  return role.id;
}

module.exports = {
  name: "guildCreate",
  async execute(guild) {
    // Upsert the guild record first
    await prisma.guild.upsert({
      where: { id: guild.id },
      update: {},
      create: {
        id: guild.id,
        allianceName: guild.name,
        allianceLogo: guild.iconURL(),
      },
    });

    // Auto-create management roles
    let scoreboardManagerRoleId = null;
    let disAdminRoleId = null;

    try {
      scoreboardManagerRoleId = await ensureRole(
        guild,
        "Scoreboard Manager",
        "#1abc9c",
      );
      disAdminRoleId = await ensureRole(guild, "Dis Admin", "#e74c3c", true);

      await prisma.guild.update({
        where: { id: guild.id },
        data: { scoreboardManagerRoleId, disAdminRoleId },
      });

      logger.info("guildCreate: roles created", {
        guildId: guild.id,
        scoreboardManagerRoleId,
        disAdminRoleId,
      });
    } catch (err) {
      // Bot may lack Manage Roles permission — non-fatal
      logger.warn("guildCreate: could not create roles", {
        guildId: guild.id,
        error: err.message,
      });
    }

    logger.info("Joined guild", { guildId: guild.id, name: guild.name });
  },
};

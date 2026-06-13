const prisma = require('../../lib/prisma');
const { guildSettingsCache } = require('../../lib/cache');

async function ensureGuild(guildId, defaults = {}) {
  const guild = await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId, ...defaults },
  });
  guildSettingsCache.set(`guild:${guildId}`, guild);
  return guild;
}

async function updateGuildSettings(guildId, data) {
  await ensureGuild(guildId);
  const guild = await prisma.guild.update({ where: { id: guildId }, data });
  guildSettingsCache.set(`guild:${guildId}`, guild);
  return guild;
}

module.exports = { ensureGuild, updateGuildSettings };

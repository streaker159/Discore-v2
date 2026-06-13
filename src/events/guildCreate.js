const prisma = require('../lib/prisma');
const logger = require('../lib/logger');

module.exports = {
  name: 'guildCreate',
  async execute(guild) {
    await prisma.guild.upsert({
      where: { id: guild.id },
      update: {},
      create: { id: guild.id, allianceName: guild.name, allianceLogo: guild.iconURL() },
    });
    logger.info('Joined guild', { guildId: guild.id, name: guild.name });
  },
};

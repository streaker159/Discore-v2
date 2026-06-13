const prisma = require("../lib/prisma");
const { buildBattleSignupEmbed } = require("../modules/battleSignup/service");
const logger = require("../lib/logger");

module.exports = {
  name: "battleExpireJob",
  intervalMs: 60_000, // every minute
  enabled: true,
  async run(client) {
    const now = new Date();

    // Find OPEN signups whose scheduled time has passed
    const expired = await prisma.battleSignup.findMany({
      where: { status: "OPEN", scheduledAt: { lte: now } },
      include: { participants: true, guild: true },
    });

    for (const signup of expired) {
      try {
        // Mark as STARTED
        await prisma.battleSignup.update({
          where: { id: signup.id },
          data: { status: "STARTED" },
        });

        const updated = { ...signup, status: "STARTED" };
        const embed = await buildBattleSignupEmbed(signup.guildId, updated);

        // Edit the live message — remove buttons, update embed
        if (signup.messageId && signup.channelId) {
          const ch = await client.channels
            .fetch(signup.channelId)
            .catch(() => null);
          if (ch) {
            const msg = await ch.messages
              .fetch(signup.messageId)
              .catch(() => null);
            if (msg) {
              await msg
                .edit({ embeds: [embed], components: [] })
                .catch(() => {});

              // If tagOnStart role is set, ping it in the channel
              if (signup.tagOnStart) {
                await ch
                  .send(
                    `<@&${signup.tagOnStart}> — ⚔️ Battle **${signup.title || signup.game}** is starting now!`,
                  )
                  .catch(() => {});
              }
            }
          }
        }

        logger.info("battleExpireJob: marked signup as STARTED", {
          id: signup.id,
        });
      } catch (err) {
        logger.error("battleExpireJob failed for signup", {
          id: signup.id,
          error: err.message,
        });
      }
    }
  },
};

const prisma = require("../lib/prisma");
const { reminderQueue } = require("../lib/queue");
const { formatDiscordTime } = require("../lib/embedBuilder");
const logger = require("../lib/logger");

module.exports = {
  name: "eventReminderJob",
  intervalMs: 60_000,
  enabled: true,
  async run(client) {
    const now = new Date();
    const in30Min = new Date(now.getTime() + 31 * 60 * 1000);

    // Find events starting within the next 30 minutes that haven't been notified yet
    const upcoming = await prisma.event.findMany({
      where: {
        status: "UPCOMING",
        scheduledAt: { gte: now, lte: in30Min },
      },
      include: { rsvps: true, guild: true },
    });

    for (const event of upcoming) {
      reminderQueue.add(async () => {
        try {
          const notifChanId = event.guild?.adminLogChan || event.channelId;
          const channel = await client.channels
            .fetch(notifChanId)
            .catch(() => null);
          if (!channel) return;
          const t = formatDiscordTime(event.scheduledAt);
          await channel
            .send(`📅 **${event.title}** starts ${t.relative} (${t.full}).`)
            .catch(() => {});
          await prisma.event.update({
            where: { id: event.id },
            data: { status: "LIVE" },
          });
        } catch (error) {
          logger.error("eventReminderJob failed for event", {
            id: event.id,
            error: error.message,
          });
        }
      });
    }
  },
};

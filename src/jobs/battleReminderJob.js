const prisma = require("../lib/prisma");
const { reminderQueue } = require("../lib/queue");
const logger = require("../lib/logger");

module.exports = {
  name: "battleReminderJob",
  intervalMs: 60_000,
  enabled: true,
  async run(client) {
    const now = new Date();
    const due = await prisma.battleReminder.findMany({
      where: { sent: false, remindAt: { lte: now } },
    });

    for (const reminder of due) {
      reminderQueue.add(async () => {
        try {
          const user = await client.users
            .fetch(reminder.userId)
            .catch(() => null);
          const signup = await prisma.battleSignup.findUnique({
            where: { id: reminder.signupId },
          });
          if (user && signup) {
            await user
              .send(
                `🔔 Reminder: your battle signup starts soon! Game: **${signup.game}**`,
              )
              .catch(() => {});
          }
          await prisma.battleReminder.update({
            where: { id: reminder.id },
            data: { sent: true },
          });
        } catch (error) {
          logger.error("battleReminderJob failed for reminder", {
            id: reminder.id,
            error: error.message,
          });
        }
      });
    }
  },
};

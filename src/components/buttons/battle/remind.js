module.exports = {
  customIdPrefix: 'battle:remind:',
  async execute(interaction) {
    await interaction.reply({ content: '🔔 Reminder noted. Reminder scheduling will be wired into the battleReminderJob.', ephemeral: true });
  },
};

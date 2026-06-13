async function replyOrEdit(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload).catch(() => interaction.followUp(payload));
  return interaction.reply(payload);
}

module.exports = { replyOrEdit };

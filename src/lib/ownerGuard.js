function splitIds(value) {
  return String(value || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function getOwnerIds() {
  return splitIds(process.env.BOT_OWNER_IDS);
}

function getAdminIds() {
  return [
    ...new Set([...getOwnerIds(), ...splitIds(process.env.BOT_ADMIN_IDS)]),
  ];
}

function isBotOwner(userId) {
  return getOwnerIds().includes(userId);
}

function isBotAdmin(userId) {
  return getAdminIds().includes(userId);
}

async function requireBotOwner(interaction) {
  if (!isBotOwner(interaction.user.id)) {
    await interaction.reply({
      content: "This command is bot-owner only.",
      flags: 64,
    });
    return false;
  }
  return true;
}

async function requireBotAdmin(interaction) {
  if (!isBotAdmin(interaction.user.id)) {
    await interaction.reply({
      content: "This command is bot-admin only.",
      flags: 64,
    });
    return false;
  }
  return true;
}

module.exports = {
  getOwnerIds,
  getAdminIds,
  isBotOwner,
  isBotAdmin,
  requireBotOwner,
  requireBotAdmin,
};

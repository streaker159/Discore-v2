const { EmbedBuilder } = require("discord.js");
const prisma = require("./prisma");
const { guildSettingsCache } = require("./cache");

async function getGuildSettings(guildId) {
  if (!guildId) return null;
  const cacheKey = `guild:${guildId}`;
  const cached = guildSettingsCache.get(cacheKey);
  if (cached) return cached;

  const guild = await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId },
  });

  guildSettingsCache.set(cacheKey, guild);
  return guild;
}

function makeColor(value) {
  if (!value) return 0x1a7a9e;
  const clean = String(value).replace("#", "");
  const parsed = Number.parseInt(clean, 16);
  return Number.isFinite(parsed) ? parsed : 0x1a7a9e;
}

async function hasActivePremium(guildId) {
  if (!guildId) return false;
  const premium = await prisma.guildPremium.findUnique({ where: { guildId } });
  if (!premium || premium.tier === "FREE") return false;
  if (premium.expiresAt && premium.expiresAt < new Date()) return false;
  return true;
}

async function createDiscoreEmbed(interactionOrGuildId, options = {}) {
  const guildId =
    typeof interactionOrGuildId === "string"
      ? interactionOrGuildId
      : interactionOrGuildId?.guildId;

  const client =
    typeof interactionOrGuildId === "string"
      ? options.client
      : interactionOrGuildId?.client;

  const settings = options.guildSettings || (await getGuildSettings(guildId));

  // Premium gate branding at render time
  const premium = await hasActivePremium(guildId);
  const allianceName = premium
    ? settings?.allianceName || options.allianceName || "Discore"
    : "Discore";
  const allianceLogo = premium
    ? settings?.allianceLogo || options.allianceLogo || undefined
    : undefined;
  const footerText = premium
    ? settings?.customFooter || "Powered by Discore"
    : "Powered by Discore";
  const color = makeColor(options.color || settings?.themeColor);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: allianceName, iconURL: allianceLogo || undefined })
    .setFooter({
      text: footerText,
      iconURL: client?.user?.displayAvatarURL?.() || undefined,
    })
    .setTimestamp();

  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.image) embed.setImage(options.image);
  if (Array.isArray(options.fields) && options.fields.length)
    embed.addFields(options.fields);

  return embed;
}

function formatDiscordTime(date) {
  const unix = Math.floor(new Date(date).getTime() / 1000);
  return {
    unix,
    shortDate: `<t:${unix}:d>`,
    longDate: `<t:${unix}:D>`,
    shortTime: `<t:${unix}:t>`,
    full: `<t:${unix}:F>`,
    relative: `<t:${unix}:R>`,
  };
}

module.exports = {
  getGuildSettings,
  createDiscoreEmbed,
  formatDiscordTime,
};

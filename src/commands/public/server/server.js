const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { updateGuildSettings, ensureGuild } = require('../../../modules/serverSettings/service');
const { createDiscoreEmbed } = require('../../../lib/embedBuilder');

module.exports = {
  scope: 'SERVER_ADMIN',
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Configure Discore server settings.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('setup').setDescription('Create default server settings.'))
    .addSubcommand((s) => s.setName('settings').setDescription('Show current server settings.'))
    .addSubcommand((s) => s.setName('timezone').setDescription('Set server timezone.').addStringOption((o) => o.setName('timezone').setDescription('Example: Europe/Paris').setRequired(true)))
    .addSubcommand((s) => s.setName('default-game').setDescription('Set default game slug.').addStringOption((o) => o.setName('game').setDescription('Example: supremacy-ww3').setRequired(true)))
    .addSubcommand((s) => s.setName('branding').setDescription('Set alliance branding.').addStringOption((o) => o.setName('name').setDescription('Alliance name')).addStringOption((o) => o.setName('logo').setDescription('Logo URL')).addStringOption((o) => o.setName('color').setDescription('Hex color, example #1a7a9e'))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    let guild;

    if (sub === 'setup') guild = await ensureGuild(interaction.guildId, { allianceName: interaction.guild.name, allianceLogo: interaction.guild.iconURL() });
    if (sub === 'timezone') guild = await updateGuildSettings(interaction.guildId, { timezone: interaction.options.getString('timezone', true) });
    if (sub === 'default-game') guild = await updateGuildSettings(interaction.guildId, { defaultGame: interaction.options.getString('game', true) });
    if (sub === 'branding') {
      const data = {};
      const name = interaction.options.getString('name');
      const logo = interaction.options.getString('logo');
      const color = interaction.options.getString('color');
      if (name) data.allianceName = name;
      if (logo) data.allianceLogo = logo;
      if (color) data.themeColor = color;
      guild = await updateGuildSettings(interaction.guildId, data);
    }
    if (sub === 'settings') guild = await ensureGuild(interaction.guildId);

    const embed = await createDiscoreEmbed(interaction, {
      guildSettings: guild,
      title: '⚙️ Server Settings',
      fields: [
        { name: 'Alliance', value: guild.allianceName || 'Not set', inline: true },
        { name: 'Timezone', value: guild.timezone || 'UTC', inline: true },
        { name: 'Default game', value: guild.defaultGame || 'Not set', inline: true },
        { name: 'Theme color', value: guild.themeColor || '#1a7a9e', inline: true },
      ],
    });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

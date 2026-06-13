require('dotenv').config();
const path = require('path');
const { REST, Routes } = require('discord.js');
const { walkFiles } = require('../src/loaders/fileWalker');

function commandJsonFromDir(relativeDir) {
  const dir = path.join(__dirname, '..', relativeDir);
  return walkFiles(dir).map((file) => require(file)).filter((cmd) => cmd?.data).map((cmd) => cmd.data.toJSON());
}

function rest() {
  return new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
}

module.exports = { commandJsonFromDir, rest, Routes };

const { rest, Routes } = require('./_commandDeployUtil');

async function main() {
  if (!process.env.ADMIN_GUILD_ID) throw new Error('ADMIN_GUILD_ID is required.');
  await rest().put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.ADMIN_GUILD_ID), { body: [] });
  console.log('✅ Cleared admin guild commands.');
}
main().catch((error) => { console.error(error); process.exit(1); });

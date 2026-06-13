const { commandJsonFromDir, rest, Routes } = require('./_commandDeployUtil');

async function main() {
  if (!process.env.ADMIN_GUILD_ID) throw new Error('ADMIN_GUILD_ID is required.');
  const commands = commandJsonFromDir('src/commands/admin');
  console.log(`Deploying ${commands.length} owner-only admin commands to ${process.env.ADMIN_GUILD_ID}...`);
  await rest().put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.ADMIN_GUILD_ID), { body: commands });
  console.log('✅ Admin commands deployed to owner guild only.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

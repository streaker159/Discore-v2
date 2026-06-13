const { commandJsonFromDir, rest, Routes } = require('./_commandDeployUtil');

async function main() {
  const commands = commandJsonFromDir('src/commands/public');
  console.log(`Deploying ${commands.length} global public commands...`);
  await rest().put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  console.log('✅ Global public commands deployed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

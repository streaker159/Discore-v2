const { rest, Routes } = require('./_commandDeployUtil');

async function main() {
  await rest().put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
  console.log('✅ Cleared global commands.');
}
main().catch((error) => { console.error(error); process.exit(1); });

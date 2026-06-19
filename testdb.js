require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const q = "SELECT column_name FROM information_schema.columns WHERE table_name='Event' ORDER BY column_name";
p.$queryRawUnsafe(q)
  .then(r => { console.log("COLUMNS:", r.map(c=>c.column_name).join(", ")); p.$disconnect(); })
  .catch(e => { console.error("ERROR:", e.message); p.$disconnect(); });
    update: {},
    create: { id: "1366566263048110125" },
  })
  .then(() => console.log("✅ Guild registered"))
  .catch((e) => console.error("❌", e.message))
  .finally(() => p.$disconnect());

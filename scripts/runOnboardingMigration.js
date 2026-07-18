"use strict";

/**
 * Runs the onboarding migration SQL against the configured database
 * using the project's existing Prisma Client ($executeRawUnsafe).
 *
 * Prisma only accepts single statements, so this script splits the
 * migration file on statement-terminating semicolons and runs each
 * CREATE / CREATE INDEX independently.
 *
 * Usage:
 *   node scripts/runOnboardingMigration.js
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const prisma = require("../src/lib/prisma");

const migrationPath = path.join(
  __dirname,
  "..",
  "prisma",
  "migrations",
  "20260718000000_add_onboarding_system",
  "migration.sql",
);

if (!fs.existsSync(migrationPath)) {
  console.error(`❌ Migration file not found at: ${migrationPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(migrationPath, "utf-8");

/**
 * Split raw SQL into individual statement strings.
 *
 * We split on every semicolon, then keep only non-empty fragments
 * that contain actual SQL (skip pure-comment blocks).
 *
 * Because this migration file never uses semicolons inside string
 * literals, a simple ;-split is safe.
 */
function splitStatements(sql) {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => {
      // Drop empty and pure-comment fragments
      if (!s) return false;
      const lines = s.split("\n").filter((l) => l.trim() !== "");
      if (lines.length === 0) return false;
      if (lines.every((l) => l.trim().startsWith("--"))) return false;
      return true;
    })
    .map((s) => s + ";");
}

async function run() {
  const statements = splitStatements(raw);
  console.log(`Found ${statements.length} statement(s) to execute.\n`);

  let executed = 0;
  let skipped = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.slice(0, 80).replace(/\n/g, " ").trim();

    try {
      await prisma.$executeRawUnsafe(stmt);
      executed++;
      console.log(`  ✅ ${preview}...`);
    } catch (err) {
      const msg = err?.message || "";

      // Known safe-to-skip codes
      const isAlreadyExists =
        msg.includes("already exists") ||
        msg.includes("duplicate key") ||
        msg.includes("Duplicate column") ||
        msg.includes("multiple primary keys");

      if (isAlreadyExists) {
        skipped++;
        console.log(`  ⏭️  (already exists) ${preview}...`);
        continue;
      }

      // Real error
      console.error(`\n❌ Statement ${i + 1} failed:`);
      console.error(`   ${stmt.slice(0, 300).replace(/\n/g, " ")}...\n`);
      console.error(`   ${msg}\n`);

      await prisma.$disconnect();
      process.exit(1);
    }
  }

  console.log(
    `\n✅ Done — ${executed} executed, ${skipped} already existed (skipped).`,
  );

  await prisma.$disconnect();
  process.exit(0);
}

run();

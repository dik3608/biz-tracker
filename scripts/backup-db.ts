// Dumps all app tables to a timestamped JSON file in backups/.
// Usage: npx tsx scripts/backup-db.ts
import "dotenv/config";
import { Pool } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const TABLES = [
  "Category",
  "Subcategory",
  "Transaction",
  "Session",
  "ChatSession",
  "ChatMessage",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url });

  const dump: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const { rows } = await pool.query(`SELECT * FROM "${table}"`);
    dump[table] = rows;
    console.log(`${table}: ${rows.length} rows`);
  }
  await pool.end();

  const dir = join(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(dir, `backup-${stamp}.json`);
  writeFileSync(file, JSON.stringify(dump, null, 2));
  console.log(`Saved ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

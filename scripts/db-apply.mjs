/* Apply supabase/migrations/*.sql in order to a Supabase Postgres database.
   Usage:
     $env:DATABASE_URL="postgresql://..." ; node scripts/db-apply.mjs

   Safely skips a migration file whose lead table already exists (migrations
   here are guarded to be re-runnable as a set). Each file runs in a
   transaction. Never commit real DATABASE_URL values. */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const url = process.env.DATABASE_URL;

if (!url) {
  console.error("Set DATABASE_URL first, e.g. `$env:DATABASE_URL=\"postgresql://...\"`");
  process.exit(1);
}

const LEAD_TABLE = {
  "0001_initial.sql": "public.enquiries",
  "0002_stats_rpc.sql": "public.stats_overview",
  "0003_fix_dedupe.sql": "public.enquiries_dedupe_key_uniq",
  // Lead is a unique CONSTRAINT (name may collide with the old index name).
  "0004_dedupe_constraint.sql": "constraint:enquiries_dedupe_key_uniq:public.enquiries",
};

const client = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: 25000,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
console.log("Connected:", (await client.query("select current_database() as db")).rows[0].db);

const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
let applied = 0;
for (const file of files) {
  const lead = LEAD_TABLE[file];
  if (lead) {
    if (lead.startsWith("constraint:")) {
      const [, conname, conrelid] = lead.split(":");
      const { rows } = await client.query(
        "select count(*)::int as n from pg_constraint where conname=$1 and conrelid=$2::regclass",
        [conname, conrelid]
      );
      if (rows[0].n > 0) {
        console.log(`  skip  ${file}  (${conname} constraint exists)`);
        continue;
      }
    } else {
      const { rows } = await client.query(
        "select to_regclass($1) is not null as exists_", [lead]
      );
      if (rows[0].exists_) {
        console.log(`  skip  ${file}  (${lead} already exists)`);
        continue;
      }
    }
  }
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    applied++;
    console.log(`  ok    ${file}`);
  } catch (err) {
    await client.query("rollback");
    console.error(`  FAIL  ${file}: ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

console.log(`Done. ${applied} migration(s) applied.`);
await client.end();
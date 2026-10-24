import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import pg from "pg";
const url = process.env.BILLING_TEST_DATABASE_URL;
const local = Boolean(
  url &&
  /^postgres(ql)?:\/\/[^@]+@(localhost|127\.0\.0\.1):\d+\/zuri_billing_qa(?:\?|$)/.test(
    url,
  ),
);
test(
  "Migration additive: conservation exacte de toutes les tables existantes",
  { skip: !local },
  async () => {
    const name = `zuri_billing_migration_qa_${Date.now()}`;
    assert.match(name, /^zuri_billing_migration_qa_\d+$/);
    const admin = new pg.Client({ connectionString: url! });
    await admin.connect();
    let client: pg.Client | undefined;
    try {
      await admin.query(`CREATE DATABASE "${name}"`);
      const target = new URL(url!);
      target.pathname = `/${name}`;
      client = new pg.Client({ connectionString: target.toString() });
      await client.connect();
      const migrations = (
        await readdir("prisma/migrations", { withFileTypes: true })
      )
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
      const billing = "20261024120000_billing";
      for (const name of migrations.filter((n) => n < billing))
        await client.query(
          await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"),
        );
      await client.query(
        `INSERT INTO "Workspace" (id,name,"updatedAt") VALUES ('migration-workspace','Validation locale – préserver',now()); INSERT INTO "Brand" (id,"workspaceId",name,slug,"updatedAt") VALUES ('migration-brand','migration-workspace','Marque préexistante éàç','migration-brand',now());`,
      );
      const tables = (
        await client.query(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
        )
      ).rows.map((r) => r.tablename as string);
      async function fingerprints() {
        const result: Record<string, unknown> = {};
        for (const name of tables) {
          assert.match(name, /^[A-Za-z_]+$/);
          result[name] = (
            await client!.query(
              `SELECT count(*)::int AS count,md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),'')) AS hash FROM "${name}" t`,
            )
          ).rows[0];
        }
        return result;
      }
      const before = await fingerprints();
      await client.query(
        await readFile(`prisma/migrations/${billing}/migration.sql`, "utf8"),
      );
      const after = await fingerprints();
      assert.deepEqual(after, before);
      const added = (
        await client.query(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'Billing%' ORDER BY tablename",
        )
      ).rows.map((r) => r.tablename);
      assert.deepEqual(added, [
        "BillingCompany",
        "BillingCustomer",
        "BillingDocument",
      ]);
      await client.query('DELETE FROM "Brand" WHERE id=$1', [
        "migration-brand",
      ]); // Existing brands without documents remain deletable.
      await mkdir("tmp/billing-qa", { recursive: true });
      await writeFile(
        "tmp/billing-qa/migration-preservation.json",
        JSON.stringify(
          {
            existingTables: tables.length,
            allFingerprintsIdentical: true,
            newTables: added,
            existingBrandDeletionStillWorks: true,
          },
          null,
          2,
        ),
      );
      console.log(
        `MIGRATION_QA_PASS: ${tables.length} tables préexistantes identiques (comptages et empreintes), nouvelles tables vides.`,
      );
    } finally {
      if (client) await client.end();
      await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
      await admin.end();
    }
  },
);

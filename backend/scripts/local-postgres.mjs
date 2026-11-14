import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import "dotenv/config";
const settings = new URL(process.env.DATABASE_URL || "postgresql://postgres:sahay-local-only@127.0.0.1:5433/sahay");
const databaseName = settings.pathname.slice(1) || "sahay";
const pg = new EmbeddedPostgres({
  databaseDir: "./.data/postgres", user: decodeURIComponent(settings.username),
  password: decodeURIComponent(settings.password), port: Number(settings.port || 5433),
  persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1"],
});
if (!existsSync("./.data/postgres/PG_VERSION")) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
if (!result.rowCount) await pg.createDatabase(databaseName);
await client.end();
console.log("Local PostgreSQL ready at 127.0.0.1:" + (settings.port || 5433));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await pg.stop(); process.exit(0); });
setInterval(() => {}, 60000);

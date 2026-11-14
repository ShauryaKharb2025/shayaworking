import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
const pg = new EmbeddedPostgres({
  databaseDir: "./.data/postgres", user: "postgres",
  password: "jeevansetu-local-only", port: 5433, persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1"],
});
if (!existsSync("./.data/postgres/PG_VERSION")) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const result = await client.query("SELECT 1 FROM pg_database WHERE datname = 'jeevansetu'");
if (!result.rowCount) await pg.createDatabase("jeevansetu");
await client.end();
console.log("Local PostgreSQL ready at 127.0.0.1:5433");
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await pg.stop(); process.exit(0); });
setInterval(() => {}, 60000);

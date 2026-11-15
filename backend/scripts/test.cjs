require("dotenv").config();
const {PrismaClient}=require("@prisma/client");
const {spawnSync}=require("node:child_process");
const {readdirSync}=require("node:fs");
const {randomUUID}=require("node:crypto");
async function main(){
 const source=new URL(process.env.DATABASE_URL);
 const target=new URL(process.env.TEST_DATABASE_URL || source.toString());
 const disposable=!process.env.TEST_DATABASE_URL;
 if(disposable)target.pathname="/sahay_check_"+randomUUID().replaceAll("-","")+"_test";
 if(!["localhost","127.0.0.1"].includes(target.hostname) || !/^\/[a-zA-Z0-9_]+_test$/.test(target.pathname) || target.toString()===source.toString())throw new Error("Tests require a separate local database ending in _test");
 const admin=new PrismaClient({datasourceUrl:source.toString()});
 const name=target.pathname.slice(1);
 try{
  const existing=await admin.$queryRaw`SELECT datname FROM pg_database WHERE datname=${name}`;
  if(disposable&&existing.length)throw new Error("Disposable database name collision; nothing was changed");
  if(!existing.length)await admin.$executeRawUnsafe('CREATE DATABASE "'+name+'"');
 }finally{await admin.$disconnect();}
 const env={...process.env,DATABASE_URL:target.toString(),NODE_ENV:"test",MARITIME_ENABLED:"false"};
 const run=args=>{const result=spawnSync(process.execPath,args,{env,stdio:"inherit"});if(result.status!==0)throw new Error("Test command failed (exit "+(result.status||1)+")");};
 try {
 run([require.resolve("prisma/build/index.js"),"migrate","deploy"]);
 const testDb=new PrismaClient({datasourceUrl:target.toString()});
 let seeded;try{seeded=await testDb.coverageZone.count();}finally{await testDb.$disconnect();}
 if(!seeded)run(["src/seed.js"]);
 console.log("Integration database: "+name);
 run(["--test","--test-concurrency=1",...readdirSync("tests").filter(name=>name.endsWith(".test.js")).map(name=>"tests/"+name)]);
 } finally {
  if(disposable){
   // This exact random local database was created above for this run only.
   try{await admin.$executeRawUnsafe('DROP DATABASE "'+name+'" WITH (FORCE)');console.log("Disposed integration database: "+name);}finally{await admin.$disconnect();}
  }
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

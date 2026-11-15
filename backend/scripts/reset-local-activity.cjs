const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();
const db = require("../src/data/prisma");

async function reset() {
  const database = new URL(process.env.DATABASE_URL);
  if (process.env.NODE_ENV === "production" || !["localhost","127.0.0.1","[::1]"].includes(database.hostname)) {
    throw new Error("Activity reset is restricted to the local development database");
  }
  const result = await db.$transaction(async tx => {
    const tables = ["trip","healthReading","hospitalReferral","caregiverAccess","clinicalObservation","journeyProjection","doctorSlot","waitlistEntry","ambulance","hospital"];
    const backup = {};
    for (const table of tables) backup[table] = await tx[table].findMany();
    const directory = path.resolve(".data/activity-backups");
    fs.mkdirSync(directory,{recursive:true});
    const backupPath = path.join(directory,Date.now()+".json");
    fs.writeFileSync(backupPath,JSON.stringify(backup,null,2),{flag:"wx"});
    for (const reservation of backup.hospitalReferral.filter(row=>["accepted","confirmed"].includes(row.status))) {
      await tx.hospital.update({where:{id:reservation.hospitalId},data:{bedsAvailable:{increment:1},version:{increment:1}}});
    }
    const vehicleIds = [...new Set(backup.trip.map(row=>row.ambulanceId).filter(Boolean))];
    await tx.ambulance.updateMany({where:{id:{in:vehicleIds}},data:{status:"idle",version:{increment:1}}});
    for(const table of ["healthReading","doctorSlot","clinicalObservation","caregiverAccess","hospitalReferral","journeyProjection","trip","waitlistEntry"]) {
      await tx[table].deleteMany();
    }
    return {clearedCases:backup.trip.length,clearedSlots:backup.doctorSlot.length,backupPath};
  },{timeout:20000});
  console.log(JSON.stringify(result));
}
reset().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>db.$disconnect());

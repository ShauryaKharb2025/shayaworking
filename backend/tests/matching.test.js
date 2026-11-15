const {test}=require("node:test");
const assert=require("node:assert/strict");
const {ambulanceCandidates}=require("../src/services/matching");
test("automatic matching chooses the nearest eligible equipped vehicle",()=>{
 const trip={pickupLocation:{coordinates:[77,28]},requestedAmbulanceTier:"ALS",triage:{suggestedEquipment:["Oxygen"]}};
 const vehicle=(id,lng,extra={})=>({id,vehicleNumber:id,status:"idle",tier:"ALS",equipment:["Oxygen"],crew:[{certified:true}],complianceVerified:true,operator:{verified:true},location:{coordinates:[lng,28]},...extra});
 const rows=ambulanceCandidates(trip,[
  vehicle("near-busy",77,{status:"en_route"}),
  vehicle("near-unequipped",77.00001,{equipment:[]}),
  vehicle("far",77.1),
  vehicle("closest",77.00002),
  vehicle("missing-location",77,{location:null}),
 ]);
 assert.equal(rows.filter(row=>row.eligible)[0].id,"closest");
 assert.equal(rows.find(row=>row.id==="missing-location").eligible,false);
});

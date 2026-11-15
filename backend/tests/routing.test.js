const {test}=require("node:test");
const assert=require("node:assert/strict");
const {roadRoute,routingStatus}=require("../src/services/routing");
test("OSRM geometry, distance and duration are validated and outage fallback is explicit",async()=>{
 const start=[77.1,28.7],end=[77.2,28.8];
 const route=await roadRoute(start,end,async()=>({ok:true,json:async()=>({code:"Ok",routes:[{distance:3000,duration:300,geometry:{coordinates:[start,end]}}]})}));
 assert.equal(route.source,"osrm");assert.equal(route.distanceKm,3);assert.equal(route.durationSeconds,300);
 const fallback=await roadRoute(start,end,async()=>{throw new Error("Unavailable")});
 assert.equal(fallback.source,"straight_line");assert.equal(fallback.durationSeconds,null);
 assert.equal(routingStatus().status,"degraded");
 const invalid=await roadRoute(start,end,async()=>({ok:true,json:async()=>({code:"Ok",routes:[{distance:-1,duration:300,geometry:{coordinates:[start,end]}}]})}));
 assert.equal(invalid.source,"straight_line");
 await assert.rejects(roadRoute([300,91],end),{status:400});
});

const {distanceKm}=require("./matching");
let last={status:"degraded",reason:"not_checked"};
const valid=point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90;
async function roadRoute(start,end,fetchImpl=fetch) {
 if(!valid(start)||!valid(end))throw Object.assign(new Error("Valid start and destination coordinates required"),{status:400});
 try {
  const base=(process.env.OSRM_URL||"https://router.project-osrm.org").replace(/\/$/,"");
  const response=await fetchImpl(base+"/route/v1/driving/"+start.join(",")+";"+end.join(",")+"?overview=full&geometries=geojson",{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error("Routing HTTP "+response.status);
  const result=await response.json(),route=result.routes?.[0];
  if(result.code && result.code!=="Ok" || !route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration) || route.distance<0 || route.duration<0 ||
    !Array.isArray(route.geometry?.coordinates) || route.geometry.coordinates.length<2 || !route.geometry.coordinates.every(valid))throw new Error("Invalid route response");
  last={status:"healthy",source:"osrm",checkedAt:new Date().toISOString()};
  return {source:"osrm",coordinates:route.geometry.coordinates,distanceKm:route.distance/1000,durationSeconds:route.duration,checkedAt:last.checkedAt};
 }catch{
  last={status:"degraded",source:"straight_line",reason:"routing_unavailable",checkedAt:new Date().toISOString()};
  return {source:"straight_line",coordinates:[start,end],distanceKm:distanceKm(start,end),durationSeconds:null,checkedAt:last.checkedAt};
 }
}
function routingStatus(){return last.status==="healthy" && Date.now()-new Date(last.checkedAt).getTime()>120000 ? {...last,status:"degraded",reason:"check_stale"} : last;}
module.exports={roadRoute,routingStatus};

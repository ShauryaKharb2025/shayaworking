const router=require("express").Router();
const db=require("../data/prisma");
const {requireAuth,requireRole}=require("../middleware/auth");
const {config}=require("../integrations/maritime/config");
const worker=require("../integrations/maritime/worker");
const {signals}=require("../integrations/maritime/events");
const {interruptDemoGps,restoreDemoGps}=require("../services/demoDrive");
const {randomUUID}=require("node:crypto");
const wrap=fn=>(req,res,next)=>fn(req,res).catch(next);
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
router.use(requireAuth);
router.get("/simulation/:id",requireRole("driver"),wrap(async(req,res)=>{
  const trip=await db.trip.findUnique({where:{id:req.params.id},include:worker.include});
  if(!trip||trip.ambulance?.driverId!==req.user.sub)fail(403,"Assigned case required");
  res.json({enabled:config().simulation&&worker.synthetic(trip)});
}));
router.post("/simulation/:id/gps-gap",requireRole("driver"),wrap(async(req,res)=>{
  await interruptDemoGps(req.params.id,req.user.sub);
  req.app.get("io")?.to("dispatcher").to(`trip:${req.params.id}`).to(`driver:${req.user.sub}`).emit("case:refresh",{tripId:req.params.id});
  res.json({ok:true,message:"Synthetic GPS interruption started. Positions remain at their last recorded value."});
}));
router.use(requireRole("admin"));
router.get("/status",wrap(async(req,res)=>res.json(await worker.status())));
router.get("/incidents",wrap(async(req,res)=>{
  if(req.query.cursor && (typeof req.query.cursor!=="string"||req.query.cursor.length>128))fail(400,"Invalid cursor");
  const rows=await db.maritimeIncident.findMany({orderBy:{id:"desc"},take:50,...(req.query.cursor?{cursor:{id:req.query.cursor},skip:1}:{}),include:{jobs:{include:{advisory:true}},trip:{select:{version:true,status:true}}}});
  res.json({incidents:rows,nextCursor:rows.length===50?rows.at(-1).id:null});
}));
router.post("/incidents/:id/review",wrap(async(req,res)=>{
  const {advisoryId,expectedVersion,decision}=req.body;
  if(typeof advisoryId!=="string"||!Number.isInteger(expectedVersion)||!["approve","dismiss"].includes(decision))fail(400,"Advisory, current case version and review decision required");
  const found=await db.maritimeIncident.findUnique({where:{id:req.params.id}});if(!found)fail(404,"Incident not found");
  const result=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Trip" WHERE id=${found.tripId} FOR UPDATE`;
    const incident=await tx.maritimeIncident.findUnique({where:{id:found.id}}),trip=await tx.trip.findUnique({where:{id:found.tripId},include:worker.include});
    const advisory=await tx.maritimeAdvisory.findUnique({where:{id:advisoryId},include:{job:true}});
    if(!worker.synthetic(trip)||advisory?.job.incidentId!==incident.id)fail(403,"Synthetic incident advisory required");
    if(advisory.reviewStatus!=="pending")return {tripId:trip.id,replayed:true};
    if(trip.version!==expectedVersion)fail(409,"Case changed. Refresh and review the current state.");
    const post=advisory.job.kind==="post_incident";
    const signal=signals(trip,config()).find(row=>row.key===incident.episodeKey);
    if(decision==="approve"&&!post&&(!signal||signal.context!==incident.context||["resolved","superseded"].includes(incident.status)))fail(409,"Recommendation is no longer current");
    const code=advisory.response.playbook;let execution={code,decision},coordinates=null;
    if(!require("../integrations/maritime/contract").playbooks.includes(code))fail(409,"Invalid recovery playbook");
    if(decision==="approve"&&!post){
      if(code==="RETRY_ELIGIBLE_AMBULANCE" && (trip.status!=="requested"||trip.ambulanceId))fail(409,"Only an unassigned pending case can request engine retry");
      if(code==="REASSESS_HOSPITAL_OPTIONS" && trip.hospitalId)fail(409,"A confirmed destination needs the existing replacement and acceptance workflow");
      if(code==="FLAG_GPS_COMMUNICATION_FAILURE" && config().simulation){coordinates=await restoreDemoGps(tx,trip);execution.simulatedGpsRestored=!!coordinates;}
      if(code==="REQUEST_ROUTE_REEVALUATION"){
        if(!["en_route","en_route_hospital"].includes(trip.status) || !trip.ambulance?.lastPingAt || Date.now()-trip.ambulance.lastPingAt>config().gpsMs)fail(409,"A current route and recent GPS are required");
        // Reuse routing, never agent-provided coordinates or instructions.
        execution.requested=true;
      }
      if(["RETRY_ELIGIBLE_AMBULANCE","REASSESS_HOSPITAL_OPTIONS"].includes(code))execution.engineReassessmentRequested=true;
    }
    await tx.maritimeAdvisory.update({where:{id:advisory.id},data:{reviewStatus:decision==="approve"?"approved":"dismissed",reviewedBy:req.user.sub,reviewedAt:new Date(),execution}});
    await tx.maritimeIncident.update({where:{id:incident.id},data:{...(!post&&!["resolved","superseded"].includes(incident.status)?{status:"recommendation_ready"}:{}),audit:[...incident.audit,{id:randomUUID(),type:"admin:"+decision,actorId:req.user.sub,at:new Date().toISOString(),playbook:code}]}});
    const fresh=await tx.trip.findUnique({where:{id:trip.id}});
    await tx.trip.update({where:{id:trip.id},data:{version:{increment:1},events:[...fresh.events,{_id:randomUUID(),type:"journey:rescue_reviewed",at:new Date().toISOString(),payload:{incidentId:incident.id,playbook:code,decision,simulated:true}}]}});
    return {tripId:trip.id,coordinates,route:decision==="approve"&&code==="REQUEST_ROUTE_REEVALUATION",engine:execution.engineReassessmentRequested};
  });
  if(result.route){
    const trip=await db.trip.findUnique({where:{id:result.tripId},include:{ambulance:true,hospital:true}});
    const end=trip.status==="en_route_hospital"?trip.hospital?.location?.coordinates:trip.pickupLocation.coordinates;
    if(end&&["en_route","en_route_hospital"].includes(trip.status))await require("../services/routing").roadRoute(trip.ambulance.location.coordinates,end);
  }
  if(result.engine)require("../services/autoDispatchService").kickOrchestration(req.app.get("io"));
  const io=req.app.get("io");
  if(result.coordinates)io?.to(`trip:${result.tripId}`).emit("trip:location",{tripId:result.tripId,lng:result.coordinates[0],lat:result.coordinates[1],simulated:true});
  worker.notify(io,result.tripId);res.json({ok:true,replayed:!!result.replayed});
}));
module.exports=router;

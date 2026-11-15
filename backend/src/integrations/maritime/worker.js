const {randomUUID}=require("node:crypto");
const db=require("../../data/prisma");
const {config}=require("./config");
const {signals,terminal,digest,envelope}=require("./events");
const {validate,isEvidenceType}=require("./contract");
const {chat}=require("./client");
const closed=["resolved","superseded"];
const include={ambulance:true,referrals:true,patient:{select:{email:true}}};
const synthetic=trip=>process.env.NODE_ENV!=="production" && trip.patient?.email==="patient@sahay.org";
const audit=(type,extra={})=>({id:randomUUID(),type,at:new Date().toISOString(),...extra});
function notify(io,tripId){io?.to("dispatcher").to(`trip:${tripId}`).emit("case:refresh",{tripId});}

async function scan(cfg=config(),io,now=Date.now()) {
  if(!cfg.enabled)return;
  // A cursor bounds memory while still visiting every active synthetic case.
  let cursor;
  while(true){
    const trips=await db.trip.findMany({where:{patient:{email:"patient@sahay.org"},OR:[{status:{notIn:["handed_off","cancelled","waitlisted"]}},{maritimeIncidents:{some:{status:{notIn:closed}}}},{status:"handed_off",maritimeIncidents:{some:{jobs:{none:{kind:"post_incident"}}}}}]},include,orderBy:{id:"asc"},take:50,...(cursor?{cursor:{id:cursor},skip:1}:{})});
    for(const candidate of trips){
      if(!synthetic(candidate))continue;
      const changed=await db.$transaction(async tx=>{
        let changed=false;
        await tx.$queryRaw`SELECT id FROM "Trip" WHERE id=${candidate.id} FOR UPDATE`;
        let trip=await tx.trip.findUnique({where:{id:candidate.id},include});
        const phase=trip.events.findLast(e=>e.type==="status:"+trip.status);
        if(["en_route","en_route_hospital"].includes(trip.status) && phase && Number.isFinite(trip.etaMinutes) && !trip.events.some(e=>e.type==="rescue:eta_baseline"&&e.payload?.phase===phase._id)){
          changed=true;
          trip=await tx.trip.update({where:{id:trip.id},include,data:{version:{increment:1},events:[...trip.events,{_id:randomUUID(),type:"rescue:eta_baseline",at:new Date(now).toISOString(),payload:{phase:phase._id,etaMinutes:trip.etaMinutes}}]}});
        }
        const detected=signals(trip,cfg,now), existing=await tx.maritimeIncident.findMany({where:{tripId:trip.id}});
        for(const signal of detected){
          if(existing.some(row=>row.episodeKey===signal.key))continue;
          const event={_id:randomUUID(),type:"rescue:detected",at:new Date(now).toISOString(),payload:{category:signal.category,...signal.facts}};
          changed=true;
          trip=await tx.trip.update({where:{id:trip.id},include,data:{version:{increment:1},events:[...trip.events,event]}});
          // Only numeric/timestamp watchdog facts leave Sahay; no clinical/free-text fields.
          const previous=trip.events.filter(e=>e.type!=="rescue:detected"&&isEvidenceType(e.type)).slice(-8).map(e=>({id:e._id,type:e.type,at:e.at}));
          const evidence=[...previous,{id:event._id,type:event.type,at:event.at,category:signal.category,...signal.facts}];
          const incident=await tx.maritimeIncident.create({data:{tripId:trip.id,caseAlias:"case_"+digest(trip.id).slice(0,12),category:signal.category,episodeKey:signal.key,context:signal.context,facts:signal.facts,evidence,audit:[audit("detected")],createdAt:new Date(now)}});
          await tx.maritimeJob.create({data:{incidentId:incident.id,caseVersion:trip.version,evidence,nextAttemptAt:new Date(now)}});
        }
        for(const incident of existing.filter(row=>!closed.includes(row.status))){
          const signal=detected.find(row=>row.key===incident.episodeKey);
          if(signal)continue;
          changed=true;
          const resolved=trip.status!=="cancelled" && (!terminal(trip.status)||trip.status==="handed_off");
          await tx.maritimeIncident.update({where:{id:incident.id},data:{status:resolved?"resolved":"superseded",resolvedAt:new Date(now),audit:[...incident.audit,audit(resolved?"resolved":"superseded")]}});
          await tx.maritimeJob.updateMany({where:{incidentId:incident.id,kind:"recovery",status:{in:["pending","running"]}},data:{status:"superseded",leaseToken:null,leaseUntil:null}});
        }
        // Selected post-incident analysis is durable and limited to cases with detected incidents.
        if(trip.status==="handed_off")for(const incident of existing){
          const handoff=trip.events.findLast(e=>e.type==="status:handed_off");
          if(!handoff)continue;
          const recent=trip.events.filter(e=>isEvidenceType(e.type)&&Date.parse(e.at)>=incident.createdAt.getTime()).slice(-10).map(e=>({id:e._id,type:e.type,at:e.at}));
          const evidence=[...new Map([...incident.evidence,...recent,{id:handoff._id,type:handoff.type,at:handoff.at}].map(e=>[e.id,e])).values()];
          changed=true;
          await tx.maritimeJob.upsert({where:{incidentId_kind:{incidentId:incident.id,kind:"post_incident"}},update:{},create:{incidentId:incident.id,kind:"post_incident",caseVersion:trip.version,evidence,nextAttemptAt:new Date(now)}});
        }
        return changed;
      });
      if(changed)notify(io,candidate.id);
    }
    if(trips.length<50)break;cursor=trips.at(-1).id;
  }
}

async function claim(cfg,now=Date.now()){
  if(!cfg.enabled||!cfg.apiKey||!cfg.agentId)return null;
  return db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('sahay-rescue-request-budget'))`;
    const runtime=await tx.maritimeRuntime.upsert({where:{id:"default"},update:{},create:{id:"default"}});
    if(runtime.openUntil && runtime.openUntil.getTime()>now)return null;
    const recent=runtime.requests.filter(at=>now-new Date(at).getTime()<60000);
    if(recent.length>=cfg.rpm)return null;
    // Prisma timestamps are stored in UTC without a zone; raw comparisons must use UTC too.
    const jobs=await tx.$queryRaw`SELECT id FROM "MaritimeJob" WHERE (status='pending' AND "nextAttemptAt" <= (${new Date(now)}::timestamptz AT TIME ZONE 'UTC')) OR (status='running' AND "leaseUntil" <= (${new Date(now)}::timestamptz AT TIME ZONE 'UTC')) ORDER BY "nextAttemptAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if(!jobs.length)return null;
    let job=await tx.maritimeJob.findUnique({where:{id:jobs[0].id},include:{incident:{include:{trip:{include}}}}});
    const {incident}=job,trip=incident.trip;
    const signal=signals(trip,cfg,now).find(row=>row.key===incident.episodeKey);
    if(!synthetic(trip) || job.kind==="recovery"&&(!signal||signal.context!==incident.context||closed.includes(incident.status)) || job.kind==="post_incident"&&trip.status!=="handed_off"){
      await tx.maritimeJob.update({where:{id:job.id},data:{status:"superseded",leaseToken:null,leaseUntil:null}});return null;
    }
    if(job.attempts>=cfg.maxAttempts){
      await tx.maritimeJob.update({where:{id:job.id},data:{status:"failed",leaseToken:null,leaseUntil:null,lastError:"attempt_limit"}});
      if(job.kind==="recovery")await tx.maritimeIncident.updateMany({where:{id:incident.id,status:{notIn:closed}},data:{status:"failed"}});
      return null;
    }
    const held=await tx.maritimeJob.updateMany({where:{id:job.id,OR:[{status:"pending",nextAttemptAt:{lte:new Date(now)}},{status:"running",leaseUntil:{lte:new Date(now)}}]},data:{status:"running",caseVersion:trip.version,attempts:{increment:1},leaseToken:randomUUID(),leaseUntil:new Date(now+cfg.timeoutMs+10000),startedAt:new Date(now)}});
    if(!held.count)return null;
    job=await tx.maritimeJob.findUnique({where:{id:job.id}});
    await tx.maritimeRuntime.update({where:{id:"default"},data:{requests:[...recent,new Date(now).toISOString()]}});
    if(job.kind==="recovery")await tx.maritimeIncident.update({where:{id:incident.id},data:{status:"investigating"}});
    return {job,incident,request:envelope(incident,job,trip)};
  });
}

async function processOne(cfg=config(),io,fetchImpl=fetch,now=Date.now()){
  const claimed=await claim(cfg,now);if(!claimed)return false;
  const {job,incident,request}=claimed;
  try{
    const response=validate(await chat(request,cfg,fetchImpl),request);
    await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Trip" WHERE id=${incident.tripId} FOR UPDATE`;
      const current=await tx.maritimeJob.findUnique({where:{id:job.id}});
      if(current.status!=="running"||current.leaseToken!==job.leaseToken||current.leaseUntil<Date.now())return;
      const trip=await tx.trip.findUnique({where:{id:incident.tripId},include});
      const signal=signals(trip,cfg).find(row=>row.key===incident.episodeKey);
      const stale=job.kind==="recovery" ? !signal||signal.context!==incident.context : trip.status!=="handed_off";
      if(stale){await tx.maritimeJob.update({where:{id:job.id},data:{status:"superseded",leaseToken:null,leaseUntil:null}});return;}
      await tx.maritimeAdvisory.create({data:{jobId:job.id,response,source:new URL(cfg.base).hostname==="127.0.0.1"||new URL(cfg.base).hostname==="localhost"?"mock_maritime":"maritime"}});
      await tx.maritimeJob.update({where:{id:job.id},data:{status:"done",completedAt:new Date(),leaseToken:null,leaseUntil:null,lastError:null}});
      if(job.kind==="recovery")await tx.maritimeIncident.updateMany({where:{id:incident.id,status:{notIn:closed}},data:{status:"admin_review_required",audit:[...incident.audit,audit("recommendation_ready"),audit("admin_review_required")]}});
    });
    await connectivity("healthy",null);
  }catch(error){
    const wait=Math.max(error.retryMs||0,Math.min(60000,1000*2**(job.attempts-1)));
    const failed=error.permanent||job.attempts>=cfg.maxAttempts;
    const changed=await db.maritimeJob.updateMany({where:{id:job.id,leaseToken:job.leaseToken,status:"running"},data:{status:failed?"failed":"pending",lastError:error.code||"invalid_response",nextAttemptAt:new Date(Date.now()+wait),leaseToken:null,leaseUntil:null}});
    if(changed.count&&failed&&job.kind==="recovery")await db.maritimeIncident.updateMany({where:{id:incident.id,status:{notIn:closed}},data:{status:"failed"}});
    await connectivity("degraded",error.code||"invalid_response",wait,error.permanent);
  }
  notify(io,incident.tripId);return true;
}
async function connectivity(status,reason,retryMs=0,permanent=false){
  await db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('sahay-rescue-request-budget'))`;
    const row=await tx.maritimeRuntime.findUnique({where:{id:"default"}});
    const failures=status==="healthy"?0:row.failures+1;
    const delay=permanent?300000:Math.max(reason==="http_429"?retryMs:0,failures>=3?30000:0);
    await tx.maritimeRuntime.update({where:{id:"default"},data:{status,reason,failures,checkedAt:new Date(),openUntil:delay?new Date(Date.now()+delay):null}});
  });
}
async function status(cfg=config()){
  if(!cfg.enabled)return {status:"disabled",simulationOnly:true};
  const missing=[!cfg.apiKey&&"MARITIME_API_KEY",!cfg.agentId&&"MARITIME_AGENT_ID"].filter(Boolean);
  if(missing.length)return {status:"unavailable",missing,simulationOnly:true};
  const row=await db.maritimeRuntime.findUnique({where:{id:"default"}});
  return {status:row?.status||"not_checked",reason:row?.reason,checkedAt:row?.checkedAt,retryAt:row?.openUntil,source:/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(cfg.base)?"mock_maritime":"maritime",simulationOnly:true};
}
function startWorker(io){
  let cfg;try{cfg=config();}catch{console.error("[rescue] Invalid configuration; worker not started");return;}
  if(!cfg.enabled)return;
  let busy=false;
  const tick=async()=>{if(busy)return;busy=true;try{await scan(cfg,io);await processOne(cfg,io);}catch{console.error("[rescue] Worker pass failed; durable jobs retained");}finally{busy=false;}};
  const timer=setInterval(tick,cfg.pollMs);timer.unref();tick();return()=>clearInterval(timer);
}
module.exports={scan,claim,processOne,status,startWorker,include,synthetic,notify};

const http=require("node:http");
const fs=require("node:fs");
const path=require("node:path");
const {validate,validateRequest}=require("../../backend/src/integrations/maritime/contract");
const instructions=fs.readFileSync(path.join(__dirname,"instructions.md"),"utf8");
function createServer(env=process.env,fetchImpl=fetch){
 return http.createServer(async(req,res)=>{
  const json=(status,body)=>{res.writeHead(status,{"Content-Type":"application/json"});res.end(JSON.stringify(body));};
  const ready=!!(env.OPENAI_BASE_URL&&env.OPENAI_API_KEY&&env.RESCUE_MODEL);
  if(req.method==="GET"&&req.url==="/health")return json(ready?200:503,{status:ready?"ready":"model_configuration_missing",agent:"Sahay RESCUE",policyVersion:1});
  if(req.method!=="POST"||req.url!=="/chat")return json(404,{error:"not_found"});
  if(!ready)return json(503,{error:"model_configuration_missing"});
  try{
   const chunks=[];let length=0;
   for await(const chunk of req){length+=chunk.length;if(length>65536)return json(413,{error:"body_too_large"});chunks.push(chunk);}
   const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));
   const request=validateRequest(JSON.parse(body.message));
   const response=await fetchImpl(env.OPENAI_BASE_URL.replace(/\/$/,"")+"/chat/completions",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+env.OPENAI_API_KEY},signal:AbortSignal.timeout(20000),
    body:JSON.stringify({model:env.RESCUE_MODEL,messages:[{role:"system",content:instructions+"\nCurrent time: "+new Date().toISOString()},{role:"user",content:JSON.stringify(request)}]}),redirect:"error",
   });
   if(!response.ok)return json(response.status===429?429:503,{error:"model_unavailable"});
   const result=await response.json();
   const answer=validate(JSON.parse(result.choices?.[0]?.message?.content),request);
   json(200,{response:JSON.stringify(answer)});
  }catch(error){json(error.code==="invalid_evidence"?400:502,{error:error.code==="invalid_evidence"?"invalid_evidence":"invalid_or_unavailable_model_reply"});}
 });
}
if(require.main===module){
 const port=Number(process.env.PORT);if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Maritime-injected PORT is required");
 createServer().listen(port,"0.0.0.0",()=>console.log("Sahay RESCUE container ready"));
}
module.exports={createServer};

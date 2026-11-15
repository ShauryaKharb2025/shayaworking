function retryAfter(value, now = Date.now()) {
  if (!value) return 0;
  const seconds = Number(value);
  return Math.max(0,Number.isFinite(seconds) ? seconds*1000 : Date.parse(value)-now) || 0;
}
async function chat(request, cfg, fetchImpl = fetch) {
  require("./contract").validateRequest(request);
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),cfg.timeoutMs);
  try {
    const response = await fetchImpl(`${cfg.base}/api/agents/${encodeURIComponent(cfg.agentId)}/chat`,{
      method:"POST",headers:{Authorization:`Bearer ${cfg.apiKey}`,"Content-Type":"application/json"},
      body:JSON.stringify({message:JSON.stringify(request)}),signal:controller.signal,redirect:"error",
    });
    if (!response.ok) throw Object.assign(new Error("Maritime request failed"),{code:"http_"+response.status,retryMs:retryAfter(response.headers.get("retry-after")),permanent:[400,401,402,403,404].includes(response.status)});
    const reader=response.body.getReader();let size=0;const chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw new Error("Oversized reply");}chunks.push(Buffer.from(value));}
    const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof body.response!=="string") throw new Error("Missing chat response");
    return JSON.parse(body.response);
  } catch(error) {
    if(typeof error.code==="string"&&/^http_\d+$/.test(error.code))throw error;
    throw Object.assign(new Error("Maritime reply unavailable"),{code:controller.signal.aborted?"timeout":"invalid_or_unavailable"});
  } finally {clearTimeout(timer);}
}
module.exports = { chat, retryAfter };

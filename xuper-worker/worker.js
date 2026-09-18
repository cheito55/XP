/*
 * XuperTv Bridge Worker v10
 *
 * Uses the documented/observed PortalCore HTTP flow:
 *   v3/snToken (device bootstrap, when available)
 *   v8/login / v8/active
 *   v3/searchByName / v3/searchByContent
 *   getHome
 *   v10/startPlayVOD
 *   v15/getSlbInfo
 *
 * IMPORTANT: this bridge does not fabricate or extract account credentials.
 * Supply an authorized Xuper session through request headers/body or use
 * /api/login with the account credentials authorized by the service.
 */

const PKG = "com.android.msandroid";
const VER = "49902";
const UA = "Ranger/4.9.4-17294ac0";
const CRYPTO = { aesKey: "b972E8a5A4e0e8Ff", aesIv: "2c6b361ee550e80c" };
const CUSTOM_B64 = "jWB7YtC3n9iXbEkUcJl1VxF4STpQoOIaRmh2M-efAgLwPqGr6uyD5vNsdH_Kz0Z8";
const API_DOMAINS = ["ftmrmy.jdfey0cd.com", "eskna.ucpjdhivl.com", "sydrgt.a878kkoyc.com"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Xuper-User-Id, X-Xuper-Token, X-Xuper-Portal, X-Xuper-Dev-Id"
};

let LAST_DOMAIN = API_DOMAINS[0];

function json(d, s) { return new Response(JSON.stringify(d), { status: s || 200, headers: { "Content-Type": "application/json", ...CORS } }); }
function err(m, s) { return json({ ok: false, error: m }, s || 400); }
function text(v) { return v == null ? "" : String(v); }
function first(obj, keys, def) { for (let i=0;i<keys.length;i++) if (obj && obj[keys[i]] != null && text(obj[keys[i]]) !== "") return obj[keys[i]]; return def; }

function pkcs5Pad(data) {
  const n = 16 - (data.length % 16), out = new Uint8Array(data.length+n);
  out.set(data); for (let i=data.length;i<out.length;i++) out[i]=n; return out;
}
function pkcs5Unpad(data) {
  if (!data || !data.length) return data;
  const n=data[data.length-1]; if (n<1 || n>16 || n>data.length) return data;
  return data.slice(0,data.length-n);
}
async function aesEncrypt(plain) {
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(CRYPTO.aesKey),{name:"AES-CBC"},false,["encrypt"]);
  const iv=new TextEncoder().encode(CRYPTO.aesIv);
  const x=await crypto.subtle.encrypt({name:"AES-CBC",iv:iv},key,pkcs5Pad(new TextEncoder().encode(plain)));
  return new Uint8Array(x);
}
function b64enc(bytes) {
  let s=""; for(let i=0;i<bytes.length;i++) s+=String.fromCharCode(bytes[i]);
  const std=btoa(s), abc="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let r=""; for(let i=0;i<std.length;i++){const k=abc.indexOf(std[i]);r+=k<0?std[i]:CUSTOM_B64[k];} return r;
}
async function encryptBody(o){return b64enc(await aesEncrypt(JSON.stringify(o)));}

async function api(path, body, domain) {
  const host=domain || LAST_DOMAIN || API_DOMAINS[0];
  try {
    const r=await fetch("https://"+host+path,{method:"POST",redirect:"follow",headers:{"Content-Type":"application/json","User-Agent":UA,"Accept":"application/json"},body:JSON.stringify({data:await encryptBody(body)})});
    const t=await r.text();
    let d=null; try{d=JSON.parse(t);}catch(e){return {ok:false,status:r.status,error:"Non-JSON response",raw:t.slice(0,300)}}
    return {ok:r.ok || !!d,status:r.status,data:d};
  } catch(e){return {ok:false,error:e.message};}
}
async function apiFallback(path, body) {
  const order=[LAST_DOMAIN].concat(API_DOMAINS.filter(x=>x!==LAST_DOMAIN));
  let last=null;
  for(let i=0;i<order.length;i++){
    const r=await api(path,body,order[i]); last=r;
    if(r.ok && r.data){LAST_DOMAIN=order[i]; return r;}
  }
  return last || {ok:false,error:"No API domain available"};
}

function sessionFrom(req, body) {
  body=body||{};
  const auth=req.headers.get("Authorization") || "";
  let bearer=auth.indexOf("Bearer ")===0 ? auth.slice(7).trim() : "";
  return {
    userId:text(body.userId || req.headers.get("X-Xuper-User-Id")),
    userToken:text(body.userToken || req.headers.get("X-Xuper-Token") || bearer),
    portalCode:text(body.portalCode || req.headers.get("X-Xuper-Portal")),
    devId:text(body.devId || req.headers.get("X-Xuper-Dev-Id")),
    apiDomain:text(body.apiDomain || "")
  };
}
function requireSession(s){return !!(s.userId && s.userToken && s.portalCode);}
function authBody(s, extra){return Object.assign({userToken:s.userToken,userId:s.userId,portalCode:s.portalCode},extra||{});}

async function login(body){
  if(!body || !body.email || !body.password) return err("Email y password requeridos");
  const b={email:body.email,password:body.password,pkg:PKG,version:VER,sn:body.devId||"",channel:"googleplay",language:"es"};
  const r=await apiFallback("/api/portalCore/v8/login",b);
  if(!r.ok) return err(r.error||"Login failed",502);
  const d=r.data||{}, x=d.data||d;
  const s={userId:text(first(x,["userId","user_id"],"")),userToken:text(first(x,["userToken","user_token","token"],"")),portalCode:text(first(x,["portalCode","portal_code"],"")),devId:body.devId||"",apiDomain:LAST_DOMAIN};
  if(!s.userId || !s.userToken || !s.portalCode) return json({ok:false,error:"Login response did not contain a complete session",session:s,response:d},502);
  return json({ok:true,session:s,response:d});
}

async function snToken(body){
  const s=body||{};
  const b={androidId:s.androidId||s.devId||"",appId:PKG,pkg:PKG,appVer:VER,version:VER,language:s.language||"es",channel:s.channel||"googleplay"};
  const r=await apiFallback("/api/portalCore/v3/snToken",b);
  return r.ok ? json({ok:true,response:r.data}) : err(r.error||"snToken failed",502);
}
async function active(body, req){
  const s=sessionFrom(req,body);
  if(!s.userId || !s.devId) return err("userId y devId requeridos");
  const b=authBody(s,{devId:s.devId,pkg:PKG,version:VER,snToken:body.snToken||body.userToken||s.userToken});
  const r=await apiFallback("/api/portalCore/v8/active",b);
  return r.ok?json({ok:true,response:r.data}):err(r.error||"Active failed",502);
}

function normalizeList(data){
  const root=data&&data.data?data.data:data||{};
  let a=[];
  const candidates=[root.assetList,root.contentList,root.vodList,root.list,root.result,root.recommendList,root.channelList,root.channels,root.vod];
  for(let i=0;i<candidates.length;i++) if(Array.isArray(candidates[i])) a=a.concat(candidates[i]);
  const out=[];
  for(let i=0;i<a.length;i++){
    const v=a[i]||{};
    const id=text(first(v,["mediaCode","media_code","contentId","content_id","assetId","asset_id","id","channelCode","channel_code"],""));
    const title=text(first(v,["title","name","vodName","assetName","contentName","channelName"],id));
    if(!id && !title) continue;
    const live=!!(v.channelCode||v.channel_code||v.isLive===true||v.type==="live");
    out.push({contentId:id,title:title,type:live?"live":"vod",isLive:live,mediaCode:id,posterUrl:text(first(v,["posterUrl","picUrl","logoUrl","poster","imageUrl","assetPic"],"")),year:text(v.year||""),description:text(v.description||v.overview||"")});
  }
  return out;
}
async function home(req){
  const s=sessionFrom(req,{});
  if(!requireSession(s)) return err("NO_SESSION: configure userId, userToken y portalCode",401);
  const r=await apiFallback("/api/portalCore/getHome",authBody(s,{homePageCode:"home",version:VER,freeVodCode:"free_vod",freeVersion:VER}));
  if(!r.ok) return err(r.error||"getHome failed",502);
  return json({ok:true,data:normalizeList(r.data),raw:r.data});
}
async function search(req, body){
  const s=sessionFrom(req,body);
  if(!requireSession(s)) return err("NO_SESSION: configure userId, userToken y portalCode",401);
  const q=text(body.q||body.query||body.value).trim(); if(!q) return json({ok:true,data:[]});
  const b=authBody(s,{columnId:body.columnId||"",value:q,type:body.type||"",pageSize:body.pageSize||30,pageNum:body.pageNum||1,filter:body.filter||""});
  const r=await apiFallback("/api/portalCore/v3/searchByName",b);
  if(!r.ok) return err(r.error||"search failed",502);
  return json({ok:true,data:normalizeList(r.data),raw:r.data});
}
async function content(req,body){
  const s=sessionFrom(req,body); if(!requireSession(s)) return err("NO_SESSION",401);
  const id=body.contentId||body.mediaCode||body.id||"";
  const r=await apiFallback("/api/portalCore/blSearchByContent",authBody(s,{contentId:id,mediaCode:id}));
  return r.ok?json({ok:true,data:normalizeList(r.data),raw:r.data}):err(r.error||"content lookup failed",502);
}

function collectUrls(x,out,depth){
  if(depth>8 || x==null) return; if(typeof x==="string"){if(/^https?:\/\//i.test(x) && (x.indexOf("m3u8")>=0||x.indexOf("/vod/")>=0||x.indexOf("/live/")>=0||x.indexOf(".mp4")>=0||x.indexOf(".ts")>=0)) out.push(x);return;}
  if(Array.isArray(x)){for(let i=0;i<x.length;i++)collectUrls(x[i],out,depth+1);return;}
  if(typeof x==="object"){for(const k in x) if(Object.prototype.hasOwnProperty.call(x,k)) collectUrls(x[k],out,depth+1);}
}
function findFirst(x,keys,depth){if(depth>8||x==null)return "";if(typeof x!=="object")return "";for(let i=0;i<keys.length;i++)if(x[keys[i]]!=null&&text(x[keys[i]]))return text(x[keys[i]]);if(Array.isArray(x)){for(let j=0;j<x.length;j++){const z=findFirst(x[j],keys,depth+1);if(z)return z;}}else{for(const k in x){const z=findFirst(x[k],keys,depth+1);if(z)return z;}}return "";}
async function startPlay(req,body){
  const s=sessionFrom(req,body); if(!requireSession(s)) return err("NO_SESSION",401);
  const mediaCode=text(body.mediaCode||body.id); if(!mediaCode) return err("mediaCode requerido");
  const b=authBody(s,{mediaCode:mediaCode,type:body.type||"vod",pkg:PKG,version:VER});
  const r=await apiFallback("/api/portalCore/v10/startPlayVOD",b);
  if(!r.ok) return err(r.error||"startPlayVOD failed",502);
  const raw=r.data, urls=[]; collectUrls(raw,urls,0);
  return json({ok:true,data:{streamUrl:urls.length?urls[0]:"",urls:Array.from(new Set(urls)),raw:raw},source:"xuper-v10"});
}
async function slb(req,body){
  const s=sessionFrom(req,body); if(!requireSession(s)) return err("NO_SESSION",401);
  const mediaCode=text(body.mediaCode||body.id); if(!mediaCode)return err("mediaCode requerido");
  const b=authBody(s,{mediaCode:mediaCode,pkg:PKG,version:VER,appVer:VER,lang:"es",encMediaSupported:true,hasPay:false,pipFlag:false});
  const r=await apiFallback("/api/portalCore/v15/getSlbInfo",b);
  if(!r.ok) return err(r.error||"getSlbInfo failed",502);
  const urls=[]; collectUrls(r.data,urls,0);
  return json({ok:true,data:{urls:Array.from(new Set(urls)),mainAddr:findFirst(r.data,["main_slb_addr","main_addr"],0),sparedAddr:findFirst(r.data,["spared_slb_addr","spared_addr"],0),raw:r.data}});
}
async function stream(req,body){
  const a=await startPlay(req,body); const d=await a.json();
  if(!d.ok)return json(d,401);
  if(d.data && (d.data.streamUrl || (d.data.urls&&d.data.urls.length))) return json({ok:true,data:{streamUrl:d.data.streamUrl||d.data.urls[0],urls:d.data.urls||[],headers:{"User-Agent":UA}},source:d.source});
  const b=await slb(req,body); const s=await b.json();
  if(s.ok && s.data.urls && s.data.urls.length)return json({ok:true,data:{streamUrl:s.data.urls[0],urls:s.data.urls,headers:{"User-Agent":UA}},source:"xuper-v15"});
  return err("Xuper no devolvio una URL de reproduccion",502);
}

async function live(req,body){
  const s=sessionFrom(req,body); if(!requireSession(s)) return err("NO_SESSION",401);
  const channelCode=text(body.channelCode||body.mediaCode||body.id); if(!channelCode)return err("channelCode requerido");
  const b=authBody(s,{channelCode:channelCode,version:VER,pkg:PKG,appVer:VER});
  const r=await apiFallback("/api/portalCore/v5/getLiveData",b);
  if(!r.ok)return err(r.error||"getLiveData failed",502);
  const urls=[]; collectUrls(r.data,urls,0);
  return json({ok:true,data:{streamUrl:urls.length?urls[0]:"",urls:Array.from(new Set(urls)),raw:r.data},source:"xuper-live"});
}
async function tmdb(req,env){
  const key=(env&&env.TMDB_KEY)||""; const q=new URL(req.url).searchParams.get("q")||"";
  if(!key)return err("TMDB_KEY no configurada",503); if(!q)return json({ok:true,results:[]});
  const r=await fetch("https://api.themoviedb.org/3/search/multi?api_key="+encodeURIComponent(key)+"&query="+encodeURIComponent(q)+"&language=es-MX&page=1&include_adult=false");
  const d=await r.json(); return json({ok:true,results:d.results||[]});
}

export default { async fetch(req,env){
  const u=new URL(req.url), p=u.pathname, m=req.method;
  if(m==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  try{
    if(p==="/"||p==="/health")return json({ok:true,version:"11.0",apiDomains:API_DOMAINS,lastDomain:LAST_DOMAIN,endpoints:["/api/login","/api/snToken","/api/active","/api/home","/api/search","/api/content","/api/play","/api/slb","/api/stream","/api/tmdb"]});
    if(p==="/api/login"&&m==="POST")return login(await req.json());
    if(p==="/api/snToken"&&m==="POST")return snToken(await req.json());
    if(p==="/api/active"&&m==="POST")return active(await req.json(),req);
    if(p==="/api/home")return home(req);
    if(p==="/api/search"&&m==="POST")return search(req,await req.json());
    if(p==="/api/content"&&m==="POST")return content(req,await req.json());
    if(p==="/api/play"&&m==="POST")return startPlay(req,await req.json());
    if(p==="/api/live"&&m==="POST")return live(req,await req.json());
    if(p==="/api/slb"&&m==="POST")return slb(req,await req.json());
    if(p==="/api/stream"&&m==="POST")return stream(req,await req.json());
    if(p==="/api/tmdb")return tmdb(req,env);
    return err("Endpoint no encontrado",404);
  }catch(e){return err("Error: "+e.message,500);}
} };

/* GrayJay XuperTv v91 - Xuper HTTP catalog + authorized session + VOD */
var PLATFORM="XuperTv";
var DEFAULT_WORKER="https://xuper-bridge.cheito55.workers.dev";
var TMDB_IMG="https://image.tmdb.org/t/p";
var _conf={};
var _workerUrl=DEFAULT_WORKER;

function bodyJson(r){try{return r&&r.isOk&&r.body?JSON.parse(r.body):null;}catch(e){return null;}}
function worker(){return (_conf.settings&&_conf.settings.worker_url?String(_conf.settings.worker_url):_workerUrl).replace(/\/+$/g,"").trim();}
function setting(k){return _conf&&_conf.settings&&_conf.settings[k]?String(_conf.settings[k]).trim():"";}
var _session={userId:"",userToken:"",portalCode:"",devId:""};
var _loginTried=false;

function sessionHeaders(){
  var h={"Content-Type":"application/json"};
  var uid=setting("user_id")||_session.userId;
  var tok=setting("user_token")||_session.userToken;
  var portal=setting("portal_code")||_session.portalCode;
  var dev=setting("dev_id")||_session.devId;
  if(uid)h["X-Xuper-User-Id"]=uid;
  if(tok)h["X-Xuper-Token"]=tok;
  if(portal)h["X-Xuper-Portal"]=portal;
  if(dev)h["X-Xuper-Dev-Id"]=dev;
  return h;
}
function cacheSession(d){
  if(!d)return false;
  var x=d.session||d.data||d;
  var uid=String(x.userId||x.user_id||"");
  var tok=String(x.userToken||x.user_token||x.token||"");
  var portal=String(x.portalCode||x.portal_code||"");
  var dev=String(x.devId||x.dev_id||setting("dev_id")||"");
  if(uid)_session.userId=uid;
  if(tok)_session.userToken=tok;
  if(portal)_session.portalCode=portal;
  if(dev)_session.devId=dev;
  return !!(_session.userId&&_session.userToken&&_session.portalCode);
}
function doLogin(){
  var email=setting("email");
  var password=setting("password");
  if(!email||!password||_loginTried)return false;
  _loginTried=true;
  try{
    var r=http.POST(worker()+"/api/login",JSON.stringify({email:email,password:password,devId:setting("dev_id")}),{"Content-Type":"application/json"});
    var d=bodyJson(r);
    return !!(d&&d.ok&&cacheSession(d));
  }catch(e){return false;}
}
function ensureSession(){
  if(setting("user_id")&&setting("user_token")&&setting("portal_code"))return true;
  if(_session.userId&&_session.userToken&&_session.portalCode)return true;
  return doLogin();
}
function post(path,obj){try{return http.POST(worker()+path,JSON.stringify(obj||{}),sessionHeaders());}catch(e){return null;}}

function get(path){try{return http.GET(worker()+path,{});}catch(e){return null;}}
function thumb(url){return url?new Thumbnails([new Thumbnail(url,500)]):new Thumbnails([]);}
function author(){return new PlatformAuthorLink(new PlatformID(PLATFORM,"XuperTv",_conf.id),"XuperTv","");}
function videoFrom(x){
  var id=String(x.mediaCode||x.contentId||x.id||""); if(!id)return null;
  var live=!!x.isLive; var title=String(x.title||x.name||id);
  return new PlatformVideo({id:new PlatformID(PLATFORM,id,_conf.id),name:title,thumbnails:thumb(x.posterUrl||x.logoUrl||""),author:author(),uploadDate:0,duration:0,viewCount:0,url:"xuper://"+(live?"live":"vod")+"?id="+encodeURIComponent(id),isLive:live});
}
function pager(arr){return new VideoPager(arr||[],false,null);}
function workerItems(path,obj){
  ensureSession();
  var r=post(path,obj||{}),d=bodyJson(r);
  if(d&&d.ok&&Array.isArray(d.data))return d.data;
  if(d&&d.error&&String(d.error).indexOf("NO_SESSION")>=0){_session={userId:"",userToken:"",portalCode:"",devId:""};_loginTried=false;if(ensureSession()){r=post(path,obj||{});d=bodyJson(r);}}
  return d&&d.ok&&Array.isArray(d.data)?d.data:[];
}
function tmdbRequest(path){
  var key=setting("tmdb_api_key"); if(!key)return null;
  try{var r=http.GET("https://api.themoviedb.org/3"+path+(path.indexOf("?")>=0?"&":"?")+"api_key="+encodeURIComponent(key),{});return r&&r.isOk&&r.body?JSON.parse(r.body):null;}catch(e){return null;}
}
function enrich(v){
  if(!v)return null;
  var t=videoFrom(v); if(t)return t; return null;
}

source.enable=function(c){_conf=c||{};};
source.getSettings=function(){return [
  {key:"worker_url",label:"Worker URL",type:"text",defaultValue:DEFAULT_WORKER},
  {key:"user_id",label:"Xuper User ID",type:"text",defaultValue:""},
  {key:"user_token",label:"Xuper User Token",type:"text",defaultValue:""},
  {key:"portal_code",label:"Xuper Portal Code",type:"text",defaultValue:""},
  {key:"dev_id",label:"Xuper Device ID",type:"text",defaultValue:""},
  {key:"email",label:"Xuper Account Email",type:"text",defaultValue:""},
  {key:"password",label:"Xuper Account Password",type:"text",defaultValue:""},
  {key:"tmdb_api_key",label:"TMDB API Key",type:"text",defaultValue:""}
];};
source.setSettings=function(s){if(s&&s.worker_url)_workerUrl=String(s.worker_url).replace(/\/+$/g,"");};
source.getSearchCapabilities=function(){return {types:[Type.Feed.Mixed],sorts:[],filters:[]};};
source.isChannelUrl=function(){return false;};
source.isContentDetailsUrl=function(u){return /^xuper:\/\//i.test(String(u||""));};
source.isVideoDetailsUrl=source.isContentDetailsUrl;

source.search=function(q,type,order,filters,continuationToken){
  var a=workerItems("/api/search",{q:String(q||""),pageNum:1,pageSize:40});
  var out=[],i;
  for(i=0;i<a.length;i++){var v=enrich(a[i]);if(v)out.push(v);}
  return pager(out);
};
source.searchSuggestions=function(q){
  var a=workerItems("/api/search",{q:String(q||""),pageNum:1,pageSize:10}),o=[];
  for(var i=0;i<a.length&&i<5;i++)o.push(String(a[i].title||a[i].name||""));
  return o;
};
source.getHome=function(){
  var a=workerItems("/api/home",{}),o=[];
  for(var i=0;i<a.length;i++){var v=enrich(a[i]);if(v)o.push(v);}
  return pager(o);
};

source.getContentDetails=function(url){
  ensureSession();
  var s=String(url||""),m=s.match(/^xuper:\/\/(live|vod)\?id=([^&]+)/i);
  if(!m)return null;
  var live=m[1].toLowerCase()==="live",id=decodeURIComponent(m[2]);
  var r=post(live?"/api/live":"/api/stream",{mediaCode:id,id:id});
  var d=bodyJson(r),urls=[];
  if(d&&d.ok&&d.data){if(d.data.streamUrl)urls.push(d.data.streamUrl);if(Array.isArray(d.data.urls))for(var i=0;i<d.data.urls.length;i++)if(urls.indexOf(d.data.urls[i])<0)urls.push(d.data.urls[i]);}
  var src=[],j;
  for(j=0;j<urls.length;j++)src.push(new VideoUrlSource({url:urls[j],width:1920,height:1080,container:/\.m3u8/i.test(urls[j])?"application/x-mpegURL":"video/mp2t",codec:"H.264"}));
  return new PlatformVideoDetails({id:new PlatformID(PLATFORM,id,_conf.id),name:id,thumbnails:new Thumbnails([]),author:author(),uploadDate:0,duration:0,viewCount:0,url:s,isLive:live,description:"XuperTv",video:new VideoSourceDescriptor(src),live:null,rating:new RatingLikes(0),subtitles:[]});
};
source.getChannelContents=function(){return pager([]);};
source.searchChannels=function(){return pager([]);};
source.getChannel=function(){return new PlatformChannel({id:new PlatformID(PLATFORM,"XuperTv",_conf.id),name:"XuperTv",thumbnails:new Thumbnails([]),url:"",subscriberCount:0});};
source.getDiagnostics=function(){var r=get("/health"),d=bodyJson(r);return {platform:PLATFORM,version:91,workerOnline:!!(d&&d.ok),sessionConfigured:!!((setting("user_id")&&setting("user_token")&&setting("portal_code"))||(setting("email")&&setting("password"))),worker:d||null};};

const DEFAULT_CAMPAIGNS=[];
const EMPTY_RECORDER={active:false,sessionId:null,sessionName:"",startedAt:null,targetUrl:"",eventCount:0};
const JOURNEY_ENGINE_VERSION=2;

chrome.runtime.onInstalled.addListener(async()=>{
  const d=await chrome.storage.local.get(["campaigns","xpTotal","activityLog","awards","recorderState","recordedTriggers","journeys","journeyProgress","journeyEngineVersion"]),s={};
  if(!Array.isArray(d.campaigns))s.campaigns=DEFAULT_CAMPAIGNS;
  if(typeof d.xpTotal!=="number")s.xpTotal=0;
  if(!Array.isArray(d.activityLog))s.activityLog=[];
  if(!d.awards||typeof d.awards!=="object")s.awards={};
  if(!d.recorderState)s.recorderState=EMPTY_RECORDER;
  if(!Array.isArray(d.recordedTriggers))s.recordedTriggers=[];
  if(!Array.isArray(d.journeys))s.journeys=[];
  if(!d.journeyProgress)s.journeyProgress={};
  if(d.journeyEngineVersion!==JOURNEY_ENGINE_VERSION){s.journeyEngineVersion=JOURNEY_ENGINE_VERSION;s.journeyProgress={};}
  if(Object.keys(s).length)await chrome.storage.local.set(s);
});

function key(c){if(c.frequency==="repeat")return null;if(c.frequency==="daily")return`${c.id}:${new Date().toISOString().slice(0,10)}`;return c.id}
async function award(c,url,detail){
  const d=await chrome.storage.local.get(["xpTotal","activityLog","awards"]),a=d.awards||{},k=key(c);
  if(k&&a[k])return{ok:true,awarded:false,total:d.xpTotal||0};
  const xp=Math.max(0,Number(c.xp||0)),total=(d.xpTotal||0)+xp;
  if(k)a[k]={at:Date.now(),url};
  const entry={id:crypto.randomUUID(),campaignId:c.id,campaignName:c.name,xp,trigger:c.trigger,url,detail,at:Date.now()},log=[entry,...(d.activityLog||[])].slice(0,100);
  await chrome.storage.local.set({xpTotal:total,activityLog:log,awards:a});
  return{ok:true,awarded:true,xp,total,entry};
}
function unwrap(u){try{const x=new URL(u);if(/(^|\.)isolation\.zscaler\.com$/i.test(x.hostname)){const raw=x.searchParams.get("original_url");if(raw){try{return decodeURIComponent(raw)}catch{return raw}}}return u}catch{return u||""}}
function norm(u){try{const x=new URL(unwrap(u));return x.origin+x.pathname.replace(/\/$/,"")+x.hash}catch{return String(u||"")}}
function pathOnly(u){try{const x=new URL(unwrap(u));return x.origin+x.pathname.replace(/\/$/,"")}catch{return String(u||"")}}
function base(u){return pathOnly(u)}
function sameUrl(a,b){a=base(a);b=base(b);return !a||!b||a===b||b.startsWith(a)||a.startsWith(b)}
function canonText(v){return String(v||"").replace(/\s+/g," ").trim().toLowerCase()}
function label(x){return canonText(x?.elementText||x?.pageTitle||"")}
function textSimilar(a,b){a=canonText(a);b=canonText(b);return !!a&&!!b&&(a===b||a.includes(b)||b.includes(a))}
function stableSelector(v){v=String(v||"").trim();return /^#[\w-]+$/.test(v)||/\[(data-testid|data-test|data-qa|name|aria-label)=/.test(v)||/>|:nth-of-type\(/.test(v)?v:""}
function sameDestination(a,b){a=norm(a);b=norm(b);return !!a&&!!b&&a===b}
function recorderNoise(x){const t=`${x?.pageTitle||""} ${x?.elementText||""}`;return /browser isolation|zero trust mode/i.test(t)||(/isolation\.zscaler\.com/i.test(String(x?.url||""))&&!/[?&]original_url=/i.test(String(x?.url||"")))}

function urlRuleMatches(c,url){
  const actual=String(unwrap(url)||"");
  const pattern=String(c?.urlPattern||"").trim();
  if(!pattern)return false;
  try{
    switch(c.matchType){
      case"exact":return actual===pattern||norm(actual)===norm(pattern);
      case"startsWith":return actual.startsWith(pattern);
      case"regex":return new RegExp(pattern).test(actual);
      case"contains":
      default:return actual.includes(pattern);
    }
  }catch{return false}
}
async function showCampaignAward(tab,c,result){
  if(!result?.awarded||typeof tab!=="number")return;
  try{await chrome.tabs.sendMessage(tab,{type:"K2_JOURNEY_AWARDED",campaign:c,xp:result.xp,total:result.total})}catch{}
}
async function processStandalonePageVisit(url,tabId){
  const d=await chrome.storage.local.get(["campaigns"]);
  const cs=(d.campaigns||[]).filter(c=>c.enabled!==false&&c.trigger==="visit");
  const done=[];
  for(const c of cs){
    if(!urlRuleMatches(c,url))continue;
    const result=await award(c,unwrap(url),`Page visit matched: ${c.matchType||"contains"} ${c.urlPattern}`);
    done.push({campaign:c,result});
    await showCampaignAward(tabId,c,result);
  }
  return done;
}
async function processStandaloneEvent(e,sender){
  const d=await chrome.storage.local.get(["campaigns"]);
  const tab=sender?.tab?.id??e.tabId??null;
  const cs=(d.campaigns||[]).filter(c=>c.enabled!==false&&c.trigger!=="journey"&&c.trigger!=="visit");
  const done=[];
  for(const c of cs){
    if(!urlRuleMatches(c,e.url))continue;
    let ok=false,detail="";
    if(c.trigger==="click"&&e.action==="click"){
      ok=(e.matchedCampaignIds||[]).includes(c.id)||(!c.selector&&true)||String(c.selector||"")===String(e.selector||"");
      detail=`Button click${c.selector?` matched ${c.selector}`:""}`;
    }else if(c.trigger==="form"&&e.action==="submit"){
      ok=(e.matchedCampaignIds||[]).includes(c.id)||(!c.selector&&true)||String(c.selector||"")===String(e.selector||"");
      detail=`Form submission${c.selector?` matched ${c.selector}`:""}`;
    }else if(c.trigger==="element"&&e.action==="element"){
      ok=(e.matchedCampaignIds||[]).includes(c.id)||String(c.selector||"")===String(e.selector||"");
      detail=`Element appeared: ${c.selector||e.selector||"selector"}`;
    }else if(c.trigger==="time"&&e.action==="time"){
      const need=Math.max(0,Number(c.triggerValue||0));ok=Number(e.seconds||0)>=need;detail=`Time on page reached ${need} seconds`;
    }else if(c.trigger==="scroll"&&e.action==="scroll"){
      const need=Math.max(0,Math.min(100,Number(c.triggerValue||0)));ok=Number(e.percent||0)>=need;detail=`Scroll depth reached ${need}%`;
    }else if(c.trigger==="custom"&&e.action==="custom"){
      ok=!!c.activityId&&String(c.activityId)===String(e.activityId||"");detail=`Custom K2 event: ${c.activityId}`;
    }
    if(!ok)continue;
    const result=await award(c,unwrap(e.url||""),detail);
    done.push({campaign:c,result});
    await showCampaignAward(tab,c,result);
  }
  return done;
}

function clickMatches(s,e){
  if(e.action!=="click"||!sameUrl(s.url,e.url))return false;
  if(s.controlRole&&e.controlRole&&s.controlRole!==e.controlRole)return false;
  if(s.contextKey&&e.contextKey&&s.contextKey!==e.contextKey)return false;
  if(s.semanticKey&&e.semanticKey)return s.semanticKey===e.semanticKey;
  const ss=stableSelector(s.selector),es=stableSelector(e.selector);if(ss)return !!es&&ss===es;
  const sd=String(s.destinationUrl||"").trim(),ed=String(e.destinationUrl||"").trim();if(sd)return !!ed&&sameDestination(sd,ed);
  const a=canonText(s.elementText),b=canonText(e.elementText);return !!a&&!!b&&textSimilar(a,b);
}
function submitMatches(s,e){
  if(e.action!=="submit"||!sameUrl(s.url,e.url))return false;
  if(s.contextKey&&e.contextKey&&s.contextKey!==e.contextKey)return false;
  const ss=stableSelector(s.selector),es=stableSelector(e.selector);if(ss)return !!es&&ss===es;
  if(s.semanticKey)return !!e.semanticKey&&s.semanticKey===e.semanticKey;
  const a=canonText(s.elementText),b=canonText(e.elementText);return !!a&&!!b&&textSimilar(a,b);
}
function fieldMatches(s,e){
  if(e.action!=="field"||!sameUrl(s.url,e.url))return false;
  if(s.contextKey&&e.contextKey&&s.contextKey!==e.contextKey)return false;
  if(s.semanticKey)return !!e.semanticKey&&s.semanticKey===e.semanticKey;
  const ss=stableSelector(s.selector),es=stableSelector(e.selector);return !!ss&&!!es&&ss===es;
}
function completionMatches(s,e){
  if(!s||!e||e.action!=="complete")return false;
  if(s.successText)return !!e.successText&&textSimilar(s.successText,e.successText);
  if(s.distinctPath)return pathOnly(s.url)===pathOnly(e.url);
  if(s.distinctHeading)return !!e.heading&&textSimilar(s.heading,e.heading);
  return false;
}
function matches(s,e){
  if(!s||!e||s.action!==e.action)return false;
  if(s.action==="complete")return completionMatches(s,e);
  if(s.action==="click")return clickMatches(s,e);
  if(s.action==="submit")return submitMatches(s,e);
  if(s.action==="field")return fieldMatches(s,e);
  if(s.action==="page")return norm(s.url)===norm(e.url);
  return false;
}
async function showJourneyAward(tab,c,result){if(!result?.awarded||typeof tab!=="number")return;try{await chrome.tabs.sendMessage(tab,{type:"K2_JOURNEY_AWARDED",campaign:c,xp:result.xp,total:result.total})}catch{}}

async function processJourney(e,sender){
  const d=await chrome.storage.local.get(["campaigns","journeyProgress","journeyEngineVersion"]);
  const cs=(d.campaigns||[]).filter(c=>c.enabled&&c.trigger==="journey"&&c.steps?.length);
  const p=d.journeyEngineVersion===JOURNEY_ENGINE_VERSION?(d.journeyProgress||{}):{};
  const tab=sender?.tab?.id??e.tabId??"global",done=[];
  for(const c of cs){
    const k=`${c.id}:${tab}`;
    let i=Number(p[k]||0);
    const steps=c.steps;
    if(i<0||i>=steps.length)i=0;
    if(e.action==="page"&&steps[0]?.action==="page"&&norm(steps[0].url)===norm(e.url)){
      i=1;p[k]=i;continue;
    }
    if(matches(steps[i],e))i++;else if(matches(steps[0],e))i=1;
    if(i>=steps.length){
      const result=await award(c,e.url||"",`Completed required journey: ${steps.length} of ${steps.length} steps`);
      done.push({campaign:c,result});
      await showJourneyAward(typeof tab==="number"?tab:null,c,result);
      i=0;
    }
    p[k]=i;
  }
  await chrome.storage.local.set({journeyProgress:p,journeyEngineVersion:JOURNEY_ENGINE_VERSION});
  return done;
}

async function record(e,sender){
  const d=await chrome.storage.local.get(["recorderState","recordedTriggers"]),r=d.recorderState||EMPTY_RECORDER;
  if(!r.active||!r.sessionId||String(e.url||"").startsWith("chrome-extension://")||e.action==="complete")return{ok:false};
  const item={id:crypto.randomUUID(),sessionId:r.sessionId,sessionName:r.sessionName||"Recording",at:Date.now(),action:e.action||"unknown",url:unwrap(e.url||sender?.url||""),pageTitle:e.pageTitle||"",selector:e.selector||"",elementText:(e.elementText||"").slice(0,120),destinationUrl:unwrap(e.destinationUrl||""),semanticKey:e.semanticKey||"",fieldType:e.fieldType||"",controlRole:e.controlRole||"",contextKey:e.contextKey||"",adminLabel:e.adminLabel||"",tabId:sender?.tab?.id??null};
  const list=[item,...(d.recordedTriggers||[])].slice(0,500),next={...r,eventCount:(r.eventCount||0)+1,lastTabId:item.tabId,lastEventAt:item.at};
  await chrome.storage.local.set({recordedTriggers:list,recorderState:next});
  return{ok:true,item};
}

function cleanSteps(raw,target,completion){
  let a=raw.slice().sort((x,y)=>x.at-y.at).map(x=>({...x,url:unwrap(x.url),destinationUrl:unwrap(x.destinationUrl)})).filter(x=>!recorderNoise(x));
  const out=[];
  for(const x of a){
    const prev=out[out.length-1];
    if(x.action==="page"&&prev?.action==="page"&&norm(x.url)===norm(prev.url)){if(x.adminLabel)out[out.length-1]=x;continue}
    if(x.action==="field"&&prev?.action==="field"&&x.semanticKey&&x.semanticKey===prev.semanticKey){out[out.length-1]=x;continue}
    const dup=prev&&x.action===prev.action&&x.action!=="click"&&x.action!=="submit"&&norm(x.url)===norm(prev.url)&&label(x)===label(prev)&&Math.abs((x.at||0)-(prev.at||0))<250;
    if(dup)continue;
    out.push(x);
  }
  const mapped=out.map((x,i)=>({id:crypto.randomUUID(),order:i+1,action:x.action,url:norm(x.url),pageTitle:x.pageTitle,selector:x.selector||"",elementText:x.elementText||"",displayName:x.adminLabel||x.elementText||x.pageTitle||`Step ${i+1}`,destinationUrl:norm(x.destinationUrl||""),semanticKey:x.semanticKey||"",fieldType:x.fieldType||"",controlRole:x.controlRole||"",contextKey:x.contextKey||"",optional:false,required:true}));
  const start=out[0]||{};
  const completionUrl=norm(completion?.url||out[out.length-1]?.url||target);
  const startUrl=norm(target||start.url||"");
  const startHeading=String(start.elementText||start.pageTitle||"").trim();
  const completionHeading=String(completion?.heading||"").trim();
  const successText=String(completion?.successText||"").trim();
  const distinctPath=!!completionUrl&&!!startUrl&&pathOnly(completionUrl)!==pathOnly(startUrl);
  const distinctHeading=!!completionHeading&&!!startHeading&&!textSimilar(completionHeading,startHeading);
  mapped.push({id:crypto.randomUUID(),order:mapped.length+1,action:"complete",url:completionUrl,pageTitle:completion?.pageTitle||"",elementText:successText||completionHeading||"Completion state",displayName:successText||completionHeading||"Activity complete",heading:completionHeading,successText,distinctPath,distinctHeading,verified:!!(successText||distinctPath||distinctHeading),completion:true,optional:false,required:true});
  return mapped;
}

async function markComplete(){
  const d=await chrome.storage.local.get(["recorderState","recordedTriggers","journeys"]),r=d.recorderState||EMPTY_RECORDER;
  if(!r.active||!r.sessionId)return{ok:false,reason:"not-recording"};
  let completion={action:"complete",url:r.targetUrl||"",elementText:"Completion state",formCount:0};
  if(Number.isInteger(r.lastTabId))try{completion=await chrome.tabs.sendMessage(r.lastTabId,{type:"K2_CAPTURE_COMPLETION"})||completion}catch{}
  const raw=(d.recordedTriggers||[]).filter(x=>x.sessionId===r.sessionId),steps=cleanSteps(raw,r.targetUrl,completion);
  if(steps.length<2)return{ok:false,reason:"no-events"};
  const journey={id:crypto.randomUUID(),name:r.sessionName||"Recorded K2 journey",createdAt:Date.now(),completedAt:Date.now(),targetUrl:r.targetUrl||"",steps,completionVerified:!!steps.at(-1)?.verified};
  const journeys=[journey,...(d.journeys||[])].slice(0,100),next={...r,active:false,stoppedAt:Date.now(),markedComplete:true,eventCount:steps.length};
  await chrome.storage.local.set({journeys,recorderState:next});
  return{ok:true,journey};
}

chrome.runtime.onMessage.addListener((m,sender,send)=>{
  if(m?.type==="K2_AWARD_REQUEST"){award(m.campaign,m.url,m.detail).then(send);return true}
  if(m?.type==="K2_START_RECORDER"){(async()=>{const r={active:true,sessionId:crypto.randomUUID(),sessionName:(m.sessionName||"K2 activity journey").trim(),targetUrl:(m.targetUrl||"").trim(),startedAt:Date.now(),eventCount:0};await chrome.storage.local.set({recorderState:r});if(r.targetUrl)try{await chrome.tabs.create({url:r.targetUrl})}catch{}send({ok:true,recorderState:r})})();return true}
  if(m?.type==="K2_STOP_RECORDER"){(async()=>{const d=await chrome.storage.local.get(["recorderState"]),r={...(d.recorderState||EMPTY_RECORDER),active:false,stoppedAt:Date.now()};await chrome.storage.local.set({recorderState:r});send({ok:true})})();return true}
  if(m?.type==="K2_MARK_COMPLETE"){markComplete().then(send);return true}
  if(m?.type==="K2_RECORD_EVENT"){record(m.event||{},sender).then(send);return true}
  if(m?.type==="K2_OBSERVED_EVENT"){const e={...m.event,url:unwrap(m.event?.url||""),destinationUrl:unwrap(m.event?.destinationUrl||"")};Promise.all([processStandaloneEvent(e,sender),processJourney(e,sender)]).then(([standalone,journey])=>send({standalone,journey}));return true}
});

chrome.tabs.onUpdated.addListener(async(tabId,info,tab)=>{
  if(info.status!=="complete"||!tab.url||tab.url.startsWith("chrome://")||tab.url.startsWith("chrome-extension://"))return;
  const cleanUrl=unwrap(tab.url);
  await processStandalonePageVisit(cleanUrl,tabId);
  const e={action:"page",url:cleanUrl,pageTitle:tab.title||"",elementText:tab.title||"",tabId};
  await processJourney(e,{tab:{id:tabId}});
  await record(e,{tab:{id:tabId}});
});
const $=s=>document.querySelector(s);
let campaigns=[],state={};
const names={visit:"Page visit",time:"Time on page",scroll:"Scroll depth",click:"Button click",element:"Element appears",form:"Form submit",custom:"Custom K2 event",journey:"Recorded journey"};
const actionNames={page:"Visit",click:"Click",field:"Complete field",submit:"Submit form",complete:"Verify completion"};
const esc=v=>String(v||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const clean=v=>String(v||"").replace(/\s+/g," ").trim();
const norm=u=>{try{const x=new URL(u);return x.origin+x.pathname.replace(/\/$/,"")+x.hash}catch{return u||""}};
const isIsolationNoise=x=>/isolation\.zscaler\.com/i.test(String(x?.url||""))||/browser isolation|zero trust mode/i.test(`${x?.pageTitle||""} ${x?.elementText||""}`);
function humanHash(u){try{const x=new URL(u);const h=decodeURIComponent(x.hash.replace(/^#/,"")).replace(/[-_]+/g," ").trim();return h?h.replace(/\b\w/g,c=>c.toUpperCase()):""}catch{return""}}
function suggestion(x){
  const noisy=/browser isolation|zero trust mode/i.test(`${x.elementText||""} ${x.pageTitle||""}`);
  const raw=noisy?"":clean(x.elementText||x.pageTitle||"");
  if(x.action==="page"){const h=humanHash(x.url);return h?`Visit ${h}`:`Visit ${raw||"page"}`}
  if(x.action==="submit")return raw&&!/^submit form$/i.test(raw)?`Submit: ${raw}`:"Submit form";
  if(x.action==="field")return raw&&!/^(form field|text field|field)$/i.test(raw)?`Complete ${raw.replace(/ field$/i,"")} field`:"Complete form field";
  if(x.action==="click"){
    const label=raw&&!/^(action|page action|div|span)$/i.test(raw)?raw:"";
    if(x.controlRole==="submit-control"||x.controlRole==="form-action")return label?`Submit: ${label}`:"Submit registration";
    if(x.controlRole==="navigation-cta")return label?`Click: ${label}`:"Click navigation button";
    return label?`Click: ${label}`:"Click action";
  }
  return raw||"Recorded step";
}
function currentRaw(){const r=state.recorderState||{};return (state.recordedTriggers||[]).filter(x=>!r.sessionId||x.sessionId===r.sessionId).sort((a,b)=>(a.at||0)-(b.at||0))}
function visibleSteps(){
  const out=[];
  for(const x of currentRaw()){
    if(x.action==="page"&&isIsolationNoise(x))continue;
    const prev=out[out.length-1];
    if(x.action==="page"&&prev?.action==="page"&&norm(x.url)===norm(prev.url))continue;
    if(x.action==="field"&&prev?.action==="field"&&x.semanticKey&&x.semanticKey===prev.semanticKey)continue;
    out.push(x);
  }
  return out;
}
async function load(){state=await chrome.storage.local.get(["campaigns","xpTotal","activityLog","awards","recorderState","recordedTriggers","journeys","journeyProgress"]);campaigns=state.campaigns||[];render()}
function stepEditorHtml(x,i){
  const name=x.adminLabel||suggestion(x),tech=[x.controlRole,x.contextKey,x.selector].filter(Boolean).join(" • ");
  return `<div class="recorded" data-step-id="${esc(x.id)}"><div class="meta">STEP ${i+1} • ${esc(String(x.action||"event").toUpperCase())}</div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input class="k2-step-name" data-id="${esc(x.id)}" value="${esc(name)}" aria-label="Step name" style="flex:1;min-width:240px"><button class="k2-save-step" data-id="${esc(x.id)}" type="button">Save name</button><button class="k2-delete-step" data-id="${esc(x.id)}" type="button">Delete step</button></div><div class="meta">${esc(x.url||"")}</div>${tech?`<div class="meta">Detected: ${esc(tech)}</div>`:""}</div>`;
}
function journeyCard(j){return `<div class="journey"><div class="journeyHead"><div><div class="journeyTitle">${esc(j.name)}</div><div class="meta">${j.steps.length} semantic step(s)</div></div><div><button class="make" data-id="${j.id}">Create campaign</button> <button class="delj" data-id="${j.id}">Delete</button></div></div>${j.steps.map((s,i)=>`<div class="journeyStep"><div class="stepNum">${i+1}</div><div class="stepMain"><b>${esc(actionNames[s.action]||String(s.action||"event").toUpperCase())}${s.optional?" (context)":""}</b> ${esc(s.displayName||s.elementText||s.pageTitle||"")}<div class="stepMeta">${esc(s.semanticKey||s.selector||s.url||"")}</div></div>${s.action!=="complete"?`<button class="rmstep" data-j="${j.id}" data-s="${s.id}">Remove</button>`:""}</div>`).join("")}<div class="completeFlag">✓ XP requires final completion verification</div></div>`}
function render(){
  $("#statCampaigns").textContent=campaigns.length;$("#statXp").textContent=state.xpTotal||0;$("#statEvents").textContent=(state.activityLog||[]).length;
  const r=state.recorderState||{},rec=visibleSteps();
  $("#recDot").classList.toggle("live",!!r.active);$("#recStatus").textContent=r.active?"Journey recorder is LIVE":"Recorder stopped";$("#recDetail").textContent=r.active?`${r.sessionName||"Recording"} • ${rec.length} step(s). Perform the flow, edit/delete steps as needed, then click Mark Activity Complete.`:"Record the complete user journey, then mark the exact point that counts as completion.";
  $("#startRecBtn").disabled=!!r.active;$("#stopRecBtn").disabled=!r.active;$("#markCompleteBtn").disabled=!r.active;
  $("#recordedList").innerHTML=rec.length?rec.map(stepEditorHtml).join(""):"<p>Nothing recorded for the current journey yet.</p>";
  const saved=state.journeys||[];
  const draft=r.active?`<div class="journey"><div class="journeyHead"><div><div class="journeyTitle">${esc(r.sessionName||"Current Journey")} — Draft</div><div class="meta">${rec.length} kept step(s) • updates while you record</div></div></div>${rec.map((s,i)=>`<div class="journeyStep"><div class="stepNum">${i+1}</div><div class="stepMain"><b>${esc(actionNames[s.action]||String(s.action||"event").toUpperCase())}</b> ${esc(s.adminLabel||suggestion(s))}<div class="stepMeta">${esc(s.semanticKey||s.selector||s.url||"")}</div></div></div>`).join("")||"<p>No steps captured yet.</p>"}<div class="completeFlag">Draft — Mark Activity Complete to save this journey.</div></div>`:"";
  $("#journeyList").innerHTML=draft+(saved.length?saved.map(journeyCard).join(""):(!r.active?"<p>No completed journeys yet.</p>":""));
  document.querySelectorAll(".make").forEach(b=>b.onclick=()=>makeCampaign(b.dataset.id));document.querySelectorAll(".delj").forEach(b=>b.onclick=()=>deleteJourney(b.dataset.id));document.querySelectorAll(".rmstep").forEach(b=>b.onclick=()=>removeStep(b.dataset.j,b.dataset.s));
  document.querySelectorAll(".k2-save-step").forEach(b=>b.onclick=()=>saveLiveName(b.dataset.id));document.querySelectorAll(".k2-delete-step").forEach(b=>b.onclick=()=>deleteLiveStep(b.dataset.id));
  $("#campaignList").innerHTML=campaigns.length?campaigns.map(c=>`<div class="campaign"><b>${esc(c.name)}</b><div class="meta">${esc(c.urlPattern||c.steps?.[0]?.url||"")}</div><div class="chips"><span class="chip xp">+${Number(c.xp)} XP</span><span class="chip">${names[c.trigger]||c.trigger}</span>${c.trigger==="journey"?`<span class="chip">${c.steps?.filter(s=>!s.optional).length||0} required steps</span>`:""}<span class="chip">${c.frequency}</span><span class="chip">${c.enabled===false?"DISABLED":"ENABLED"}</span></div><button class="edit" data-id="${c.id}">Edit</button> <button class="toggle" data-id="${c.id}">${c.enabled===false?"Enable":"Disable"}</button> <button class="delc" data-id="${c.id}">Delete</button></div>`).join(""):"<p>No campaigns yet.</p>";
  document.querySelectorAll(".edit").forEach(b=>b.onclick=()=>edit(b.dataset.id));document.querySelectorAll(".toggle").forEach(b=>b.onclick=()=>toggleCampaign(b.dataset.id));document.querySelectorAll(".delc").forEach(b=>b.onclick=()=>deleteCampaign(b.dataset.id));
  $("#activityLog").innerHTML=(state.activityLog||[]).slice(0,12).map(x=>`<div class="log"><b>+${x.xp} XP • ${esc(x.campaignName)}</b><div class="meta">${new Date(x.at).toLocaleString()} • ${esc(x.detail)}</div></div>`).join("")||"<p>No XP completions yet.</p>";
}
async function saveLiveName(id){const input=document.querySelector(`.k2-step-name[data-id="${CSS.escape(id)}"]`);if(!input)return;const items=(state.recordedTriggers||[]).map(x=>x.id===id?{...x,adminLabel:clean(input.value)||suggestion(x)}:x);await chrome.storage.local.set({recordedTriggers:items});await load()}
async function deleteLiveStep(id){const items=(state.recordedTriggers||[]).filter(x=>x.id!==id);await chrome.storage.local.set({recordedTriggers:items});await load()}
document.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.classList.contains("k2-step-name")){e.preventDefault();saveLiveName(e.target.dataset.id)}});
function sync(){const t=$("#trigger").value;$("#selectorField").style.display=["click","element","form"].includes(t)?"block":"none";$("#activityField").style.display=t==="custom"?"block":"none";$("#valueField").style.display=["time","scroll"].includes(t)?"block":"none";$("#urlPattern").required=t!=="journey";$("#valueLabel").textContent=t==="scroll"?"Scroll percentage":"Seconds"}
$("#trigger").onchange=sync;
$("#campaignForm").onsubmit=async e=>{e.preventDefault();const id=$("#campaignId").value||crypto.randomUUID(),old=campaigns.find(x=>x.id===id)||{},c={...old,id,name:$("#name").value.trim(),urlPattern:$("#urlPattern").value.trim(),matchType:$("#matchType").value,xp:Number($("#xp").value),trigger:$("#trigger").value,triggerValue:$("#triggerValue").value.trim(),selector:$("#selector").value.trim(),activityId:$("#activityId").value.trim(),frequency:$("#frequency").value,enabled:$("#enabled").checked},i=campaigns.findIndex(x=>x.id===id);if(i>=0)campaigns[i]=c;else campaigns.unshift(c);await chrome.storage.local.set({campaigns});clear();load()};
function edit(id){const c=campaigns.find(x=>x.id===id);if(!c)return;for(const k of["name","urlPattern","matchType","xp","trigger","triggerValue","selector","activityId","frequency"])$("#"+k).value=c[k]??"";$("#campaignId").value=c.id;$("#enabled").checked=c.enabled!==false;$("#formTitle").textContent="Edit campaign activity";sync();scrollTo({top:0,behavior:"smooth"})}
function clear(){$("#campaignForm").reset();$("#campaignId").value="";$("#xp").value=25;$("#triggerValue").value=20;$("#enabled").checked=true;$("#formTitle").textContent="Create campaign activity";sync()}
$("#clearBtn").onclick=clear;
async function toggleCampaign(id){campaigns=campaigns.map(c=>c.id===id?{...c,enabled:c.enabled===false}:c);const jp={...(state.journeyProgress||{})};for(const k of Object.keys(jp))if(k.startsWith(id+":"))delete jp[k];await chrome.storage.local.set({campaigns,journeyProgress:jp});load()}
async function deleteCampaign(id){const c=campaigns.find(x=>x.id===id);if(!c)return;if(!confirm(`Delete campaign “${c.name}”? This removes the rule but keeps past XP history.`))return;campaigns=campaigns.filter(c=>c.id!==id);const jp={...(state.journeyProgress||{})};for(const k of Object.keys(jp))if(k.startsWith(id+":"))delete jp[k];const awards={...(state.awards||{})};for(const k of Object.keys(awards))if(k===id||k.startsWith(id+":"))delete awards[k];await chrome.storage.local.set({campaigns,journeyProgress:jp,awards});if($("#campaignId").value===id)clear();load()}
async function makeCampaign(id){const j=(state.journeys||[]).find(x=>x.id===id);if(!j?.steps.length)return;const c={id:crypto.randomUUID(),name:j.name,urlPattern:norm(j.steps[0].url),matchType:"startsWith",xp:100,trigger:"journey",triggerValue:"",selector:"",activityId:"",frequency:"once",enabled:true,journeyId:j.id,steps:j.steps.map((s,i)=>({...s,order:i+1,url:norm(s.url)}))};campaigns.unshift(c);await chrome.storage.local.set({campaigns});await load();edit(c.id);$("#formTitle").textContent="Journey campaign created — review XP and save"}
async function removeStep(j,s){const journeys=(state.journeys||[]).map(x=>x.id!==j?x:{...x,steps:x.steps.filter(y=>y.id!==s).map((y,i)=>({...y,order:i+1}))}).filter(x=>x.steps.some(s=>s.action==="complete"));await chrome.storage.local.set({journeys});load()}
async function deleteJourney(id){await chrome.storage.local.set({journeys:(state.journeys||[]).filter(j=>j.id!==id)});load()}
$("#startRecBtn").onclick=async()=>{let u=$("#recTargetUrl").value.trim();if(u&&!/^https?:\/\//i.test(u))u="https://"+u;await chrome.runtime.sendMessage({type:"K2_START_RECORDER",sessionName:$("#recSessionName").value.trim()||"K2 activity journey",targetUrl:u});load()};
$("#markCompleteBtn").onclick=async()=>{const r=await chrome.runtime.sendMessage({type:"K2_MARK_COMPLETE"});if(!r?.ok)alert(r?.reason==="no-events"?"No journey activity was recorded yet.":"Could not mark journey complete.");load()};
$("#stopRecBtn").onclick=async()=>{await chrome.runtime.sendMessage({type:"K2_STOP_RECORDER"});load()};
$("#clearRecordedBtn").onclick=async()=>{if(confirm("Clear live recorded steps? Completed journeys will remain.")){const r=state.recorderState||{};const keep=(state.recordedTriggers||[]).filter(x=>r.sessionId&&x.sessionId!==r.sessionId);await chrome.storage.local.set({recordedTriggers:keep});load()}};
$("#resetBtn").onclick=async()=>{if(confirm("Reset XP, history and journey progress?")){await chrome.storage.local.set({xpTotal:0,activityLog:[],awards:{},journeyProgress:{}});load()}};
$("#clearLogBtn").onclick=async()=>{await chrome.storage.local.set({activityLog:[]});load()};
$("#exportBtn").onclick=async()=>{const all=await chrome.storage.local.get(null),a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(all,null,2)],{type:"application/json"}));a.download="k2-xp-prototype-export.json";a.click()};
chrome.storage.onChanged.addListener(()=>load());sync();load();
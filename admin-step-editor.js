(()=>{
const list=document.querySelector('#recordedList');
if(!list)return;
let lastSig='';
const esc=v=>String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
function humanHash(u){try{const x=new URL(u);const h=decodeURIComponent(x.hash.replace(/^#/,'' )).replace(/[-_]+/g,' ').trim();return h?h.replace(/\b\w/g,c=>c.toUpperCase()):''}catch{return''}}
function suggestion(x){
  const raw=clean(x.elementText||x.pageTitle||'');
  if(x.action==='page'){
    const h=humanHash(x.url);
    return h?`Visit ${h}`:`Visit ${raw||'page'}`;
  }
  if(x.action==='submit')return raw&& !/^submit form$/i.test(raw)?raw:'Submit form';
  if(x.action==='field'){
    if(raw&&!/^(form field|text field|field)$/i.test(raw))return `Complete ${raw.replace(/ field$/i,'')} field`;
    return 'Complete form field';
  }
  if(x.action==='click'){
    const label=raw&&!/^(action|page action|div|span)$/i.test(raw)?raw:'';
    if(x.controlRole==='submit-control'||x.controlRole==='form-action')return label?`Submit: ${label}`:'Submit form';
    if(x.controlRole==='navigation-cta')return label?`Click: ${label}`:'Click navigation link';
    return label?`Click: ${label}`:'Click action';
  }
  return raw||'Recorded step';
}
async function getCurrent(){
  const d=await chrome.storage.local.get(['recorderState','recordedTriggers']);
  const r=d.recorderState||{};
  return (d.recordedTriggers||[]).filter(x=>!r.sessionId||x.sessionId===r.sessionId).sort((a,b)=>a.at-b.at);
}
async function renderEditor(){
  if(document.activeElement?.classList?.contains('k2-step-name'))return;
  const rec=await getCurrent();
  const sig=rec.map(x=>`${x.id}:${x.elementText}:${x.at}`).join('|');
  if(sig===lastSig)return;
  lastSig=sig;
  if(!rec.length){list.innerHTML='<p>Nothing recorded for the current journey yet.</p>';return;}
  list.innerHTML=rec.map((x,i)=>{
    const proposed=suggestion(x);
    const name=x.adminLabel||proposed;
    const tech=[x.controlRole,x.contextKey,x.selector].filter(Boolean).join(' • ');
    return `<div class="recorded" data-step-id="${esc(x.id)}" style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,.08)">
      <div style="font-size:11px;opacity:.7;margin-bottom:5px">STEP ${i+1} • ${esc(String(x.action||'event').toUpperCase())}</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input class="k2-step-name" data-id="${esc(x.id)}" value="${esc(name)}" aria-label="Step name" style="flex:1;min-width:260px;padding:9px 10px;border-radius:8px" />
        <button class="k2-save-step" data-id="${esc(x.id)}" type="button">Save name</button>
      </div>
      <div class="meta" style="margin-top:6px">${esc(x.url||'')}</div>
      ${tech?`<div class="meta" style="margin-top:3px;opacity:.6">Detected: ${esc(tech)}</div>`:''}
    </div>`;
  }).join('');
}
async function saveName(id,value){
  const d=await chrome.storage.local.get(['recordedTriggers']);
  const items=(d.recordedTriggers||[]).map(x=>x.id===id?{...x,adminLabel:clean(value)||suggestion(x)}:x);
  await chrome.storage.local.set({recordedTriggers:items});
  lastSig='';
  renderEditor();
}
list.addEventListener('click',e=>{
  const b=e.target.closest('.k2-save-step');
  if(!b)return;
  const input=list.querySelector(`.k2-step-name[data-id="${CSS.escape(b.dataset.id)}"]`);
  if(input)saveName(b.dataset.id,input.value);
});
list.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target.classList.contains('k2-step-name')){
    e.preventDefault();saveName(e.target.dataset.id,e.target.value);e.target.blur();
  }
});
list.addEventListener('change',e=>{
  if(e.target.classList.contains('k2-step-name'))saveName(e.target.dataset.id,e.target.value);
});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes.recordedTriggers||changes.recorderState))setTimeout(renderEditor,40)});
setInterval(renderEditor,700);
setTimeout(renderEditor,100);
})();
const STORAGE = {
  participant: "hg_participant_id",
  rehearsal: "hg_rehearsal",
  instruments: "hg_instruments",
  reservations: "hg_reservations",
  attendance: "hg_attendance"
};

const seedInstruments = [
  ["caixa","Caixa",6],["tamborim","Tamborim",6],["surdo-1","Surdo de 1ª",2],
  ["surdo-2","Surdo de 2ª",2],["surdo-3","Surdo de 3ª",2],["agogo","Agogô",4],
  ["repinique","Repinique",3],["timbal","Timbal",2],["alfaia","Alfaia",2],["ganza","Ganzá (Chocalho)",5]
];

function uuid(){ return crypto.randomUUID ? crypto.randomUUID() : "hg-"+Date.now()+"-"+Math.random().toString(16).slice(2); }
function get(key, fallback){ try{return JSON.parse(localStorage.getItem(key)) ?? fallback}catch{return fallback} }
function set(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

function init(){
  if(!localStorage.getItem(STORAGE.participant)) localStorage.setItem(STORAGE.participant, uuid());
  if(!localStorage.getItem(STORAGE.rehearsal)) set(STORAGE.rehearsal,{id:uuid(),date:"2026-10-07",time:"19:30",location:"A definir",status:"active"});
  if(!localStorage.getItem(STORAGE.instruments)) set(STORAGE.instruments,seedInstruments.map(([id,name,stockTotal])=>({id,name,stockTotal,active:true})));
  if(!localStorage.getItem(STORAGE.reservations)) set(STORAGE.reservations,[]);
  if(!localStorage.getItem(STORAGE.attendance)) set(STORAGE.attendance,[]);
  bind();
  renderAll();
  routeFromHash();
}

function bind(){
  // A navegação principal usa links com hash como fallback real.
  // O JS apenas sincroniza qual view fica visível.
  document.addEventListener("click", (event)=>{
    const nav = event.target.closest("[data-nav]");
    if(nav){
      event.preventDefault();
      navigate(nav.dataset.nav);
    }
  });
  const adminButton=document.querySelector("[data-action=open-admin]");
  if(adminButton) adminButton.addEventListener("click",()=>document.querySelector("#admin-login-dialog")?.showModal());
  document.querySelector("#presence-form")?.addEventListener("submit",confirmPresence);
  document.querySelector("#reserve-form")?.addEventListener("submit",reserveInstrument);
  document.querySelector("#admin-login-form")?.addEventListener("submit",adminLogin);
  window.addEventListener("hashchange",routeFromHash);
}

function navigate(id){
  const clean=String(id||"home").replace(/^#/,"");
  if(location.hash === `#${clean}`){
    routeFromHash();
  } else {
    location.hash=clean;
  }
}

function routeFromHash(){
  const raw=location.hash.replace(/^#/,"");
  const allowed=["home","presence","instruments","my-reservations","admin"];
  const target=allowed.includes(raw)?raw:"home";
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===target));
  document.querySelectorAll(".bottom-nav a").forEach(a=>a.classList.toggle("active",a.getAttribute("href")===`#${target}`));
  if(target==="admin") renderAdmin();
  if(target==="instruments") renderInstruments();
  if(target==="my-reservations") renderMyReservations();
  window.scrollTo({top:0,behavior:"auto"});
}

function currentRehearsal(){ return get(STORAGE.rehearsal,{}); }
function instruments(){ return get(STORAGE.instruments,[]); }
function reservations(){ return get(STORAGE.reservations,[]); }
function attendance(){ return get(STORAGE.attendance,[]); }
function participantId(){ return localStorage.getItem(STORAGE.participant); }

function formatDate(value){
  if(!value) return "A definir";
  const d=new Date(value+"T12:00:00");
  return new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"2-digit",month:"long"}).format(d);
}
function activeReservationsFor(id){ const r=currentRehearsal(); return reservations().filter(x=>x.rehearsalId===r.id && x.instrumentId===id && x.status==="active"); }
function availableFor(id){
  const i=instruments().find(x=>x.id===id); return i ? Math.max(0,i.stockTotal-activeReservationsFor(id).length) : 0;
}
function shortId(){return participantId().slice(0,8).toUpperCase()}

function renderAll(){
  const r=currentRehearsal();
  document.querySelector("#home-date").textContent=formatDate(r.date);
  document.querySelector("#home-time").textContent=r.time || "A definir";
  document.querySelector("#home-location").textContent=r.location || "A definir";
  document.querySelector("#home-attendance").textContent=attendance().filter(a=>a.rehearsalId===r.id).length;
  document.querySelector("#participant-id-short").textContent=shortId();
  renderInstruments();
  renderMyReservations();
}

function confirmPresence(e){
  e.preventDefault();
  const r=currentRehearsal(), name=document.querySelector("#presence-name").value.trim(), pronoun=document.querySelector("#presence-pronoun").value.trim();
  const existing=attendance().find(a=>a.rehearsalId===r.id && a.participantId===participantId());
  if(existing){ showToast("Sua presença já está confirmada."); return; }
  const list=attendance();
  list.push({id:uuid(),rehearsalId:r.id,participantId:participantId(),name,pronoun,createdAt:new Date().toISOString()});
  set(STORAGE.attendance,list);
  showStatus("Presença confirmada. Agora você pode escolher um instrumento.");
  renderAll();
}
function showStatus(msg){const el=document.querySelector("#presence-status");el.textContent=msg;el.hidden=false}
function renderInstruments(){
  const el=document.querySelector("#instrument-list"); if(!el)return;
  el.innerHTML=instruments().filter(i=>i.active).map((i,n)=>{
    const avail=availableFor(i.id);
    return `<div class="instrument-row">
      <div class="instrument-code">I / ${String(n+1).padStart(2,"0")}</div>
      <div class="instrument-name">${i.name}</div>
      <div class="instrument-availability ${avail===0?"sold":""}"><strong>${avail}</strong>${avail===1?"disponível":"disponíveis"}</div>
      <button class="reserve-btn" ${avail===0?"disabled":""} data-reserve="${i.id}">${avail===0?"Esgotado":"Reservar →"}</button>
      <a class="guide-btn" href="guias.html?instrument=${encodeURIComponent(i.id)}#detalhe">Guia ↗</a>
    </div>`;
  }).join("");
  el.querySelectorAll("[data-reserve]").forEach(b=>b.addEventListener("click",()=>openReserve(b.dataset.reserve)));
}
function openReserve(id){
  const i=instruments().find(x=>x.id===id);
  document.querySelector("#reserve-instrument-id").value=id;
  document.querySelector("#reserve-instrument-label").textContent=i.name;
  const mine=attendance().find(a=>a.rehearsalId===currentRehearsal().id&&a.participantId===participantId());
  if(mine){document.querySelector("#reserve-name").value=mine.name;document.querySelector("#reserve-pronoun").value=mine.pronoun}
  document.querySelector("#reserve-dialog").showModal();
}
function reserveInstrument(e){
  e.preventDefault();
  const r=currentRehearsal(), id=document.querySelector("#reserve-instrument-id").value;
  const existing=reservations().find(x=>x.rehearsalId===r.id&&x.participantId===participantId()&&x.instrumentId===id&&x.status==="active");
  if(existing){showToast("Você já reservou este instrumento.");return}
  if(availableFor(id)<=0){showToast("Este instrumento acabou de ficar esgotado.");return}
  const list=reservations();
  list.push({id:uuid(),rehearsalId:r.id,participantId:participantId(),instrumentId:id,name:document.querySelector("#reserve-name").value.trim(),pronoun:document.querySelector("#reserve-pronoun").value.trim(),needsStrap:document.querySelector("#needs-strap").checked,needsBeater:document.querySelector("#needs-beater").checked,status:"active",createdAt:new Date().toISOString()});
  set(STORAGE.reservations,list);
  document.querySelector("#reserve-dialog").close();
  renderAll();
  navigate("my-reservations");
  showToast("Instrumento reservado.");
}
function renderMyReservations(){
  const el=document.querySelector("#my-reservations-list"); if(!el)return;
  const r=currentRehearsal(), mine=reservations().filter(x=>x.rehearsalId===r.id&&x.participantId===participantId()&&x.status==="active");
  if(!mine.length){el.innerHTML=`<div class="empty-state">Você ainda não tem reservas ativas para este ensaio.<br><br><button class="text-btn" onclick="navigate('instruments')">Escolher instrumento →</button></div>`;return}
  const all=instruments();
  el.innerHTML=mine.map(x=>{const i=all.find(y=>y.id===x.instrumentId);return `<div class="reservation-row"><div><strong>${i?.name||"Instrumento"}</strong><small>${x.name} · ${x.pronoun}</small></div><div class="meta"><small>${x.needsStrap?"Talabarte · ":""}${x.needsBeater?"Baqueta/maçaneta":(!x.needsStrap?"Sem acessórios":"")}</small></div><button class="cancel-btn" data-cancel="${x.id}">Desfazer</button></div>`}).join("");
  el.querySelectorAll("[data-cancel]").forEach(b=>b.addEventListener("click",()=>cancelReservation(b.dataset.cancel)));
}
function cancelReservation(id){
  const list=reservations(); const item=list.find(x=>x.id===id&&x.participantId===participantId());
  if(!item)return;
  item.status="cancelled";item.cancelledAt=new Date().toISOString();set(STORAGE.reservations,list);renderAll();showToast("Reserva desfeita. O instrumento voltou ao estoque.");
}

function adminLogin(e){
  e.preventDefault();
  if(document.querySelector("#admin-password").value!=="garoa"){showToast("Senha incorreta.");return}
  document.querySelector("#admin-login-dialog").close();navigate("admin");renderAdmin();
}
function renderAdmin(){
  const el=document.querySelector("#admin-content"); if(!el)return;
  const r=currentRehearsal(), att=attendance().filter(a=>a.rehearsalId===r.id), res=reservations().filter(x=>x.rehearsalId===r.id&&x.status==="active");
  el.innerHTML=`
    <div class="admin-grid">
      <div class="admin-card"><h3>PRESENÇAS CONFIRMADAS</h3><div class="big">${att.length}</div></div>
      <div class="admin-card"><h3>RESERVAS ATIVAS</h3><div class="big">${res.length}</div></div>
    </div>
    <div class="admin-card">
      <h3>PRÓXIMO ENSAIO</h3>
      <form id="rehearsal-form" class="admin-form">
        <label>Data<input id="admin-date" type="date" value="${r.date||""}"></label>
        <label>Horário<input id="admin-time" type="time" value="${r.time||""}"></label>
        <label>Local<input id="admin-location" value="${escapeHtml(r.location||"")}"></label>
        <button class="primary-btn" type="submit">Salvar ensaio →</button>
      </form>
    </div>
    <div class="admin-subsection"><h3>ESTOQUE</h3><div class="admin-table">${instruments().map((i,n)=>`
      <div class="admin-line">
        <div><strong>${i.name}</strong><small class="admin-stock"> ${activeReservationsFor(i.id).length} reservados · ${availableFor(i.id)} disponíveis</small></div>
        <div class="stock-controls"><button data-stock="-1" data-id="${i.id}">−</button><strong>${i.stockTotal}</strong><button data-stock="1" data-id="${i.id}">+</button></div>
        <div class="admin-reservations">${activeReservationsFor(i.id).map(x=>`${escapeHtml(x.name)} — ${escapeHtml(x.pronoun)}`).join("<br>")||"—"}</div>
        <div class="admin-options">${activeReservationsFor(i.id).map(x=>`${x.needsStrap?"talabarte ":""}${x.needsBeater?"baqueta/maçaneta":""}`).filter(Boolean).join("<br>")||"—"}</div>
      </div>`).join("")}</div></div>
    <div class="admin-subsection"><h3>PRESENÇAS</h3><div class="admin-table">${att.map(a=>`<div class="admin-line"><div><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.pronoun)}</small></div><div></div><div></div><div>${new Date(a.createdAt).toLocaleString("pt-BR")}</div></div>`).join("")||"<div class='empty-state'>Nenhuma presença ainda.</div>"}</div></div>
    <div class="admin-subsection"><h3>MANUTENÇÃO</h3><button class="reset-btn" id="reset-rehearsal">Encerrar ensaio e criar próximo</button></div>
  `;
  document.querySelector("#rehearsal-form").addEventListener("submit",saveRehearsal);
  el.querySelectorAll("[data-stock]").forEach(b=>b.addEventListener("click",()=>adjustStock(b.dataset.id,Number(b.dataset.stock))));
  document.querySelector("#reset-rehearsal").addEventListener("click",resetRehearsal);
}
function saveRehearsal(e){e.preventDefault();const r=currentRehearsal();r.date=document.querySelector("#admin-date").value;r.time=document.querySelector("#admin-time").value;r.location=document.querySelector("#admin-location").value.trim();set(STORAGE.rehearsal,r);renderAll();renderAdmin();showToast("Dados do ensaio atualizados.");}
function adjustStock(id,delta){const list=instruments(), i=list.find(x=>x.id===id);if(!i)return;const next=Math.max(0,i.stockTotal+delta);if(next<activeReservationsFor(id).length){showToast("O estoque total não pode ficar abaixo das reservas atuais.");return}i.stockTotal=next;set(STORAGE.instruments,list);renderAll();renderAdmin();}
function resetRehearsal(){
  if(!confirm("Encerrar o ensaio atual e criar um novo? No protótipo, presença e reservas do ensaio atual serão arquivadas localmente e o novo ensaio começará vazio."))return;
  const old=currentRehearsal(), next={id:uuid(),date:"",time:"",location:"A definir",status:"active",previousRehearsalId:old.id};
  set(STORAGE.rehearsal,next);renderAll();renderAdmin();showToast("Novo ensaio criado.");
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
let toastTimer;
function showToast(msg){const t=document.querySelector("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2600)}
window.navigate=navigate;
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

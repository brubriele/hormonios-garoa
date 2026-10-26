// Estado em memória. Vem do BFF (/api) no init e é recarregado depois de cada ação.
const state = {
  event: null,        // GET /api/ensaio
  eventError: false,
  mine: [],           // GET /api/minhas-reservas
  mineLoading: true,
  mineError: false,
  admin: null,        // GET /api/admin/resumo
  adminLocked: false, // 401 na Produção
  email: ""           // último e-mail usado nesta aba (não é salvo)
};

const OPERATIONAL_VIEWS = ["presence","instruments","my-reservations"];

const ERROR_MESSAGES = {
  SOLD_OUT_ERROR: "Este instrumento acabou de esgotar.",
  ACCESSORY_SOLD_OUT_ERROR: "Este acessório acabou de esgotar.",
  ALREADY_RESERVED_ERROR: "Este e-mail já tem reserva neste ensaio.",
  BOOKING_CLOSED_ERROR: "As reservas estão fechadas no momento.",
  EVENT_CHANGED_ERROR: "O ensaio mudou. Atualizamos a página.",
  STOCK_BELOW_RESERVATIONS_ERROR: "O estoque total não pode ficar abaixo das reservas atuais.",
  EVENT_CREATION_PENDING_ERROR: "O encerramento anterior ainda está sincronizando. Tente de novo em alguns minutos.",
  INVALID_PARAMETER_ERROR: "Confira os campos."
};
const GENERIC_ERROR = "Não foi possível concluir. Tente de novo.";

async function api(path, { method = "GET", body } = {}){
  const options = { method, credentials: "same-origin", headers: {} };
  if(body !== undefined){
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  let res;
  try{ res = await fetch(path, options); }
  catch{ throw { status: 0, key: "NETWORK_ERROR" }; }

  if(res.status === 204) return null;
  const data = await res.json().catch(() => undefined);
  if(!res.ok) throw { status: res.status, key: data?.key || "INTERNAL_ERROR", message: data?.message };
  // 200 que não é JSON (ex.: /api servido pelo vite sem o vercel dev) é erro, não "carregando"
  if(data === undefined) throw { status: res.status, key: "INVALID_RESPONSE" };
  return data;
}

function init(){
  bind();
  routeFromHash();
  loadPublic();
}

function bind(){
  document.querySelectorAll("[data-nav]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.nav)));
  document.querySelector("[data-action=open-admin]").addEventListener("click",openAdminLogin);
  document.querySelector("#presence-form").addEventListener("submit",confirmPresence);
  document.querySelector("#reserve-form").addEventListener("submit",reserveInstrument);
  document.querySelector("#admin-login-form").addEventListener("submit",adminLogin);
  window.addEventListener("hashchange",routeFromHash);
}

function navigate(id){ location.hash=id; }

function currentView(){
  const id=location.hash.replace("#","") || "home";
  return ["home","presence","instruments","my-reservations","admin"].includes(id)?id:"home";
}

function routeFromHash(){
  let target=currentView();

  // Quando a produção fecha as reservas, as telas operacionais ficam fora do ar.
  if(state.event && !isBookingOpen() && OPERATIONAL_VIEWS.includes(target)){
    target="home";
    if(location.hash !== "#home") history.replaceState(null,"","#home");
  }

  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===target));
  document.querySelectorAll(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.nav===target));

  if(target==="admin") loadAdmin();
  if(target==="instruments") renderInstruments();
  if(target==="my-reservations") renderMyReservations();

  updatePublicMode();
  window.scrollTo({top:0,behavior:"smooth"});
}

// Se as reservas fecharam, sai das telas operacionais sem rolar a página.
function enforceBookingRoute(){
  if(state.event && !isBookingOpen() && OPERATIONAL_VIEWS.includes(currentView())) navigate("home");
}

function isBookingOpen(){ return state.event?.bookingOpen === true; }

async function loadEvent(){
  try{
    state.event=await api("/api/ensaio");
    state.eventError=false;
  }catch{
    state.event=null;
    state.eventError=true;
  }
}

async function loadMine(){
  state.mineLoading=true;
  renderMyReservations();
  try{
    state.mine=await api("/api/minhas-reservas");
    state.mineError=false;
  }catch{
    state.mine=[];
    state.mineError=true;
  }
  state.mineLoading=false;
}

async function loadPublic(){
  await Promise.all([loadEvent(),loadMine()]);
  renderAll();
  enforceBookingRoute();
}

function formatDate(value){
  if(!value) return "A definir";
  const d=new Date(value+"T12:00:00");
  if(Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"2-digit",month:"long"}).format(d);
}

function loadingHtml(){ return `<div class="empty-state">Carregando…</div>`; }

function closedHtml(){
  return `<div class="empty-state">As reservas estão fechadas no momento.<br><br><a class="text-btn" href="guias.html">Ir para as guias de estudo →</a></div>`;
}

function retryHtml(msg){
  return `<div class="empty-state">${escapeHtml(msg)}<br><br><button class="text-btn" type="button" data-retry>Tentar de novo →</button></div>`;
}

function bindRetry(el){
  el.querySelectorAll("[data-retry]").forEach(b=>b.addEventListener("click",()=>run(b,loadPublic)));
}

function renderAll(){
  const r=state.event || {};
  const date=formatDate(r.date);
  const time=r.time || "A definir";
  const location=r.location || "A definir";

  document.querySelector("#home-date").textContent=date;
  document.querySelector("#home-time").textContent=time;
  document.querySelector("#home-location").textContent=location;
  document.querySelector("#closed-date").textContent=date;
  document.querySelector("#closed-time").textContent=time;
  document.querySelector("#closed-location").textContent=location;
  document.querySelector("#home-attendance").textContent=r.goingCount ?? 0;

  renderInstruments();
  renderMyReservations();
  updatePublicMode();
}

function updatePublicMode(){
  const loaded=!!state.event;
  const open=isBookingOpen();
  const status=document.querySelector("#home-status");
  const closed=document.querySelector("#booking-closed-view");
  const opened=document.querySelector("#booking-open-view");
  const nav=document.querySelector("#main-bottom-nav");
  const whatsapp=document.querySelector("#closed-whatsapp-link");

  status.hidden=loaded;
  if(!loaded){
    status.innerHTML=state.eventError?retryHtml("Não foi possível carregar o ensaio."):loadingHtml();
    bindRetry(status);
  }
  closed.hidden=!loaded || open;
  opened.hidden=!loaded || !open;
  nav.hidden=!loaded || !open;

  const url=state.event?.whatsappUrl || "";
  if(url){
    whatsapp.href=url;
    whatsapp.hidden=false;
  }else{
    whatsapp.removeAttribute("href");
    whatsapp.hidden=true;
  }
}

function renderInstruments(){
  const el=document.querySelector("#instrument-list"); if(!el)return;

  if(!state.event){ el.innerHTML=state.eventError?retryHtml("Não foi possível carregar os instrumentos."):loadingHtml(); bindRetry(el); return; }
  if(!isBookingOpen()){ el.innerHTML=closedHtml(); return; }

  el.innerHTML=state.event.instruments.map((g,n)=>{
    // available null = sem limite: só o rótulo, sem número
    const avail=g.available, sold=g.soldOut;
    const count=avail===null?"":`<strong>${escapeHtml(avail)}</strong>`;
    return `<div class="instrument-row">
      <div class="instrument-code">I / ${String(n+1).padStart(2,"0")}</div>
      <div class="instrument-name">${escapeHtml(g.name)}</div>
      <div class="instrument-availability ${sold?"sold":""}">${count}${avail===1?"disponível":"disponíveis"}</div>
      <button class="reserve-btn" ${sold?"disabled":""} data-reserve="${escapeHtml(g.id)}">${sold?"Esgotado":"Reservar →"}</button>
    </div>`;
  }).join("");

  el.querySelectorAll("[data-reserve]").forEach(b=>b.addEventListener("click",()=>openReserve(b.dataset.reserve)));
}

function confirmPresence(e){
  e.preventDefault();
  if(!isBookingOpen()){showToast("As reservas ainda não estão abertas.");navigate("home");return;}

  if(state.mine.length){ showStatus("Sua presença já está confirmada."); return; }

  const body={
    email:document.querySelector("#presence-email").value.trim(),
    name:document.querySelector("#presence-name").value.trim(),
    pronoun:document.querySelector("#presence-pronoun").value.trim(),
    groupId:null,
    supportIds:[]
  };

  run(document.querySelector("#presence-submit"),async()=>{
    await api("/api/reserva",{method:"POST",body});
    state.email=body.email;
    showStatus("Presença confirmada. Agora você pode escolher um instrumento.");
    await loadPublic();
  });
}

function showStatus(msg){
  const el=document.querySelector("#presence-status");
  el.textContent=msg;
  el.hidden=false;
}

function openReserve(id){
  if(!isBookingOpen()){showToast("As reservas estão fechadas no momento.");navigate("home");return;}

  const i=state.event.instruments.find(x=>x.id===id);
  if(!i)return;

  document.querySelector("#reserve-instrument-id").value=id;
  document.querySelector("#reserve-instrument-label").textContent=i.name;
  document.querySelector("#reserve-accessories").innerHTML=(i.accessories||[]).map(a=>
    `<label class="toggle-row"><input type="checkbox" value="${escapeHtml(a.id)}" ${a.soldOut?"disabled":""}><span>Preciso de ${escapeHtml(a.name)}${a.soldOut?" (esgotado)":""}</span></label>`
  ).join("");

  const mine=state.mine[0];
  const email=document.querySelector("#reserve-email");
  if(!email.value) email.value=mine?.email||state.email;
  if(mine){
    document.querySelector("#reserve-name").value=mine.name;
    document.querySelector("#reserve-pronoun").value=mine.pronoun;
  }

  document.querySelector("#reserve-dialog").showModal();
}

function reserveInstrument(e){
  e.preventDefault();
  const dialog=document.querySelector("#reserve-dialog");
  if(e.submitter?.value==="cancel"){ dialog.close(); return; }

  if(!isBookingOpen()){
    dialog.close();
    showToast("As reservas estão fechadas no momento.");
    navigate("home");
    return;
  }

  const id=document.querySelector("#reserve-instrument-id").value;
  if(state.mine.some(x=>x.groupId===id)){showToast("Você já reservou este instrumento.");return}
  if(state.event.instruments.find(x=>x.id===id)?.soldOut ?? true){showToast("Este instrumento acabou de ficar esgotado.");return}

  const supportIds=[...document.querySelectorAll("#reserve-accessories input:checked")].map(x=>x.value);

  const body={
    email:document.querySelector("#reserve-email").value.trim(),
    name:document.querySelector("#reserve-name").value.trim(),
    pronoun:document.querySelector("#reserve-pronoun").value.trim(),
    groupId:id,
    supportIds
  };

  run(document.querySelector("#reserve-submit"),async()=>{
    await api("/api/reserva",{method:"POST",body});
    state.email=body.email;
    dialog.close();
    await loadPublic();
    navigate("my-reservations");
    showToast("Instrumento reservado.");
  });
}

function renderMyReservations(){
  const el=document.querySelector("#my-reservations-list"); if(!el)return;

  if(!state.event){ el.innerHTML=state.eventError?retryHtml("Não foi possível carregar suas reservas."):loadingHtml(); bindRetry(el); return; }
  if(!isBookingOpen()){ el.innerHTML=closedHtml(); return; }
  if(state.mineLoading){ el.innerHTML=loadingHtml(); return; }
  if(state.mineError){ el.innerHTML=retryHtml("Não foi possível carregar suas reservas."); bindRetry(el); return; }

  if(!state.mine.length){
    el.innerHTML=`<div class="empty-state">Você ainda não tem reservas ativas para este ensaio.<br><br><button class="text-btn" onclick="navigate('instruments')">Escolher instrumento →</button></div>`;
    return;
  }

  el.innerHTML=state.mine.map(x=>{
    // groupId null = só presença: a linha mostra "Presença confirmada" (dúvida 18)
    const title=x.groupId ? (x.groupName || "Instrumento") : "Presença confirmada";
    const names=(x.accessories||[]).map(a=>a.name).join(" · ");
    const meta=x.groupId ? escapeHtml(names || "Sem acessórios") : "";
    return `<div class="reservation-row">
      <div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(x.name)} · ${escapeHtml(x.pronoun)}</small></div>
      <div class="meta"><small>${meta}</small></div>
      <button class="cancel-btn" data-cancel="${escapeHtml(x.id)}">Desfazer</button>
    </div>`;
  }).join("");

  el.querySelectorAll("[data-cancel]").forEach(b=>b.addEventListener("click",()=>cancelReservation(b,b.dataset.cancel)));
}

function cancelReservation(button,id){
  const item=state.mine.find(x=>x.id===id);
  run(button,async()=>{
    await api("/api/reserva/desfazer",{method:"POST",body:{id}});
    await loadPublic();
    showToast(item?.groupId?"Reserva desfeita. O instrumento voltou ao estoque.":"Reserva desfeita.");
  });
}

// Produção

function openAdmin(){
  if(currentView()==="admin") loadAdmin();
  else navigate("admin");
}

function openAdminLogin(){
  const dialog=document.querySelector("#admin-login-dialog");
  if(!dialog.open) dialog.showModal();
}

function adminLogin(e){
  e.preventDefault();
  const dialog=document.querySelector("#admin-login-dialog");
  if(e.submitter?.value==="cancel"){ dialog.close(); return; }

  const input=document.querySelector("#admin-password");
  run(document.querySelector("#admin-login-submit"),async()=>{
    try{
      await api("/api/admin/entrar",{method:"POST",body:{key:input.value}});
    }catch(err){
      if(err.key==="UNAUTHORIZED_ERROR"){ showToast("Senha incorreta."); return; }
      throw err;
    }
    input.value="";
    dialog.close();
    openAdmin();
  });
}

async function loadAdmin(){
  const el=document.querySelector("#admin-content"); if(!el)return;
  if(!state.admin) el.innerHTML=loadingHtml();
  try{
    state.admin=await api("/api/admin/resumo");
    state.adminLocked=false;
  }catch(err){
    if(err.key==="UNAUTHORIZED_ERROR"){
      state.admin=null;
      state.adminLocked=true;
      openAdminLogin();
    }else{
      el.innerHTML=retryHtml("Não foi possível carregar a Produção.");
      el.querySelector("[data-retry]").addEventListener("click",loadAdmin);
      return;
    }
  }
  renderAdmin();
}

function renderAdmin(){
  const el=document.querySelector("#admin-content"); if(!el)return;

  if(state.adminLocked || !state.admin){
    el.innerHTML=`<div class="empty-state">Entre com a senha da Produção.<br><br><button class="text-btn" type="button" id="admin-login-open">Entrar →</button></div>`;
    document.querySelector("#admin-login-open").addEventListener("click",openAdminLogin);
    return;
  }

  const r=state.admin.event;
  const att=state.admin.attendances;
  const res=att.filter(a=>a.groupId);
  const bookingOpen=r.bookingOpen === true;

  el.innerHTML=`
    <div class="admin-grid">
      <div class="admin-card">
        <h3>PRESENÇAS CONFIRMADAS</h3>
        <div class="big">${att.length}</div>
      </div>
      <div class="admin-card">
        <h3>RESERVAS ATIVAS</h3>
        <div class="big">${res.length}</div>
      </div>
    </div>

    <div class="admin-card admin-booking-control">
      <h3>DISPONIBILIDADE PARA O PÚBLICO</h3>
      <div class="booking-control-status ${bookingOpen?"is-open":"is-closed"}">
        <div>
          <span class="booking-status-kicker">STATUS ATUAL</span>
          <strong>${bookingOpen?"RESERVAS ABERTAS":"RESERVAS FECHADAS"}</strong>
          <small>${bookingOpen
            ?"A página pública mostra presença, instrumentos e reservas."
            :"A página pública mostra apenas o aviso de preparação e as guias de estudo."
          }</small>
        </div>
        <button id="toggle-booking" class="primary-btn" type="button">
          ${bookingOpen?"Fechar reservas":"Liberar reservas"} <span>→</span>
        </button>
      </div>
    </div>

    <div class="admin-card">
      <h3>PRÓXIMO ENSAIO</h3>
      <form id="rehearsal-form" class="admin-form">
        <label>Data<input id="admin-date" type="date" value="${escapeHtml(r.date||"")}"></label>
        <label>Horário<input id="admin-time" type="time" value="${escapeHtml(r.time||"")}"></label>
        <label>Local<input id="admin-location" value="${escapeHtml(r.location||"")}"></label>
        <button class="primary-btn" type="submit">Salvar ensaio →</button>
      </form>
    </div>

    <div class="admin-card admin-whatsapp-control">
      <h3>INFORME DO GRUPO</h3>
      <form id="whatsapp-form" class="admin-form">
        <label class="admin-form-wide">Link do grupo HG · Ensaios
          <input id="admin-whatsapp" type="url" placeholder="https://chat.whatsapp.com/..." value="${escapeHtml(r.whatsappUrl||"")}">
        </label>
        <button class="primary-btn" type="submit">Salvar link →</button>
      </form>
      <p class="form-hint">Se preenchido, o botão “Abrir grupo HG · Ensaios” aparece automaticamente na tela de reservas fechadas.</p>
    </div>

    <div class="admin-subsection"><h3>ESTOQUE</h3><div class="admin-table">${(r.stock||[]).map(g=>{
      // stockTotal null = sem limite: sem ajuste de estoque
      const list=g.reservations||[];
      const unlimited=g.stockTotal===null;
      const avail=g.available===null?"sem limite":`${escapeHtml(g.available)} disponíveis`;
      return `
      <div class="admin-line">
        <div><strong>${escapeHtml(g.name)}</strong><small class="admin-stock"> ${list.length} reservados · ${avail}</small></div>
        <div class="stock-controls"><button data-stock="-1" data-id="${escapeHtml(g.id)}" ${unlimited?"disabled":""}>−</button><strong>${unlimited?"—":escapeHtml(g.stockTotal)}</strong><button data-stock="1" data-id="${escapeHtml(g.id)}" ${unlimited?"disabled":""}>+</button></div>
        <div class="admin-reservations">${list.map(x=>`${escapeHtml(x.name)} — ${escapeHtml(x.pronoun)}`).join("<br>")||"—"}</div>
        <div class="admin-options">${list.map(x=>escapeHtml(x.detail||"")).filter(Boolean).join("<br>")||"—"}</div>
      </div>`;
    }).join("")}</div></div>

    <div class="admin-subsection"><h3>PRESENÇAS</h3><div class="admin-table">${att.map(a=>`<div class="admin-line"><div><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.pronoun)}</small></div><div></div><div></div><div>${escapeHtml(new Date(a.createdAt).toLocaleString("pt-BR"))}</div></div>`).join("")||"<div class='empty-state'>Nenhuma presença ainda.</div>"}</div></div>

    <div class="admin-subsection"><h3>MANUTENÇÃO</h3><button class="reset-btn" id="reset-rehearsal">Encerrar ensaio e criar próximo</button></div>
  `;

  document.querySelector("#rehearsal-form").addEventListener("submit",saveRehearsal);
  document.querySelector("#whatsapp-form").addEventListener("submit",saveWhatsapp);
  document.querySelector("#toggle-booking").addEventListener("click",e=>toggleBooking(e.currentTarget));
  el.querySelectorAll("[data-stock]").forEach(b=>b.addEventListener("click",()=>adjustStock(b,b.dataset.id,Number(b.dataset.stock))));
  document.querySelector("#reset-rehearsal").addEventListener("click",e=>resetRehearsal(e.currentTarget));
}

// PUT parcial: só os campos enviados mudam. A resposta já é o resumo novo.
async function updateEvent(body){
  state.admin=await api("/api/admin/ensaio",{method:"PUT",body});
  renderAdmin();
  await loadPublic();
}

function saveRehearsal(e){
  e.preventDefault();
  const body={
    date:document.querySelector("#admin-date").value,
    time:document.querySelector("#admin-time").value,
    location:document.querySelector("#admin-location").value.trim()
  };
  run(e.submitter,async()=>{ await updateEvent(body); showToast("Dados do ensaio atualizados."); });
}

function saveWhatsapp(e){
  e.preventDefault();
  const body={ whatsappUrl:document.querySelector("#admin-whatsapp").value.trim() };
  run(e.submitter,async()=>{ await updateEvent(body); showToast("Link do grupo atualizado."); });
}

function toggleBooking(button){
  const bookingOpen=!state.admin.event.bookingOpen;
  run(button,async()=>{
    await updateEvent({bookingOpen});
    if(!bookingOpen) navigate("home");
    showToast(bookingOpen?"Reservas liberadas. A UI de presença e reserva está ativa.":"Reservas fechadas. A página informativa está ativa.");
  });
}

function adjustStock(button,id,delta){
  const g=state.admin.event.stock.find(x=>x.id===id);
  if(!g || g.stockTotal===null)return;
  const stockTotal=Math.max(0,g.stockTotal+delta);
  // rotativo: as reservas não ocupam o estoque, então o BFF decide
  if(!g.rotativo && stockTotal<g.reservations.length){
    showToast("O estoque total não pode ficar abaixo das reservas atuais.");
    return;
  }
  if(stockTotal===g.stockTotal)return;
  run(button,()=>updateEvent({stocks:[{id,stockTotal}]}));
}

function resetRehearsal(button){
  if(!confirm("Encerrar o ensaio atual e criar um novo? Presença e reservas do ensaio atual serão arquivadas e o novo ensaio começará fechado para reservas."))return;

  run(button,async()=>{
    state.admin=await api("/api/admin/novo-ensaio",{method:"POST"});
    renderAdmin();
    await loadPublic();
    navigate("home");
    showToast("Novo ensaio criado. Reservas estão fechadas.");
  });
}

// Ações: botão disabled enquanto a chamada roda; erro vira toast pela key.

async function run(button,fn){
  if(button){ button.disabled=true; button.setAttribute("aria-busy","true"); }
  try{
    await fn();
  }catch(err){
    await handleError(err);
  }finally{
    if(button && button.isConnected){ button.disabled=false; button.removeAttribute("aria-busy"); }
  }
}

async function handleError(err){
  const key=err?.key;

  if(key==="UNAUTHORIZED_ERROR"){
    state.admin=null;
    state.adminLocked=true;
    renderAdmin();
    openAdminLogin();
    return;
  }

  showToast(ERROR_MESSAGES[key] || GENERIC_ERROR);

  if(key==="BOOKING_CLOSED_ERROR"){
    document.querySelector("#reserve-dialog").close();
    await loadPublic();
    navigate("home");
  }
  if(key==="SOLD_OUT_ERROR" || key==="ACCESSORY_SOLD_OUT_ERROR"){
    document.querySelector("#reserve-dialog").close();
    await loadPublic();
  }
  if(key==="EVENT_CHANGED_ERROR"){
    document.querySelector("#reserve-dialog").close();
    await loadPublic();
    if(currentView()==="admin") await loadAdmin();
  }
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))
}

let toastTimer;
function showToast(msg){
  const t=document.querySelector("#toast");
  t.textContent=msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove("show"),2600);
}

window.navigate=navigate;
init();

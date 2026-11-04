// Estado em memória. Vem do BFF (/api) no init e é recarregado depois de cada ação.
const state = {
  event: null,        // GET /api/ensaio
  eventError: false,
  user: null,         // GET /api/membros
  mineLoading: true,
  mineError: false,
  admin: null,        // GET /api/admin/ensaio?posicao=atual|proximo
  adminTab: "atual",  // F1
  adminDraft: false,  // F4
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
  NEXT_EVENT_EXISTS_ERROR: "Já existe um próximo ensaio.",
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

function instrumentsOf(event){
  return event.groups.filter(g=>g.active).map(group=>({
    group,
    item:event.catalog.find(c=>c.type==="INSTRUMENT" && c.groupIds.includes(group.id)) || null
  })).filter(x=>x.item);
}

function accessoriesOf(event,groupId){
  return event.catalog.filter(c=>c.type==="ACCESSORY" && (!c.groupIds.length || c.groupIds.includes(groupId)));
}

function goingAttendance(user){
  return user?.attendances.find(a=>a.answer==="vou" && a.sync!=="REJECTED") || null;
}

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
    state.user=await api("/api/membros");
    state.mineError=false;
  }catch(err){
    state.user=null;
    state.mineError=err.key!=="NOT_FOUND_ERROR";
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

function isDebug(){
  return new URLSearchParams(location.search).get("debug") === "1";
}

function devEventCode(event){
  if(!isDebug() || !event?.id) return "";
  const integrationId=event.integrationId;
  const integration=integrationId == null
    ? `<span class="dev-not-integrated">NÃO_INTEGRADO</span>`
    : escapeHtml(String(integrationId));
  return `E-${escapeHtml(event.id)}-${integration}`;
}

function devAdminEventCode(event){
  if(!isDebug() || !event?.id) return "";
  const notIntegrated=`<span class="dev-not-integrated">NÃO_INTEGRADO</span>`;
  const eventId=event.integrationId == null ? notIntegrated : escapeHtml(String(event.integrationId));
  const publicId=event.externalPublicId == null ? notIntegrated : escapeHtml(String(event.externalPublicId));
  return `transicionaisEventId: ${eventId}<br>transicionaisPublicEventId: ${publicId}<br>hormoniosId: ${escapeHtml(event.id)}`;
}

function renderAll(){
  const r=state.event || {};
  const date=formatDate(r.date);
  const time=r.startTime || "A definir";
  const location=r.location || "A definir";

  document.querySelector("#home-date").textContent=date;
  document.querySelector("#home-time").textContent=time;
  document.querySelector("#home-location").textContent=location;
  document.querySelector("#closed-date").textContent=date;
  document.querySelector("#closed-time").textContent=time;
  document.querySelector("#closed-location").textContent=location;
  document.querySelector("#home-attendance").textContent=r.goingCount ?? 0;
  const eventCode=devEventCode(state.event);
  document.querySelectorAll("[data-dev-event-code]").forEach(el=>{ el.innerHTML=eventCode; el.hidden=!eventCode; });

  renderUserIdentity();
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

function renderUserIdentity(){
  const user=state.user;
  const idEl=document.querySelector("#presence-user-id");
  idEl.textContent=user ? user.id : "";
  idEl.hidden=!user;
  if(!user) return;
  document.querySelector("#presence-email-hash").value=user.emailHash||"";
  [["#presence-email",user.email],["#presence-name",user.name],["#presence-pronoun",user.pronoun]].forEach(([selector,value])=>{
    const input=document.querySelector(selector);
    if(!input.value) input.value=value||"";
  });
}

function renderInstruments(){
  const el=document.querySelector("#instrument-list"); if(!el)return;

  if(!state.event){ el.innerHTML=state.eventError?retryHtml("Não foi possível carregar os instrumentos."):loadingHtml(); bindRetry(el); return; }
  if(!isBookingOpen()){ el.innerHTML=closedHtml(); return; }

  el.innerHTML=instrumentsOf(state.event).map(({group:g,item},n)=>{
    // available null = sem limite: só o rótulo, sem número
    const avail=item?.stock.free ?? null, sold=avail===0;
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

  const email=document.querySelector("#presence-email").value.trim();
  const name=document.querySelector("#presence-name").value.trim();
  const pronoun=document.querySelector("#presence-pronoun").value.trim();
  const sameUser=email===state.user?.email;
  const current=sameUser ? goingAttendance(state.user) : null;
  const unchanged=sameUser && name===state.user?.name && pronoun===state.user?.pronoun;
  if(unchanged && current){ showStatus("Sua presença já está confirmada."); return; }

  const body={
    email,
    name,
    pronoun,
    answer:"vou",
    groupId:current?.groupId ?? null,
    supportIds:current?.supportIds ?? [],
    emailHash:document.querySelector("#presence-email-hash").value||null
  };

  run(document.querySelector("#presence-submit"),async()=>{
    await api("/api/membros/reservas",{method:"POST",body});
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

  const i=instrumentsOf(state.event).find(x=>x.group.id===id)?.group;
  if(!i)return;

  document.querySelector("#reserve-instrument-id").value=id;
  document.querySelector("#reserve-instrument-label").textContent=i.name;
  document.querySelector("#reserve-accessories").innerHTML=accessoriesOf(state.event,id).map(a=>{
    const sold=a.stock.free===0;
    return `<label class="toggle-row"><input type="checkbox" value="${escapeHtml(a.id)}" ${sold?"disabled":""}><span>Preciso de ${escapeHtml(a.name)}${sold?" (esgotado)":""}</span></label>`;
  }).join("");

  const user=state.user;
  const email=document.querySelector("#reserve-email");
  if(!email.value) email.value=user?.email||state.email;
  if(user){
    document.querySelector("#reserve-name").value=user.name;
    document.querySelector("#reserve-pronoun").value=user.pronoun;
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
  if(goingAttendance(state.user)?.groupId===id){showToast("Você já reservou este instrumento.");return}
  const inst=instrumentsOf(state.event).find(x=>x.group.id===id);
  if(!inst || inst.item?.stock.free===0){showToast("Este instrumento acabou de ficar esgotado.");return}

  const supportIds=[...document.querySelectorAll("#reserve-accessories input:checked")].map(x=>x.value);

  const body={
    email:document.querySelector("#reserve-email").value.trim(),
    name:document.querySelector("#reserve-name").value.trim(),
    pronoun:document.querySelector("#reserve-pronoun").value.trim(),
    answer:"vou",
    groupId:id,
    supportIds,
    emailHash:state.user?.emailHash||null
  };

  run(document.querySelector("#reserve-submit"),async()=>{
    // spec-9 F1
    if(!state.user){
      await api("/api/membros/reservas",{method:"POST",body:{...body,groupId:null,supportIds:[]}});
    }
    await api("/api/membros/reservas",{method:"POST",body});
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

  const x=goingAttendance(state.user);
  if(!x){
    el.innerHTML=`<div class="empty-state">Você ainda não tem reservas ativas para este ensaio.<br><br><button class="text-btn" onclick="navigate('instruments')">Escolher instrumento →</button></div>`;
    return;
  }

  // groupId null = só presença: a linha mostra "Presença confirmada" (dúvida 18)
  const title=x.groupId ? (state.event.groups.find(g=>g.id===x.groupId)?.name || "Instrumento") : "Presença confirmada";
  const names=catalogNames(state.event,x.supportIds).join(" · ");
  const meta=x.groupId ? escapeHtml(names || "Sem acessórios") : "";
  el.innerHTML=`<div class="reservation-row">
      <div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(state.user.name)} · ${escapeHtml(state.user.pronoun)}</small></div>
      <div class="meta"><small>${meta}</small></div>
      <button class="cancel-btn" data-cancel="${escapeHtml(x.id)}">Desfazer</button>
    </div>`;

  el.querySelectorAll("[data-cancel]").forEach(b=>b.addEventListener("click",()=>cancelReservation(b)));
}

function catalogNames(event,ids){
  return (ids||[]).map(id=>event.catalog.find(c=>c.id===id)?.name).filter(Boolean);
}

function cancelReservation(button){
  const item=goingAttendance(state.user);
  if(!item)return;
  const {email,name,pronoun}=state.user;
  const body={ email, name, pronoun, answer:item.groupId?"vou":"nao-vou", groupId:null, supportIds:[], emailHash:state.user.emailHash||null };
  run(button,async()=>{
    await api("/api/membros/reservas",{method:"PATCH",body});
    await loadPublic();
    showToast(item.groupId?"Reserva desfeita. O instrumento voltou ao estoque.":"Reserva desfeita.");
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
    state.admin=await fetchAdmin(state.adminTab);
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

async function fetchAdmin(tab){
  if(tab==="atual"){
    const current=await api("/api/admin/ensaio?posicao=atual");
    state.adminDraft=false;
    return current;
  }
  try{
    const next=await api("/api/admin/ensaio?posicao=proximo");
    state.adminDraft=false;
    return next;
  }catch(err){
    if(err.key!=="NOT_FOUND_ERROR") throw err;
  }
  const current=await api("/api/admin/ensaio?posicao=atual");
  state.adminDraft=true;
  return { event:nextDraft(current.event), users:[] };
}

// F4
function nextDraft(event){
  return {
    ...event,
    id:null,
    integrationId:null,
    externalPublicId:null,
    bookingOpen:false,
    goingCount:0,
    date:addDays(event.date,7),
    catalog:event.catalog.map(c=>({ ...c, stock:{ ...c.stock, used:0, free:c.stock.total } }))
  };
}

function setAdminTab(tab){
  if(tab===state.adminTab) return;
  state.adminTab=tab;
  state.admin=null;
  loadAdmin();
}

function renderAdmin(){
  const el=document.querySelector("#admin-content"); if(!el)return;

  if(state.adminLocked || !state.admin){
    el.innerHTML=`<div class="empty-state">Entre com a senha da Produção.<br><br><button class="text-btn" type="button" id="admin-login-open">Entrar →</button></div>`;
    document.querySelector("#admin-login-open").addEventListener("click",openAdminLogin);
    return;
  }

  const r=state.admin.event;
  const att=state.admin.users.map(u=>{
    const a=goingAttendance(u);
    return a && { name:u.name, pronoun:u.pronoun, groupId:a.groupId, supportIds:a.supportIds, createdAt:a.createdAt };
  }).filter(Boolean);
  const res=att.filter(a=>a.groupId);
  const stock=[...r.catalog.filter(c=>c.type==="INSTRUMENT"),...r.catalog.filter(c=>c.type==="ACCESSORY")].map(c=>({
    id:c.id,
    name:c.name,
    stockTotal:c.stock.total,
    available:c.stock.free,
    rotativo:c.stock.rotative,
    reservations:c.type==="INSTRUMENT"
      ? res.filter(a=>c.groupIds.includes(a.groupId)).map(a=>({ name:a.name, pronoun:a.pronoun, detail:catalogNames(r,a.supportIds).join(" · ") || "Sem acessórios" }))
      : res.filter(a=>a.supportIds.includes(c.id)).map(a=>({ name:a.name, pronoun:a.pronoun, detail:r.groups.find(g=>g.id===a.groupId)?.name || "" }))
  }));
  const bookingOpen=r.bookingOpen === true;
  const isCurrentTab=state.adminTab==="atual";

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

    ${isCurrentTab?`<div class="admin-card admin-booking-control">
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
    </div>`:""}

    <div class="admin-card">
      <h3>ENSAIO${devAdminEventCode(r)?` <small class="dev-event-code">${devAdminEventCode(r)}</small>`:""}</h3>
      <div class="admin-tabs" role="tablist">
        <button type="button" role="tab" data-admin-tab="atual" class="${isCurrentTab?"active":""}" aria-selected="${isCurrentTab}">ATUAL</button>
        <button type="button" role="tab" data-admin-tab="proximo" class="${isCurrentTab?"":"active"}" aria-selected="${!isCurrentTab}">PRÓXIMO</button>
      </div>
      <form id="rehearsal-form" class="admin-form">
        <label>Data<input id="admin-date" type="date" value="${escapeHtml(r.date||"")}"></label>
        <label>Horário<input id="admin-time" type="time" value="${escapeHtml(r.startTime||"")}"></label>
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

    <div class="admin-subsection"><h3>ESTOQUE</h3><div class="admin-table">${stock.map(g=>{
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
  document.querySelector("#toggle-booking")?.addEventListener("click",e=>toggleBooking(e.currentTarget));
  el.querySelectorAll("[data-admin-tab]").forEach(b=>b.addEventListener("click",()=>setAdminTab(b.dataset.adminTab)));
  el.querySelectorAll("[data-stock]").forEach(b=>b.addEventListener("click",()=>adjustStock(b,b.dataset.id,Number(b.dataset.stock))));
  document.querySelector("#reset-rehearsal").addEventListener("click",e=>resetRehearsal(e.currentTarget));
}

function eventBody(event){
  const { id, name, location, whatsappUrl, date, startTime, endTime, categoryId, description, groups, catalog }=event;
  return {
    id, name, location, whatsappUrl, date, startTime, endTime, categoryId, description,
    groups:groups.map(g=>({ id:g.id, name:g.name, active:g.active })),
    catalog:catalog.map(c=>({ id:c.id, name:c.name, type:c.type, groupIds:c.groupIds, stock:{ total:c.stock.total, rotative:c.stock.rotative } }))
  };
}

async function updateEvent(change){
  const body={...eventBody(state.admin.event),...change};
  if(state.adminDraft){
    const { id, ...create }=body;
    await api("/api/admin/ensaio",{method:"POST",body:create});
    await loadAdmin();
    return;
  }
  state.admin=await api("/api/admin/ensaio",{method:"PUT",body});
  renderAdmin();
  await loadPublic();
}

function saveRehearsal(e){
  e.preventDefault();
  const body={
    date:document.querySelector("#admin-date").value,
    startTime:document.querySelector("#admin-time").value || null,
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
    const event=await api("/api/admin/reservas",{method:"PUT",body:{isActive:bookingOpen}});
    state.admin={...state.admin,event};
    renderAdmin();
    await loadPublic();
    if(!bookingOpen) navigate("home");
    showToast(bookingOpen?"Reservas liberadas. A UI de presença e reserva está ativa.":"Reservas fechadas. A página informativa está ativa.");
  });
}

function adjustStock(button,id,delta){
  const g=state.admin.event.catalog.find(x=>x.id===id);
  if(!g || g.stock.total===null)return;
  const total=Math.max(0,g.stock.total+delta);
  // rotativo: as reservas não ocupam o estoque, então o BFF decide
  if(!g.stock.rotative && total<g.stock.used){
    showToast("O estoque total não pode ficar abaixo das reservas atuais.");
    return;
  }
  if(total===g.stock.total)return;
  const catalog=eventBody(state.admin.event).catalog.map(c=>c.id===id?{...c,stock:{...c.stock,total}}:c);
  run(button,()=>updateEvent({catalog}));
}

function addDays(value,days){
  const date=value?new Date(value+"T12:00:00"):new Date();
  if(Number.isNaN(date.getTime())) return addDays(null,days);
  date.setDate(date.getDate()+days);
  const month=String(date.getMonth()+1).padStart(2,"0");
  const day=String(date.getDate()).padStart(2,"0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function resetRehearsal(button){
  if(!confirm("Encerrar o ensaio atual e passar para o próximo? Presença e reservas do ensaio atual serão arquivadas e o próximo ensaio começará fechado para reservas."))return;

  run(button,async()=>{
    try{
      await api("/api/admin/ensaio/proximo",{method:"POST"});
    }catch(err){
      if(err.key==="NOT_FOUND_ERROR"){ showToast("Crie o próximo ensaio na aba PRÓXIMO antes de encerrar."); return; }
      throw err;
    }
    state.adminTab="atual";
    await loadAdmin();
    loadPublic();
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
  if(key==="NEXT_EVENT_EXISTS_ERROR" && currentView()==="admin") await loadAdmin();
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

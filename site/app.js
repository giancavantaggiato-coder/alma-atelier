/* Alma Atelier — app do aluno (beta). Supabase + HTML puro. */
"use strict";
const CFG = window.ALMA_CONFIG || {};
const sb = window.supabase.createClient(CFG.url, CFG.key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "alma-atelier-auth" }
});

const MAX_CRED = 8;
const WD = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];
const WDS = ["dom","seg","ter","qua","qui","sex","sáb"];
const MES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const ICO = {
  hoje:'<svg viewBox="0 0 24 24"><path d="M12 3v3M7 21l3.2-7M17 21l-3.2-7M12 14v7"/><rect x="5" y="6" width="14" height="8" rx="1"/></svg>',
  agenda:'<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  eventos:'<svg viewBox="0 0 24 24"><path d="M12 3.5l2.4 5 5.4.6-4 3.7 1.1 5.4L12 15.5l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/></svg>',
  voce:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.8"/><path d="M4.5 20c1.2-4 4-6 7.5-6s6.3 2 7.5 6"/></svg>',
  equipe:'<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>'
};
const CAM = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
const CHEV_L = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M15 5l-7 7 7 7"/></svg>';
const CHEV_R = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 5l7 7-7 7"/></svg>';

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad = n => String(n).padStart(2,"0");
const cap1 = s => s ? s[0].toUpperCase()+s.slice(1) : "";
const dkey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fromKey = k => { const [y,m,d] = k.split("-").map(Number); return new Date(y,m-1,d); };
const dm = d => `${pad(d.getDate())}/${pad(d.getMonth()+1)}`;
const hh = d => d.getMinutes() ? `${d.getHours()}h${pad(d.getMinutes())}` : `${d.getHours()}h`;
const hm = t => { const [h,m] = String(t).split(":"); return m && m !== "00" ? `${+h}h${m}` : `${+h}h`; };
const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const firstName = n => String(n||"").trim().split(/\s+/)[0] || "";
const initials = n => String(n||"").trim().split(/\s+/).map(p => p[0]).slice(0,2).join("").toUpperCase();
const errMsg = e => (e && (e.message || e.error_description)) || "Algo deu errado. Tente de novo.";

/* ---------- estado ---------- */
const S = {
  session: null, aluno: null, equipe: false, tab: "hoje",
  agenda: [], live: [], resumo: null, creditos: [], eventos: [], matriculas: [],
  mes: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  evFiltro: "proximos", justGrew: null,
  eq: { sec: "dia", dia: startOfDay(new Date()), mes: new Date(new Date().getFullYear(), new Date().getMonth(), 1), mesDados: [], dados: [], alunos: [], turmas: [], cred: {}, eventos: [] }
};

/* ---------- interface comum ---------- */
function toast(t){ const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2800); }
function sheet(html){ $("#sheetBody").innerHTML = html; $("#scrim").classList.add("show"); $("#sheet").classList.add("show"); const f = $("#sheetBody").querySelector("input,select,button:not([disabled])"); f && f.focus({preventScroll:true}); }
function closeSheet(){ $("#scrim").classList.remove("show"); $("#sheet").classList.remove("show"); }
function busy(btn, on){ if(!btn) return; btn.disabled = on; if(on){ btn.dataset.t = btn.textContent; btn.textContent = "Aguarde…"; } else if(btn.dataset.t){ btn.textContent = btn.dataset.t; } }
$("#scrim").addEventListener("click", closeSheet);
document.addEventListener("keydown", e => { if(e.key === "Escape") closeSheet(); });

function renderNav(){
  const tabs = [["hoje","Hoje"],["agenda","Agenda"],["eventos","Eventos"],["voce","Você"]];
  if(S.equipe) tabs.push(["equipe","Equipe"]);
  if(!S.aluno) tabs.splice(0, 4, ["eventos","Eventos"]);
  $("#nav").innerHTML = `<div class="in" role="tablist">${tabs.map(([k,l]) =>
    `<button role="tab" data-tab="${k}" aria-selected="${S.tab===k}"><span class="pillbg">${ICO[k]}</span>${l}</button>`).join("")}</div>`;
  $("#nav").hidden = false;
}
$("#nav").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if(b) go(b.dataset.tab); });
function go(t){ S.tab = t; window.scrollTo(0,0); render(); if(t === "equipe") eqLoad(); }

function render(){
  if(!S.session) return renderLogin();
  if(precisaCompletar()) return PA.pronto ? renderPA() : primeiroAcesso();
  renderNav();
  const v = { hoje: viewHoje, agenda: viewAgenda, eventos: viewEventos, voce: viewVoce, equipe: viewEquipe }[S.tab] || viewHoje;
  $("#view").innerHTML = v();
  bind();
}

/* ---------- login por código ---------- */
const LOGO_ALMA = '<svg class="auth-logo" viewBox="0 0 422 104" role="img" aria-label="Alma"><path fill="currentColor" d="M0 102.544L37.3916 0H62.7089L99.9573 102.544H0Z M182.86 102.544L173.765 76.3459H134.698L125.603 102.544H104.141L141.536 0H166.853L204.102 102.544H182.86ZM154.195 15.7918C154.195 15.7918 147.163 37.8671 139.5 60.1863H168.962L154.195 15.7918Z M204.102 102.544V0H224.543V102.544H204.102Z M281.095 102.544V58.3667C281.095 44.5377 277.116 37.6232 269.164 37.6232C265.042 37.6232 261.683 39.7332 259.086 43.9531C256.49 48.173 255.193 53.6318 255.193 60.3295V102.54H234.752V41.4095C234.752 37.1896 234.737 28.68 234.752 26.3455H244.284C245.166 27.5225 254.589 40.0971 254.589 40.0971C257.109 34.0808 260.565 29.0633 264.322 26.3455C268.08 23.6277 272.581 22.2688 277.817 22.2688C289.845 22.2688 297.144 27.9948 299.713 39.4428H300.151C302.817 33.3297 306.017 28.9394 309.752 26.2681C313.486 23.6006 318.239 22.265 324.013 22.265C331.675 22.265 337.519 24.8744 341.544 30.0893C345.568 35.3042 347.581 42.7878 347.581 52.5401V102.54H327.283V58.3628C327.283 44.5338 323.304 37.6193 315.352 37.6193C311.373 37.6193 308.115 39.5473 305.568 43.4033C303.022 47.2594 301.629 52.5865 301.385 59.3771V102.537H281.087L281.095 102.544Z M413.927 29.6944C408.544 24.7931 400.882 22.3424 390.94 22.3424C380.998 22.3424 373.324 24.3207 367.623 28.2735C361.923 32.2302 356.973 38.9473 356.973 46.7212H378.428C378.866 42.7452 379.969 39.8919 381.737 38.1691C383.506 36.4463 386.284 35.5868 390.065 35.5868C394.14 35.5868 397.074 36.8373 398.869 39.3344C400.661 41.8354 401.563 45.6566 401.563 50.7979V54.801L384.613 55.0914C374.524 55.1882 366.826 57.3717 361.513 61.642C356.203 65.9122 353.548 72.1221 353.548 80.2716C353.548 87.7939 355.681 93.6283 359.949 97.7746C364.218 101.925 370.158 103.996 377.774 103.996C389.315 103.996 397.948 98.8277 403.672 88.4947V102.54H422.004V50.5772C422.004 41.5528 419.311 34.5918 413.927 29.6905V29.6944ZM401.559 70.0857C401.559 73.5313 400.808 76.795 399.303 79.8728C397.798 82.9545 395.727 85.3665 393.084 87.1125C390.441 88.8586 387.519 89.7335 384.318 89.7335C381.455 89.7335 379.164 88.8237 377.445 87.0041C375.723 85.1845 374.864 82.4087 374.864 78.6727C374.864 75.7613 375.387 73.4345 376.428 71.6846C377.469 69.9386 378.986 68.6416 380.975 67.7899C382.964 66.942 386.335 66.4194 391.087 66.2258L401.563 66.0787V70.0818L401.559 70.0857Z"/></svg>';
const ICO_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/></svg>';

function authHTML(step, email, reenvio){
  const head = (t, p) => `<div class="auth-head"><h1>${t}</h1>${p ? `<p>${p}</p>` : ""}</div>`;
  let panel;
  if(step === "inicio"){
    panel = `${head("Bem-vindo ao atelier", "Agenda, reposições e eventos do Alma num só lugar.")}
      <button class="abtn light" type="button" data-auth="email">${ICO_MAIL}Entrar com e-mail</button>
      <a class="abtn line" href="https://almaestudosvisuais.com.br" target="_blank" rel="noopener">Conhecer o Alma</a>
      <p class="alegal">O acesso é liberado para alunos do atelier.</p>`;
  } else if(step === "email"){
    panel = `<form id="authForm" novalidate style="display:contents">
      ${head("Entrar com e-mail", "Use o e-mail cadastrado no atelier. Enviamos um código, sem senha.")}
      <input class="ain" id="lemail" type="email" autocomplete="email" inputmode="email" placeholder="voce@email.com" value="${esc(email)}" aria-label="E-mail">
      <p class="aerr" id="lerr" hidden></p>
      <button class="abtn light" type="submit">Enviar código</button>
      <button class="abtn line" type="button" data-auth="inicio">Voltar</button></form>`;
  } else {
    panel = `<form id="authForm" novalidate style="display:contents">
      ${head("Digite o código", `Enviamos 6 dígitos para <b>${esc(email)}</b>.`)}
      <label class="otp" id="otpBox" aria-label="Código de 6 dígitos">${"<span></span>".repeat(6)}<input id="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*"></label>
      <p class="aerr" id="lerr" hidden></p>
      <button class="abtn light" type="submit">Entrar</button>
      <div class="alinks"><button type="button" data-auth="email">Usar outro e-mail</button><button type="button" id="reenviar" ${reenvio > 0 ? "disabled" : ""}>${reenvio > 0 ? `Reenviar em ${reenvio}s` : "Reenviar código"}</button></div></form>`;
  }
  return `<div class="auth"><div class="auth-hero">${LOGO_ALMA}</div><div class="auth-panel">${panel}</div></div>`;
}
function bindOtp(onComplete){
  const otp = document.getElementById("otp"); if(!otp) return null;
  const boxes = [...document.querySelectorAll("#otpBox span")];
  const paint = () => { const v = otp.value.replace(/\D/g,"").slice(0,6); otp.value = v;
    boxes.forEach((b,i) => { b.textContent = v[i] || ""; b.classList.toggle("caret", i === Math.min(v.length,5) && document.activeElement === otp && v.length < 6); });
    if(v.length === 6) onComplete(); };
  otp.oninput = paint; otp.onfocus = paint; otp.onblur = paint; setTimeout(() => otp.focus(), 60); paint();
  return otp;
}

let loginEmail = "", loginStep = "inicio", reenvio = 0, reenvioT = null;
function startReenvio(){ reenvio = 60; clearInterval(reenvioT); reenvioT = setInterval(() => { reenvio--; const b = $("#reenviar"); if(b){ b.disabled = reenvio > 0; b.textContent = reenvio > 0 ? `Reenviar em ${reenvio}s` : "Reenviar código"; } if(reenvio <= 0) clearInterval(reenvioT); }, 1000); }
async function enviarCodigo(){
  const { data: ok, error: e1 } = await sb.rpc("pode_entrar", { p_email: loginEmail });
  if(e1) throw new Error("Não foi possível verificar o e-mail. Tente de novo.");
  if(!ok) throw new Error("Este e-mail não está cadastrado no atelier. Use o e-mail que você passou para a equipe ou fale com a gente.");
  const { error } = await sb.auth.signInWithOtp({ email: loginEmail, options: { shouldCreateUser: true } }); if(error) throw error; startReenvio(); }
function renderLogin(step){
  if(step) loginStep = step;
  $("#nav").hidden = true;
  $("#view").innerHTML = authHTML(loginStep, loginEmail, reenvio);
  $$("[data-auth]").forEach(b => b.onclick = () => renderLogin(b.dataset.auth));
  const f = $("#authForm"); if(!f) return;
  const err = $("#lerr"), btn = f.querySelector("button[type=submit]");
  const fail = m => { err.textContent = m; err.hidden = false; };
  const otp = bindOtp(() => { if(!btn.disabled) f.requestSubmit(); });
  if(otp) $("#reenviar").onclick = async () => { try{ await enviarCodigo(); toast("Código reenviado"); }catch(ex){ fail(errMsg(ex)); } };
  else setTimeout(() => $("#lemail").focus(), 60);
  f.onsubmit = async e => {
    e.preventDefault(); err.hidden = true; busy(btn, true);
    try{
      if(loginStep === "email"){
        loginEmail = $("#lemail").value.trim().toLowerCase();
        if(!/^\S+@\S+\.\S+$/.test(loginEmail)) throw new Error("Confira o e-mail digitado.");
        await enviarCodigo();
        renderLogin("codigo");
      } else {
        const token = otp.value;
        if(token.length < 6) throw new Error("O código tem 6 dígitos.");
        acabouDeEntrar(true);
        const { error } = await sb.auth.verifyOtp({ email: loginEmail, token, type: "email" });
        if(error){ acabouDeEntrar(false); throw new Error("Código inválido ou vencido. Confira ou peça um novo."); }
        loginStep = "inicio";
      }
    }catch(ex){ fail(/rate|seconds/i.test(ex.message || "") ? "Aguarde um minuto antes de pedir outro código." : errMsg(ex)); busy(btn, false); if(otp){ otp.value = ""; otp.focus(); } }
  };
}

/* ---------- carregamento ---------- */
async function loadMe(){
  const uid = S.session.user.id;
  const [{ data: aluno }, { data: eq }] = await Promise.all([
    sb.from("pessoas").select("*").eq("auth_user_id", uid).maybeSingle(),
    sb.rpc("sou_equipe")
  ]);
  S.pessoa = aluno || null;
  S.aluno = aluno && ["aluno","pausado"].includes(aluno.vinculo) && aluno.acesso_app ? aluno : null;
  S.equipe = !!eq;
}
async function loadAluno(){
  if(!S.aluno) return;
  const de = addDays(new Date(), -120), ate = addDays(new Date(), 150);
  const [ag, live, res, cr, mt] = await Promise.all([
    sb.rpc("agenda", { p_de: dkey(de), p_ate: dkey(ate) }),
    sb.rpc("em_aula_agora"),
    sb.rpc("meu_resumo"),
    sb.from("creditos").select("*").eq("aluno_id", S.aluno.id).is("usado_em_reserva_id", null).gte("expira_em", dkey(new Date())).order("data_falta"),
    sb.from("matriculas").select("turma_id, turmas(nome,dia_semana,inicio,fim)").eq("aluno_id", S.aluno.id).is("ate", null)
  ]);
  S.agenda = (ag.data || []).map(a => ({ ...a, ini: new Date(a.inicia_em), fim: new Date(a.termina_em) }));
  S.live = live.data || [];
  S.resumo = (res.data && res.data[0]) || null;
  S.creditos = (cr.data || []).filter(c => c.aluno_id === S.aluno.id);
  S.matriculas = mt.data || [];
  const { data: al } = await sb.from("pessoas").select("*").eq("id", S.aluno.id).maybeSingle();
  if(al) S.aluno = al;
}
async function loadEventos(){
  const { data } = await sb.rpc("eventos_lista");
  S.eventos = (data || []).map(e => ({ ...e, ini: new Date(e.inicia_em), fim: new Date(e.termina_em) }));
}
async function refresh(){ await Promise.all([loadAluno(), loadEventos()]); render(); }

async function boot(){
  $("#view").innerHTML = `<div class="loading">Carregando…</div>`;
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  if(!S.session) return renderLogin();
  try{
    await loadMe();
    if(!S.aluno && !S.equipe){
      $("#nav").hidden = true;
      $("#view").innerHTML = `<div class="auth"><div class="auth-hero">${LOGO_ALMA}</div>
        <div class="auth-panel"><div class="auth-head"><h1>${S.pessoa && ["aluno","pausado"].includes(S.pessoa.vinculo) ? "Acesso ainda não liberado" : S.pessoa ? "O app é para alunos do atelier" : "E-mail não cadastrado"}</h1><p>${S.pessoa && ["aluno","pausado"].includes(S.pessoa.vinculo)
          ? `Olá, ${esc(firstName(S.pessoa.nome))}. Seu cadastro está no atelier, mas o acesso ao app ainda não foi liberado. Fale com a equipe.`
          : S.pessoa
          ? `Olá, ${esc(firstName(S.pessoa.nome))}. O acesso ao app fica liberado enquanto a matrícula no atelier estiver ativa. Para voltar às aulas, fale com a equipe pelo WhatsApp.`
          : `${esc(S.session.user.email)} ainda não está na lista de alunos do atelier. Fale com a equipe para liberar o seu acesso.`}</p></div>
        <button class="abtn line" id="sair">Sair</button></div></div>`;
      $("#sair").onclick = () => sb.auth.signOut();
      return;
    }
    if(precisaCompletar()){
      if(!acabouDeEntrar()){ await sb.auth.signOut(); return; }
      return primeiroAcesso();
    }
    if(!S.aluno) S.tab = "equipe";
    await Promise.all([loadAluno(), loadEventos()]);
    render();
    if(S.tab === "equipe") eqLoad();
  }catch(ex){
    $("#view").innerHTML = `<div class="loading">Não foi possível carregar. Verifique a conexão.</div>`;
  }
}
sb.auth.onAuthStateChange((ev, session) => {
  if(ev === "SIGNED_IN" && !S.session){ S.session = session; boot(); }
  if(ev === "SIGNED_OUT"){ Object.assign(S, { session:null, aluno:null, equipe:false, tab:"hoje" }); renderLogin("inicio"); }
  if(ev === "TOKEN_REFRESHED") S.session = session;
});
document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible" && S.aluno && !precisaCompletar()) refresh(); });

/* ---------- primeiro acesso ---------- */
let _entrou = false;
function acabouDeEntrar(v){
  if(v !== undefined){ _entrou = v; try{ v ? sessionStorage.setItem("alma-entrou","1") : sessionStorage.removeItem("alma-entrou"); }catch(_){} return v; }
  if(_entrou) return true; try{ return sessionStorage.getItem("alma-entrou") === "1"; }catch(_){ return false; }
}
const precisaCompletar = () => !!(S.aluno && !S.aluno.cadastro_completo_em);
const PA = { passo: 1, nome: "", sobrenome: "", whats: "", desde: "", freq: 0, dias: [], horarios: [], fixos: false };
async function primeiroAcesso(){
  const partes = String(S.aluno.nome || "").trim().split(/\s+/).filter(Boolean);
  PA.nome = PA.nome || partes[0] || ""; PA.sobrenome = PA.sobrenome || S.aluno.sobrenome || partes.slice(1).join(" ");
  PA.whats = PA.whats || S.aluno.whatsapp || "";
  if(!PA.desde && S.aluno.aluno_desde && S.aluno.aluno_desde !== String(S.aluno.criado_em || "").slice(0,10)) PA.desde = S.aluno.aluno_desde.slice(0,7);
  const { data } = await sb.rpc("horarios_para_escolher");
  PA.horarios = data || []; PA.pronto = true;
  const meus = PA.horarios.filter(h => h.meu).map(h => h.id);
  PA.fixos = meus.length > 0;
  if(PA.fixos){ PA.dias = meus; PA.freq = meus.length; }
  else if(!PA.freq && S.aluno.frequencia_semanal) PA.freq = S.aluno.frequencia_semanal;
  renderPA();
}
function renderPA(){
  $("#nav").hidden = true;
  const pausado = S.aluno.vinculo !== "aluno", total = pausado ? 1 : 2;
  const passo = `<p class="apasso">${PA.passo} de ${total}</p>`;
  let panel;
  if(PA.passo === 1){
    panel = `<form id="paForm" novalidate style="display:contents">${passo}
      <div class="auth-head"><h1>Sobre você</h1><p>Seu nome aparece para o atelier e os colegas. O telefone fica só com a equipe.</p></div>
      <input class="ain" id="paNome" autocomplete="given-name" autocapitalize="words" placeholder="Primeiro nome" value="${esc(PA.nome)}" aria-label="Primeiro nome">
      <input class="ain" id="paSob" autocomplete="family-name" autocapitalize="words" placeholder="Sobrenome" value="${esc(PA.sobrenome)}" aria-label="Sobrenome">
      <input class="ain" id="paWhats" type="tel" inputmode="tel" autocomplete="tel" placeholder="Telefone (WhatsApp)" value="${esc(PA.whats)}" aria-label="Telefone (WhatsApp)">
      <label class="alabel" for="paDesde">Desde quando você faz aula no Alma?</label>
      <input class="ain" id="paDesde" type="month" max="${dkey(new Date()).slice(0,7)}" value="${esc(PA.desde)}" aria-label="Desde quando você faz aula no Alma">
      <p class="aerr" id="paErr" hidden></p>
      <button class="abtn light" type="submit">${pausado ? "Entrar no app" : "Continuar"}</button>
      <button class="abtn line" type="button" id="paSair">Sair</button></form>`;
  } else {
    const max = Math.min(3, Math.max(1, PA.horarios.length));
    const opcoes = PA.fixos ? [PA.freq] : Array.from({ length: max }, (_, i) => i + 1);
    const dias = PA.freq ? PA.horarios.filter(h => !PA.fixos || h.meu).map(h => {
      const lotado = !PA.fixos && h.ocupados >= h.capacidade, on = PA.dias.includes(h.id);
      const cheio = !on && PA.dias.length >= PA.freq;
      return `<button type="button" class="aopt${on ? " on" : ""}" data-dia="${h.id}" aria-pressed="${on}" ${PA.fixos || lotado || cheio ? "disabled" : ""}>
        <span>${cap1(WD[h.dia_semana])}</span><small>${hm(h.inicio)} às ${hm(h.fim)}${lotado ? " · completo" : ""}</small></button>`; }).join("") : "";
    const falta = PA.freq - PA.dias.length;
    panel = `<form id="paForm" novalidate style="display:contents">${passo}
      <div class="auth-head"><h1>Quantas vezes por semana você vem ao atelier?</h1></div>
      <div class="afreq">${opcoes.map(n => `<button type="button" class="aopt${PA.freq === n ? " on" : ""}" data-freq="${n}" aria-pressed="${PA.freq === n}" ${PA.fixos ? "disabled" : ""}><span>${n}x</span><small>por semana</small></button>`).join("")}</div>
      ${PA.freq ? `<div class="auth-head" style="margin-top:var(--s3)"><h1>${PA.freq === 1 ? "Qual dia?" : "Quais dias?"}</h1>
        <p>${PA.fixos ? "Seus dias já foram definidos pelo atelier." : falta > 0 ? `Escolha ${plural(falta, "dia", "dias")}${PA.dias.length ? " a mais" : ""}.` : "Esses serão seus dias fixos no atelier."}</p></div>
        <div class="adias">${dias || `<p class="sub">O atelier ainda não cadastrou os horários.</p>`}</div>` : ""}
      <p class="aerr" id="paErr" hidden></p>
      <button class="abtn light" type="submit" ${PA.freq && PA.dias.length === PA.freq ? "" : "disabled"}>Entrar no app</button>
      <button class="abtn line" type="button" id="paVoltar">Voltar</button></form>`;
  }
  $("#view").innerHTML = `<div class="auth"><div class="auth-hero">${LOGO_ALMA}</div><div class="auth-panel">${panel}</div></div>`;
  const f = $("#paForm"), err = $("#paErr"), btn = f.querySelector("button[type=submit]");
  const fail = m => { err.textContent = m; err.hidden = false; busy(btn, false); };
  $$("[data-freq]").forEach(b => b.onclick = () => { PA.freq = +b.dataset.freq; PA.dias = PA.dias.slice(0, PA.freq); renderPA(); });
  $$("[data-dia]").forEach(b => b.onclick = () => { const id = b.dataset.dia; PA.dias = PA.dias.includes(id) ? PA.dias.filter(x => x !== id) : [...PA.dias, id]; renderPA(); });
  if($("#paSair")) $("#paSair").onclick = () => sb.auth.signOut();
  if($("#paVoltar")) $("#paVoltar").onclick = () => { PA.passo = 1; renderPA(); };
  if(PA.passo === 1) setTimeout(() => (PA.nome ? $("#paSob") : $("#paNome")).focus(), 60);
  f.onsubmit = async e => {
    e.preventDefault(); err.hidden = true;
    if(PA.passo === 1){
      PA.nome = $("#paNome").value.trim(); PA.sobrenome = $("#paSob").value.trim(); PA.whats = $("#paWhats").value.trim(); PA.desde = $("#paDesde").value;
      if(!PA.nome || !PA.sobrenome) return fail("Preencha nome e sobrenome.");
      if(PA.whats.replace(/\D/g,"").length < 10) return fail("Confira o telefone, com DDD.");
      if(!/^\d{4}-\d{2}$/.test(PA.desde)) return fail("Conte desde quando você faz aula no Alma (mês e ano).");
      if(!pausado){ PA.passo = 2; return renderPA(); }
    }
    busy(btn, true);
    try{
      const { error } = await sb.rpc("completar_cadastro", { p_nome: PA.nome, p_sobrenome: PA.sobrenome, p_whatsapp: PA.whats, p_desde: PA.desde + "-01", p_frequencia: pausado ? (S.aluno.frequencia_semanal || 1) : PA.freq, p_horarios: pausado ? [] : PA.dias });
      if(error) throw error;
      acabouDeEntrar(false); Object.assign(PA, { pronto: false, passo: 1, nome: "", sobrenome: "", whats: "", desde: "", freq: 0, dias: [] });
      S.tab = "hoje"; boot();
    }catch(ex){ fail(errMsg(ex)); if(/completo/.test(ex.message || "")) primeiroAcesso(); }
  };
}

/* ---------- regras de leitura ---------- */
const now = () => new Date();
const isMine = a => a.reserva_id && a.reserva_status;
const activeMine = a => isMine(a) && ["confirmada","presente"].includes(a.reserva_status) && !a.cancelada;
function nextClass(){ const n = now(); return S.agenda.find(a => activeMine(a) && a.reserva_status === "confirmada" && a.ini > n); }
function currentClass(){ const n = now(); return S.agenda.find(a => activeMine(a) && a.ini <= n && a.fim > n); }
function todayClasses(){ const k = dkey(now()); return S.agenda.filter(a => activeMine(a) && dkey(a.ini) === k); }
const vagas = a => Math.max(0, a.capacidade - a.ocupadas);
const nCred = () => S.creditos.length;
const horarioNome = t => `${cap1(WD[t.dia_semana])} · ${hm(t.inicio)}–${hm(t.fim)}`;
const PAG = { em_dia: "Em dia", pendente: "Pendente", atrasado: "Em atraso" };

/* ---------- Hoje ---------- */
function viewHoje(){
  const n = now(), cur = currentClass(), hoje = todayClasses().filter(a => a.ini > n);
  const estado = cur ? "" : hoje.length ? `Sua aula hoje é às ${hh(hoje[0].ini)}.` : "Hoje você não tem aula.";
  const nx = nextClass(), ac = nCred(), live = S.live.length;
  const ev = S.eventos.find(e => e.ini > n && e.publicado);
  return `
  <header class="hello">
    <p class="label">${cap1(WD[n.getDay()])}, ${dm(n)}</p>
    <h1 class="h4">Olá, ${esc(firstName(S.aluno.nome))}</h1>
    ${estado ? `<p class="sub" style="font-size:var(--t-body)">${estado}</p>` : ""}
  </header>
  <button class="live" id="liveBtn" ${live ? "" : "disabled"}>
    <span class="dot"></span><u>${live ? `${plural(live,"aluno","alunos")} em aula agora` : "Ninguém no atelier agora"}</u>
  </button>
  ${nx ? `<section class="tile wide next">
    <div class="tl"><h2 class="tt">Próxima aula</h2><span class="chip">${nx.reserva_tipo === "reposicao" ? "Reposição" : "Seu dia fixo"}</span></div>
    <div class="tv tnum">${cap1(WD[nx.ini.getDay()])}, ${dm(nx.ini)}</div>
    <p class="ts">${hh(nx.ini)} às ${hh(nx.fim)}</p>
    <button class="textbtn" id="desmBtn" data-aula="${nx.aula_id}">Não vou poder ir</button>
  </section>` : `<section class="tile wide next"><div class="tl"><h2 class="tt">Próxima aula</h2></div><p class="sub">Nenhuma aula marcada. Veja os dias com vaga na agenda.</p></section>`}
  <div class="list">
    <button class="li" data-go="agenda"><span class="ind"></span><span class="tnum">${ac === 1 ? "1 reposição disponível" : `${ac} reposições disponíveis`}</span></button>
    <div class="li"><span class="ind n"></span>Mensalidade<span class="end">Em construção</span></div>
    ${ev ? `<button class="li" data-ev="${ev.id}"><span class="ind n"></span><span>${esc(ev.titulo)}</span><span class="end tnum">${WDS[ev.ini.getDay()]} ${dm(ev.ini)}</span></button>` : ""}
  </div>`;
}

/* ---------- Agenda ---------- */
const repoDesfeita = a => isMine(a) && a.reserva_tipo === "reposicao" && ["desmarcada","aula_cancelada"].includes(a.reserva_status);
function dayInfo(list){
  const n = now();
  const mine = list.find(a => isMine(a) && !repoDesfeita(a));
  if(mine){
    const st = mine.reserva_status;
    let cls;
    if(mine.cancelada || st === "aula_cancelada" || st === "desmarcada") cls = "c off";
    else if(st === "falta" || st === "ausencia_tardia") cls = "c miss";
    else if(mine.ini <= n && mine.fim > n) cls = "c mine now";
    else if(mine.fim <= n) cls = "c done";
    else cls = "c mine";
    if(mine.reserva_tipo === "reposicao" && !cls.includes("off")) cls += " repo";
    return cls;
  }
  const abertas = list.filter(a => !a.cancelada);
  if(!abertas.length) return "c sm";
  if(abertas.every(a => a.fim <= n)) return "c sm gone";
  return abertas.some(a => a.fim > n && vagas(a) > 0) ? "c sm vaga" : "c sm";
}
function viewAgenda(){
  const y = S.mes.getFullYear(), m = S.mes.getMonth(), off = (new Date(y,m,1).getDay()+6)%7, days = new Date(y,m+1,0).getDate();
  const byDay = {}; S.agenda.forEach(a => (byDay[dkey(a.ini)] ||= []).push(a));
  const today = startOfDay(now());
  let cells = ""; for(let i=0;i<off;i++) cells += "<div></div>";
  for(let d=1; d<=days; d++){
    const dt = new Date(y,m,d), k = dkey(dt), list = byDay[k], isToday = +dt === +today;
    const cc = `cell${isToday ? " today" : ""}${dt < today ? " past" : ""}`;
    if(!list){ cells += `<div class="${cc}"><span class="slot"></span><span class="n tnum">${d}</span></div>`; continue; }
    let cls = dayInfo(list);
    if(S.justGrew === k) cls += " grow";
    cells += `<button class="${cc}" data-day="${k}" aria-label="${d} de ${MES[m]}"><span class="slot"><span class="${cls}"></span></span><span class="n tnum">${d}</span></button>`;
  }
  S.justGrew = null;
  const minM = new Date(today.getFullYear(), today.getMonth()-3, 1), maxM = new Date(today.getFullYear(), today.getMonth()+4, 1);
  const ac = nCred();
  return `<h1 class="h4">Agenda</h1>
  <div class="monthbar">
    <button class="iconbtn" id="prevM" aria-label="Mês anterior" ${S.mes <= minM ? "disabled" : ""}>${CHEV_L}</button>
    <div class="title">${cap1(MES[m])} ${y}</div>
    <button class="iconbtn" id="nextM" aria-label="Próximo mês" ${S.mes >= maxM ? "disabled" : ""}>${CHEV_R}</button>
  </div>
  <div class="wk"><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span><span>D</span></div>
  <div class="grid">${cells}</div>
  <div class="credits">
    <span class="tnum"><b>${ac} de ${MAX_CRED}</b> <span style="color:var(--muted)">reposições disponíveis</span></span>
    <div class="dots" aria-hidden="true">${Array.from({length:MAX_CRED},(_,i)=>`<span class="${i<ac?"on":""}"></span>`).join("")}</div>
  </div>
  <div class="hint"><span>Toque num dia com vaga para marcar uma reposição.</span><span>Toque no seu dia para desmarcar ou remarcar.</span></div>
  ${mudancas().total ? `<button class="textbtn voltar" id="voltarFixos">Reverter para meus dias fixos</button>` : ""}`;
}
function mudancas(){
  const lim = new Date(+now() + 4*36e5);
  const fut = S.agenda.filter(a => isMine(a) && !a.cancelada && a.ini > lim);
  const rep = fut.filter(a => a.reserva_tipo === "reposicao" && a.reserva_status === "confirmada").length;
  const fix = fut.filter(a => a.reserva_tipo === "fixa" && a.reserva_status === "desmarcada").length;
  return { rep, fix, total: rep + fix };
}
function sheetVoltar(){
  const m = mudancas();
  const partes = [m.rep ? `${m.rep === 1 ? "a reposição marcada é desfeita e o crédito volta para você" : `as ${m.rep} reposições marcadas são desfeitas e os créditos voltam para você`}` : "",
    m.fix ? `${m.fix === 1 ? "a aula desmarcada volta para a sua agenda" : `as ${m.fix} aulas desmarcadas voltam para a sua agenda`}` : ""].filter(Boolean);
  sheet(`<p class="label">Agenda</p><h3 class="h5">Reverter para seus dias fixos?</h3>
    <p class="sub">${cap1(partes.join(" e "))}. Vale para as aulas que começam daqui a mais de 4 horas.</p>
    <div class="btns"><button class="btn pri" id="voltarOk">Reverter</button><button class="btn ghost" data-close>Agora não</button></div>`);
  $("#voltarOk").onclick = async ev => {
    const btn = ev.currentTarget; busy(btn, true);
    const { data, error } = await sb.rpc("voltar_dias_fixos");
    if(error){ busy(btn, false); return toast(errMsg(error)); }
    closeSheet(); await loadAluno(); render();
    toast(data && data.puladas ? `Agenda revertida. ${plural(data.puladas, "aula não pôde voltar", "aulas não puderam voltar")} (sem vaga ou reposição já usada)` : "Agenda de volta aos seus dias fixos");
  };
}
function sheetDia(k){
  const list = S.agenda.filter(a => dkey(a.ini) === k);
  const mine = list.find(a => isMine(a) && !(a.reserva_tipo === "reposicao" && a.reserva_status === "desmarcada"));
  if(mine) return sheetAula(mine);
  if(list.length === 1) return sheetAula(list[0]);
  const d = fromKey(k);
  sheet(`<p class="label">Atelier aberto</p><h3 class="h5">${cap1(WD[d.getDay()])}, ${dm(d)}</h3>
    <div class="opts">${list.map(a => `<button class="opt" data-aula="${a.aula_id}"><span>${hh(a.ini)} às ${hh(a.fim)}</span><span class="sub">${a.cancelada ? "cancelada" : a.fim <= now() ? "já passou" : `${vagas(a)} vagas`}</span></button>`).join("")}</div>
    <div class="btns"><button class="btn ghost" data-close>Fechar</button></div>`);
}
function sheetAula(a){
  const nome = `${cap1(WD[a.ini.getDay()])}, ${dm(a.ini)}`, hr = `${hh(a.ini)} às ${hh(a.fim)}`, n = now();
  const close = `<div class="btns"><button class="btn ghost" data-close>Fechar</button></div>`;
  if(a.cancelada) return sheet(`<p class="label">Aula cancelada</p><h3 class="h5">${nome}</h3><p class="sub">${hr}. Esta aula foi cancelada pelo atelier.${isMine(a) ? " Sua reposição já está disponível." : ""}</p>${close}`);
  const repoDesfeita = isMine(a) && a.reserva_tipo === "reposicao" && a.reserva_status === "desmarcada" && a.ini > n;
  if(isMine(a) && !repoDesfeita){
    if(a.reserva_status === "confirmada" && a.ini > n) return sheetDesmarcar(a);
    if(a.reserva_tipo === "fixa" && ["desmarcada","ausencia_tardia"].includes(a.reserva_status) && a.ini > n){
      const lotado = vagas(a) <= 0;
      return sheet(`<p class="label">Seu dia fixo</p><h3 class="h5">Remarcar ${WD[a.ini.getDay()]}, ${dm(a.ini)}?</h3>
        <p class="sub">${hr}. Você desmarcou esta aula.${lotado ? " O horário está lotado agora." : a.reserva_status === "desmarcada" ? " Ao remarcar, 1 das suas reposições é usada." : ""}</p>
        <div class="btns"><button class="btn pri" data-remarcar="${a.reserva_id}" ${lotado ? "disabled" : ""}>Remarcar aula</button><button class="btn ghost" data-close>Agora não</button></div>`);
    }
    const txt = { confirmada: a.fim <= n ? "Presença registrada." : "Você está em aula agora.", presente: "Presença registrada.", falta: "Falta registrada.",
      desmarcada: "Desmarcada com aviso.", ausencia_tardia: "Avisada com menos de 4h. Não gerou reposição.", aula_cancelada: "Aula cancelada pelo atelier." }[a.reserva_status] || "";
    return sheet(`<p class="label">${a.reserva_tipo === "reposicao" ? "Reposição" : "Sua aula"}</p><h3 class="h5">${nome}</h3><p class="sub">${hr}. ${txt}</p>${close}`);
  }
  if(a.ini <= n) return sheet(`<h3 class="h5">${nome}</h3><p class="sub">${hr}. Esta aula já aconteceu.</p>${close}`);
  const v = vagas(a), ac = nCred(), pode = v > 0 && ac > 0 && S.aluno.vinculo === "aluno";
  const motivo = v <= 0 ? "Atelier lotado neste horário." : ac === 0 ? "Você não tem reposições disponíveis." : S.aluno.vinculo !== "aluno" ? "Sua matrícula está pausada." : `Usa 1 das suas ${plural(ac, "reposição", "reposições")}.`;
  sheet(`<p class="label">Atelier aberto</p><h3 class="h5">Repor ${WD[a.ini.getDay()]}, ${dm(a.ini)}?</h3><p class="sub">${hr}. ${motivo}</p>
    <div class="facts"><div><b class="tnum">${v}</b><span>vagas livres</span></div><div><b class="tnum">${a.ocupadas}</b><span>confirmados</span></div><div><b class="tnum">${ac}</b><span>suas reposições</span></div></div>
    <div class="btns"><button class="btn pri" data-book="${a.aula_id}" ${pode ? "" : "disabled"}>Marcar reposição</button><button class="btn ghost" data-close>Agora não</button></div>`);
}
function sheetDesmarcar(a){
  const horas = (a.ini - now()) / 36e5, ok = horas >= 4, ac = nCred();
  const fim = new Date(a.ini); fim.setFullYear(fim.getFullYear()+1);
  const msg = !ok ? "Faltam menos de 4h. A ausência fica registrada, mas não gera reposição."
    : a.reserva_tipo === "reposicao" ? "O crédito usado nesta reposição volta para você."
    : ac >= MAX_CRED ? `Você já tem ${MAX_CRED} reposições, o limite. A ausência fica registrada sem novo crédito.`
    : "Você ganha 1 reposição para usar quando quiser.";
  sheet(`<p class="label">${a.reserva_tipo === "reposicao" ? "Reposição" : "Sua aula"}</p><h3 class="h5">Desmarcar ${WD[a.ini.getDay()]}, ${dm(a.ini)}?</h3>
    <p class="sub">${hh(a.ini)} às ${hh(a.fim)}. ${msg}</p>
    <div class="btns"><button class="btn pri" data-cancel="${a.reserva_id}">Desmarcar aula</button><button class="btn ghost" data-close>Manter</button></div>`);
}
async function doCancel(id, btn){
  busy(btn, true);
  const { data, error } = await sb.rpc("desmarcar", { p_reserva: id });
  if(error){ busy(btn, false); return toast(errMsg(error)); }
  closeSheet();
  toast({ credito_gerado: "Aula desmarcada. +1 reposição", credito_devolvido: "Reposição desmarcada. O crédito voltou.", ausencia_sem_credito: "Ausência registrada", limite_de_creditos: "Aula desmarcada" }[data] || "Aula desmarcada");
  await loadAluno(); render();
}
async function doBook(aulaId, btn){
  busy(btn, true);
  const { error } = await sb.rpc("marcar_reposicao", { p_aula: aulaId });
  if(error){ busy(btn, false); return toast(errMsg(error)); }
  const a = S.agenda.find(x => x.aula_id === aulaId);
  closeSheet(); await loadAluno();
  if(a){ S.justGrew = dkey(a.ini); S.mes = new Date(a.ini.getFullYear(), a.ini.getMonth(), 1); }
  render(); toast("Reposição marcada");
}

/* ---------- Eventos ---------- */
function viewEventos(){
  const n = now();
  const lista = S.eventos.filter(e => e.fim > n && (S.evFiltro === "proximos" || e.inscrito));
  return `<h1 class="h4">Eventos</h1>
  ${S.aluno ? `<div class="seg" role="group" aria-label="Filtro">
    <button data-evf="proximos" aria-pressed="${S.evFiltro === "proximos"}">Próximos</button>
    <button data-evf="meus" aria-pressed="${S.evFiltro === "meus"}">Inscrito</button></div>` : ""}
  <div class="events">${lista.length ? lista.map(e => {
    const vag = e.vagas == null ? null : Math.max(0, e.vagas - e.inscritos);
    return `<button class="ev" data-ev="${e.id}">
      <div class="date"><b class="tnum">${pad(e.ini.getDate())}</b><span>${MES[e.ini.getMonth()].slice(0,3)}</span></div>
      <div class="info"><p class="label">${esc(e.tipo)}${e.publicado ? "" : " · rascunho"}</p><span class="title">${esc(e.titulo)}</span><span class="sub">${WD[e.ini.getDay()]}, ${hh(e.ini)} às ${hh(e.fim)}</span></div>
      <span class="tag ${e.inscrito ? "in" : ""}">${e.inscrito ? "Inscrito" : vag == null ? "Aberto" : vag ? `${vag} vagas` : "Esgotado"}</span>
    </button>`; }).join("") : `<p class="empty">${S.evFiltro === "meus" ? "Você ainda não se inscreveu em nenhum evento." : "Nenhum evento marcado por enquanto."}</p>`}</div>`;
}
function sheetEvento(id){
  const e = S.eventos.find(x => x.id === id); if(!e) return;
  const vag = e.vagas == null ? null : Math.max(0, e.vagas - e.inscritos);
  const [p1, p2] = String(e.preco_texto || "").split(" · ");
  sheet(`<p class="label">${esc(e.tipo)}</p><h3 class="h5">${esc(e.titulo)}</h3>
    <p class="sub">${cap1(WD[e.ini.getDay()])}, ${dm(e.ini)} · ${hh(e.ini)} às ${hh(e.fim)}${e.local ? ` · ${esc(e.local)}` : ""}</p>
    ${e.descricao ? `<p class="desc">${esc(e.descricao)}</p>` : ""}
    <div class="facts"><div><b class="tnum">${vag == null ? "—" : vag}</b><span>vagas livres</span></div><div><b class="tnum">${e.inscritos}</b><span>inscritos</span></div><div><b style="font-size:16px;line-height:28px">${esc(p1 || "—")}</b><span>${esc(p2 || "")}</span></div></div>
    <div class="btns">${!S.aluno ? "" : e.inscrito ? `<button class="btn ghost" data-unev="${id}">Cancelar inscrição</button>` : `<button class="btn pri" data-inev="${id}" ${vag === 0 || e.ini <= now() ? "disabled" : ""}>Inscrever-se</button>`}
    ${S.equipe ? `<button class="btn ghost" data-editev="${id}">Editar evento</button>` : ""}<button class="btn ghost" data-close>Fechar</button></div>`);
}

/* ---------- Você ---------- */
function viewVoce(){
  const a = S.aluno, r = S.resumo || {}, sem = r.semanas_ritmo || 0, cr = S.creditos, prox = cr[0];
  const desde = a.aluno_desde ? fromKey(a.aluno_desde) : null;
  const turmas = S.matriculas.map(m => m.turmas).filter(Boolean);
  const venc = a.pagamento_proximo_vencimento ? fromKey(a.pagamento_proximo_vencimento) : null;
  const ult = a.pagamento_ultimo ? fromKey(a.pagamento_ultimo) : null;
  return `<header class="profile">
    <div class="cover ${a.capa_url ? "has" : ""}">${a.capa_url ? `<img class="coverimg" src="${esc(a.capa_url)}" alt="">` : ""}
      <label class="coverbtn" for="capaIn">${CAM}<span>${a.capa_url ? "Trocar capa" : "Adicionar capa"}</span></label>
      <input type="file" id="capaIn" accept="image/*" hidden>
    </div>
    <label class="avatar" for="avIn" aria-label="Trocar foto de perfil">
      ${a.avatar_url ? `<img src="${esc(a.avatar_url)}" alt="">` : `<span class="ini">${esc(initials(a.nome))}</span>`}
      <span class="avedit">${CAM}</span>
    </label>
    <input type="file" id="avIn" accept="image/*" hidden>
    <h1 class="h4">${esc(a.nome)}</h1>
    ${desde ? `<p class="sub">Desde ${MES[desde.getMonth()]} de ${desde.getFullYear()}</p>` : ""}
  </header>
  <div class="ritmo">
    <p class="label">Frequência</p>
    <div class="ritmo-row"><span class="ritmo-n tnum">${sem}</span><span class="ritmo-t">${sem === 1 ? "semana" : "semanas"}<br>mantendo o ritmo</span></div>
  </div>
  <div class="stats">
    <div class="stat"><b class="tnum">${r.aulas_total ?? 0}</b><span>aulas<br>no atelier</span></div>
    <div class="stat"><b class="tnum">${r.presenca_90d == null ? "—" : r.presenca_90d + "%"}</b><span>presença<br>em 90 dias</span></div>
    <div class="stat"><b class="tnum">${cr.length}<small> / ${MAX_CRED}</small></b><span>reposições<br>disponíveis</span></div>
  </div>
  <div class="tiles">
    <section class="tile wide">
      <div class="tl"><h2 class="tt">Mensalidade</h2><span class="chip">Em breve</span></div>
      <div class="tv">Em construção</div>
      <p class="ts">Em breve você acompanha seus pagamentos por aqui.</p>
    </section>
    <button class="tile" data-go="agenda">
      <div class="tl"><h2 class="tt">Reposições</h2></div>
      <div class="tv tnum">${cr.length}<small> de ${MAX_CRED}</small></div>
    </button>
    <section class="tile">
      <div class="tl"><h2 class="tt">Seus dias</h2>${turmas[0] && turmas.every(t => t.inicio === turmas[0].inicio && t.fim === turmas[0].fim) ? `<span class="chip">${hm(turmas[0].inicio)}–${hm(turmas[0].fim)}</span>` : ""}</div>
      <div class="tv${turmas.length > 2 ? " tv-s" : ""}">${turmas.length ? turmas.slice().sort((x,y) => ((x.dia_semana+6)%7) - ((y.dia_semana+6)%7) || String(x.inicio).localeCompare(String(y.inicio))).map(t => cap1(WDS[t.dia_semana])).join(turmas.length > 2 ? "&nbsp;· " : " · ") : "—"}</div>
    </section>
  </div>
  <button class="signout" id="sair">Sair da conta</button>
  <p class="foot">Alma Atelier · versão beta</p>`;
}
async function uploadFoto(input, qual){
  const f = input.files && input.files[0]; if(!f) return;
  toast("Enviando foto…");
  try{
    let img;
    try{ img = await createImageBitmap(f, { imageOrientation: "from-image" }); }
    catch(_){ img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(f); }); }
    const max = qual === "capa" ? 1400 : 480, sc = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width*sc); c.height = Math.round(img.height*sc);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", .84));
    const path = `${S.session.user.id}/${qual}-${Date.now()}.jpg`;
    const { error } = await sb.storage.from("perfis").upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if(error) throw error;
    const url = sb.storage.from("perfis").getPublicUrl(path).data.publicUrl;
    const { error: e2 } = await sb.rpc("atualizar_fotos", qual === "capa" ? { p_avatar: null, p_capa: url } : { p_avatar: url, p_capa: null });
    if(e2) throw e2;
    S.aluno[qual === "capa" ? "capa_url" : "avatar_url"] = url;
    render(); toast(qual === "capa" ? "Capa atualizada" : "Foto atualizada");
  }catch(ex){ toast("Não foi possível enviar a foto."); }
}

/* ---------- Equipe ---------- */
async function eqLoad(){
  const E = S.eq;
  if(E.sec === "dia"){
    const de = E.mes, ate = new Date(E.mes.getFullYear(), E.mes.getMonth()+1, 0);
    const { data } = await sb.rpc("equipe_mes", { p_de: dkey(de), p_ate: dkey(ate) });
    E.mesDados = (data || []).map(a => ({ ...a, ini: new Date(a.inicia_em), fim: new Date(a.termina_em) }));
  } else if(E.sec === "pessoas"){
    const [al, cr, mt, tu] = await Promise.all([
      sb.from("pessoas").select("*").order("nome"), sb.rpc("equipe_creditos"),
      sb.from("matriculas").select("aluno_id,turma_id").is("ate", null), sb.from("turmas").select("*").order("dia_semana").order("inicio")
    ]);
    E.alunos = al.data || []; E.turmas = tu.data || [];
    E.cred = Object.fromEntries((cr.data || []).map(c => [c.aluno_id, c.ativos]));
    E.mat = {}; (mt.data || []).forEach(m => (E.mat[m.aluno_id] ||= []).push(m.turma_id));
  } else if(E.sec === "turmas"){
    const { data } = await sb.from("turmas").select("*").order("dia_semana").order("inicio"); E.turmas = data || [];
  } else if(E.sec === "eventos"){
    await loadEventos();
  }
  if(S.tab === "equipe") render();
}
function viewEquipe(){
  const E = S.eq;
  const seg = `<div class="seg" role="group" aria-label="Seção">${[["dia","Calendário"],["pessoas","Pessoas"],["turmas","Horários"],["eventos","Eventos"]].map(([k,l]) =>
    `<button data-eqsec="${k}" aria-pressed="${E.sec === k}">${l}</button>`).join("")}</div>`;
  let body = "";
  if(E.sec === "dia"){
    const y = E.mes.getFullYear(), m = E.mes.getMonth(), off = (new Date(y,m,1).getDay()+6)%7, days = new Date(y,m+1,0).getDate();
    const byDay = {}; E.mesDados.forEach(a => (byDay[dkey(a.ini)] ||= []).push(a));
    const today = startOfDay(now());
    let cells = ""; for(let i=0;i<off;i++) cells += "<div></div>";
    for(let d=1; d<=days; d++){
      const dt = new Date(y,m,d), k = dkey(dt), list = byDay[k], isToday = +dt === +today;
      const cc = `cell${isToday ? " today" : ""}${dt < today ? " past" : ""}`;
      if(!list){ cells += `<div class="${cc}"><span class="slot"></span><span class="n tnum">${d}</span></div>`; continue; }
      const abertas = list.filter(a => !a.cancelada), qtd = abertas.reduce((t,a) => t + a.ocupadas, 0);
      const cls = !abertas.length ? "c off" : abertas.every(a => a.fim <= now()) ? "c done eqc" : "c eqc" + (qtd ? " cheio" : "");
      cells += `<button class="${cc}" data-eqdia="${k}" aria-label="${d} de ${MES[m]}, ${plural(qtd,"aluno","alunos")}"><span class="slot"><span class="${cls}">${abertas.length ? `<b class="tnum">${qtd}</b>` : ""}</span></span><span class="n tnum">${d}</span></button>`;
    }
    body = `<div class="monthbar">
        <button class="iconbtn" id="eqPrevM" aria-label="Mês anterior">${CHEV_L}</button>
        <div class="title">${cap1(MES[m])} ${y}</div>
        <button class="iconbtn" id="eqNextM" aria-label="Próximo mês">${CHEV_R}</button>
      </div>
      <div class="wk"><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span><span>D</span></div>
      <div class="grid">${cells}</div>
      <div class="hint"><span>O número em cada dia é quantos alunos vêm.</span><span>Toque no dia para ver quem estará no atelier.</span></div>`;
  } else if(E.sec === "pessoas"){
    const f = E.filtro || "alunos", q = (E.busca || "").toLowerCase();
    const grupos = { alunos: p => ["aluno","pausado"].includes(p.vinculo) && !p.fantasma, interessados: p => p.vinculo === "interessado",
      ex: p => p.vinculo === "ex_aluno", loja: p => p.comprador_loja, todos: () => true };
    const lista = E.alunos.filter(grupos[f]).filter(p => !q || [p.nome, p.email, p.whatsapp].some(x => String(x || "").toLowerCase().includes(q)));
    const n = k => E.alunos.filter(grupos[k]).length;
    body = `<div class="chips">${[["alunos","Alunos"],["interessados","Interessados"],["ex","Ex-alunos"],["loja","Loja"],["todos","Todos"]].map(([k,l]) =>
        `<button data-pfiltro="${k}" aria-pressed="${f === k}">${l} <span class="tnum">${n(k)}</span></button>`).join("")}</div>
      <div class="daybar"><label class="field" style="flex:1;margin-right:var(--s3)"><input id="pBusca" type="search" placeholder="Buscar nome, e-mail ou WhatsApp" value="${esc(E.busca || "")}"></label>
        <button class="addbtn" data-pessoa="novo">Nova pessoa</button></div>
      ${f === "alunos" ? `<button class="textbtn" id="addEmails">Adicionar alunos por e-mail</button>` : ""}
      <div class="cards">${lista.length ? lista.map(p => {
        const aluno = ["aluno","pausado"].includes(p.vinculo);
        const tags = [p.fantasma ? "Fantasma" : VINC[p.vinculo || ""], p.comprador_loja ? "Loja" : ""].filter(Boolean);
        const det = aluno
          ? [(E.mat[p.id] || []).map(id => { const t = E.turmas.find(x => x.id === id); return t ? cap1(WDS[t.dia_semana]) : ""; }).join(" · ") || "Sem dia fixo", `${E.cred[p.id] || 0} reposições`, !p.acesso_app ? "acesso bloqueado" : !p.auth_user_id ? "ainda não entrou no app" : p.cadastro_completo_em ? "usa o app" : "entrou, falta completar o cadastro"]
          : [p.origem ? `via ${p.origem}` : "", p.interesses && p.interesses.length ? p.interesses.join(", ") : "", p.vinculo === "ex_aluno" && p.saida_em ? `saiu em ${dm(fromKey(p.saida_em))}/${String(fromKey(p.saida_em).getFullYear()).slice(2)}` : ""];
        return `<button class="card" data-pessoa="${p.id}" style="text-align:left">
          <div class="row"><span class="title">${esc(p.nome || p.email || p.whatsapp)}</span>${aluno ? `<span class="pill ${p.pagamento_status === "em_dia" ? "ok" : "warn"}">${PAG[p.pagamento_status]}</span>` : ""}</div>
          <p class="sub">${esc([tags.join(" · "), ...det].filter(Boolean).join(" · "))}</p></button>`; }).join("") : `<p class="empty">Ninguém nesta lista${q ? " com essa busca" : ""}.</p>`}</div>`;
  } else if(E.sec === "turmas"){
    const ate = dkey(addDays(new Date(), 56));
    body = `<div class="card" style="margin-top:var(--s5)"><p class="title">Gerar aulas</p><p class="sub">Cria as aulas dos horários ativos até a data e coloca cada aluno nos seus dias fixos. Pode repetir sem duplicar.</p>
        <div class="row2"><label class="field"><span>Até</span><input type="date" id="gerarAte" value="${ate}"></label><div style="display:flex;align-items:flex-end"><button class="btn pri" id="gerarBtn">Gerar</button></div></div></div>
      <div class="daybar"><p class="sub">${E.turmas.length ? plural(E.turmas.length,"horário de atelier","horários de atelier") : "Cadastre os dias e horários em que o atelier abre."}</p><button class="addbtn" data-turma="novo">Novo horário</button></div>
      <div class="cards">${E.turmas.map(t => `<button class="card" data-turma="${t.id}" style="text-align:left"><div class="row"><span class="title">${esc(horarioNome(t))}</span>${t.ativa ? "" : `<span class="pill">pausado</span>`}</div>
        <p class="sub">${t.capacidade} vagas</p></button>`).join("")}</div>`;
  } else {
    body = `<div class="daybar"><p class="sub">${plural(S.eventos.length,"evento","eventos")}</p><button class="addbtn" data-editev="novo">Novo evento</button></div>
      <div class="cards">${S.eventos.map(e => `<button class="card" data-editev="${e.id}" style="text-align:left"><div class="row"><span class="title">${esc(e.titulo)}</span><span class="pill">${e.inscritos}${e.vagas ? "/" + e.vagas : ""} inscritos</span></div>
        <p class="sub">${esc(e.tipo)} · ${cap1(WD[e.ini.getDay()])}, ${dm(e.ini)}, ${hh(e.ini)}${e.publicado ? "" : " · rascunho"}</p></button>`).join("")}</div>`;
  }
  return `<h1 class="h4">Equipe</h1>${seg}${body}${S.aluno ? "" : `<button class="signout" id="sair">Sair da conta</button>`}`;
}
const VINC = { aluno: "Aluno", pausado: "Matrícula pausada", ex_aluno: "Ex-aluno", interessado: "Interessado", "": "" };
const INTERESSES = ["Desenho","Pintura","Aquarela","Escultura","Cerâmica","Fotografia","Arte digital","Jovens Artistas"];
async function sheetDiaEq(k){
  const d = fromKey(k);
  sheet(`<p class="label">Atelier</p><h3 class="h5">${cap1(WD[d.getDay()])}, ${dm(d)}</h3><p class="sub">Carregando…</p>`);
  const { data, error } = await sb.rpc("equipe_dia", { p_dia: k });
  if(error) return sheet(`<h3 class="h5">${cap1(WD[d.getDay()])}, ${dm(d)}</h3><p class="sub">${esc(errMsg(error))}</p><div class="btns"><button class="btn ghost" data-close>Fechar</button></div>`);
  const aulas = {}; (data || []).forEach(r => { (aulas[r.aula_id] ||= { ...r, ini: new Date(r.inicia_em), fim: new Date(r.termina_em), pessoas: [] }); if(r.reserva_id) aulas[r.aula_id].pessoas.push(r); });
  const lista = Object.values(aulas);
  const motivo = { desmarcada: "desmarcou", ausencia_tardia: "avisou em cima da hora", aula_cancelada: "aula cancelada", falta: "faltou" };
  sheet(`<p class="label">Atelier</p><h3 class="h5">${cap1(WD[d.getDay()])}, ${dm(d)}</h3>
    ${lista.length ? lista.map(a => {
      const vem = a.pessoas.filter(p => ["confirmada","presente"].includes(p.status));
      const fora = a.pessoas.filter(p => !["confirmada","presente"].includes(p.status));
      return `<div class="eqaula"><div class="row"><p class="title">${hh(a.ini)} às ${hh(a.fim)}</p><span class="sub tnum">${a.cancelada ? "cancelada" : `${vem.length} de ${a.capacidade} vagas`}</span></div>
        ${vem.length ? vem.map(p => `<div class="prow"><span class="nm">${esc(p.aluno_nome)}</span>${p.tipo === "reposicao" ? `<span class="meta">reposição</span>` : ""}</div>`).join("") : `<p class="sub">Ninguém marcado.</p>`}
        ${fora.length ? `<p class="sub" style="margin-top:var(--s2)">Não vêm: ${fora.map(p => `${esc(firstName(p.aluno_nome))} (${motivo[p.status] || p.status})`).join(", ")}</p>` : ""}</div>`; }).join("") : `<p class="sub">Atelier fechado neste dia.</p>`}
    <div class="btns"><button class="btn ghost" data-close>Fechar</button></div>`);
}
function sheetExcluirEq(id){
  const p = S.eq.alunos.find(x => x.id === id); if(!p) return;
  const nome = p.nome || p.email || p.whatsapp;
  const aluno = ["aluno","pausado"].includes(p.vinculo);
  sheet(`<p class="label">Excluir cadastro</p><h3 class="h5">Excluir ${esc(nome)}?</h3>
    <p class="sub">Apaga o cadastro${p.auth_user_id ? ", o login no app" : ""}${aluno ? ", os dias fixos, as aulas marcadas e as reposições" : ""} e as inscrições em eventos. Não dá para desfazer.</p>
    ${aluno ? `<p class="sub" style="margin-top:var(--s3)">Se a pessoa só parou de fazer aula, prefira mudar o vínculo para <b>Ex-aluno</b>: o acesso ao app é cortado e o histórico fica guardado.</p>` : ""}
    <div class="btns"><button class="btn danger" data-excluirok="${p.id}">Excluir definitivamente</button><button class="btn ghost" data-pessoa-voltar="${p.id}">Voltar</button></div>`);
  const v = $("[data-pessoa-voltar]"); if(v) v.onclick = () => sheetPessoaEq(id);
}
function sheetPessoaEq(id){
  const E = S.eq, p = id === "novo" ? { vinculo: E.filtro === "interessados" ? "interessado" : "aluno", pagamento_status: "em_dia", aulas_anteriores: 0, interesses: [], comprador_loja: E.filtro === "loja", acesso_app: true } : E.alunos.find(x => x.id === id);
  const minhas = E.mat[p.id] || [];
  const ehAluno = v => ["aluno","pausado"].includes(v);
  sheet(`<p class="label">${id === "novo" ? "Nova pessoa" : VINC[p.vinculo || ""] || "Contato"}</p><h3 class="h5">${esc(p.nome || "Cadastro")}</h3>
    <form class="form" id="pessoaForm">
      <label class="field"><span>Nome completo</span><input id="f_nome" value="${esc(p.nome)}" placeholder="${ehAluno(p.vinculo) ? "O aluno pode completar no primeiro acesso" : ""}"></label>
      <label class="field"><span>E-mail${ehAluno(p.vinculo) ? " (usado para entrar no app)" : ""}</span><input id="f_email" type="email" value="${esc(p.email)}"></label>
      <label class="field"><span>WhatsApp</span><input id="f_whats" inputmode="tel" value="${esc(p.whatsapp)}" placeholder="+55 11 9…"></label>
      <label class="field"><span>Vínculo com o atelier</span><select id="f_vinc">
        ${[["aluno","Aluno"],["pausado","Matrícula pausada"],["interessado","Interessado"],["ex_aluno","Ex-aluno"],["","Sem vínculo (só loja ou contato)"]].map(([k,l]) => `<option value="${k}" ${(p.vinculo || "") === k ? "selected" : ""}>${l}</option>`).join("")}
      </select></label>
      <label class="check"><input type="checkbox" id="f_loja" ${p.comprador_loja ? "checked" : ""}>Compra na loja (Alma Materiais Artísticos)</label>

      <div id="blocoAluno" ${ehAluno(p.vinculo) ? "" : "hidden"} class="form" style="margin-top:0">
        <label class="check"><input type="checkbox" id="f_app" ${p.acesso_app ? "checked" : ""}>Acesso ao app</label>
        <p class="sub" style="margin-top:calc(-1 * var(--s2))">${p.acesso_app ? (p.auth_user_id ? (p.cadastro_completo_em ? "Já usa o app." : "Já entrou; falta completar nome e dias.") : "Entra direto com o e-mail acima. No primeiro acesso completa nome, frequência e dias.") : "Bloqueado: a pessoa não consegue entrar, nem receber o código."}</p>
        <div class="row2"><label class="field"><span>Aluno desde</span><input id="f_desde" type="date" value="${esc(p.aluno_desde)}"></label>
          <label class="field"><span>Aulas antes do app</span><input id="f_ant" type="number" min="0" value="${esc(p.aulas_anteriores)}"></label></div>
        <p class="label" style="margin-top:var(--s2)">Mensalidade</p>
        <div class="row2"><label class="field"><span>Situação</span><select id="f_pag">${Object.entries(PAG).map(([k,l]) => `<option value="${k}" ${p.pagamento_status === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <label class="field"><span>Forma</span><input id="f_metodo" value="${esc(p.pagamento_metodo)}" placeholder="Pix"></label></div>
        <div class="row2"><label class="field"><span>Último pagamento</span><input id="f_ult" type="date" value="${esc(p.pagamento_ultimo)}"></label>
          <label class="field"><span>Próximo vencimento</span><input id="f_venc" type="date" value="${esc(p.pagamento_proximo_vencimento)}"></label></div>
        <p class="label" style="margin-top:var(--s2)">Dias fixos no atelier${p.frequencia_semanal ? ` · ${p.frequencia_semanal}x por semana` : ""}</p>
        ${E.turmas.map(t => `<label class="check"><input type="checkbox" data-mat="${t.id}" ${minhas.includes(t.id) ? "checked" : ""}>${esc(horarioNome(t))}</label>`).join("") || `<p class="sub">Cadastre os horários do atelier primeiro (Equipe → Horários).</p>`}
      </div>

      <div id="blocoSaida" ${p.vinculo === "ex_aluno" ? "" : "hidden"} class="form" style="margin-top:0">
        <label class="field"><span>Motivo da saída</span><input id="f_motivo" value="${esc(p.motivo_saida)}" placeholder="Mudou de cidade, horário…"></label>
      </div>

      <p class="label" style="margin-top:var(--s2)">Relacionamento</p>
      <label class="field"><span>Como chegou ao Alma</span><input id="f_origem" list="origens" value="${esc(p.origem)}" placeholder="Instagram"></label>
      <datalist id="origens"><option>Instagram</option><option>Indicação</option><option>Loja</option><option>Evento</option><option>Site</option><option>Passou na porta</option></datalist>
      <div class="chips wrap">${INTERESSES.map(i => `<label class="chipcheck"><input type="checkbox" data-int="${esc(i)}" ${(p.interesses || []).includes(i) ? "checked" : ""}><span>${esc(i)}</span></label>`).join("")}</div>
      <label class="check"><input type="checkbox" id="f_lgpd" ${p.aceita_comunicacao ? "checked" : ""}>Autorizou receber novidades do Alma</label>
      <label class="field"><span>Observações</span><textarea id="f_obs">${esc(p.observacoes)}</textarea></label>

      <p class="err" id="fErr" hidden></p>
      <div class="btns"><button class="btn pri" type="submit">Salvar</button>
        ${id !== "novo" && ehAluno(p.vinculo) ? `<button class="btn ghost" type="button" data-dar="${p.id}">Dar 1 reposição (${E.cred[p.id] || 0}/8)</button>` : ""}
        <button class="btn ghost" type="button" data-close>Cancelar</button></div>
      ${id !== "novo" ? `<button class="textbtn perigo" type="button" data-excluir="${p.id}">Excluir cadastro</button>` : ""}
    </form>`);
  const vincSel = $("#f_vinc");
  vincSel.onchange = () => { $("#blocoAluno").hidden = !ehAluno(vincSel.value); $("#blocoSaida").hidden = vincSel.value !== "ex_aluno"; };
  $("#pessoaForm").onsubmit = async ev => {
    ev.preventDefault(); const btn = $("#pessoaForm button[type=submit]"); busy(btn, true);
    const v = sel => { const el = $(sel); return el ? (el.value.trim() || null) : null; };
    const vinc = vincSel.value || null, aluno = ehAluno(vinc);
    const row = { nome: v("#f_nome"), email: (v("#f_email") || "").toLowerCase() || null, whatsapp: v("#f_whats"), vinculo: vinc,
      comprador_loja: $("#f_loja").checked, origem: v("#f_origem"), aceita_comunicacao: $("#f_lgpd").checked, observacoes: v("#f_obs"),
      interesses: $$("[data-int]").filter(c => c.checked).map(c => c.dataset.int) };
    row.acesso_app = aluno && $("#f_app").checked;
    if(aluno) Object.assign(row, { aluno_desde: v("#f_desde"), aulas_anteriores: +($("#f_ant").value || 0), pagamento_status: $("#f_pag").value,
      pagamento_metodo: v("#f_metodo"), pagamento_ultimo: v("#f_ult"), pagamento_proximo_vencimento: v("#f_venc") });
    if(vinc === "ex_aluno") row.motivo_saida = v("#f_motivo");
    try{
      if(!row.nome && !(aluno && row.email)) throw new Error("Preencha o nome.");
      if(!row.email && !row.whatsapp) throw new Error("Informe e-mail ou WhatsApp.");
      if(row.acesso_app && !row.email) throw new Error("Para o aluno entrar no app, preencha o e-mail que ele vai usar.");
      let pid = p.id;
      if(id === "novo"){ const { data, error } = await sb.from("pessoas").insert(row).select("id").single(); if(error) throw error; pid = data.id; }
      else { const { error } = await sb.from("pessoas").update(row).eq("id", p.id); if(error) throw error; }
      if(aluno){
        for(const cb of $$("[data-mat]")){
          const tid = cb.dataset.mat, had = minhas.includes(tid);
          if(cb.checked && !had){ const { error } = await sb.rpc("matricular", { p_aluno: pid, p_turma: tid }); if(error) throw error; }
          if(!cb.checked && had){ const { error } = await sb.rpc("desmatricular", { p_aluno: pid, p_turma: tid }); if(error) throw error; }
        }
      }
      closeSheet(); toast(id === "novo" ? "Cadastro criado" : "Cadastro salvo"); eqLoad();
    }catch(ex){ const e = $("#fErr"); e.textContent = /duplicate|unique/i.test(ex.message || "") ? "Já existe um cadastro com esse e-mail." : errMsg(ex); e.hidden = false; busy(btn, false); }
  };
}
function sheetEmailsEq(){
  sheet(`<p class="label">Alunos</p><h3 class="h5">Adicionar por e-mail</h3>
    <form class="form" id="emailsForm">
      <p class="sub">Cole um e-mail por linha (ou separados por vírgula). Cada pessoa entra direto no app com esse e-mail e, no primeiro acesso, completa nome, frequência e dias do atelier.</p>
      <label class="field"><span>E-mails</span><textarea id="f_emails" style="height:160px" placeholder="maria@email.com&#10;joao@email.com"></textarea></label>
      <p class="err" id="eErr" hidden></p>
      <div class="btns"><button class="btn pri" type="submit">Adicionar</button><button class="btn ghost" type="button" data-close>Cancelar</button></div>
    </form>`);
  $("#emailsForm").onsubmit = async ev => {
    ev.preventDefault(); const btn = $("#emailsForm button[type=submit]"), err = $("#eErr"); err.hidden = true;
    const lista = [...new Set($("#f_emails").value.toLowerCase().split(/[\s,;]+/).map(x => x.trim()).filter(Boolean))];
    const ruins = lista.filter(x => !/^\S+@\S+\.\S+$/.test(x));
    if(!lista.length || ruins.length){ err.textContent = ruins.length ? `Confira: ${ruins.join(", ")}` : "Cole pelo menos um e-mail."; err.hidden = false; return; }
    const ja = new Set(S.eq.alunos.map(p => (p.email || "").toLowerCase()));
    const novos = lista.filter(x => !ja.has(x));
    busy(btn, true);
    try{
      if(novos.length){ const { error } = await sb.from("pessoas").insert(novos.map(email => ({ email, vinculo: "aluno", acesso_app: true }))); if(error) throw error; }
      closeSheet(); toast(novos.length ? `${plural(novos.length, "aluno adicionado", "alunos adicionados")}${lista.length > novos.length ? ` · ${lista.length - novos.length} já estava${lista.length - novos.length > 1 ? "m" : ""} cadastrado${lista.length - novos.length > 1 ? "s" : ""}` : ""}` : "Esses e-mails já estavam cadastrados"); eqLoad();
    }catch(ex){ err.textContent = errMsg(ex); err.hidden = false; busy(btn, false); }
  };
}
function sheetTurmaEq(id){
  const t = id === "novo" ? { dia_semana: 3, inicio: "14:00", fim: "17:00", capacidade: 8, ativa: true } : S.eq.turmas.find(x => x.id === id);
  sheet(`<p class="label">${id === "novo" ? "Novo horário" : "Horário do atelier"}</p><h3 class="h5">${id === "novo" ? "Quando o atelier abre" : esc(horarioNome(t))}</h3>
    <form class="form" id="turmaForm">
      <label class="field"><span>Dia da semana</span><select id="t_dia">${WD.map((d,i) => `<option value="${i}" ${+t.dia_semana === i ? "selected" : ""}>${cap1(d)}</option>`).join("")}</select></label>
      <div class="row2"><label class="field"><span>Início</span><input id="t_ini" type="time" value="${esc(String(t.inicio).slice(0,5))}"></label><label class="field"><span>Fim</span><input id="t_fim" type="time" value="${esc(String(t.fim).slice(0,5))}"></label></div>
      <label class="field"><span>Vagas</span><input id="t_cap" type="number" min="1" value="${esc(t.capacidade)}"></label>
      <label class="check"><input type="checkbox" id="t_ativa" ${t.ativa ? "checked" : ""}>Horário ativo</label>
      <p class="sub">Mudanças de horário e vagas valem para as aulas geradas daqui em diante. Se o atelier abre duas vezes no mesmo dia (manhã e tarde), cadastre dois horários.</p>
      <p class="err" id="fErr" hidden></p>
      <div class="btns"><button class="btn pri" type="submit">Salvar</button><button class="btn ghost" type="button" data-close>Cancelar</button></div>
    </form>`);
  $("#turmaForm").onsubmit = async ev => {
    ev.preventDefault(); const btn = $("#turmaForm button[type=submit]"); busy(btn, true);
    const row = { dia_semana: +$("#t_dia").value, inicio: $("#t_ini").value, fim: $("#t_fim").value, capacidade: +$("#t_cap").value, ativa: $("#t_ativa").checked };
    row.nome = horarioNome(row);
    const err = !row.inicio || !row.fim ? "Preencha início e fim." : row.fim <= row.inicio ? "O fim precisa ser depois do início." : !(row.capacidade > 0) ? "Informe o número de vagas." : "";
    const { error } = err ? { error: new Error(err) } : await (id === "novo" ? sb.from("turmas").insert(row) : sb.from("turmas").update(row).eq("id", id));
    if(error){ const e = $("#fErr"); e.textContent = errMsg(error); e.hidden = false; return busy(btn, false); }
    closeSheet(); toast("Horário salvo"); eqLoad();
  };
}
function toLocalInput(d){ return `${dkey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function sheetEventoEq(id){
  const base = addDays(startOfDay(new Date()), 7); base.setHours(9);
  const e = id === "novo" ? { tipo:"", titulo:"", ini: base, fim: new Date(+base + 3*36e5), publicado: true } : S.eventos.find(x => x.id === id);
  sheet(`<p class="label">${id === "novo" ? "Novo evento" : "Evento"}</p><h3 class="h5">${esc(e.titulo || "Evento")}</h3>
    <form class="form" id="evForm">
      <label class="field"><span>Tipo</span><input id="e_tipo" list="tiposEv" value="${esc(e.tipo)}" placeholder="Modelo vivo" required></label>
      <datalist id="tiposEv"><option>Modelo vivo</option><option>História da Arte</option><option>Visita</option><option>Workshop</option><option>Encontro</option></datalist>
      <label class="field"><span>Título</span><input id="e_tit" value="${esc(e.titulo)}" required></label>
      <label class="field"><span>Descrição</span><textarea id="e_desc">${esc(e.descricao)}</textarea></label>
      <div class="row2"><label class="field"><span>Começa</span><input id="e_ini" type="datetime-local" value="${toLocalInput(e.ini)}"></label><label class="field"><span>Termina</span><input id="e_fim" type="datetime-local" value="${toLocalInput(e.fim)}"></label></div>
      <label class="field"><span>Local</span><input id="e_local" value="${esc(e.local || "Atelier Alma")}"></label>
      <div class="row2"><label class="field"><span>Vagas (vazio = sem limite)</span><input id="e_vagas" type="number" min="1" value="${esc(e.vagas)}"></label><label class="field"><span>Valor</span><input id="e_preco" value="${esc(e.preco_texto)}" placeholder="R$ 90 · alunos R$ 70"></label></div>
      <label class="check"><input type="checkbox" id="e_pub" ${e.publicado ? "checked" : ""}>Visível para os alunos</label>
      <p class="err" id="fErr" hidden></p>
      <div class="btns"><button class="btn pri" type="submit">Salvar</button>${id !== "novo" ? `<button class="btn danger" type="button" data-delev="${id}">Excluir evento</button>` : ""}<button class="btn ghost" type="button" data-close>Cancelar</button></div>
    </form>`);
  $("#evForm").onsubmit = async ev => {
    ev.preventDefault(); const btn = $("#evForm button[type=submit]"); busy(btn, true);
    const row = { tipo: $("#e_tipo").value.trim(), titulo: $("#e_tit").value.trim(), descricao: $("#e_desc").value.trim() || null,
      inicia_em: new Date($("#e_ini").value).toISOString(), termina_em: new Date($("#e_fim").value).toISOString(),
      local: $("#e_local").value.trim() || null, vagas: $("#e_vagas").value ? +$("#e_vagas").value : null, preco_texto: $("#e_preco").value.trim() || null, publicado: $("#e_pub").checked };
    try{
      if(!row.tipo || !row.titulo) throw new Error("Preencha tipo e título.");
      if(new Date(row.termina_em) <= new Date(row.inicia_em)) throw new Error("O fim precisa ser depois do início.");
      const { error } = id === "novo" ? await sb.from("eventos").insert(row) : await sb.from("eventos").update(row).eq("id", id);
      if(error) throw error;
      closeSheet(); toast("Evento salvo"); await loadEventos(); render();
    }catch(ex){ const e = $("#fErr"); e.textContent = errMsg(ex); e.hidden = false; busy(btn, false); }
  };
}

/* ---------- ligações ---------- */
function bind(){
  $$("#view [data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  $$("#view [data-ev]").forEach(b => b.onclick = () => sheetEvento(b.dataset.ev));
  $$("#view [data-evf]").forEach(b => b.onclick = () => { S.evFiltro = b.dataset.evf; render(); });
  $$("#view [data-day]").forEach(b => b.onclick = () => sheetDia(b.dataset.day));
  const vf = $("#voltarFixos"); if(vf) vf.onclick = sheetVoltar;
  const lb = $("#liveBtn"); if(lb) lb.onclick = sheetPessoas;
  const db = $("#desmBtn"); if(db) db.onclick = () => { const a = S.agenda.find(x => x.aula_id === db.dataset.aula); a && sheetDesmarcar(a); };
  const p = $("#prevM"), n = $("#nextM");
  if(p) p.onclick = () => { S.mes = new Date(S.mes.getFullYear(), S.mes.getMonth()-1, 1); render(); };
  if(n) n.onclick = () => { S.mes = new Date(S.mes.getFullYear(), S.mes.getMonth()+1, 1); render(); };
  const ci = $("#capaIn"); if(ci) ci.onchange = () => uploadFoto(ci, "capa");
  const ai = $("#avIn"); if(ai) ai.onchange = () => uploadFoto(ai, "avatar");
  const sair = $("#sair"); if(sair) sair.onclick = () => sb.auth.signOut();
  // equipe
  $$("#view [data-eqsec]").forEach(b => b.onclick = () => { S.eq.sec = b.dataset.eqsec; render(); eqLoad(); });
  $$("#view [data-eqday]").forEach(b => b.onclick = () => { S.eq.dia = addDays(S.eq.dia, +b.dataset.eqday); eqLoad(); });
  $$("#view [data-eqdia]").forEach(b => b.onclick = () => sheetDiaEq(b.dataset.eqdia));
  const ep = $("#eqPrevM"), en = $("#eqNextM");
  if(ep) ep.onclick = () => { S.eq.mes = new Date(S.eq.mes.getFullYear(), S.eq.mes.getMonth()-1, 1); eqLoad(); };
  if(en) en.onclick = () => { S.eq.mes = new Date(S.eq.mes.getFullYear(), S.eq.mes.getMonth()+1, 1); eqLoad(); };
  $$("#view [data-chamada]").forEach(b => b.onclick = async () => {
    const { error } = await sb.rpc("marcar_chamada", { p_reserva: b.dataset.chamada, p_falta: b.dataset.falta === "1" });
    if(error) return toast(errMsg(error)); eqLoad();
  });
  $$("#view [data-cancelaula]").forEach(b => b.onclick = () => sheet(`<p class="label">Cancelar aula</p><h3 class="h5">Cancelar esta aula?</h3>
    <p class="sub">Quem estava confirmado ganha uma reposição (ou recebe de volta o crédito, se era reposição).</p>
    <form class="form" id="cancForm"><label class="field"><span>Motivo (aparece só para a equipe)</span><input id="c_mot" placeholder="Feriado"></label>
    <div class="btns"><button class="btn pri" type="submit">Cancelar aula</button><button class="btn ghost" type="button" data-close>Voltar</button></div></form>`) || ($("#cancForm").onsubmit = async ev => {
      ev.preventDefault(); const btn = $("#cancForm button[type=submit]"); busy(btn, true);
      const { data, error } = await sb.rpc("cancelar_aula", { p_aula: b.dataset.cancelaula, p_motivo: $("#c_mot").value.trim() || null });
      if(error){ busy(btn, false); return toast(errMsg(error)); }
      closeSheet(); toast(`Aula cancelada · ${plural(data,"aluno avisado","alunos com reposição")}`); eqLoad();
    }));
  $$("#view [data-pessoa]").forEach(b => b.onclick = () => sheetPessoaEq(b.dataset.pessoa));
  const ae = $("#addEmails"); if(ae) ae.onclick = sheetEmailsEq;
  $$("#view [data-pfiltro]").forEach(b => b.onclick = () => { S.eq.filtro = b.dataset.pfiltro; render(); });
  const pb = $("#pBusca"); if(pb) pb.oninput = () => { S.eq.busca = pb.value; const pos = pb.selectionStart; render(); const nb = $("#pBusca"); nb.focus(); nb.setSelectionRange(pos, pos); };
  $$("#view [data-turma]").forEach(b => b.onclick = () => sheetTurmaEq(b.dataset.turma));
  $$("#view [data-editev]").forEach(b => b.onclick = () => sheetEventoEq(b.dataset.editev));
  const gb = $("#gerarBtn"); if(gb) gb.onclick = async () => {
    busy(gb, true);
    const { data, error } = await sb.rpc("gerar_aulas", { p_ate: $("#gerarAte").value });
    busy(gb, false);
    if(error) return toast(errMsg(error));
    toast(data ? `${plural(data,"aula criada","aulas criadas")}` : "Nenhuma aula nova; já estavam criadas");
  };
}
function sheetPessoas(){
  const cur = S.agenda.find(a => !a.cancelada && a.ini <= now() && a.fim > now());
  sheet(`<p class="label">Agora no atelier</p><h3 class="h5">${plural(S.live.length,"aluno em aula","alunos em aula")}</h3>
    ${cur ? `<p class="sub">${cap1(WD[cur.ini.getDay()])}, ${hh(cur.ini)} às ${hh(cur.fim)} · ${plural(vagas(cur),"vaga livre","vagas livres")}</p>` : ""}
    <div class="people">${S.live.map(p => `<div class="person"><div class="av">${esc(initials(p.nome))}</div><span>${esc(p.nome)}</span><span class="tag">${p.sou_eu ? "você" : p.tipo === "reposicao" ? "reposição" : ""}</span></div>`).join("")}</div>
    <div class="btns"><button class="btn ghost" data-close>Fechar</button></div>`);
}
$("#sheetBody").addEventListener("click", async e => {
  const t = e.target.closest("button"); if(!t) return;
  if(t.hasAttribute("data-close")) return closeSheet();
  if(t.dataset.aula && t.classList.contains("opt")){ const a = S.agenda.find(x => x.aula_id === t.dataset.aula); return a && sheetAula(a); }
  if(t.dataset.book) return doBook(t.dataset.book, t);
  if(t.dataset.remarcar){ busy(t, true); const { error } = await sb.rpc("remarcar_aula", { p_reserva: t.dataset.remarcar });
    if(error){ busy(t, false); return toast(errMsg(error)); }
    closeSheet(); await loadAluno(); render(); return toast("Aula remarcada"); }
  if(t.dataset.cancel) return doCancel(t.dataset.cancel, t);
  if(t.dataset.inev){ busy(t, true); const { error } = await sb.rpc("inscrever_evento", { p_evento: t.dataset.inev }); if(error){ busy(t,false); return toast(errMsg(error)); } closeSheet(); toast("Inscrição feita"); await loadEventos(); return render(); }
  if(t.dataset.unev){ busy(t, true); const { error } = await sb.rpc("cancelar_inscricao", { p_evento: t.dataset.unev }); if(error){ busy(t,false); return toast(errMsg(error)); } closeSheet(); toast("Inscrição cancelada"); await loadEventos(); return render(); }
  if(t.dataset.editev) return sheetEventoEq(t.dataset.editev);
  if(t.dataset.delev){ busy(t, true); const { error } = await sb.from("eventos").delete().eq("id", t.dataset.delev); if(error){ busy(t,false); return toast(errMsg(error)); } closeSheet(); toast("Evento excluído"); await loadEventos(); return render(); }
  if(t.dataset.excluir) return sheetExcluirEq(t.dataset.excluir);
  if(t.dataset.excluirok){ busy(t, true); const { error } = await sb.rpc("excluir_pessoa", { p_pessoa: t.dataset.excluirok }); busy(t, false);
    if(error) return toast(/excluir_pessoa|function/.test(error.message || "") ? "A exclusão ainda não foi ativada no banco." : errMsg(error));
    closeSheet(); toast("Cadastro excluído"); return eqLoad(); }
  if(t.dataset.dar){ busy(t, true); const { error } = await sb.rpc("dar_credito", { p_aluno: t.dataset.dar }); busy(t, false); if(error) return toast(errMsg(error)); toast("Reposição adicionada"); closeSheet(); return eqLoad(); }
});

if(!CFG.url || CFG.url.includes("__")) { $("#view").innerHTML = `<div class="loading">App ainda não configurado.</div>`; }
else boot();

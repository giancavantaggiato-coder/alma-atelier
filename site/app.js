/* Alma Atelier — app do aluno (beta). Supabase + HTML puro. */
"use strict";
const CFG = window.ALMA_CONFIG || {};
/* Modo aluno da equipe: com ele ligado, todo pedido ao banco leva x-alma-ver-como: aluno
   e o banco trata a equipe como o seu cadastro fantasma. Fica lembrado neste aparelho. */
const verAluno = v => { try{ if(v === undefined) return localStorage.getItem("alma-ver-aluno") === "1"; v ? localStorage.setItem("alma-ver-aluno","1") : localStorage.removeItem("alma-ver-aluno"); }catch(_){ } return !!v; };
const sb = window.supabase.createClient(CFG.url, CFG.key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "alma-atelier-auth" },
  global: { fetch: (url, opts = {}) => {
    if(!verAluno() || !String(url).includes("/rest/v1/")) return fetch(url, opts);
    const h = new Headers(opts.headers || {}); h.set("x-alma-ver-como", "aluno");
    return fetch(url, { ...opts, headers: h });
  } }
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
  equipe:'<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  pessoas:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.9-3.4 3.2-5.2 6-5.2s5.1 1.8 6 5.2"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.6 14.6c1.6.7 2.8 2.3 3.4 4.9"/></svg>',
  horarios:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>'
};
const NAV_ICO = { eqhoje: ICO.hoje, "eq:dia": ICO.agenda, "eq:pessoas": ICO.pessoas, "eq:turmas": ICO.horarios, "eq:eventos": ICO.eventos, painel: ICO.voce };
const adminOnly = () => S.equipe && !S.aluno;
const isEqTab = () => S.tab === "equipe" || String(S.tab).startsWith("eq:");
const CAM = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
const CHEV_L = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M15 5l-7 7 7 7"/></svg>';
const CHEV_R = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 5l7 7-7 7"/></svg>';

/* sem zoom por pinça nem duplo toque (iOS ignora user-scalable em alguns casos) */
["gesturestart","gesturechange","gestureend"].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
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
const saudacao = () => { const h = new Date().getHours(); return h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite"; };
const errMsg = e => { const m = (e && (e.message || e.error_description)) || ""; return /fetch|network|load failed|conex/i.test(m) || (typeof navigator !== "undefined" && navigator.onLine === false) ? "Sem conexão. Tente de novo quando a internet voltar." : m || "Algo deu errado. Tente de novo."; };

/* ---------- estado ---------- */
const S = {
  session: null, aluno: null, equipe: false, tab: "hoje",
  agenda: [], live: [], resumo: null, creditos: [], eventos: [], matriculas: [],
  mes: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  evFiltro: "proximos", justGrew: null,
  eq: { sec: "dia", dia: startOfDay(new Date()), mes: new Date(new Date().getFullYear(), new Date().getMonth(), 1), mesDados: [], dados: [], alunos: [], turmas: [], cred: {}, eventos: [] }
};

/* ---------- interface comum ---------- */
/* contorno da tela enquanto os dados chegam */
const esqueleto = () => `<div class="sk-tela" aria-busy="true" aria-label="Carregando">
  <span class="sk sk-l" style="width:30%"></span><span class="sk sk-h"></span><span class="sk sk-l" style="width:55%;margin-top:var(--s5)"></span>
  <span class="sk sk-tile"></span>
  <span class="sk sk-row"></span><span class="sk sk-row"></span><span class="sk sk-row"></span></div>`;
function toast(t){ const el = $("#toast"); el.classList.remove("acao"); el.textContent = t; el.classList.add("show"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2800); }
/* aviso com uma ação (ex.: Desfazer), visível por alguns segundos */
function toastAcao(t, rotulo, fn, ms = 6000){
  const el = $("#toast");
  el.innerHTML = `<span>${esc(t)}</span><button type="button">${esc(rotulo)}</button>`;
  el.classList.add("show", "acao"); clearTimeout(el._t);
  const fechar = () => { el.classList.remove("show"); setTimeout(() => el.classList.remove("acao"), 300); };
  el._t = setTimeout(fechar, ms);
  el.querySelector("button").onclick = () => { clearTimeout(el._t); fechar(); fn(); };
}
function sheet(html){ $("#sheetBody").innerHTML = html; $("#scrim").classList.add("show"); $("#sheet").classList.add("show"); if(window.matchMedia && matchMedia("(pointer: fine)").matches){ const f = $("#sheetBody").querySelector("input,select,button:not([disabled])"); f && f.focus({preventScroll:true}); } }
function closeSheet(){ $("#scrim").classList.remove("show"); $("#sheet").classList.remove("show"); }
function busy(btn, on){ if(!btn) return; btn.disabled = on; if(on){ btn.dataset.t = btn.textContent; btn.textContent = "Aguarde…"; } else if(btn.dataset.t){ btn.textContent = btn.dataset.t; } }
$("#scrim").addEventListener("click", closeSheet);
document.addEventListener("keydown", e => { if(e.key === "Escape") closeSheet(); });

function renderNav(){
  const tabs = [["hoje","Hoje"],["agenda","Agenda"],["eventos","Eventos"],["voce","Você"]];
  if(S.equipe) tabs.push(["equipe","Equipe"]);
  const lista = S.visitante && !S.equipe ? [["hoje","Hoje"],["agenda","Agenda"],["eventos","Eventos"],["voce","Você"]] : adminOnly() ? [["eqhoje","Hoje"],["eq:dia","Calendário"],["eq:pessoas","Alunos"],["eq:eventos","Eventos"],["painel","Você"]] : tabs;
  $("#nav").innerHTML = `<div class="in" role="tablist">${lista.map(([k,l]) =>
    `<button role="tab" data-tab="${k}" aria-selected="${S.tab===k || (k === "voce" && S.tab === "diario") || ((k === "eventos" || k === "eq:eventos") && S.tab === "evento")}"><span class="pillbg">${NAV_ICO[k] || ICO[k]}</span>${l}</button>`).join("")}</div>`;
  $("#nav").hidden = false;
}
$("#nav").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if(b) go(b.dataset.tab); });
function go(t){
  if(t !== "evento" && typeof sairCanalEvento === "function") sairCanalEvento();
  S.tab = t; if(String(t).startsWith("eq:")) S.eq.sec = t.slice(3);
  window.scrollTo(0,0); render();
  if(isEqTab()) eqLoad();
  if(t === "painel") loadPainel();
  if(t === "diario" && S.aluno) loadDiario().then(() => { if(S.tab === "diario") render(); });
  if(t === "eqhoje") loadHojeEq();
}

function render(){
  if(!S.session) return renderLogin();
  if(precisaCompletar()) return PA.pronto ? renderPA() : primeiroAcesso();
  if(NS.ativo) return renderNovaSenha();
  renderNav();
  const v = S.visitante && !isEqTab() ? ({ hoje: viewHojeV, agenda: viewAgendaV, eventos: viewEventos, evento: viewEventoPag, voce: viewVoceV }[S.tab] || viewHojeV)
    : isEqTab() ? viewEquipe : ({ hoje: viewHoje, agenda: viewAgenda, eventos: viewEventos, evento: viewEventoPag, voce: viewVoce, diario: viewDiario, painel: viewPainel, eqhoje: viewHojeEq }[S.tab] || (adminOnly() ? viewHojeEq : viewHoje));
  try{ $("#view").innerHTML = v(); }
  catch(ex){ console.error(ex); $("#view").innerHTML = `<div class="loading">Não foi possível abrir esta tela. Feche e abra o app de novo.</div>`; return; }
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
      ${head("Entrar com e-mail", "Use o e-mail cadastrado no atelier.")}
      <input class="ain" id="lemail" type="email" autocomplete="email" inputmode="email" placeholder="voce@email.com" value="${esc(email)}" aria-label="E-mail">
      <p class="aerr" id="lerr" hidden></p>
      <button class="abtn light" type="submit">Continuar</button>
      <button class="abtn line" type="button" data-auth="inicio">Voltar</button></form>`;
  } else if(step === "senha"){
    panel = `<form id="authForm" novalidate style="display:contents">
      ${head("Digite sua senha", `Os 4 números que você criou para <b>${esc(email)}</b>.`)}
      ${pinBox("Senha de 4 números")}
      <p class="aerr" id="lerr" hidden></p>
      <button class="abtn light" type="submit">Entrar</button>
      <div class="alinks"><button type="button" data-auth="email">Usar outro e-mail</button><button type="button" id="esqueci">Esqueci a senha</button></div></form>`;
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
/* caixinhas para a senha de 4 números (mostra pontos, não os números) */
const pinBox = rotulo => `<label class="otp pin" id="otpBox" aria-label="${rotulo}">${"<span></span>".repeat(4)}<input id="otp" type="tel" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]*"></label>`;
function bindOtp(onComplete){
  const otp = document.getElementById("otp"); if(!otp) return null;
  const n = otp.maxLength > 0 ? otp.maxLength : 6, oculto = n === 4;
  const boxes = [...document.querySelectorAll("#otpBox span")];
  const paint = () => { const v = otp.value.replace(/\D/g,"").slice(0,n); otp.value = v;
    boxes.forEach((b,i) => { b.textContent = v[i] ? (oculto ? "•" : v[i]) : ""; b.classList.toggle("caret", i === Math.min(v.length,n-1) && document.activeElement === otp && v.length < n); });
    if(v.length === n) onComplete(); };
  otp.oninput = paint; otp.onfocus = paint; otp.onblur = paint; setTimeout(() => otp.focus(), 60); paint();
  return otp;
}

const EMAIL_KEY = "alma-email";
const emailLembrado = () => { try{ return localStorage.getItem(EMAIL_KEY) || ""; }catch(_){ return ""; } };
const lembrarEmail = e => { try{ e ? localStorage.setItem(EMAIL_KEY, e) : localStorage.removeItem(EMAIL_KEY); }catch(_){} };
const trocarSenhaDepois = v => { try{ if(v === undefined) return sessionStorage.getItem("alma-nova-senha") === "1"; v ? sessionStorage.setItem("alma-nova-senha","1") : sessionStorage.removeItem("alma-nova-senha"); }catch(_){ return false; } };
let loginEmail = emailLembrado(), loginStep = "inicio", reenvio = 0, reenvioT = null;
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
  if($("#reenviar")) $("#reenviar").onclick = async () => { try{ await enviarCodigo(); toast("Código reenviado"); }catch(ex){ fail(errMsg(ex)); } };
  if($("#esqueci")) $("#esqueci").onclick = async e => { const b = e.currentTarget; busy(b, true);
    try{ await enviarCodigo(); trocarSenhaDepois(true); renderLogin("codigo"); toast("Enviamos um código para o seu e-mail"); }
    catch(ex){ busy(b, false); fail(/rate|seconds/i.test(ex.message || "") ? "Aguarde um minuto antes de pedir outro código." : errMsg(ex)); } };
  if(!otp) setTimeout(() => $("#lemail").focus(), 60);
  f.onsubmit = async e => {
    e.preventDefault(); err.hidden = true; busy(btn, true);
    try{
      if(loginStep === "email"){
        loginEmail = $("#lemail").value.trim().toLowerCase();
        if(!/^\S+@\S+\.\S+$/.test(loginEmail)) throw new Error("Confira o e-mail digitado.");
        const { data: modo, error: em } = await sb.rpc("como_entrar", { p_email: loginEmail });
        if(em) throw new Error("Não foi possível verificar o e-mail. Tente de novo.");
        if(!modo) throw new Error("Este e-mail não está cadastrado no atelier. Use o e-mail que você passou para a equipe ou fale com a gente.");
        if(modo === "senha") return renderLogin("senha");
        await enviarCodigo();
        renderLogin("codigo");
      } else if(loginStep === "senha"){
        const pin = otp.value;
        if(pin.length < 4) throw new Error("A senha tem 4 números.");
        const { data: r, error: ef } = await sb.functions.invoke("entrar-pin", { body: { email: loginEmail, pin } });
        if(ef || !r) throw new Error("Não foi possível entrar agora. Tente de novo.");
        if(r.status === "bloqueada"){
          await enviarCodigo(); trocarSenhaDepois(true); renderLogin("codigo");
          return $("#lerr") && Object.assign($("#lerr"), { hidden: false, textContent: "Senha bloqueada depois de 5 tentativas. Enviamos um código para o seu e-mail; depois você cria uma senha nova." });
        }
        if(r.status === "sem_senha"){ await enviarCodigo(); return renderLogin("codigo"); }
        if(String(r.status).startsWith("errada")){ const resta = +String(r.status).split(":")[1];
          throw new Error(`Senha errada.${resta === 1 ? " Resta 1 tentativa antes de bloquear." : resta <= 3 ? ` Restam ${resta} tentativas.` : ""}`); }
        if(r.status !== "ok") throw new Error("Este e-mail não tem acesso liberado. Fale com a equipe.");
        acabouDeEntrar(true);
        const { error } = await sb.auth.verifyOtp({ token_hash: r.token_hash, type: "magiclink" });
        if(error){ acabouDeEntrar(false); throw new Error("Não foi possível entrar agora. Tente de novo."); }
        lembrarEmail(loginEmail); loginStep = "inicio";
      } else {
        const token = otp.value;
        if(token.length < 6) throw new Error("O código tem 6 dígitos.");
        acabouDeEntrar(true);
        const { error } = await sb.auth.verifyOtp({ email: loginEmail, token, type: "email" });
        if(error){ acabouDeEntrar(false); throw new Error("Código inválido ou vencido. Confira ou peça um novo."); }
        lembrarEmail(loginEmail); loginStep = "inicio";
      }
    }catch(ex){ fail(/rate|seconds/i.test(ex.message || "") ? "Aguarde um minuto antes de pedir outro código." : errMsg(ex)); busy(btn, false); if(otp){ otp.value = ""; otp.focus(); } }
  };
}

/* ---------- carregamento ---------- */
async function loadMe(){
  const uid = S.session.user.id;
  const [{ data: aluno, error: e1 }, { data: eq, error: e2 }] = await Promise.all([
    sb.from("pessoas").select("*").eq("auth_user_id", uid).maybeSingle(),
    sb.rpc("sou_equipe")
  ]);
  if(semRede(e1) || semRede(e2)) throw new Error("offline");
  S.pessoa = aluno || null;
  S.aluno = aluno && aluno.vinculo === "aluno" && aluno.acesso_app ? aluno : null;
  S.visitante = !S.aluno && aluno && ["ex_aluno","pausado"].includes(aluno.vinculo) && aluno.acesso_app ? aluno : null;
  document.body.classList.toggle("limitado", !!S.visitante);
  S.equipe = !!eq; S.comoAluno = false;
  if(S.equipe && verAluno()){
    const { data: e } = await sb.from("equipe").select("fantasma_id").eq("auth_user_id", uid).maybeSingle();
    const { data: f } = e && e.fantasma_id ? await sb.from("pessoas").select("*").eq("id", e.fantasma_id).maybeSingle() : { data: null };
    if(f){ S.pessoa = f; S.aluno = f; S.visitante = null; S.equipe = false; S.comoAluno = true; }
    else verAluno(false);
  }
  document.body.classList.toggle("comoaluno", S.comoAluno);
  const bar = $("#comoAlunoBar"); if(bar) bar.hidden = !S.comoAluno;
}
/* liga/desliga o modo aluno sem sair da conta */
async function trocarModoAluno(ligar){
  closeSheet(); verAluno(ligar);
  D.itens = null; D.filtro = "todos"; D.busca = ""; R.lista = []; R.dest = null;
  Object.assign(S, { tab: ligar ? "hoje" : "painel", aluno: null, agenda: [], live: [], resumo: null, creditos: [], matriculas: [], pedido: null });
  window.scrollTo(0,0); await boot();
  if(!ligar) loadPainel();
  toast(ligar ? "Vendo o app como aluno" : "De volta à equipe");
}
async function loadAluno(){
  if(!S.aluno) return;
  const de = addDays(new Date(), -120), ate = addDays(new Date(), 150);
  const [ag, live, res, cr, mt, pd, le] = await Promise.all([
    sb.rpc("agenda", { p_de: dkey(de), p_ate: dkey(ate) }),
    sb.rpc("em_aula_agora"),
    sb.rpc("meu_resumo"),
    sb.from("creditos").select("*").eq("aluno_id", S.aluno.id).is("usado_em_reserva_id", null).gte("expira_em", dkey(new Date())).order("data_falta"),
    sb.from("matriculas").select("turma_id, turmas(nome,dia_semana,inicio,fim)").eq("aluno_id", S.aluno.id).is("ate", null),
    sb.from("pedidos_mudanca").select("*").eq("aluno_id", S.aluno.id).order("criado_em", { ascending: false }).limit(1),
    sb.from("lista_espera").select("aula_id, avisado_em").eq("aluno_id", S.aluno.id)
  ]);
  if(semRede(ag.error)) throw new Error("offline");
  S.espera = (le && le.data) || [];
  await loadRecados();
  S.pedido = (pd.data && pd.data[0]) || null;
  S.agenda = (ag.data || []).map(a => ({ ...a, ini: new Date(a.inicia_em), fim: new Date(a.termina_em) }));
  S.live = live.data || [];
  S.resumo = (res.data && res.data[0]) || null;
  S.creditos = (cr.data || []).filter(c => c.aluno_id === S.aluno.id);
  S.matriculas = mt.data || [];
  const { data: al } = await sb.from("pessoas").select("*").eq("id", S.aluno.id).maybeSingle();
  if(al) S.aluno = al;
  loadDiario().then(() => { if(["voce","diario"].includes(S.tab) && !precisaCompletar() && !NS.ativo) render(); }).catch(() => {});
}
async function loadEventos(){
  const [{ data }, { data: qv }, { data: mc }, { data: fo }] = await Promise.all([sb.rpc("eventos_lista"), sb.rpc("inscritos_eventos"), sb.rpc("mural_contagem"), sb.from("eventos").select("id,foto_url").not("foto_url", "is", null)]);
  const foto = {}; (fo || []).forEach(f => foto[f.id] = f.foto_url);
  const porEv = {}; (qv || []).forEach(q => (porEv[q.evento_id] ||= []).push(q));
  const nc = {}; (mc || []).forEach(m => nc[m.evento_id] = m.total);
  S.eventos = (data || []).map(e => ({ ...e, ini: new Date(e.inicia_em), fim: new Date(e.termina_em), quem: porEv[e.id] || [], nc: nc[e.id] || 0, foto_url: foto[e.id] || null }));
}
/* fotinhas de quem vai ao evento (foto ou iniciais) */
const avatarMini = q => q.avatar_url
  ? `<span class="fp${q.sou_eu ? " eu" : ""}" title="${esc(q.nome)}"><img src="${esc(q.avatar_url)}" alt="" loading="lazy"></span>`
  : `<span class="fp${q.sou_eu ? " eu" : ""}" title="${esc(q.nome)}">${esc(initials(q.nome.replace(".", "")))}</span>`;
function quemVaiHTML(e, max = 5){
  const l = e.quem || []; if(!l.length) return "";
  const nomes = l.map(q => q.sou_eu ? "você" : firstName(q.nome));
  const txt = l.length === 1 ? `${cap1(nomes[0])} vai` : l.length === 2 ? `${cap1(nomes[0])} e ${nomes[1]} vão` : (l[0].sou_eu ? `Você e mais ${l.length - 1}` : `${l.length} pessoas vão`);
  return `<span class="facepile" aria-label="${esc(txt)}"><span class="fps">${l.slice(0, max).map(avatarMini).join("")}${l.length > max ? `<span class="fp mais">+${l.length - max}</span>` : ""}</span><span class="fpt">${esc(txt)}</span></span>`;
}
async function refresh(){
  try{ await Promise.all([loadAluno(), loadEventos()]); marcarOnline(); guardarCache(); }
  catch(_){ mostrarOffline(); }
  render();
}
/* ---------- sem conexão: guarda o último estado e mostra com um aviso ---------- */
const semRede = e => !!e && (/fetch|network|load failed/i.test(e.message || "") || navigator.onLine === false);
const chaveCache = () => S.session ? "alma-cache-v1:" + S.session.user.id : null;
function guardarCache(){
  const k = chaveCache(); if(!k || S.comoAluno || !S.aluno) return;
  const tira = l => (l || []).map(({ ini, fim, ...r }) => r);
  try{ localStorage.setItem(k, JSON.stringify({ ts: Date.now(), pessoa: S.pessoa, aluno: S.aluno, visitante: S.visitante, equipe: S.equipe,
    agenda: tira(S.agenda), live: [], resumo: S.resumo, creditos: S.creditos, matriculas: S.matriculas, pedido: S.pedido, espera: S.espera, eventos: tira(S.eventos) })); }catch(_){}
}
function lerCache(){
  const k = chaveCache(); if(!k) return false;
  let c; try{ c = JSON.parse(localStorage.getItem(k) || "null"); }catch(_){ c = null; }
  if(!c || !c.aluno) return false;
  const datas = l => (l || []).map(r => ({ ...r, ini: new Date(r.inicia_em), fim: new Date(r.termina_em) }));
  Object.assign(S, { pessoa: c.pessoa, aluno: c.aluno, visitante: c.visitante, equipe: c.equipe, agenda: datas(c.agenda), live: [], resumo: c.resumo,
    creditos: c.creditos || [], matriculas: c.matriculas || [], pedido: c.pedido, espera: c.espera || [], eventos: datas(c.eventos), cacheTs: c.ts });
  return true;
}
function mostrarOffline(){
  S.offline = true;
  let b = $("#offBar");
  if(!b){ b = document.createElement("div"); b.id = "offBar"; b.className = "offbar"; b.setAttribute("role", "status"); document.body.appendChild(b); }
  const d = S.cacheTs ? new Date(S.cacheTs) : null;
  b.textContent = d ? `Sem conexão. Atualizado em ${dm(d)}, ${hh(d)}` : "Sem conexão";
  document.body.classList.add("offline");
}
function marcarOnline(){ S.offline = false; const b = $("#offBar"); if(b) b.remove(); document.body.classList.remove("offline"); }
window.addEventListener("online", () => { if(S.offline) boot(); });
window.addEventListener("offline", () => { if(S.session) { S.cacheTs = S.cacheTs || Date.now(); mostrarOffline(); } });

/* link vindo de uma notificação: ?aula=… abre a aula, ?ir=diario abre a aba */
function abrirLinkDireto(){
  const q = new URLSearchParams(location.search), aula = q.get("aula"), ir = q.get("ir");
  if(!aula && !ir) return;
  try{ history.replaceState(null, "", location.pathname); }catch(_){}
  if(ir && ["hoje","agenda","eventos","voce","diario","painel"].includes(ir)) go(ir);
  if(aula && S.aluno){ const a = S.agenda.find(x => x.aula_id === aula); if(a) sheetAula(a); }
}
async function boot(){
  $("#view").innerHTML = esqueleto();
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  if(!S.session) return renderLogin();
  try{
    await loadMe();
    if(S.visitante && !S.equipe){
      if(!["hoje","agenda","eventos","voce"].includes(S.tab)) S.tab = "hoje";
      if(await pedirSenha()) return;
      await loadVisitante(); render(); return;
    }
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
      if(!acabouDeEntrar() && !S.comoAluno){ await sb.auth.signOut(); return; }
      return primeiroAcesso();
    }
    if(!S.comoAluno && await pedirSenha()) return;
    if(!S.aluno){ if(!["eqhoje","painel"].includes(S.tab) && !isEqTab()) S.tab = "eqhoje"; if(S.tab === "eqhoje") loadHojeEq(); }
    await Promise.all([loadAluno(), loadEventos()]);
    render();
    marcarOnline(); guardarCache();
    abrirLinkDireto();
    setTimeout(talvezTour, 400);
    estadoPush().then(() => { pushPadrao(); if(["hoje","voce","painel"].includes(S.tab) && !document.querySelector("#sheet.show")) render(); }).catch(() => {});
    if(isEqTab()) eqLoad();
  }catch(ex){
    const rede = ex && (ex.message === "offline" || /fetch|network|load failed/i.test(ex.message || "") || navigator.onLine === false);
    if(rede && lerCache()){ mostrarOffline(); if(!["hoje","agenda","eventos","voce"].includes(S.tab)) S.tab = "hoje"; render(); return; }
    $("#view").innerHTML = `<div class="loading">${rede ? "Sem conexão. Abra o app de novo quando a internet voltar." : "Não foi possível carregar. Feche e abra o app de novo."}</div>`;
  }
}
sb.auth.onAuthStateChange((ev, session) => {
  if(ev === "SIGNED_IN" && !S.session){ S.session = session; boot(); }
  if(ev === "SIGNED_OUT"){ D.itens = null; if(D.ed) fecharEditor(); Object.assign(S, { session:null, aluno:null, equipe:false, tab:"hoje" }); NS.ativo = false; loginEmail = emailLembrado() || loginEmail; renderLogin(loginEmail && emailLembrado() ? "email" : "inicio"); }
  if(ev === "TOKEN_REFRESHED") S.session = session;
});
document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible"){ checarVersao(); if(NS.ativo) return; if(adminOnly() && S.tab === "eqhoje") loadHojeEq(); if(S.aluno && !precisaCompletar()) refresh(); else if(S.visitante) loadVisitante().then(render); } });
/* Atualiza o app sozinho quando sai uma versão nova (sem precisar sair e entrar) */
let VERSAO = null;
async function checarVersao(){
  try{
    const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" }); if(!r.ok) return;
    const { v } = await r.json(); if(!v) return;
    if(VERSAO === null){ VERSAO = v; return; }
    if(v !== VERSAO && !document.querySelector("#sheet.show") && !document.querySelector("#paForm") && !document.querySelector("#nsForm") && !document.querySelector("#dEditor")) location.reload();
  }catch(_){}
}
checarVersao(); setInterval(checarVersao, 5 * 60 * 1000);
document.addEventListener("click", e => { if(e.target.closest("#comoAlunoSair")) trocarModoAluno(false); });

/* Aparência: automático (segue o celular), claro ou escuro. Fica guardado neste aparelho. */
const TEMAS = [["auto","Automático","Segue o tema do celular"],["claro","Claro","Fundo creme, sempre"],["escuro","Escuro","Fundo preto, sempre"]];
const temaAtual = () => { try{ const t = localStorage.getItem("alma-tema"); return t === "claro" || t === "escuro" ? t : "auto"; }catch(_){ return "auto"; } };
function aplicarTema(t){
  const r = document.documentElement;
  if(t === "claro") r.setAttribute("data-theme","light"); else if(t === "escuro") r.setAttribute("data-theme","dark"); else r.removeAttribute("data-theme");
  const escuro = t === "escuro" || (t === "auto" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.removeAttribute("media"); m.setAttribute("content", escuro ? "#000000" : "#FEFCE6"); });
}
aplicarTema(temaAtual());
if(window.matchMedia){ const mq = matchMedia("(prefers-color-scheme: dark)"); const f = () => { if(temaAtual() === "auto") aplicarTema("auto"); }; mq.addEventListener ? mq.addEventListener("change", f) : mq.addListener && mq.addListener(f); }
const linhaTema = () => `<button class="li" data-tema-abrir><span class="ind n"></span>Aparência<span class="end">${TEMAS.find(x => x[0] === temaAtual())[1]}</span></button>`;
function sheetTema(){
  const t = temaAtual();
  sheet(`<p class="label">Aparência</p><h3 class="h5">Tema do app</h3>
    <div class="tema-op" role="radiogroup" aria-label="Tema do app">${TEMAS.map(([k, n, d]) => `<button type="button" role="radio" aria-checked="${k === t}" data-tema="${k}"><span>${n}<small>${d}</small></span><span class="rd"></span></button>`).join("")}</div>
    <div class="btns"><button class="btn ghost" data-close>Fechar</button></div>`);
}
document.addEventListener("click", e => {
  if(e.target.closest("[data-tema-abrir]")) return sheetTema();
  const b = e.target.closest("[data-tema]"); if(!b) return;
  const t = b.dataset.tema; try{ t === "auto" ? localStorage.removeItem("alma-tema") : localStorage.setItem("alma-tema", t); }catch(_){ }
  aplicarTema(t);
  document.querySelectorAll(".tema-op [data-tema]").forEach(x => x.setAttribute("aria-checked", String(x.dataset.tema === t)));
  document.querySelectorAll("[data-tema-abrir] .end").forEach(x => x.textContent = TEMAS.find(y => y[0] === t)[1]);
});


/* ---------- senha de 4 números ---------- */
const NS = { ativo: false, passo: 1, pin: "", troca: false };
async function pedirSenha(){
  if(NS.ativo) { renderNovaSenha(); return true; }
  const forcar = trocarSenhaDepois();
  if(!forcar){ const { data: tem, error } = await sb.rpc("tenho_senha"); if(error || tem) return false; }
  Object.assign(NS, { ativo: true, passo: 1, pin: "", troca: forcar });
  renderNovaSenha(); return true;
}
function abrirTrocaSenha(){ closeSheet(); Object.assign(NS, { ativo: true, passo: 1, pin: "", troca: true, voltar: true }); renderNovaSenha(); }
function renderNovaSenha(){
  $("#nav").hidden = true;
  const titulo = NS.passo === 1 ? (NS.troca ? "Crie uma senha nova" : "Crie sua senha") : "Confirme a senha";
  const texto = NS.passo === 1 ? "São 4 números. Da próxima vez você entra com eles, sem esperar código no e-mail." : "Digite os mesmos 4 números de novo.";
  $("#view").innerHTML = `<div class="auth"><div class="auth-hero">${LOGO_ALMA}</div><div class="auth-panel"><form id="nsForm" novalidate style="display:contents">
    <p class="apasso">${NS.passo} de 2</p>
    <div class="auth-head"><h1>${titulo}</h1><p>${texto}</p></div>
    ${pinBox(titulo)}
    <p class="aerr" id="nsErr" hidden></p>
    <button class="abtn light" type="submit">${NS.passo === 1 ? "Continuar" : "Salvar senha"}</button>
    <button class="abtn line" type="button" id="nsVoltar">${NS.passo === 2 ? "Voltar" : NS.voltar ? "Cancelar" : "Sair"}</button></form></div></div>`;
  const f = $("#nsForm"), err = $("#nsErr"), btn = f.querySelector("button[type=submit]");
  const otp = bindOtp(() => { if(!btn.disabled) f.requestSubmit(); });
  const fail = m => { err.textContent = m; err.hidden = false; busy(btn, false); otp.value = ""; otp.focus(); otp.dispatchEvent(new Event("input")); };
  $("#nsVoltar").onclick = () => {
    if(NS.passo === 2){ NS.passo = 1; NS.pin = ""; return renderNovaSenha(); }
    if(NS.voltar){ NS.ativo = false; NS.voltar = false; return render(); }
    NS.ativo = false; sb.auth.signOut();
  };
  f.onsubmit = async e => {
    e.preventDefault(); err.hidden = true;
    const v = otp.value;
    if(v.length < 4) return fail("A senha tem 4 números.");
    if(NS.passo === 1){
      if(/^(\d)\1{3}$/.test(v) || "0123456789".includes(v) || "9876543210".includes(v)) return fail("Evite sequências como 1234 ou 1111. Escolha outros números.");
      NS.pin = v; NS.passo = 2; return renderNovaSenha();
    }
    if(v !== NS.pin){ NS.passo = 1; NS.pin = ""; renderNovaSenha(); return Object.assign($("#nsErr"), { hidden: false, textContent: "As senhas não batem. Crie de novo." }); }
    busy(btn, true);
    const { error } = await sb.rpc("definir_senha", { p_pin: v });
    if(error) return fail(errMsg(error));
    const voltar = NS.voltar;
    Object.assign(NS, { ativo: false, passo: 1, pin: "", troca: false, voltar: false }); trocarSenhaDepois(false);
    if(S.session && S.session.user && S.session.user.email) lembrarEmail(S.session.user.email.toLowerCase());
    toast("Senha salva");
    if(voltar) render(); else boot();
  };
}

/* ---------- primeiro acesso ---------- */
let _entrou = false;
function acabouDeEntrar(v){
  if(v !== undefined){ _entrou = v; try{ v ? sessionStorage.setItem("alma-entrou","1") : sessionStorage.removeItem("alma-entrou"); }catch(_){} return v; }
  if(_entrou) return true; try{ return sessionStorage.getItem("alma-entrou") === "1"; }catch(_){ return false; }
}
const livre = () => !!(S.aluno && S.aluno.plano === "livre");
const repoLivre = () => !!(S.aluno && S.aluno.reposicao_livre && !livre());
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
  const pausado = S.aluno.vinculo !== "aluno" || livre(), total = pausado ? 1 : 2;
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
        <span>${cap1(WD[h.dia_semana])}</span><small>${hm(h.inicio)} às ${hm(h.fim)}${lotado ? ", completo" : ""}</small></button>`; }).join("") : "";
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
const horarioNome = t => `${cap1(WD[t.dia_semana])}, ${hm(t.inicio)}–${hm(t.fim)}`;
const naEspera = id => (S.espera || []).some(e => e.aula_id === id);
/* lotado: entrar ou sair da lista de espera */
function blocoEspera(a, podeRepor){
  if(naEspera(a.aula_id)) return `<p class="sub espera-msg">Você está na lista de espera. Avisamos assim que abrir uma vaga.</p>
    <div class="btns"><button class="btn pri" data-saiespera="${a.aula_id}">Sair da lista de espera</button><button class="btn ghost" data-close>Fechar</button></div>`;
  return `<div class="btns"><button class="btn pri" data-espera="${a.aula_id}" ${podeRepor ? "" : "disabled"}>Entrar na lista de espera</button><button class="btn ghost" data-close>Agora não</button></div>
    ${podeRepor ? `<p class="sub espera-msg">Se alguém desmarcar, você recebe um aviso para marcar.</p>` : ""}`;
}
const PAG = { em_dia: "Em dia", pendente: "Pendente", atrasado: "Em atraso" };

/* ---------- Hoje ---------- */
function viewHoje(){
  const n = now(), cur = currentClass(), hoje = todayClasses().filter(a => a.ini > n);
  const estado = cur ? "" : hoje.length ? `Sua aula hoje é às ${hh(hoje[0].ini)}.` : "Hoje você não tem aula.";
  const nx = nextClass(), ac = nCred(), live = S.live.length;
  const ev = S.eventos.find(e => e.ini > n && e.publicado);
  const esp = S.agenda.filter(a => naEspera(a.aula_id) && a.ini > n && !a.cancelada && !activeMine(a));
  const espAberta = esp.filter(a => vagas(a) > 0), espFila = esp.filter(a => vagas(a) <= 0);
  return `
  <header class="hello">
    <p class="label">${cap1(WD[n.getDay()])}, ${dm(n)}</p>
    <h1 class="h4">${saudacao()}, ${esc(firstName(S.aluno.nome))}</h1>
    ${estado ? `<p class="sub" style="font-size:var(--t-body)">${estado}</p>` : ""}
  </header>
  <button class="live" id="liveBtn" ${live ? "" : "disabled"}>
    <span class="dot"></span><u>${live ? `${plural(live,"aluno","alunos")} em aula agora` : "Ninguém no atelier agora"}</u>
  </button>
  ${aniversarioAtelier()}
  ${blocoRecados()}
  ${nx ? `<section class="tile wide next">
    <div class="tl"><h2 class="tt">Próxima aula</h2><span class="chip">${livre() ? "Aula marcada" : nx.reserva_tipo === "reposicao" ? "Reposição" : "Seu dia fixo"}</span></div>
    <div class="tv tnum">${cap1(WD[nx.ini.getDay()])}, ${dm(nx.ini)}</div>
    <p class="ts">${hh(nx.ini)} às ${hh(nx.fim)}</p>
    <button class="textbtn" id="desmBtn" data-aula="${nx.aula_id}">Não vou poder ir</button>
  </section>` : `<section class="tile wide next"><div class="tl"><h2 class="tt">Próxima aula</h2></div><p class="sub">Nenhuma aula marcada. Veja os dias com vaga na agenda.</p></section>`}
  ${espAberta.map(a => `<button class="vagaaberta" data-abreaula="${a.aula_id}"><span class="label">Abriu vaga</span>
    <span class="title">${cap1(WD[a.ini.getDay()])}, ${dm(a.ini)}, ${hh(a.ini)} às ${hh(a.fim)}</span>
    <span class="sub">Você estava na lista de espera. Toque para marcar antes que alguém pegue.</span></button>`).join("")}
  <div class="list">
    ${espFila.map(a => `<button class="li" data-abreaula="${a.aula_id}"><span class="ind n"></span>Na lista de espera<span class="end tnum">${WDS[a.ini.getDay()]} ${dm(a.ini)}, ${hh(a.ini)}</span></button>`).join("")}
    <button class="li" data-go="agenda"><span class="ind"></span><span class="tnum">${livre() ? "Plano livre: marque as aulas que quiser" : repoLivre() ? "Reposições sem limite" : ac === 1 ? "1 reposição disponível" : `${ac} reposições disponíveis`}</span></button>
    ${ev ? `<button class="li" data-ev="${ev.id}"><span class="ind n"></span><span>${esc(ev.titulo)}</span><span class="end tnum">${WDS[ev.ini.getDay()]} ${dm(ev.ini)}</span></button>` : ""}
  </div>
  ${cartaoPush()}
  ${botaoRecado()}`;
}

/* ---------- Aluno suspenso / ex-aluno (acesso reduzido) ---------- */
const rotuloV = () => S.visitante && S.visitante.vinculo === "pausado" ? "Aluno suspenso" : "Ex-aluno";
async function loadVisitante(){
  const de = addDays(new Date(), -60), ate = addDays(new Date(), 120);
  const [ag, ag2] = await Promise.all([sb.rpc("agenda_contagem", { p_de: dkey(de), p_ate: dkey(ate) }), sb.rpc("agora_contagem"), loadEventos()]);
  S.agendaV = (ag.data || []).map(a => ({ ...a, ini: new Date(a.inicia_em), fim: new Date(a.termina_em) }));
  S.agoraV = ag2.data || 0;
}
const AVISO_V = "Função ativa somente para alunos ativos";
function viewHojeV(){
  const n = now(), v = S.visitante, live = S.agoraV || 0;
  const ev = S.eventos.find(e => e.ini > n && e.publicado);
  const hoje = (S.agendaV || []).filter(a => !a.cancelada && dkey(a.ini) === dkey(n));
  return `<header class="hello">
    <p class="label">${cap1(WD[n.getDay()])}, ${dm(n)}</p>
    <h1 class="h4">${saudacao()}, ${esc(firstName(v.nome))}</h1>
    <p class="sub" style="font-size:var(--t-body)">${hoje.length ? `O atelier abre hoje às ${hh(hoje[0].ini)}.` : "Hoje o atelier não abre."}</p>
  </header>
  <div class="live" aria-disabled="true"><span class="dot"></span><span>${live ? `${plural(live,"aluno","alunos")} no atelier agora` : "Ninguém no atelier agora"}</span></div>
  <section class="tile wide next v-aviso"><div class="tl"><h2 class="tt">${rotuloV()}</h2><span class="chip">Acesso reduzido</span></div>
    <p class="sub">${S.visitante.vinculo === "pausado" ? "Sua matrícula está suspensa. Você acompanha a agenda do atelier e os eventos; marcar aulas, reposições e inscrições voltam quando a matrícula for reativada." : "Você acompanha a agenda do atelier e os eventos. Marcar aulas, reposições e inscrições ficam disponíveis quando você voltar às aulas."}</p></section>
  <div class="list">
    ${ev ? `<button class="li" data-ev="${ev.id}"><span class="ind n"></span><span>${esc(ev.titulo)}</span><span class="end tnum">${WDS[ev.ini.getDay()]} ${dm(ev.ini)}</span></button>` : ""}
  </div>`;
}
function viewAgendaV(){
  const y = S.mes.getFullYear(), m = S.mes.getMonth(), off = (new Date(y,m,1).getDay()+6)%7, days = new Date(y,m+1,0).getDate();
  const byDay = {}; (S.agendaV || []).forEach(a => (byDay[dkey(a.ini)] ||= []).push(a));
  const today = startOfDay(now());
  let cells = ""; for(let i=0;i<off;i++) cells += "<div></div>";
  for(let d=1; d<=days; d++){
    const dt = new Date(y,m,d), k = dkey(dt), list = byDay[k], isToday = +dt === +today;
    const cc = `cell${isToday ? " today" : ""}${dt < today ? " past" : ""}`;
    if(!list){ cells += `<div class="${cc}"><span class="slot"></span><span class="n tnum">${d}</span></div>`; continue; }
    const ab = list.filter(a => !a.cancelada), qtd = ab.reduce((t,a) => t + a.ocupadas, 0);
    const cls = !ab.length ? "c off" : ab.every(a => a.fim <= now()) ? "c done eqc" : "c eqc vis";
    cells += `<button class="${cc}" data-day="${k}" aria-label="${d} de ${MES[m]}, ${plural(qtd,"aluno","alunos")}"><span class="slot"><span class="${cls}">${ab.length ? `<b class="tnum">${qtd}</b>` : ""}</span></span><span class="n tnum">${d}</span></button>`;
  }
  const minM = new Date(today.getFullYear(), today.getMonth()-1, 1), maxM = new Date(today.getFullYear(), today.getMonth()+3, 1);
  return `<h1 class="h4">Agenda</h1>
  <div class="monthbar">
    <button class="iconbtn" id="prevM" aria-label="Mês anterior" ${S.mes <= minM ? "disabled" : ""}>${CHEV_L}</button>
    <div class="title">${cap1(MES[m])} ${y}</div>
    <button class="iconbtn" id="nextM" aria-label="Próximo mês" ${S.mes >= maxM ? "disabled" : ""}>${CHEV_R}</button>
  </div>
  <div class="wk"><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span><span>D</span></div>
  <div class="grid">${cells}</div>
  <div class="credits off"><span><b>Reposições</b> <span style="color:var(--muted)">${AVISO_V.toLowerCase()}</span></span></div>
`;
}
function sheetDiaV(k){
  const d = fromKey(k), list = (S.agendaV || []).filter(a => dkey(a.ini) === k);
  sheet(`<p class="label">${AVISO_V}</p><h3 class="h5">${cap1(WD[d.getDay()])}, ${dm(d)}</h3>
    ${list.map(a => `<div class="eqaula"><div class="row"><p class="title">${hh(a.ini)} às ${hh(a.fim)}</p><span class="sub tnum">${a.cancelada ? "cancelada" : `${plural(a.ocupadas,"aluno","alunos")}, ${plural(Math.max(0, a.capacidade - a.ocupadas),"vaga","vagas")}`}</span></div></div>`).join("")}
    <p class="sub" style="margin-top:var(--s4)">${S.visitante && S.visitante.vinculo === "pausado" ? "Marcar aula e reposição volta quando a sua matrícula for reativada. Fale com o atelier." : "Marcar aula e reposição fica disponível quando você voltar às aulas. Para voltar, fale com o atelier."}</p>
    <div class="btns"><button class="btn pri" disabled>Marcar aula</button><button class="btn ghost" data-close>Fechar</button></div>`);
}
function viewVoceV(){
  const v = S.visitante, desde = v.aluno_desde ? fromKey(v.aluno_desde) : null, saiu = v.saida_em ? fromKey(v.saida_em) : null;
  return `<header class="profile">
    <div class="cover"></div>
    <div class="avatar" aria-hidden="true"><span class="ini">${esc(initials(v.nome))}</span></div>
    <h1 class="h4">${esc(v.nome || "")}</h1>
    <p class="sub"><span class="tag-ex">${rotuloV()}</span>${desde ? ` no atelier desde ${MES[desde.getMonth()]} de ${desde.getFullYear()}` : ""}</p>
  </header>
  <section class="tile wide v-aviso" style="margin-top:var(--s6)"><div class="tl"><h2 class="tt">Acesso reduzido</h2><span class="chip">${rotuloV()}</span></div>
    <p class="sub">Você vê a agenda do atelier (quantos alunos vêm em cada dia) e os eventos. ${S.visitante.vinculo === "pausado" ? "Marcar aulas, ter reposições e se inscrever em eventos voltam quando a sua matrícula for reativada." : "Para marcar aulas, ter reposições e se inscrever em eventos, é só voltar às aulas."}</p></section>
  <div class="list ajustes">
    ${linhaTema()}
    <button class="li" id="trocarSenha"><span class="ind n"></span>Trocar senha de acesso</button>
    <button class="li sairli" id="sair"><span class="ind n"></span>Sair da conta</button>
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
  const esp = abertas.find(a => a.fim > n && naEspera(a.aula_id));
  if(esp) return vagas(esp) > 0 ? "c sm vaga espera aberta" : "c sm espera";
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
    let cls = dayInfo(list).replace(" sm", " cnt");
    if(S.justGrew === k) cls += " grow";
    /* quantos alunos vêm no dia (sem nomes), como no painel da equipe */
    const num = ""; /* sem contagem para o aluno: só a cor diz se é seu dia, se tem vaga ou se lotou */
    cells += `<button class="${cc}" data-day="${k}" aria-label="${d} de ${MES[m]}${num ? `, ${plural(qtd, "aluno", "alunos")}` : ""}"><span class="slot"><span class="${cls}">${num}</span></span><span class="n tnum">${d}</span></button>`;
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
  <div class="legenda" aria-hidden="true"><span><i class="lg mine"></i>Seu dia</span><span><i class="lg vaga"></i>Com vaga</span><span><i class="lg cheio"></i>Lotado</span>${(S.espera || []).length ? `<span><i class="lg espera"></i>Na espera</span>` : ""}</div>
  ${repoLivre() ? `<div class="credits"><span><b>Reposições sem limite</b> <span style="color:var(--muted)">marque quantas quiser</span></span></div>
  <div class="hint"><span>Toque num dia com vaga para marcar uma reposição.</span><span>Toque no seu dia para desmarcar ou remarcar.</span></div>` : livre() ? `<div class="credits"><span><b>Plano livre</b> <span style="color:var(--muted)">sem limite de aulas</span></span></div>
  <div class="hint"><span>Toque num dia com vaga para marcar uma aula.</span><span>Toque numa aula marcada para desmarcar.</span></div>` : `<div class="credits">
    <span class="tnum"><b>${ac} de ${MAX_CRED}</b> <span style="color:var(--muted)">reposições disponíveis</span></span>
    <div class="dots" aria-hidden="true">${Array.from({length:MAX_CRED},(_,i)=>`<span class="${i<ac?"on":""}"></span>`).join("")}</div>
  </div>
  <div class="hint"><span>Toque num dia com vaga para marcar uma reposição.</span><span>Toque no seu dia para desmarcar ou remarcar.</span></div>`}
  ${!livre() && mudancas().total ? `<button class="textbtn voltar" id="voltarFixos">Reverter para meus dias fixos</button>` : ""}`;
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
  const emAndamento = a.ini <= n && a.fim > n;
  const quem = emAndamento ? `<p class="label" style="margin-top:var(--s4)">${plural(S.live.length,"aluno em aula","alunos em aula")}</p>${listaEmAula()}` : "";
  const repoDesfeita = isMine(a) && a.reserva_tipo === "reposicao" && a.reserva_status === "desmarcada" && a.ini > n;
  if(isMine(a) && !repoDesfeita){
    if(a.reserva_status === "confirmada" && a.ini > n) return sheetDesmarcar(a);
    if(a.reserva_tipo === "fixa" && ["desmarcada","ausencia_tardia"].includes(a.reserva_status) && a.ini > n){
      const lotado = vagas(a) <= 0;
      return sheet(`<p class="label">Seu dia fixo</p><h3 class="h5">Remarcar ${WD[a.ini.getDay()]}, ${dm(a.ini)}?</h3>
        <p class="sub">${hr}. Você desmarcou esta aula.${lotado ? " O horário está lotado agora." : a.reserva_status === "desmarcada" && !repoLivre() ? " Ao remarcar, 1 das suas reposições é usada." : ""}</p>
        <div class="btns"><button class="btn pri" data-remarcar="${a.reserva_id}" ${lotado ? "disabled" : ""}>Remarcar aula</button><button class="btn ghost" data-close>Agora não</button></div>`);
    }
    const txt = { confirmada: a.fim <= n ? "Presença registrada." : "Você está em aula agora.", presente: "Presença registrada.", falta: "Falta registrada.",
      desmarcada: "Desmarcada com aviso.", ausencia_tardia: "Avisada com menos de 4h. Não gerou reposição.", aula_cancelada: "Aula cancelada pelo atelier." }[a.reserva_status] || "";
    return sheet(`<p class="label">${a.reserva_tipo === "reposicao" ? "Reposição" : "Sua aula"}</p><h3 class="h5">${nome}</h3><p class="sub">${hr}. ${txt}</p>${quem}${close}`);
  }
  if(emAndamento) return sheet(`<p class="label">Agora no atelier</p><h3 class="h5">${nome}</h3><p class="sub">${hr}. Aula acontecendo agora.</p>${quem}${close}`);
  if(a.ini <= n) return sheet(`<h3 class="h5">${nome}</h3><p class="sub">${hr}. Esta aula já aconteceu.</p>${close}`);
  if(livre()){
    const v = vagas(a);
    return sheet(`<p class="label">${v <= 0 ? "Atelier lotado" : naEspera(a.aula_id) ? "Abriu vaga" : "Atelier aberto"}</p><h3 class="h5">Marcar ${WD[a.ini.getDay()]}, ${dm(a.ini)}?</h3><p class="sub">${hr}. ${v <= 0 ? "Atelier lotado neste horário." : naEspera(a.aula_id) ? "Abriu vaga nesta aula que você estava esperando." : "Plano livre: marque quantas aulas quiser."}</p>
      <div class="facts"><div><b class="tnum">${v}</b><span>vagas livres</span></div><div><b class="tnum">${a.ocupadas}</b><span>confirmados</span></div><div><b>∞</b><span>seu plano</span></div></div>
      ${v <= 0 ? blocoEspera(a, S.aluno.vinculo === "aluno") : `<div class="btns"><button class="btn pri" data-book="${a.aula_id}">Marcar aula</button><button class="btn ghost" data-close>Agora não</button></div>`}`);
  }
  const v = vagas(a), ac = nCred(), pode = v > 0 && (ac > 0 || repoLivre()) && S.aluno.vinculo === "aluno";
  const esperando = naEspera(a.aula_id);
  const motivo = v <= 0 ? (ac > 0 || repoLivre() ? "Atelier lotado neste horário." : "Atelier lotado neste horário. Para entrar na lista de espera, você precisa ter uma reposição disponível.") : esperando && (ac > 0 || repoLivre()) ? `Abriu vaga nesta aula que você estava esperando. ${repoLivre() ? "Suas reposições são sem limite." : `Usa 1 das suas ${plural(ac, "reposição", "reposições")}.`}` : repoLivre() ? "Suas reposições são sem limite." : ac === 0 ? "Você não tem reposições disponíveis." : S.aluno.vinculo !== "aluno" ? "Sua matrícula está pausada." : `Usa 1 das suas ${plural(ac, "reposição", "reposições")}.`;
  sheet(`<p class="label">${v <= 0 ? "Atelier lotado" : esperando ? "Abriu vaga" : "Atelier aberto"}</p><h3 class="h5">Repor ${WD[a.ini.getDay()]}, ${dm(a.ini)}?</h3><p class="sub">${hr}. ${motivo}</p>
    <div class="facts"><div><b class="tnum">${v}</b><span>vagas livres</span></div><div><b class="tnum">${a.ocupadas}</b><span>confirmados</span></div><div><b class="tnum">${repoLivre() ? "∞" : ac}</b><span>suas reposições</span></div></div>
    ${v <= 0 ? blocoEspera(a, (ac > 0 || repoLivre()) && S.aluno.vinculo === "aluno") : `<div class="btns"><button class="btn pri" data-book="${a.aula_id}" ${pode ? "" : "disabled"}>Marcar reposição</button><button class="btn ghost" data-close>Agora não</button></div>`}`);
}
function sheetDesmarcar(a){
  const horas = (a.ini - now()) / 36e5, ok = horas >= 4, ac = nCred();
  const fim = new Date(a.ini); fim.setFullYear(fim.getFullYear()+1);
  const msg = !ok ? "Faltam menos de 4h. A ausência fica registrada, mas não gera reposição."
    : livre() ? "A vaga fica livre para outra pessoa."
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
  const r = S.agenda.find(a => a.reserva_id === id);
  const msg = livre() ? (data === "ausencia_sem_credito" ? "Ausência registrada" : "Aula desmarcada") : { credito_gerado: "Aula desmarcada. +1 reposição", credito_devolvido: "Reposição desmarcada. O crédito voltou.", ausencia_sem_credito: "Ausência registrada", limite_de_creditos: "Aula desmarcada" }[data] || "Aula desmarcada";
  /* desfazer: aula fixa volta a valer; reposição (que some ao desmarcar) é marcada de novo */
  const desfazer = async () => {
    const res = r && r.reserva_tipo === "fixa" ? await sb.rpc("remarcar_aula", { p_reserva: id })
      : r ? await sb.rpc("marcar_reposicao", { p_aula: r.aula_id }) : { error: new Error("Não foi possível desfazer.") };
    if(res.error) return toast(errMsg(res.error));
    await loadAluno(); render(); vibrar(); toast("Pronto, sua aula voltou");
  };
  toastAcao(msg, "Desfazer", desfazer);
  await loadAluno(); render();
}
async function doBook(aulaId, btn){
  busy(btn, true);
  const { error } = await sb.rpc("marcar_reposicao", { p_aula: aulaId });
  if(error){ busy(btn, false); return toast(errMsg(error)); }
  const a = S.agenda.find(x => x.aula_id === aulaId);
  closeSheet(); await loadAluno();
  if(a){ S.justGrew = dkey(a.ini); S.mes = new Date(a.ini.getFullYear(), a.ini.getMonth(), 1); }
  render(); vibrar(); toast(livre() ? "Aula marcada" : "Reposição marcada");
}

/* ---------- Eventos ---------- */
function viewEventos(){
  const n = now();
  const lista = S.eventos.filter(e => e.fim > n && (S.evFiltro === "proximos" || e.inscrito));
  return `<h1 class="h4">Eventos</h1>
  ${S.aluno ? `<div class="seg" role="group" aria-label="Filtro">
    <button data-evf="proximos" aria-pressed="${S.evFiltro === "proximos"}">Próximos</button>
    <button data-evf="meus" aria-pressed="${S.evFiltro === "meus"}">Inscrito</button></div>` : ""}
  <div class="evcards">${lista.length ? lista.map(e => cardEventoHTML(e)).join("") : `<p class="empty">${S.evFiltro === "meus" ? "Você ainda não se inscreveu em nenhum evento." : "Nenhum evento marcado por enquanto."}</p>`}</div>`;
}
/* cartão de evento das listas (aluno e equipe): foto em cima, data com hierarquia, título e quem vai */
const dataPonto = d => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
/* selo de calendário (mês em cima, dia embaixo): o mesmo componente no cartão e na página do evento */
const mesSigla = d => MES[d.getMonth()].slice(0, 3).toUpperCase();
const seloData = (d, cls = "") => `<span class="dchip ${cls}" aria-hidden="true"><span>${mesSigla(d)}</span><b class="tnum">${d.getDate()}</b></span>`;
function cardEventoHTML(e, eq){
  const vag = e.vagas == null ? null : Math.max(0, e.vagas - e.inscritos);
  const num = (n, rot) => `<span class="evc-st"><b class="tnum">${n}</b> <span>${rot}</span></span>`;
  const status = eq ? num(e.vagas ? `${e.inscritos} de ${e.vagas}` : e.inscritos, e.inscritos === 1 && !e.vagas ? "inscrito" : "inscritos")
    : e.inscrito ? `<span class="evc-st in">Inscrito</span>`
    : vag == null ? `<span class="evc-st"><span>Vagas abertas</span></span>` : vag ? num(vag, vag === 1 ? "vaga" : "vagas") : `<span class="evc-st"><span>Esgotado</span></span>`;
  const quem = (e.quem || []).length ? quemVaiHTML(e, 4) : `<span class="fpt">Ninguém inscrito ainda</span>`;
  return `<button class="evcard${e.foto_url ? " comfoto" : ""}" data-ev="${e.id}" aria-label="${esc(e.titulo)}, ${WD[e.ini.getDay()]} ${e.ini.getDate()} de ${MES[e.ini.getMonth()]}">
    ${e.foto_url ? `<span class="evc-foto"><img src="${esc(e.foto_url)}" alt="" loading="lazy">${seloData(e.ini, "sobre")}</span>` : ""}
    <span class="evc-corpo">
      ${e.foto_url ? "" : seloData(e.ini)}
      <span class="evc-txt">
        <span class="evc-over">${esc(e.tipo)}${e.publicado ? "" : ", rascunho"}</span>
        <span class="evc-tit">${esc(e.titulo)}</span>
        <span class="evc-sub">${cap1(WD[e.ini.getDay()])}, ${hh(e.ini)} às ${hh(e.fim)}${e.local ? `, ${esc(e.local)}` : ""}</span>
      </span>
    </span>
    <span class="evc-pe">${quem}${status}</span>
  </button>`;
}
/* ---------- Página do evento: detalhes, reações e mural ---------- */
const EMOJIS = ["❤️","😍","👏","🎨","🔥","😂"];
const EV = { id: null, volta: null, mural: null, reac: [], quem: [], rascunho: "", carregado: null };
const muralContaHTML = e => e.nc ? `<span class="mcount">${plural(e.nc, "comentário", "comentários")}</span>` : "";
const podeEscrever = () => !!(S.aluno || S.equipe) && !(S.visitante && !S.equipe);
function abrirEvento(id){
  if(EV.id !== id){ EV.mural = null; EV.reac = []; EV.quem = []; EV.rascunho = ""; } EV.tray = false;
  EV.id = id; if(S.tab !== "evento") EV.volta = S.tab;
  go("evento");
  loadEventoPag().then(() => { if(S.tab === "evento" && EV.id === id) render(); });
}
async function loadEventoPag(){
  const id = EV.id; if(!id) return;
  const [m, r, q] = await Promise.all([sb.rpc("mural_evento", { p_evento: id }), sb.rpc("reacoes_eventos"), sb.rpc("quem_reagiu", { p_evento: id })]);
  if(EV.id !== id) return;
  EV.mural = (m.data || []).map(c => ({ ...c, quando: new Date(c.criado_em) })).sort((a, b) => b.quando - a.quando);
  EV.reac = (r.data || []).filter(x => x.evento_id === id);
  EV.quem = q.data || [];
  const e = S.eventos.find(x => x.id === id); if(e) e.nc = EV.mural.length;
}
const avatarMural = c => `<span class="av mav">${c.avatar_url ? `<img src="${esc(c.avatar_url)}" alt="" loading="lazy">` : esc(initials(String(c.nome).replace(".", "")))}</span>`;
const EVI = {
  data:'<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  local:'<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  valor:'<svg viewBox="0 0 24 24"><path d="M4 8.5V6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v2a3.5 3.5 0 0 0 0 7v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-2a3.5 3.5 0 0 0 0-7z"/><path d="M14 5v14" stroke-dasharray="2 2.5"/></svg>',
  vagas:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.9-3.4 3.2-5.2 6-5.2s5.1 1.8 6 5.2M15.5 5.6a3 3 0 0 1 0 5.8M17.6 14.6c1.6.7 2.7 2.4 3.2 4.9"/></svg>',
  reagir:'<svg viewBox="0 0 24 24"><path d="M20 11.5A8.5 8.5 0 1 1 12.5 3.05"/><path d="M8.8 14.5c.8 1.1 1.9 1.7 3.2 1.7s2.4-.6 3.2-1.7"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/><path d="M19 2.5v5M16.5 5h5"/></svg>',
  enviar:'<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>'
};
function reacoesHTML(){
  const pode = podeEscrever();
  const minha = (EV.reac.find(r => r.minha) || {}).emoji;
  const ativas = EMOJIS.map(em => EV.reac.find(r => r.emoji === em)).filter(Boolean);
  const nomes = EV.quem.map(q => q.sou_eu ? "você" : firstName(q.nome));
  const txt = !nomes.length ? "" : nomes.length <= 2 ? cap1(nomes.join(" e ")) : `${cap1(nomes.slice(0, 2).join(", "))} e mais ${nomes.length - 2}`;
  if(!ativas.length && !pode) return "";
  return `<div class="rbar">
    ${ativas.map(r => `<button class="rchip${r.minha && EV.novo === r.emoji ? " pulo" : ""}" data-reac="${r.emoji}" aria-pressed="${!!r.minha}" ${pode ? "" : "disabled"}><span>${r.emoji}</span><span class="tnum">${r.total}</span></button>`).join("")}
    ${pode ? `<button class="rchip radd" id="rAdd" aria-expanded="${!!EV.tray}" aria-label="Reagir">${EVI.reagir}${ativas.length ? "" : "<span>Reagir</span>"}</button>` : ""}
    ${txt ? `<span class="rquem">${esc(txt)}</span>` : ""}
  </div>
  ${pode && EV.tray ? `<div class="rtray" role="group" aria-label="Escolha uma reação">${EMOJIS.map(em => `<button data-reac="${em}" aria-pressed="${minha === em}" aria-label="Reagir com ${em}">${em}</button>`).join("")}</div>` : ""}`;
}
function meuAvatarHTML(){
  const f = (S.aluno && S.aluno.avatar_url) || (!S.aluno && S.painel && S.painel.avatar_url);
  const n = (S.aluno && S.aluno.nome) || (S.painel && S.painel.nome) || (S.pessoa && S.pessoa.nome) || "";
  return `<span class="av mav">${f ? `<img src="${esc(f)}" alt="">` : esc(initials(n))}</span>`;
}
function muralHTML(){
  const pode = podeEscrever();
  const comp = pode ? `<form class="mcomp" id="mForm">${meuAvatarHTML()}
      <div class="mfield"><label class="sr" for="mTxt">Escrever no mural</label>
      <textarea id="mTxt" rows="1" maxlength="500" placeholder="Escreva um comentário">${esc(EV.rascunho)}</textarea>
      <button class="mpub" type="submit" aria-label="Publicar" ${EV.rascunho.trim() ? "" : "disabled"}>${EVI.enviar}</button></div></form>`
    : `<p class="mnota">Comentar fica aberto para alunos ativos e equipe.</p>`;
  if(EV.mural === null) return `${comp}<div class="mlista sk-lista" aria-hidden="true"><span class="sk sk-card"></span><span class="sk sk-card"></span></div>`;
  const chegou = EV.chegou; EV.chegou = false;
  return `${comp}<div class="mlista">${EV.mural.length ? EV.mural.map((c, i) => `<article class="mc${chegou && i === 0 && !c.sou_eu ? " chegou" : ""}">
      ${avatarMural(c)}
      <div class="mcb"><p class="mch"><b>${c.sou_eu ? "Você" : esc(c.nome)}</b>${c.equipe ? `<span class="meq">Equipe</span>` : ""}</p>
        <p class="mtx">${esc(c.texto)}</p>
        <p class="mmeta"><span>${tempoRel(c.quando)}</span>${c.sou_eu || S.equipe ? `<button class="mdel" data-mdel="${c.id}">Apagar</button>` : ""}</p></div>
    </article>`).join("") : `<p class="mvazio">Nenhum comentário ainda.</p>`}</div>`;
}
const EVI_TOPO = {
  voltar:'<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  editar:'<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  hora:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  foto:'<svg viewBox="0 0 24 24"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.3"/></svg>'
};
/* reações na capa: um emoji fixo no canto de baixo e um fluxo de emojis subindo dele,
   como as reações de transmissão ao vivo (cada um com velocidade, tamanho e balanço sorteados) */
function poolReacoes(){ const l = []; EMOJIS.forEach(em => { const r = EV.reac.find(x => x.emoji === em); if(r) for(let k = 0; k < r.total; k++) l.push(em); }); return l; }
function capaReacoesHTML(){
  if(!EV.reac.length) return "";
  const topo = EV.novo || [...EV.reac].sort((a, b) => b.total - a.total)[0].emoji;
  return `<div class="evfloat" id="evFloat" aria-hidden="true"><span class="evancora${EV.novo ? " pulo" : ""}">${topo}</span></div>`;
}
const semMovimento = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
function bolhaReacao(em, rapido, nome){
  const box = $("#evFloat"); if(!box || semMovimento() || box.childElementCount > 9) return;
  const alt = box.clientHeight, rnd = (a, b) => a + Math.random() * (b - a);
  const out = document.createElement("span"), inn = document.createElement("span");
  out.className = "evbolha"; inn.textContent = em; out.appendChild(inn);
  if(nome){ const tag = document.createElement("small"); tag.textContent = nome; inn.appendChild(tag); out.classList.add("comnome"); }
  out.style.fontSize = `${Math.round(rnd(28, 40))}px`; box.appendChild(out);
  const dur = rapido ? rnd(1800, 2600) : rnd(3400, 5200), sobe = alt * rnd(.55, .8), lado = rnd(14, 30) * (Math.random() < .5 ? -1 : 1);
  out.animate([
    { transform: "translateY(0) scale(.2)", opacity: 0 },
    { transform: `translateY(-${sobe * .12}px) scale(1.05)`, opacity: 1, offset: .12 },
    { transform: `translateY(-${sobe * .2}px) scale(1)`, opacity: 1, offset: .2 },
    { transform: `translateY(-${sobe * .7}px) scale(.95)`, opacity: .85, offset: .7 },
    { transform: `translateY(-${sobe}px) scale(.8)`, opacity: 0 }
  ], { duration: dur, easing: "cubic-bezier(.25,.6,.45,1)", fill: "forwards" }).onfinish = () => out.remove();
  inn.animate([
    { transform: "translateX(0) rotate(0deg)" },
    { transform: `translateX(${lado}px) rotate(${lado / 3}deg)` },
    { transform: `translateX(${-lado * .7}px) rotate(${-lado / 4}deg)` },
    { transform: `translateX(${lado * .4}px) rotate(${lado / 6}deg)` },
    { transform: "translateX(0) rotate(0deg)" }
  ], { duration: dur, easing: "ease-in-out", fill: "forwards" });
}
function iniciarFluxo(){
  if(EV.fluxo || semMovimento()) return;
  const tick = () => {
    if(S.tab !== "evento" || !$("#evFloat")){ EV.fluxo = null; return; }
    const pool = poolReacoes();
    if(pool.length && !document.hidden) bolhaReacao(pool[Math.floor(Math.random() * pool.length)]);
    EV.fluxo = setTimeout(tick, 1100 + Math.random() * 1700 - Math.min(pool.length, 10) * 60);
  };
  EV.fluxo = setTimeout(tick, 500);
}
/* explosão de emojis subindo a partir do botão tocado */
/* resposta ao toque: o chip dá um apertinho e um único emoji sobe dele, com curva desacelerada (Material 3) */
const M3_ENF = "cubic-bezier(.05,.7,.1,1)", M3_PADRAO = "cubic-bezier(.2,0,0,1)";
function soltarEmojis(em, el){
  if(semMovimento() || !el) return;
  const r = el.getBoundingClientRect();
  const sp = document.createElement("span"); sp.className = "evburst"; sp.textContent = em;
  sp.style.left = `${r.left + r.width / 2}px`; sp.style.top = `${r.top + r.height / 2}px`;
  document.body.appendChild(sp);
  sp.animate([
    { transform: "translate(-50%,-50%) scale(.6)", opacity: 0 },
    { transform: "translate(-50%,-90%) scale(1.25)", opacity: 1, offset: .35 },
    { transform: "translate(-50%,-260%) scale(1)", opacity: 0 }
  ], { duration: 900, easing: M3_ENF, fill: "forwards" }).onfinish = () => sp.remove();
}
/* ---------- ao vivo: quem está na página vê as reações e os comentários dos outros na hora ---------- */
function meuNomeCurto(){ return firstName((S.aluno && S.aluno.nome) || (S.painel && S.painel.nome) || (S.pessoa && S.pessoa.nome) || ""); }
function souFantasma(){ return !!(S.aluno && S.aluno.fantasma); }
function canalEvento(){
  if(!sb.channel) return;
  const id = EV.id;
  if(EV.canal && EV.canalId === id) return;
  sairCanalEvento();
  const ch = sb.channel(`evento-${id}`, { config: { broadcast: { self: false }, presence: { key: (S.session && S.session.user.id) || String(Math.random()) } } });
  ch.on("broadcast", { event: "reacao" }, ({ payload }) => {
    if(S.tab !== "evento" || EV.id !== id || !payload) return;
    bolhaReacao(payload.emoji, false, payload.nome); atualizarAoVivo();
  });
  ch.on("broadcast", { event: "comentario" }, () => { if(S.tab === "evento" && EV.id === id){ EV.chegou = true; atualizarAoVivo(); } });
  ch.on("presence", { event: "sync" }, () => {
    const st = ch.presenceState(), meu = S.session && S.session.user.id;
    EV.aqui = Object.entries(st).filter(([k]) => k !== meu).map(([, v]) => v[0]).filter(Boolean);
    const el = $("#evAqui"); if(el) el.outerHTML = aquiHTML();
  });
  ch.subscribe(st => { if(st === "SUBSCRIBED" && !souFantasma()) ch.track({ nome: meuNomeCurto(), avatar: (S.aluno && S.aluno.avatar_url) || (S.painel && S.painel.avatar_url) || null }); });
  EV.canal = ch; EV.canalId = id;
}
function sairCanalEvento(){ if(EV.canal){ try{ sb.removeChannel(EV.canal); }catch(_){} } EV.canal = null; EV.canalId = null; EV.aqui = []; }
function avisarCanal(evento, payload){ if(EV.canal && !souFantasma()) EV.canal.send({ type: "broadcast", event: evento, payload: { ...payload, nome: meuNomeCurto() } }).catch(() => {}); }
function atualizarAoVivo(){
  clearTimeout(EV.vivoT);
  EV.vivoT = setTimeout(async () => { await Promise.all([loadEventoPag(), loadEventos()]); if(S.tab === "evento" && !document.activeElement?.matches?.("#mTxt")) render(); }, 700);
}
function aquiHTML(){
  const l = EV.aqui || [];
  if(!l.length) return `<span id="evAqui"></span>`;
  const nomes = l.map(q => q.nome).filter(Boolean);
  const txt = nomes.length === 1 ? `${nomes[0]} está aqui agora` : nomes.length === 2 ? `${nomes[0]} e ${nomes[1]} estão aqui agora` : `${nomes.length} pessoas aqui agora`;
  return `<span id="evAqui" class="evaqui"><span class="fps">${l.slice(0, 3).map(q => `<span class="fp">${q.avatar ? `<img src="${esc(q.avatar)}" alt="">` : esc(initials(q.nome || ""))}</span>`).join("")}</span><span class="evaqui-t">${esc(txt)}</span></span>`;
}
function viewEventoPag(){
  EV.vivas = $$("#evFloat .evbolha");   // emojis no meio do voo passam para a capa nova sem sumir
  const e = S.eventos.find(x => x.id === EV.id);
  if(!e){ setTimeout(() => S.tab === "evento" && go(EV.volta || "eventos")); return ""; }
  const vag = e.vagas == null ? null : Math.max(0, e.vagas - e.inscritos);
  const [preco1, ...precoResto] = String(e.preco_texto || "").split(/\s+·\s+|\s*\/\s*|;\s*/).filter(Boolean);
  const passou = e.ini <= now();
  const vagasTxt = vag == null ? "" : vag === 0 ? "Esgotado" : plural(vag, "vaga livre", "vagas livres");
  const preco = `<span class="evbar-l"><span class="evbar-r">Valor</span><b>${esc(preco1 || "A definir")}</b>${precoResto.length ? `<span class="evbar-n">${esc(precoResto.join(", "))}</span>` : ""}</span>`;
  let barra = "";
  if(S.visitante && !S.equipe) barra = `${preco}<span class="evbar-aviso">Inscrição para alunos ativos</span>`;
  else if(S.aluno && e.inscrito) barra = `<span class="evbar-l"><span class="evbar-r">Inscrição</span><b class="evvai">Você vai</b></span><button class="btn evcta ghost-line" data-unev="${e.id}">Cancelar</button>`;
  else if(S.aluno) barra = `${preco}<button class="btn pri evcta" data-inev="${e.id}" ${vag === 0 || passou ? "disabled" : ""}>${vag === 0 ? "Esgotado" : passou ? "Encerrado" : "Quero ir"}</button>`;
  return `<header class="evhero${e.foto_url ? " comfoto" : ""}${EV.reac.length ? " comreac" : ""}">
      ${e.foto_url ? `<img class="evfoto" src="${esc(e.foto_url)}" alt="">` : ""}
      <div class="evhero-top"><button class="evround" data-evvoltar aria-label="Voltar">${EVI_TOPO.voltar}</button>
        ${S.equipe ? `<span class="evhero-acoes"><label class="evround" aria-label="${e.foto_url ? "Trocar foto" : "Adicionar foto"}">${EVI_TOPO.foto}<input type="file" accept="image/*" id="evFotoIn" hidden></label><button class="evround" data-editev="${e.id}" aria-label="Editar evento">${EVI_TOPO.editar}</button></span>` : ""}</div>
      ${capaReacoesHTML()}
    </header>
    <article class="evbody${barra ? " combarra" : ""}">
      <span class="evc-over">${esc(e.tipo)}${e.publicado ? "" : ", rascunho"}</span>
      <h1 class="evtit">${esc(e.titulo)}</h1>
      <ul class="evinfo">
        <li class="lin"><span class="evico">${EVI.data}</span><span><b>${cap1(WD[e.ini.getDay()])}, ${e.ini.getDate()} de ${MES[e.ini.getMonth()]}</b><span>, ${hh(e.ini)} às ${hh(e.fim)}</span></span></li>
        ${e.local ? `<li class="lin"><span class="evico">${EVI.local}</span><span><b>${esc(e.local)}</b>${/atelier/i.test(e.local) ? `<span>, Rua São Paulo, 864</span>` : ""}</span></li>` : ""}
        ${!S.aluno && preco1 ? `<li class="lin"><span class="evico">${EVI.valor}</span><span><b>${esc(preco1)}</b>${precoResto.length ? `<span>, ${esc(precoResto.join(", "))}</span>` : ""}</span></li>` : ""}
      </ul>
      <div class="evgente">${(e.quem || []).length ? quemVaiHTML(e, 5) : `<span class="fpt">Ninguém inscrito ainda</span>`}${vagasTxt ? `<span class="evvag">${vagasTxt}</span>` : ""}</div>
      ${e.descricao ? `<h2 class="evsec">Sobre</h2><p class="evdesc">${esc(e.descricao)}</p>` : ""}
      <section class="evmural">
        <div class="mtopo"><h2 class="evsec">Mural</h2>${aquiHTML()}</div>
        ${reacoesHTML()}
        ${muralHTML()}
      </section>
    </article>
    ${barra ? `<div class="evbar"><div class="evbar-in">${barra}</div></div>` : ""}`;
}
async function enviarFotoEvento(id, input){
  const f = input.files && input.files[0]; if(!f) return;
  toast("Enviando foto…");
  try{
    const blob = await comprimir(f, 1600);
    const path = `${S.session.user.id}/evento-${id}-${Date.now()}.jpg`;
    const { error } = await sb.storage.from("perfis").upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if(error) throw error;
    const url = sb.storage.from("perfis").getPublicUrl(path).data.publicUrl;
    const { error: e2 } = await sb.from("eventos").update({ foto_url: url }).eq("id", id);
    if(e2) throw e2;
    const e = S.eventos.find(x => x.id === id); if(e) e.foto_url = url;
    toast("Foto do evento salva"); render();
  }catch(ex){ toast(errMsg(ex)); }
}
function bindEventoPag(){
  if(S.tab !== "evento") return;
  const id = EV.id;
  const vb = $("#view [data-evvoltar]"); if(vb) vb.onclick = () => go(EV.volta || "eventos");
  const fi = $("#evFotoIn"); if(fi) fi.onchange = () => enviarFotoEvento(id, fi);
  const fl = $("#evFloat"); if(fl && EV.vivas && EV.vivas.length){ EV.vivas.forEach(b => fl.appendChild(b)); } EV.vivas = null;
  iniciarFluxo(); canalEvento();
  $$("#view [data-inev]").forEach(b => b.onclick = async () => { busy(b, true); const { error } = await sb.rpc("inscrever_evento", { p_evento: id });
    if(error){ busy(b, false); return toast(errMsg(error)); } vibrar(); toast("Inscrição feita"); await loadEventos(); render(); });
  $$("#view [data-unev]").forEach(b => b.onclick = async () => { busy(b, true); const { error } = await sb.rpc("cancelar_inscricao", { p_evento: id });
    if(error){ busy(b, false); return toast(errMsg(error)); } toast("Inscrição cancelada"); await loadEventos(); render(); });
  const ra = $("#rAdd"); if(ra) ra.onclick = () => { EV.tray = !EV.tray; render(); };
  $$("#view [data-reac]").forEach(b => b.onclick = async () => {
    EV.tray = false;
    const em = b.dataset.reac, antes = EV.reac.map(r => ({ ...r })), minha = (EV.reac.find(r => r.minha) || {}).emoji;
    EV.reac = EV.reac.map(r => r.emoji === minha ? { ...r, total: r.total - 1, minha: false } : r).filter(r => r.total > 0);
    if(minha !== em){ const r = EV.reac.find(x => x.emoji === em); if(r){ r.total++; r.minha = true; } else EV.reac.push({ evento_id: id, emoji: em, total: 1, minha: true }); vibrar();
      soltarEmojis(em, b); EV.novo = em; setTimeout(() => bolhaReacao(em, false), 120); avisarCanal("reacao", { emoji: em }); clearTimeout(EV.novoT); EV.novoT = setTimeout(() => { EV.novo = null; }, 1500); }
    render();
    const { error } = await sb.rpc("reagir_evento", { p_evento: id, p_emoji: em });
    if(error){ EV.reac = antes; render(); return toast(errMsg(error)); }
    await loadEventoPag(); if(S.tab === "evento") render();
  });
  const ta = $("#mTxt"), f = $("#mForm");
  if(ta){
    const ajusta = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 180) + "px"; };
    ajusta();
    ta.oninput = () => { EV.rascunho = ta.value; ajusta(); $("#mForm .mpub").disabled = !ta.value.trim(); };
  }
  if(f) f.onsubmit = async ev => {
    ev.preventDefault(); const txt = ta.value.trim(); if(!txt) return;
    const btn = $("#mForm .mpub"); busy(btn, true); ta.disabled = true;
    const { error } = await sb.rpc("comentar_evento", { p_evento: id, p_texto: txt });
    if(error){ busy(btn, false); ta.disabled = false; return toast(errMsg(error)); }
    EV.rascunho = ""; vibrar(); avisarCanal("comentario", {}); await loadEventoPag(); if(S.tab === "evento") render();
  };
  $$("#view [data-mdel]").forEach(b => b.onclick = () => sheet(`<p class="label">Mural</p><h3 class="h5">Apagar este comentário?</h3>
    <p class="sub">Ele sai do mural para todo mundo.</p>
    <div class="btns"><button class="btn danger" data-mdelok="${b.dataset.mdel}">Apagar</button><button class="btn ghost" data-close>Cancelar</button></div>`));
}
$("#sheetBody").addEventListener("click", async e => {
  const t = e.target.closest("[data-mdelok]"); if(!t) return;
  busy(t, true); const { error } = await sb.rpc("apagar_comentario_evento", { p_id: t.dataset.mdelok });
  if(error){ busy(t, false); return toast(errMsg(error)); }
  closeSheet(); toast("Comentário apagado"); await loadEventoPag(); if(S.tab === "evento") render();
});

/* ---------- Hoje da equipe (tela inicial do admin) ---------- */
async function loadHojeEq(){
  const de = startOfDay(new Date()), ate = addDays(de, 21);
  const [ms, live, pd, pn, , al] = await Promise.all([
    sb.rpc("equipe_mes", { p_de: dkey(de), p_ate: dkey(ate) }), sb.rpc("em_aula_agora"),
    sb.rpc("equipe_pedidos"), S.painel ? Promise.resolve({ data: S.painel }) : sb.rpc("meu_painel_equipe"), loadEventos(),
    sb.rpc("equipe_alertas"), loadRecados()
  ]);
  const ordem = { faltas: 0, reposicoes: 1, espera: 2 };
  S.eq.alertas = (al.data || []).sort((a, b) => (ordem[a.tipo] ?? 9) - (ordem[b.tipo] ?? 9) || b.valor - a.valor);
  S.eq.prox = (ms.data || []).map(a => ({ ...a, ini: new Date(a.inicia_em), fim: new Date(a.termina_em) })).sort((a,b) => a.ini - b.ini);
  S.live = live.data || []; S.eq.pedidos = pd.data || []; S.painel = pn.data || S.painel || {};
  S.eq.hojePronto = true;
  if(S.tab === "eqhoje") render();
}
function viewHojeEq(){
  const n = now(), E = S.eq, p = S.painel || {};
  if(!E.hojePronto) return esqueleto();
  const abertas = (E.prox || []).filter(a => !a.cancelada);
  const agora = abertas.find(a => a.ini <= n && a.fim > n);
  const hoje = abertas.filter(a => dkey(a.ini) === dkey(n) && a.fim > n);
  const nx = abertas.find(a => a.fim > n && a !== agora) || null;
  const estado = agora ? `Atelier aberto agora, até as ${hh(agora.fim)}.` : hoje.length ? `Hoje o atelier abre às ${hh(hoje[0].ini)}.` : abertas.some(a => dkey(a.ini) === dkey(n)) ? "As aulas de hoje já terminaram." : "Hoje o atelier está fechado.";
  const live = S.live.length, np = (E.pedidos || []).length;
  const ev = S.eventos.find(e => e.fim > n);
  const sem = abertas.filter(a => a.ini >= startOfDay(n) && a.ini < addDays(startOfDay(n), 7));
  const vagasSem = sem.reduce((t, a) => t + Math.max(0, a.capacidade - a.ocupadas), 0);
  return `
  <header class="hello">
    <p class="label">${cap1(WD[n.getDay()])}, ${dm(n)}</p>
    <h1 class="h4">${saudacao()}, ${esc(firstName(p.nome) || "equipe")}</h1>
    <p class="sub" style="font-size:var(--t-body)">${estado}</p>
  </header>
  <button class="live" id="liveBtn" ${live ? "" : "disabled"}>
    <span class="dot"></span><u>${live ? `${plural(live,"aluno","alunos")} em aula agora` : "Ninguém no atelier agora"}</u>
  </button>
  ${blocoRecados()}
  ${nx ? `<section class="tile wide next">
    <div class="tl"><h2 class="tt">Próxima aula</h2><span class="chip tnum">${plural(nx.ocupadas, "aluno", "alunos")} de ${nx.capacidade}</span></div>
    <div class="tv tnum">${dkey(nx.ini) === dkey(n) ? "Hoje" : dkey(nx.ini) === dkey(addDays(n,1)) ? "Amanhã" : cap1(WD[nx.ini.getDay()])}, ${dm(nx.ini)}</div>
    <p class="ts">${hh(nx.ini)} às ${hh(nx.fim)}</p>
    <button class="textbtn" data-eqdia="${dkey(nx.ini)}">Ver quem vem</button>
  </section>` : `<section class="tile wide next"><div class="tl"><h2 class="tt">Próxima aula</h2></div><p class="sub">Nenhuma aula nas próximas semanas. Confira os horários do atelier.</p></section>`}
  <div class="list">
    <button class="li" id="pnPedidos"><span class="ind ${np ? "" : "n"}"></span>Pedidos de mudança<span class="end tnum">${np ? `${np} aguardando` : "nenhum"}</span></button>
    <button class="li" data-tabgo="eq:dia"><span class="ind n"></span>Próximos 7 dias<span class="end tnum">${plural(sem.length, "aula", "aulas")}, ${plural(vagasSem, "vaga", "vagas")}</span></button>
    ${ev ? `<button class="li" data-ev="${ev.id}"><span class="ind n"></span><span>${esc(ev.titulo)}</span><span class="end tnum">${WDS[ev.ini.getDay()]} ${dm(ev.ini)}${ev.inscritos ? `, ${plural(ev.inscritos, "inscrito", "inscritos")}` : ""}</span></button>` : `<button class="li" data-editev="novo"><span class="ind n"></span>Criar evento</button>`}
    <button class="li" id="pnEmails"><span class="ind n"></span>Adicionar alunos por e-mail</button>
  </div>
  ${blocoAlertas()}
  ${botaoRecado()}`;
}
/* alertas: faltas seguidas, reposições perto do limite e lista de espera */
const ALERTA_T = { faltas: "Sem vir há algumas aulas", reposicoes: "Perto do limite de reposições", espera: "Lista de espera" };
function blocoAlertas(){
  const al = S.eq.alertas || [];
  if(!al.length) return `<section class="alertas"><p class="label">Atenção</p><p class="sub alertas-ok">Nenhum alerta. Todo mundo em dia com as aulas e as reposições.</p></section>`;
  const grupos = {}; al.forEach(a => (grupos[a.tipo] ||= []).push(a));
  return `<section class="alertas"><p class="label">Atenção</p>${Object.entries(grupos).map(([t, l]) => `
    <p class="alertas-g">${ALERTA_T[t] || t}</p>
    <div class="list alertas-l">${l.map(a => {
      const det = String(a.detalhe || "");
      return `<button class="li al" ${a.aluno_id ? `data-alerta-pessoa="${a.aluno_id}"` : `data-eqdia="${esc(a.dia)}"`}>
        <span class="ind ${t === "espera" ? "" : "warn"}"></span><span class="al-t"><span>${esc(t === "espera" ? cap1(a.nome) : a.nome)}</span><span class="sub">${esc(det)}</span></span></button>`;
    }).join("")}</div>`).join("")}</section>`;
}
async function abrirPessoaAlerta(id){
  S.eq.sec = "pessoas"; S.tab = "eq:pessoas"; window.scrollTo(0,0); render();
  await eqLoad();
  if(S.eq.alunos.find(x => x.id === id)) sheetPessoaEq(id);
}

/* ---------- Painel da equipe ---------- */
async function loadPainel(){
  const [pn, pd, ps] = await Promise.all([sb.rpc("meu_painel_equipe"), sb.rpc("equipe_pedidos"), sb.from("pessoas").select("id,email,nome,vinculo")]);
  S.painel = pn.data || {}; S.eq.pedidos = pd.data || [];
  if(!S.eq.alunos || !S.eq.alunos.length) S.eq.alunos = ps.data || [];
  if(S.tab === "painel") render();
}
function viewPainel(){
  const p = S.painel || {}, nome = p.nome || "Equipe Alma";
  const desde = p.desde ? new Date(p.desde) : null;
  const np = p.pedidos ?? (S.eq.pedidos || []).length;
  return `<header class="profile">
    <div class="cover ${p.capa_url ? "has" : ""}">${p.capa_url ? `<img class="coverimg" src="${esc(p.capa_url)}" alt="">` : ""}
      <label class="coverbtn" for="capaIn">${CAM}<span>${p.capa_url ? "Trocar capa" : "Adicionar capa"}</span></label>
      <input type="file" id="capaIn" accept="image/*" hidden>
    </div>
    <label class="avatar" for="avIn" aria-label="Trocar foto de perfil">
      ${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : `<span class="ini">${esc(initials(nome))}</span>`}
      <span class="avedit">${CAM}</span>
    </label>
    <input type="file" id="avIn" accept="image/*" hidden>
    <h1 class="h4">${esc(nome)}</h1>
    <p class="sub">${esc(p.cargo || "Professor")}</p>
  </header>
  <div class="stats">
    <div class="stat"><b class="tnum">${p.alunos ?? "—"}</b><span>alunos<br>ativos</span></div>
    <div class="stat"><b class="tnum">${p.usam_app ?? "—"}</b><span>usam<br>o app</span></div>
    <div class="stat"><b class="tnum">${p.aulas_semana ?? "—"}</b><span>aulas<br>nesta semana</span></div>
  </div>
  <div class="list">
    <button class="li" id="pnPedidos"><span class="ind ${np ? "" : "n"}"></span>Pedidos de mudança<span class="end tnum">${np ? `${np} aguardando` : "nenhum"}</span></button>
    <button class="li" id="pnEmails"><span class="ind n"></span>Adicionar alunos por e-mail</button>
    <button class="li" id="pnEvento"><span class="ind n"></span>Criar evento</button>
    <button class="li" id="pnHorario"><span class="ind n"></span>Horários do atelier</button>
    <button class="li" id="pnPerfil"><span class="ind n"></span>Editar nome e cargo</button>
    ${linhaPush()}
    ${linhaTema()}
    <button class="li" id="pnFantasma"><span class="ind n"></span>Ver o app como aluno</button>
  </div>
  <button class="signout" id="trocarSenha">Trocar senha de acesso</button>
  <button class="signout" id="sair">Sair da conta</button>
  <p class="foot">${esc(p.email || "")}${desde ? `, na equipe desde ${MES[desde.getMonth()]} de ${desde.getFullYear()}` : ""}</p>`;
}
function sheetPerfilEq(){
  const p = S.painel || {};
  sheet(`<p class="label">Seu perfil</p><h3 class="h5">Nome e cargo</h3>
    <form class="form" id="pfForm">
      <label class="field"><span>Nome</span><input id="pfNome" value="${esc(p.nome)}"></label>
      <label class="field"><span>Cargo</span><input id="pfCargo" value="${esc(p.cargo)}" placeholder="Diretor"></label>
      <div class="btns"><button class="btn pri" type="submit">Salvar</button><button class="btn ghost" type="button" data-close>Cancelar</button></div>
    </form>`);
  $("#pfForm").onsubmit = async ev => { ev.preventDefault(); const b = $("#pfForm button[type=submit]"); busy(b, true);
    const { error } = await sb.rpc("atualizar_equipe", { p_nome: $("#pfNome").value, p_cargo: $("#pfCargo").value });
    if(error){ busy(b, false); return toast(errMsg(error)); }
    closeSheet(); toast("Perfil salvo"); loadPainel(); };
}

/* ---------- Você ---------- */
/* no dia em que completa mais um ano de atelier, o Hoje lembra */
function aniversarioAtelier(){
  const a = S.aluno; if(!a || !a.aluno_desde) return "";
  const d = fromKey(a.aluno_desde), n = now(), anos = n.getFullYear() - d.getFullYear();
  if(anos < 1 || d.getMonth() !== n.getMonth() || d.getDate() !== n.getDate()) return "";
  return `<section class="aniver"><p class="label">${MES[d.getMonth()]} de ${d.getFullYear()}</p>
    <p class="title">Hoje faz ${plural(anos, "ano", "anos")} que você chegou ao Alma.</p>
    <p class="sub">Obrigado por fazer parte do atelier.</p></section>`;
}
/* tempo de atelier: percurso, não quantidade */
function tempoAtelier(a){
  if(!a.aluno_desde) return "";
  const d = fromKey(a.aluno_desde), n = now();
  let m = (n.getFullYear() - d.getFullYear()) * 12 + n.getMonth() - d.getMonth();
  if(n.getDate() < d.getDate()) m--;
  if(m < 1) return "Primeiras semanas de atelier";
  const anos = Math.floor(m / 12), meses = m % 12;
  if(!anos) return `${plural(meses, "mês", "meses")} de atelier`;
  return `${plural(anos, "ano", "anos")}${meses ? ` e ${plural(meses, "mês", "meses")}` : ""} de atelier`;
}
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
    ${desde ? `<p class="tempo">${tempoAtelier(a)}</p>` : ""}
  </header>
  <div class="ritmo">
    <p class="label">Frequência</p>
    <div class="ritmo-row"><span class="ritmo-n tnum">${sem}</span><span class="ritmo-t">${sem === 1 ? "semana" : "semanas"}<br>mantendo o ritmo</span></div>
  </div>
  ${blocoDiario()}
  <div class="tiles">
    ${repoLivre() ? `<button class="tile" data-go="agenda"><div class="tl"><h2 class="tt">Reposições</h2></div><div class="tv">∞</div><p class="ts">Sem limite</p></button>` : livre() ? `<button class="tile" data-go="agenda"><div class="tl"><h2 class="tt">Seu plano</h2></div><div class="tv">Livre</div><p class="ts">Sem limite de aulas</p></button>` : `<button class="tile" data-go="agenda">
      <div class="tl"><h2 class="tt">Reposições</h2></div>
      <div class="tv tnum">${cr.length}<small> de ${MAX_CRED}</small></div>
    </button>`}
    <section class="tile">
      <div class="tl"><h2 class="tt">Seus dias</h2>${turmas[0] && turmas.every(t => t.inicio === turmas[0].inicio && t.fim === turmas[0].fim) ? `<span class="chip">${hm(turmas[0].inicio)}–${hm(turmas[0].fim)}</span>` : ""}</div>
      <div class="tv${turmas.length > 2 ? " tv-s" : ""}">${livre() && !turmas.length ? "Avulsos" : turmas.length ? turmas.slice().sort((x,y) => ((x.dia_semana+6)%7) - ((y.dia_semana+6)%7) || String(x.inicio).localeCompare(String(y.inicio))).map(t => cap1(WDS[t.dia_semana])).join(", ") : "—"}</div>
    </section>
  </div>
  ${blocoPedido()}
  <div class="list ajustes">
    ${!livre() && !(S.pedido && S.pedido.status === "pendente") ? `<button class="li" id="pedMudar"><span class="ind n"></span>Mudar frequência ou dias</button>` : ""}
    <div class="li"><span class="ind n"></span>Mensalidade<span class="end">Em breve</span></div>
    ${linhaPush()}
    ${linhaTema()}
    <button class="li" id="trocarSenha"><span class="ind n"></span>Trocar senha de acesso</button>
    <button class="li sairli" id="sair"><span class="ind n"></span>Sair da conta</button>
  </div>`;
}
function blocoPedido(){
  const p = S.pedido, n = now();
  const recente = p && p.decidido_em && (n - new Date(p.decidido_em)) < 14 * 864e5;
  if(p && p.status === "pendente") return `<section class="pedido"><p class="label">Pedido de mudança</p>
    <p class="title">${p.frequencia_nova}x por semana, aguardando aprovação do atelier</p>
    <p class="sub">Enviado em ${dm(new Date(p.criado_em))}. Seus dias atuais continuam valendo até a aprovação.</p>
    <div class="pedido-acoes"><button class="textbtn" id="pedMudar">Alterar pedido</button><button class="textbtn" id="pedCancelar">Cancelar pedido</button></div></section>`;
  const aviso = recente && p.status === "aprovado" ? `<p class="sub pedido-aviso">Sua mudança para ${p.frequencia_nova}x por semana foi aprovada.</p>`
    : recente && p.status === "recusado" ? `<p class="sub pedido-aviso">Seu pedido de mudança não foi aprovado.${p.resposta_equipe ? ` ${esc(p.resposta_equipe)}` : ""}</p>` : "";
  return aviso;
}
async function sheetMudanca(){
  if(S.aluno.vinculo !== "aluno") return toast("Sua matrícula está pausada. Fale com o atelier.");
  sheet(`<p class="label">Seus dias</p><h3 class="h5">Mudar frequência ou dias</h3><p class="sub">Carregando horários…</p>`);
  const { data, error } = await sb.rpc("horarios_para_escolher");
  if(error) return sheet(`<h3 class="h5">Mudar frequência ou dias</h3><p class="sub">${esc(errMsg(error))}</p><div class="btns"><button class="btn ghost" data-close>Fechar</button></div>`);
  const hs = data || [], max = Math.min(3, Math.max(1, hs.length));
  const pend = S.pedido && S.pedido.status === "pendente" ? S.pedido : null;
  const M = { freq: pend ? pend.frequencia_nova : (S.aluno.frequencia_semanal || hs.filter(h => h.meu).length || 1),
              dias: pend ? [...pend.horarios_novos] : hs.filter(h => h.meu).map(h => h.id), obs: pend ? (pend.observacao_aluno || "") : "" };
  const draw = () => {
    const falta = M.freq - M.dias.length;
    sheet(`<p class="label">Seus dias</p><h3 class="h5">Mudar frequência ou dias</h3>
      <p class="sub">O pedido vai para o atelier. Depois de aprovado, os novos dias passam a valer na sua agenda.</p>
      <p class="label" style="margin-top:var(--s5)">Vezes por semana</p>
      <div class="chips">${Array.from({ length: max }, (_, i) => i + 1).map(n => `<button type="button" data-mfreq="${n}" aria-pressed="${M.freq === n}">${n}x</button>`).join("")}</div>
      <p class="label" style="margin-top:var(--s5)">${M.freq === 1 ? "Qual dia" : "Quais dias"}${falta > 0 ? `, escolha mais ${falta}` : ""}</p>
      <div class="opts">${hs.map(h => { const on = M.dias.includes(h.id), lot = !h.meu && h.ocupados >= h.capacidade, cheio = !on && M.dias.length >= M.freq;
        return `<button type="button" class="opt" data-mdia="${h.id}" aria-pressed="${on}" ${lot || cheio ? "disabled" : ""}><span>${cap1(WD[h.dia_semana])}</span><span class="sub">${hm(h.inicio)} às ${hm(h.fim)}${h.meu ? ", seu dia hoje" : lot ? ", lotado" : ""}</span></button>`; }).join("")}</div>
      <label class="field" style="margin-top:var(--s4)"><span>Comentário para o atelier (opcional)</span><textarea id="mObs" placeholder="Ex.: mudei de horário no trabalho">${esc(M.obs)}</textarea></label>
      <p class="err" id="mErr" hidden></p>
      <div class="btns"><button class="btn pri" id="mEnviar" ${M.dias.length === M.freq ? "" : "disabled"}>${pend ? "Atualizar pedido" : "Enviar pedido"}</button><button class="btn ghost" data-close>Agora não</button></div>`);
    const keep = () => { const t = $("#mObs"); if(t) M.obs = t.value; };
    $$("[data-mfreq]").forEach(b => b.onclick = () => { keep(); M.freq = +b.dataset.mfreq; M.dias = M.dias.slice(0, M.freq); draw(); });
    $$("[data-mdia]").forEach(b => b.onclick = () => { keep(); const id = b.dataset.mdia; M.dias = M.dias.includes(id) ? M.dias.filter(x => x !== id) : [...M.dias, id]; draw(); });
    $("#mEnviar").onclick = async ev => {
      keep(); const btn = ev.currentTarget; busy(btn, true);
      const { error } = await sb.rpc("pedir_mudanca", { p_frequencia: M.freq, p_horarios: M.dias, p_obs: M.obs || null });
      if(error){ busy(btn, false); const e = $("#mErr"); e.textContent = errMsg(error); e.hidden = false; return; }
      closeSheet(); await loadAluno(); render(); toast("Pedido enviado para o atelier");
    };
  };
  draw();
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
    if(S.tab === "painel"){
      const { error: e2 } = await sb.rpc("atualizar_equipe", qual === "capa" ? { p_capa: url } : { p_avatar: url });
      if(e2) throw e2;
      S.painel = { ...(S.painel || {}), [qual === "capa" ? "capa_url" : "avatar_url"]: url };
    } else {
      const { error: e2 } = await sb.rpc("atualizar_fotos", qual === "capa" ? { p_avatar: null, p_capa: url } : { p_avatar: url, p_capa: null });
      if(e2) throw e2;
      S.aluno[qual === "capa" ? "capa_url" : "avatar_url"] = url;
    }
    render(); toast(qual === "capa" ? "Capa atualizada" : "Foto atualizada");
  }catch(ex){ toast("Não foi possível enviar a foto."); }
}

/* ---------- Equipe ---------- */
async function eqLoad(){
  const E = S.eq;
  sb.rpc("equipe_pedidos").then(({ data }) => { const n = (data || []).length, mudou = n !== (E.pedidos || []).length; E.pedidos = data || []; if(mudou && isEqTab()) render(); });
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
  if(isEqTab()) render();
}
function viewEquipe(){
  const E = S.eq;
  const seg = `<div class="seg" role="group" aria-label="Seção">${[["dia","Calendário"],["pessoas","Alunos"],["turmas","Horários"],["eventos","Eventos"]].map(([k,l]) =>
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
      <div class="hint"><span>Toque no dia para ver quem estará no atelier.</span></div>`;
  } else if(E.sec === "pessoas"){
    const f = ["todos","alunos","suspensos","ex"].includes(E.filtro) ? E.filtro : "alunos", q = (E.busca || "").toLowerCase();
    const grupos = { todos: p => ["aluno","pausado","ex_aluno"].includes(p.vinculo), alunos: p => p.vinculo === "aluno" && !p.fantasma,
      suspensos: p => p.vinculo === "pausado", ex: p => p.vinculo === "ex_aluno" };
    const lista = E.alunos.filter(grupos[f]).filter(p => !q || [p.nome, p.email, p.whatsapp].some(x => String(x || "").toLowerCase().includes(q)));
    const n = k => E.alunos.filter(grupos[k]).length;
    body = `<div class="chips">${[["todos","Todos"],["alunos","Alunos"],["suspensos","Suspensos"],["ex","Ex-alunos"]].map(([k,l]) =>
        `<button data-pfiltro="${k}" aria-pressed="${f === k}">${l} <span class="tnum">${n(k)}</span></button>`).join("")}</div>
      <div class="daybar"><label class="field" style="flex:1;margin-right:var(--s3)"><input id="pBusca" type="search" placeholder="Buscar nome, e-mail ou WhatsApp" value="${esc(E.busca || "")}"></label>
        <button class="addbtn" data-pessoa="novo">Novo aluno</button></div>
      ${(() => { const c = {}; lista.forEach(p => { const t = (statusApp(p).match(/>([^<]+)</) || [])[1]; if(t) c[t] = (c[t] || 0) + 1; });
        const ord = ["Usa o app","Falta cadastro","Não entrou","Sem app","Sem acesso"].filter(k => c[k]);
        return ord.length ? `<p class="sub" style="margin-top:var(--s3)">${ord.map(k => `${c[k]} ${k.toLowerCase()}`).join(", ")}</p>` : ""; })()}
      ${f === "alunos" ? `<button class="textbtn" id="addEmails">Adicionar alunos por e-mail</button>` : ""}
      <div class="cards">${lista.length ? lista.map(p => {
        const aluno = ["aluno","pausado"].includes(p.vinculo);
        const tags = [p.fantasma ? "Fantasma" : VINC[p.vinculo || ""], p.comprador_loja ? "Loja" : ""].filter(Boolean);
        const det = aluno
          ? [((E.mat || {})[p.id] || []).map(id => { const t = (E.turmas || []).find(x => x.id === id); return t ? cap1(WDS[t.dia_semana]) : ""; }).join(", ") || (p.plano === "livre" ? "Plano livre" : "Sem dia fixo"), p.plano === "livre" ? "marca as aulas que quiser" : p.reposicao_livre ? "reposições sem limite" : `${(E.cred || {})[p.id] || 0} reposições`]
          : [p.origem ? `via ${p.origem}` : "", p.interesses && p.interesses.length ? p.interesses.join(", ") : "", p.vinculo === "ex_aluno" && p.saida_em ? `saiu em ${dm(fromKey(p.saida_em))}/${String(fromKey(p.saida_em).getFullYear()).slice(2)}` : ""];
        return `<button class="card" data-pessoa="${p.id}" style="text-align:left">
          <div class="row"><span class="title">${esc(p.nome || p.email || p.whatsapp)}</span>${statusApp(p)}</div>
          <p class="sub">${esc([tags.join(", "), ...det].filter(Boolean).join(", "))}</p></button>`; }).join("") : `<p class="empty">Ninguém nesta lista${q ? " com essa busca" : ""}.</p>`}</div>`;
  } else if(E.sec === "turmas"){
    const ate = dkey(addDays(new Date(), 56));
    body = `<div class="card" style="margin-top:var(--s5)"><p class="title">Gerar aulas</p><p class="sub">Cria as aulas dos horários ativos até a data e coloca cada aluno nos seus dias fixos. Pode repetir sem duplicar.</p>
        <div class="row2"><label class="field"><span>Até</span><input type="date" id="gerarAte" value="${ate}"></label><div style="display:flex;align-items:flex-end"><button class="btn pri" id="gerarBtn">Gerar</button></div></div></div>
      <div class="daybar"><p class="sub">${E.turmas.length ? plural(E.turmas.length,"horário de atelier","horários de atelier") : "Cadastre os dias e horários em que o atelier abre."}</p><button class="addbtn" data-turma="novo">Novo horário</button></div>
      <div class="cards">${E.turmas.map(t => `<button class="card" data-turma="${t.id}" style="text-align:left"><div class="row"><span class="title">${esc(horarioNome(t))}</span>${t.ativa ? "" : `<span class="pill">pausado</span>`}</div>
        <p class="sub">${t.capacidade} vagas</p></button>`).join("")}</div>`;
  } else {
    body = `<div class="daybar"><p class="sub">${plural(S.eventos.length,"evento","eventos")}</p><button class="addbtn" data-editev="novo">Novo evento</button></div>
      <div class="evcards">${S.eventos.map(e => cardEventoHTML(e, true)).join("")}</div>`;
  }
  const np = (E.pedidos || []).length;
  const banner = np ? `<button class="pedidos-banner" id="verPedidos"><span class="ind"></span><span>${np === 1 ? "1 pedido de mudança de dias" : `${np} pedidos de mudança de dias`}</span><span class="end">Ver</span></button>` : "";
  if(adminOnly()){
    const tit = { dia: "Calendário", pessoas: "Alunos", turmas: "Horários", eventos: "Eventos" }[E.sec] || "Equipe";
    return `<h1 class="h4">${tit}</h1>${banner}${body}`;
  }
  return `<h1 class="h4">Equipe</h1>${banner}${seg}${body}`;
}
/* situação no app, no lugar do status de pagamento (que ainda não existe) */
function statusApp(p){
  if(p.fantasma) return "";
  const [cls, txt] = !p.email ? ["mute", "Sem app"]
    : !p.acesso_app ? ["mute", "Sem acesso"]
    : !p.auth_user_id ? ["wait", "Não entrou"]
    : !p.cadastro_completo_em && p.vinculo === "aluno" ? ["wait", "Falta cadastro"]
    : ["ok", "Usa o app"];
  return `<span class="pill ${cls}">${txt}</span>`;
}
const VINC = { aluno: "Aluno", pausado: "Aluno suspenso", ex_aluno: "Ex-aluno", interessado: "Interessado", "": "" };
const INTERESSES = ["Desenho","Pintura","Aquarela","Escultura","Cerâmica","Fotografia","Arte digital","Jovens Artistas"];
async function sheetDiaEq(k){
  const d = fromKey(k);
  sheet(`<p class="label">Atelier</p><h3 class="h5">${cap1(WD[d.getDay()])}, ${dm(d)}</h3><p class="sub">Carregando…</p>`);
  const { data, error } = await sb.rpc("equipe_dia", { p_dia: k });
  if(error) return sheet(`<h3 class="h5">${cap1(WD[d.getDay()])}, ${dm(d)}</h3><p class="sub">${esc(errMsg(error))}</p><div class="btns"><button class="btn ghost" data-close>Fechar</button></div>`);
  const ids = [...new Set((data || []).map(r => r.aula_id))];
  const { data: esp } = ids.length ? await sb.from("lista_espera").select("aula_id, criado_em, pessoas(nome, fantasma)").in("aula_id", ids).order("criado_em") : { data: [] };
  const fila = {}; (esp || []).filter(e => e.pessoas && !e.pessoas.fantasma).forEach(e => (fila[e.aula_id] ||= []).push(e.pessoas.nome || "Aluno"));
  const aulas = {}; (data || []).forEach(r => { (aulas[r.aula_id] ||= { ...r, ini: new Date(r.inicia_em), fim: new Date(r.termina_em), pessoas: [] }); if(r.reserva_id) aulas[r.aula_id].pessoas.push(r); });
  const lista = Object.values(aulas);
  const motivo = { desmarcada: "desmarcou", ausencia_tardia: "avisou em cima da hora", aula_cancelada: "aula cancelada", falta: "faltou" };
  sheet(`<p class="label">Atelier</p><h3 class="h5">${cap1(WD[d.getDay()])}, ${dm(d)}</h3>
    ${lista.length ? lista.map(a => {
      const vem = a.pessoas.filter(p => ["confirmada","presente"].includes(p.status));
      const fora = a.pessoas.filter(p => !["confirmada","presente"].includes(p.status));
      return `<div class="eqaula"><div class="row"><p class="title">${hh(a.ini)} às ${hh(a.fim)}</p><span class="sub tnum">${a.cancelada ? "cancelada" : `${vem.length} de ${a.capacidade} vagas`}</span></div>
        ${vem.length ? vem.map(p => `<div class="prow"><span class="nm">${esc(p.aluno_nome)}</span>${p.tipo === "reposicao" ? `<span class="meta">reposição</span>` : ""}</div>`).join("") : `<p class="sub">Ninguém marcado.</p>`}
        ${fora.length ? `<p class="sub" style="margin-top:var(--s2)">Não vêm: ${fora.map(p => `${esc(firstName(p.aluno_nome))} (${motivo[p.status] || p.status})`).join(", ")}</p>` : ""}
        ${(fila[a.aula_id] || []).length ? `<p class="sub" style="margin-top:var(--s2)">Lista de espera: ${fila[a.aula_id].map(n => esc(firstName(n))).join(", ")}</p>` : ""}</div>`; }).join("") : `<p class="sub">Atelier fechado neste dia.</p>`}
    <div class="btns"><button class="btn ghost" data-close>Fechar</button></div>`);
}
function sheetPedidosEq(){
  const L = S.eq.pedidos || [];
  if(!L.length) return closeSheet();
  sheet(`<p class="label">Pedidos de mudança</p><h3 class="h5">${L.length === 1 ? "1 pedido aguardando" : `${L.length} pedidos aguardando`}</h3>
    ${L.map(p => `<div class="eqaula">
      <p class="title">${esc(p.aluno_nome)}</p>
      <p class="sub">Hoje: ${p.frequencia_atual ? `${p.frequencia_atual}x por semana, ` : ""}${esc(p.dias_atuais || "sem dia fixo")}</p>
      <p class="sub" style="color:var(--fg)">Quer: ${p.frequencia_nova}x por semana, ${esc(p.dias_novos || "")}</p>
      ${p.observacao_aluno ? `<p class="sub">“${esc(p.observacao_aluno)}”</p>` : ""}
      <p class="sub">Pedido em ${dm(new Date(p.criado_em))}</p>
      <div class="pedido-acoes"><button class="btn pri" data-aprovar="${p.id}" style="width:auto;padding:0 var(--s5)">Aprovar</button><button class="textbtn" data-recusar="${p.id}">Recusar</button></div>
    </div>`).join("")}
    <div class="btns"><button class="btn ghost" data-close>Fechar</button></div>`);
}
function sheetRecusarEq(id){
  const p = (S.eq.pedidos || []).find(x => x.id === id); if(!p) return;
  sheet(`<p class="label">Recusar pedido</p><h3 class="h5">${esc(p.aluno_nome)}</h3>
    <label class="field" style="margin-top:var(--s4)"><span>Mensagem para o aluno (opcional)</span><textarea id="rMsg" placeholder="Ex.: sábado está lotado; podemos ver quarta?"></textarea></label>
    <div class="btns"><button class="btn pri" data-recusarok="${p.id}">Recusar pedido</button><button class="btn ghost" id="rVoltar">Voltar</button></div>`);
  $("#rVoltar").onclick = sheetPedidosEq;
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
  const E = S.eq, p = id === "novo" ? { vinculo: E.filtro === "suspensos" ? "pausado" : E.filtro === "ex" ? "ex_aluno" : "aluno", pagamento_status: "em_dia", aulas_anteriores: 0, interesses: [], comprador_loja: false, acesso_app: true } : E.alunos.find(x => x.id === id);
  const minhas = E.mat[p.id] || [];
  const ehAluno = v => ["aluno","pausado"].includes(v);
  sheet(`<p class="label">${id === "novo" ? "Nova pessoa" : VINC[p.vinculo || ""] || "Contato"}</p><h3 class="h5">${esc(p.nome || "Cadastro")}</h3>
    <form class="form" id="pessoaForm">
      <label class="field"><span>Nome completo</span><input id="f_nome" value="${esc(p.nome)}" placeholder="${ehAluno(p.vinculo) ? "O aluno pode completar no primeiro acesso" : ""}"></label>
      <label class="field"><span>E-mail${ehAluno(p.vinculo) ? " (usado para entrar no app)" : ""}</span><input id="f_email" type="email" value="${esc(p.email)}"></label>
      <label class="field"><span>WhatsApp</span><input id="f_whats" inputmode="tel" value="${esc(p.whatsapp)}" placeholder="+55 11 9…"></label>
      <label class="field"><span>Vínculo com o atelier</span><select id="f_vinc">
        ${[["aluno","Aluno"],["pausado","Aluno suspenso (acesso reduzido)"],["interessado","Interessado"],["ex_aluno","Ex-aluno"],["","Sem vínculo (só loja ou contato)"]].map(([k,l]) => `<option value="${k}" ${(p.vinculo || "") === k ? "selected" : ""}>${l}</option>`).join("")}
      </select></label>
      <label class="check"><input type="checkbox" id="f_loja" ${p.comprador_loja ? "checked" : ""}>Compra na loja (Alma Materiais Artísticos)</label>

      <div id="blocoAluno" ${ehAluno(p.vinculo) ? "" : "hidden"} class="form" style="margin-top:0">
        <label class="check"><input type="checkbox" id="f_app" ${p.acesso_app ? "checked" : ""}>Acesso ao app</label>
        ${p.vinculo === "pausado" ? `<p class="sub" style="margin-top:calc(-1 * var(--s2))">Aluno suspenso entra com acesso reduzido: vê a agenda (só quantos alunos vêm) e os eventos, sem marcar aula nem se inscrever.</p>` : ""}
        <p class="sub" style="margin-top:calc(-1 * var(--s2))">${p.acesso_app ? (p.auth_user_id ? (p.cadastro_completo_em ? "Já usa o app." : "Já entrou; falta completar nome e dias.") : "Entra direto com o e-mail acima. No primeiro acesso completa nome, frequência e dias.") : "Bloqueado: a pessoa não consegue entrar, nem receber o código."}</p>
        <div class="row2"><label class="field"><span>Aluno desde</span><input id="f_desde" type="date" value="${esc(p.aluno_desde)}"></label>
          <label class="field"><span>Aulas antes do app</span><input id="f_ant" type="number" min="0" value="${esc(p.aulas_anteriores)}"></label></div>
        <p class="label" style="margin-top:var(--s2)">Mensalidade</p>
        <div class="row2"><label class="field"><span>Situação</span><select id="f_pag">${Object.entries(PAG).map(([k,l]) => `<option value="${k}" ${p.pagamento_status === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <label class="field"><span>Forma</span><input id="f_metodo" value="${esc(p.pagamento_metodo)}" placeholder="Pix"></label></div>
        <div class="row2"><label class="field"><span>Último pagamento</span><input id="f_ult" type="date" value="${esc(p.pagamento_ultimo)}"></label>
          <label class="field"><span>Próximo vencimento</span><input id="f_venc" type="date" value="${esc(p.pagamento_proximo_vencimento)}"></label></div>
        <label class="check"><input type="checkbox" id="f_repolivre" ${p.reposicao_livre ? "checked" : ""}>Reposições sem limite (mantém os dias fixos)</label>
        <label class="check"><input type="checkbox" id="f_livre" ${p.plano === "livre" ? "checked" : ""}>Plano livre (sem dias fixos, marca as aulas que quiser)</label>
        <p class="label" style="margin-top:var(--s2)">Dias fixos no atelier${p.frequencia_semanal ? `, ${p.frequencia_semanal}x por semana` : ""}</p>
        ${E.turmas.map(t => `<label class="check"><input type="checkbox" data-mat="${t.id}" ${minhas.includes(t.id) ? "checked" : ""}>${esc(horarioNome(t))}</label>`).join("") || `<p class="sub">Cadastre os horários do atelier primeiro (Equipe → Horários).</p>`}
      </div>

      <div id="blocoSaida" ${p.vinculo === "ex_aluno" ? "" : "hidden"} class="form" style="margin-top:0">
        <label class="field"><span>Motivo da saída</span><input id="f_motivo" value="${esc(p.motivo_saida)}" placeholder="Mudou de cidade, horário…"></label>
        <label class="check"><input type="checkbox" id="f_app_ex" ${p.vinculo === "ex_aluno" && p.acesso_app ? "checked" : ""}>Acesso reduzido ao app</label>
        <p class="sub" style="margin-top:calc(-1 * var(--s2))">Vê a agenda (só quantos alunos vêm) e os eventos, sem marcar aula nem se inscrever.</p>
      </div>

      <p class="label" style="margin-top:var(--s2)">Relacionamento</p>
      <label class="field"><span>Como chegou ao Alma</span><input id="f_origem" list="origens" value="${esc(p.origem)}" placeholder="Instagram"></label>
      <datalist id="origens"><option>Instagram</option><option>Indicação</option><option>Loja</option><option>Evento</option><option>Site</option><option>Passou na porta</option></datalist>
      <div class="chips wrap">${INTERESSES.map(i => `<label class="chipcheck"><input type="checkbox" data-int="${esc(i)}" ${(p.interesses || []).includes(i) ? "checked" : ""}><span>${esc(i)}</span></label>`).join("")}</div>
      <label class="check"><input type="checkbox" id="f_lgpd" ${p.aceita_comunicacao ? "checked" : ""}>Autorizou receber novidades do Alma</label>
      <label class="field"><span>Observações</span><textarea id="f_obs">${esc(p.observacoes)}</textarea></label>

      <p class="err" id="fErr" hidden></p>
      <div class="btns"><button class="btn pri" type="submit">Salvar</button>
        ${id !== "novo" && ehAluno(p.vinculo) ? `<button class="btn ghost" type="button" data-diarioeq="${p.id}">Ver diário</button>` : ""}
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
    row.acesso_app = aluno ? $("#f_app").checked : vinc === "ex_aluno" && !!($("#f_app_ex") || {}).checked;
    if(aluno){ row.plano = $("#f_livre").checked ? "livre" : "fixo"; row.reposicao_livre = $("#f_repolivre").checked; }
    if(aluno) Object.assign(row, { aluno_desde: v("#f_desde"), aulas_anteriores: +($("#f_ant").value || 0), pagamento_status: $("#f_pag").value,
      pagamento_metodo: v("#f_metodo"), pagamento_ultimo: v("#f_ult"), pagamento_proximo_vencimento: v("#f_venc") });
    if(vinc === "ex_aluno") row.motivo_saida = v("#f_motivo");
    try{
      if(!row.nome && !(aluno && row.email)) throw new Error("Preencha o nome.");
      if(!row.email && !row.whatsapp && !(["aluno","pausado"].includes(row.vinculo) && !row.acesso_app)) throw new Error("Informe e-mail ou WhatsApp.");
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
      closeSheet(); toast(novos.length ? `${plural(novos.length, "aluno adicionado", "alunos adicionados")}${lista.length > novos.length ? `. ${lista.length - novos.length} já estava${lista.length - novos.length > 1 ? "m" : ""} cadastrado${lista.length - novos.length > 1 ? "s" : ""}` : ""}` : "Esses e-mails já estavam cadastrados"); eqLoad();
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
      <div class="row2"><label class="field"><span>Vagas (vazio = sem limite)</span><input id="e_vagas" type="number" min="1" value="${esc(e.vagas)}"></label><label class="field"><span>Valor</span><input id="e_preco" value="${esc(e.preco_texto)}" placeholder="R$ 90 / alunos R$ 70"></label></div>
      <label class="check"><input type="checkbox" id="e_pub" ${e.publicado ? "checked" : ""}>Visível para os alunos</label>
      ${e.foto_url ? `<label class="check"><input type="checkbox" id="e_semfoto">Tirar a foto do topo</label>` : ""}
      <p class="err" id="fErr" hidden></p>
      <div class="btns"><button class="btn pri" type="submit">Salvar</button>${id !== "novo" ? `<button class="btn ghost dperigo" type="button" data-delevask="${id}">Excluir evento</button>` : ""}<button class="btn ghost" type="button" data-close>Cancelar</button></div>
    </form>`);
  $("#evForm").onsubmit = async ev => {
    ev.preventDefault(); const btn = $("#evForm button[type=submit]"); busy(btn, true);
    const row = { tipo: $("#e_tipo").value.trim(), titulo: $("#e_tit").value.trim(), descricao: $("#e_desc").value.trim() || null,
      inicia_em: new Date($("#e_ini").value).toISOString(), termina_em: new Date($("#e_fim").value).toISOString(),
      local: $("#e_local").value.trim() || null, vagas: $("#e_vagas").value ? +$("#e_vagas").value : null, preco_texto: $("#e_preco").value.trim() || null, publicado: $("#e_pub").checked };
    if($("#e_semfoto") && $("#e_semfoto").checked) row.foto_url = null;
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
/* ---------- Lembretes no celular (Web Push) ---------- */
const P = { estado: "?", salvo: false };
const pushSuportado = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const ehIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalado = () => (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
const pushDesligado = v => { try{ if(v === undefined) return localStorage.getItem("alma-push-off") === "1"; v ? localStorage.setItem("alma-push-off", "1") : localStorage.removeItem("alma-push-off"); }catch(_){ } return !!v; };
const pushDispensado = v => { try{ if(v === undefined) return localStorage.getItem("alma-push-depois") === "1"; localStorage.setItem("alma-push-depois", "1"); }catch(_){ } return !!v; };
let swReg = null;
async function registrarSW(){
  if(!("serviceWorker" in navigator)) return null;
  if(swReg) return swReg;
  try{ swReg = await navigator.serviceWorker.register("sw.js"); }catch(_){ swReg = null; }
  return swReg;
}
function b64u(s){
  const pad = "=".repeat((4 - s.length % 4) % 4), b = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
async function salvarSub(sub){
  const j = sub.toJSON();
  const { error } = await sb.rpc("salvar_push", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_aparelho: navigator.userAgent });
  if(error) throw error;
  P.salvo = true;
}
async function estadoPush(){
  if(!pushSuportado() || !CFG.vapid){ P.estado = ehIOS() && !instalado() ? "instalar" : "indisponivel"; return P.estado; }
  if(Notification.permission === "denied"){ P.estado = "bloqueado"; return P.estado; }
  const reg = await registrarSW();
  if(!reg){ P.estado = "indisponivel"; return P.estado; }
  const sub = await reg.pushManager.getSubscription().catch(() => null);
  if(sub && Notification.permission === "granted"){
    P.estado = "ativo";
    if(!P.salvo && !S.comoAluno) salvarSub(sub).catch(() => {});   // mantém o aparelho ligado a quem está logado
  } else P.estado = "desligado";
  return P.estado;
}
async function ativarPush(btn){
  if(S.comoAluno) return toast("Saia do modo aluno para ativar os lembretes neste aparelho");
  if(P.estado === "instalar") return sheetInstalarApp();
  if(P.estado === "bloqueado") return sheet(`<p class="label">Lembretes no celular</p><h3 class="h5">Notificações bloqueadas</h3>
    <p class="sub">As notificações do Alma estão desligadas neste aparelho. Ative nos ajustes do celular (Ajustes → Notificações → Alma) e volte aqui.</p>
    <div class="btns"><button class="btn ghost" data-close>Fechar</button></div>`);
  if(P.estado === "indisponivel") return toast("Este navegador não recebe lembretes. Tente pelo app instalado na tela de início.");
  pushDesligado(false);
  busy(btn, true);
  let perm;
  try{ perm = await Notification.requestPermission(); }catch(_){ perm = Notification.permission; }
  try{
    if(perm !== "granted"){ busy(btn, false); await estadoPush(); render(); return toast("Sem permissão, os lembretes ficam desligados"); }
    const reg = await registrarSW(); await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(CFG.vapid) });
    await salvarSub(sub);
    P.estado = "ativo"; closeSheet(); render(); toast("Lembretes ativados");
  }catch(ex){ busy(btn, false); console.error(ex); toast("Não foi possível ativar os lembretes neste aparelho."); }
}
async function desativarPush(btn){
  busy(btn, true);
  try{
    const reg = await registrarSW(), sub = reg && await reg.pushManager.getSubscription();
    if(sub){ await sb.rpc("remover_push", { p_endpoint: sub.endpoint }); await sub.unsubscribe(); }
  }catch(_){}
  pushDesligado(true);
  P.estado = "desligado"; P.salvo = false; closeSheet(); render(); toast("Lembretes desligados neste aparelho");
}
const PUSH_O_QUE = () => S.equipe && !S.aluno
  ? ["Quando chega um pedido de mudança de frequência ou dias"]
  : ["Na véspera de cada aula, às 19h", "Se o atelier cancelar uma aula sua", "Quando abrir vaga numa aula da sua lista de espera", "Quando seu pedido de mudança for respondido"];
function sheetPush(){
  if(P.estado !== "ativo") return ativarPush($("#pushBtn"));
  sheet(`<p class="label">Lembretes no celular</p><h3 class="h5">Lembretes ativados</h3>
    <p class="sub">Neste aparelho você recebe um aviso:</p>
    <ul class="pushlista">${PUSH_O_QUE().map(t => `<li>${esc(t)}</li>`).join("")}</ul>
    <div class="btns"><button class="btn ghost" data-close>Fechar</button><button class="btn ghost dperigo" id="pushOff">Desligar lembretes</button></div>`);
  $("#pushOff").onclick = ev => desativarPush(ev.currentTarget);
}
function sheetInstalarApp(){
  sheet(`<p class="label">Lembretes no celular</p><h3 class="h5">Instale o app primeiro</h3>
    <p class="sub">No iPhone, os lembretes só chegam pelo app instalado na tela de início. Leva meio minuto:</p>
    <ol class="pushlista passos"><li>No Safari, toque em <b>Compartilhar</b> (o quadrado com a seta para cima).</li>
      <li>Escolha <b>Adicionar à Tela de Início</b> e confirme.</li>
      <li>Abra o Alma pelo ícone novo e toque em <b>Ativar lembretes</b>.</li></ol>
    <div class="btns"><button class="btn ghost" data-close>Entendi</button></div>`);
}
function linhaPush(){
  if(S.comoAluno || ["?","indisponivel"].includes(P.estado)) return "";
  const end = { ativo: "Ativados", desligado: "Ativar", instalar: "Como ativar", bloqueado: "Bloqueados" }[P.estado] || "";
  return `<button class="li" id="pushBtn"><span class="ind ${P.estado === "ativo" ? "" : "n"}"></span>Lembretes no celular<span class="end">${end}</span></button>`;
}
/* lembretes ligados por padrão: assina sozinho; se o celular ainda não deu permissão,
   pede no primeiro toque (o iPhone só mostra o pedido depois de um toque). Quem desligar fica desligado. */
async function assinarSilencioso(){
  try{
    const reg = await registrarSW(); await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(CFG.vapid) });
    await salvarSub(sub); P.estado = "ativo";
  }catch(_){}
}
function pushPadrao(){
  if(S.comoAluno || pushDesligado() || P.estado !== "desligado" || !pushSuportado()) return;
  if(Notification.permission === "granted"){ assinarSilencioso().then(() => { if(["voce","painel"].includes(S.tab)) render(); }); return; }
  if(Notification.permission !== "default" || pushPadrao.armado) return;
  pushPadrao.armado = true;
  const pedir = () => {
    if($("#tour")) return;   /* durante as boas-vindas, o pedido vem no último passo */
    document.removeEventListener("click", pedir, true);
    if(S.comoAluno || pushDesligado() || Notification.permission !== "default") return;
    let pedido; try{ pedido = Notification.requestPermission(); }catch(_){ return; }
    Promise.resolve(pedido).then(perm => { if(perm === "granted") assinarSilencioso().then(() => { if(["voce","painel"].includes(S.tab)) render(); }); });
  };
  document.addEventListener("click", pedir, true);
}
function cartaoPush(){
  if(S.comoAluno || P.estado !== "instalar" || pushDispensado()) return "";
  return `<section class="pushcard"><p class="title">Receba lembretes das aulas</p>
    <p class="sub">Um aviso na véspera, se a aula for cancelada e quando abrir vaga na sua lista de espera.</p>
    <div class="pushcard-acoes"><button class="btn pri" id="pushAtivar">${P.estado === "instalar" ? "Como ativar" : "Ativar lembretes"}</button><button class="textbtn" id="pushDepois">Agora não</button></div></section>`;
}
function bindPush(){
  const pb = $("#pushBtn"); if(pb) pb.onclick = () => sheetPush();
  const pa = $("#pushAtivar"); if(pa) pa.onclick = ev => ativarPush(ev.currentTarget);
  const pd = $("#pushDepois"); if(pd) pd.onclick = () => { pushDispensado(true); render(); };
}


/* ---------- Recados (entre alunos e com o professor) ---------- */
const ICO_RECADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 5.5h15v10h-8l-4.5 3.5v-3.5h-2.5z"/><path d="M8.5 10.5h7"/></svg>';
const R = { lista: [], dest: null, ed: null };
const tempoRel = d => {
  const m = Math.round((now() - d) / 6e4);
  if(m < 1) return "agora"; if(m < 60) return `há ${m} min`;
  const h = Math.round(m / 60); if(h < 24) return `há ${h} h`;
  const dd = Math.round(h / 24); return dd === 1 ? "ontem" : `há ${dd} dias`;
};
async function loadRecados(){
  const { data, error } = await sb.rpc("meus_recados");
  if(!error) R.lista = (data || []).map(r => ({ ...r, quando: new Date(r.criado_em) }));
}
const avatarRec = (nome, url, prof) => prof && !url ? `<span class="rec-av prof">${ICO_RECADO}</span>` : url ? `<span class="rec-av"><img src="${esc(url)}" alt=""></span>` : `<span class="rec-av">${esc(initials(String(nome || "").replace(".", "")))}</span>`;
function blocoRecados(){
  const l = R.lista || []; if(!l.length) return "";
  const mostra = l.slice(0, 3);
  return `<div class="recados">${mostra.map(r => `<section class="recado${r.de_equipe ? " prof" : r.lido ? "" : " novo"}">
      <div class="rec-top">${avatarRec(r.de_nome, r.de_avatar, r.de_equipe)}<span class="rec-de"><b>Recado de ${esc(r.de_nome)}</b><span>${tempoRel(r.quando)}</span></span></div>
      <p class="rec-txt">${esc(r.texto)}</p>
      <div class="rec-acoes"><button class="textbtn" data-recresp="${r.id}">Responder</button><button class="textbtn" data-recok="${r.id}">Ok, visto</button></div>
    </section>`).join("")}
    ${l.length > 3 ? `<button class="textbtn rec-mais" id="recTodos">Ver mais ${plural(l.length - 3, "recado", "recados")}</button>` : ""}</div>`;
}
function botaoRecado(){
  if(S.visitante && !S.equipe) return "";
  const n = (R.lista || []).length;
  return `<button class="fab fab-rec" id="recBtn" aria-label="Recados${n ? `, ${n} para ver` : ""}">${ICO_RECADO}${n ? `<span class="rec-badge tnum">${n > 9 ? "9+" : n}</span>` : ""}</button>`;
}
function bindRecados(){
  const b = $("#recBtn"); if(b) b.onclick = () => (R.lista || []).length ? sheetRecados() : novoRecado(null);
  const t = $("#recTodos"); if(t) t.onclick = sheetRecados;
  $$("#view [data-recok]").forEach(x => x.onclick = () => arquivarRecado(x.dataset.recok, x));
  $$("#view [data-recresp]").forEach(x => x.onclick = () => responderRecado(x.dataset.recresp));
  if((R.lista || []).some(r => !r.lido)) { sb.rpc("ler_recados").then(() => (R.lista || []).forEach(r => r.lido = true)); }
}
async function arquivarRecado(id, btn){
  if(btn) busy(btn, true);
  const { error } = await sb.rpc("arquivar_recado", { p_id: id });
  if(error){ if(btn) busy(btn, false); return toast(errMsg(error)); }
  R.lista = R.lista.filter(r => r.id !== id);
  if($("#sheet.show") && $("#recLista")) sheetRecados(); else render();
}
function responderRecado(id){
  const r = (R.lista || []).find(x => x.id === id); if(!r) return;
  novoRecado(r.de_equipe ? { id: null, nome: r.de_nome, avatar_url: r.de_avatar, equipe: true } : { id: r.de_id, nome: r.de_nome, avatar_url: r.de_avatar }, r);
}
function sheetRecados(){
  const l = R.lista || [];
  sheet(`<p class="label">Recados</p><h3 class="h5">${l.length ? plural(l.length, "recado para você", "recados para você") : "Nenhum recado"}</h3>
    <div class="rec-lista" id="recLista">${l.map(r => `<div class="rec-item${r.de_equipe ? " prof" : ""}">${avatarRec(r.de_nome, r.de_avatar, r.de_equipe)}<div class="rec-corpo">
      <p class="rec-de"><b>${esc(r.de_nome)}</b><span>${tempoRel(r.quando)}</span></p><p class="rec-txt">${esc(r.texto)}</p>
      <div class="rec-acoes"><button class="textbtn" data-recresp="${r.id}">Responder</button><button class="textbtn" data-recok="${r.id}">Ok, visto</button></div></div></div>`).join("")}</div>
    <div class="btns"><button class="btn pri" id="recNovo">Novo recado</button><button class="btn ghost" data-close>Fechar</button></div>`);
  $("#recNovo").onclick = () => novoRecado(null);
  $$("#recLista [data-recok]").forEach(x => x.onclick = () => arquivarRecado(x.dataset.recok, x));
  $$("#recLista [data-recresp]").forEach(x => x.onclick = () => responderRecado(x.dataset.recresp));
}
/* escolher para quem (ou já vem escolhido ao responder) e escrever */
async function novoRecado(para, resp){
  if(!para){
    sheet(`<p class="label">Novo recado</p><h3 class="h5">Para quem?</h3><p class="sub">Carregando…</p>`);
    if(!R.dest){ const { data, error } = await sb.rpc("recado_destinatarios"); if(error) return sheet(`<h3 class="h5">Novo recado</h3><p class="sub">${esc(errMsg(error))}</p><div class="btns"><button class="btn ghost" data-close>Fechar</button></div>`); R.dest = data || []; }
    const desenha = q => {
      const f = R.dest.filter(d => !q || d.nome.toLowerCase().includes(q.toLowerCase()));
      const item = d => `<button class="rec-pessoa${d.equipe ? " prof" : ""}" data-recpara="${R.dest.indexOf(d)}">${avatarRec(d.nome, d.avatar_url, d.equipe)}<span class="rec-pnome"><span>${esc(d.nome)}</span>${d.equipe ? `<small>Professor</small>` : ""}</span></button>`;
      const prof = f.filter(d => d.equipe), col = f.filter(d => !d.equipe);
      $("#recDest").innerHTML = f.length ? `${prof.map(item).join("")}${col.length ? `${prof.length ? `<p class="label rec-grupo">Colegas</p>` : ""}${col.map(item).join("")}` : ""}` : `<p class="sub">Ninguém com esse nome.</p>`;
      $$("#recDest [data-recpara]").forEach(b => b.onclick = () => novoRecado(R.dest[+b.dataset.recpara]));
    };
    sheet(`<p class="label">Novo recado</p><h3 class="h5">Para quem?</h3>
      ${R.dest.length > 6 ? `<label class="field rec-busca"><span class="sr">Buscar</span><input id="recBusca" type="search" placeholder="Buscar pelo nome" autocomplete="off"></label>` : ""}
      <div class="rec-dest" id="recDest"></div>
      <div class="btns"><button class="btn ghost" data-close>Cancelar</button></div>`);
    desenha("");
    const bi = $("#recBusca"); if(bi) bi.oninput = () => desenha(bi.value);
    return;
  }
  const sugestoes = para.equipe ? ["Vou me atrasar um pouco hoje.", "Não vou conseguir ir hoje.", "Tenho uma dúvida sobre a aula."]
    : S.equipe && !S.aluno ? ["Não esquece de trazer o material.", "Sua obra está pronta para buscar.", "Parabéns pelo trabalho!"]
    : ["Não esquece de levar ", "Você vai na aula de hoje?"];
  sheet(`<p class="label">${resp ? "Responder" : "Novo recado"}</p>
    <div class="rec-para">${avatarRec(para.nome, para.avatar_url, para.equipe)}<span>Para <b>${esc(para.nome)}</b></span>${resp ? "" : `<button class="textbtn" id="recTroca">Trocar</button>`}</div>
    ${resp ? `<p class="rec-cita">“${esc(resp.texto)}”</p>` : ""}
    <div class="chips rec-sug">${sugestoes.map(t => `<button type="button" data-recsug="${esc(t)}">${esc(t.trim())}</button>`).join("")}</div>
    <label class="field rec-campo"><span class="sr">Recado</span><textarea id="recTxt" maxlength="280" placeholder="Escreva o recado"></textarea></label>
    <p class="sub rec-conta" id="recConta">0 de 280</p>
    <p class="err" id="recErr" hidden></p>
    <div class="btns"><button class="btn pri" id="recEnviar" disabled>Enviar recado</button><button class="btn ghost" data-close>Cancelar</button></div>`);
  const tx = $("#recTxt"), env = $("#recEnviar"), conta = () => { $("#recConta").textContent = `${tx.value.length} de 280`; env.disabled = !tx.value.trim(); };
  tx.oninput = conta;
  $$("[data-recsug]").forEach(b => b.onclick = () => { tx.value = b.dataset.recsug; conta(); tx.focus(); tx.setSelectionRange(tx.value.length, tx.value.length); });
  const tr = $("#recTroca"); if(tr) tr.onclick = () => novoRecado(null);
  env.onclick = async () => {
    busy(env, true);
    const { error } = await sb.rpc("enviar_recado", { p_para: para.equipe ? null : para.id, p_texto: tx.value });
    if(error){ busy(env, false); const e = $("#recErr"); e.textContent = errMsg(error); e.hidden = false; return; }
    if(resp) { await sb.rpc("arquivar_recado", { p_id: resp.id }); R.lista = R.lista.filter(r => r.id !== resp.id); }
    closeSheet(); vibrar(); toast(`Recado enviado para ${firstName(para.nome)}`); render();
  };
}

/* ---------- Diário de registros ---------- */
const DTIPO = { anotacao: "Notas", obra: "Processo", aula: "Em aula", referencia: "Referência" };
const DTIPO_PL = { todos: "Todos", anotacao: "Notas", obra: "Processo", aula: "Em aula", referencia: "Referências" };
const MES3 = ["jan.","fev.","mar.","abr.","maio","jun.","jul.","ago.","set.","out.","nov.","dez."];
const ICO_BUSCA = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';
const ICO_MAIS = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const D = { itens: null, urls: {}, filtro: "todos", busca: "", buscando: false, ed: null, eq: null };
const dataLonga = (d, sempreAno) => `${cap1(WD[d.getDay()])}${d.getDay() > 0 && d.getDay() < 6 ? "-feira" : ""}, ${d.getDate()} de ${MES3[d.getMonth()]}${sempreAno || d.getFullYear() !== now().getFullYear() ? ` de ${d.getFullYear()}` : ""}`;
const contaPalavras = t => (String(t || "").trim().match(/\S+/g) || []).length;
const novoId = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

async function assinarFotos(paths){
  const agora = Date.now();
  const falta = [...new Set(paths)].filter(p => p && (!D.urls[p] || D.urls[p].ate < agora + 6e4));
  if(!falta.length) return;
  const guarda = (path, u) => { if(path && u) D.urls[path] = { url: u, ate: Date.now() + 3500e3 }; };
  try{
    const { data } = await sb.storage.from("diario").createSignedUrls(falta, 3600);
    (data || []).forEach(x => guarda(x.path, x.signedUrl || x.signedURL));
  }catch(_){}
  /* o que não veio no lote: tenta um a um e, em último caso, baixa a foto direto */
  for(const p of falta.filter(p => !D.urls[p] || D.urls[p].ate < agora + 6e4)){
    try{
      const { data } = await sb.storage.from("diario").createSignedUrl(p, 3600);
      if(data && data.signedUrl){ guarda(p, data.signedUrl); continue; }
    }catch(_){}
    try{
      const { data } = await sb.storage.from("diario").download(p);
      if(data) D.urls[p] = { url: URL.createObjectURL(data), ate: Date.now() + 864e5 };
    }catch(_){}
  }
}
/* qualquer foto do diário na tela sem endereço ainda é preenchida assim que o endereço chega */
const fotoUrl = p => (D.urls[p] || {}).url || "";
const fotoImg = (p, extra) => { const u = fotoUrl(p); return `<img data-fpath="${esc(p)}"${u ? ` src="${esc(u)}"` : ""} alt="" loading="lazy"${extra || ""}>`; };
let hidratando = false;
async function hidratarFotos(){
  if(hidratando) return; hidratando = true;
  try{
    for(let tentativa = 0; tentativa < 3; tentativa++){
      const imgs = [...document.querySelectorAll("img[data-fpath]")].filter(i => !i.getAttribute("src"));
      if(!imgs.length) break;
      await assinarFotos(imgs.map(i => i.dataset.fpath));
      document.querySelectorAll("img[data-fpath]").forEach(i => { if(!i.getAttribute("src")){ const u = fotoUrl(i.dataset.fpath); if(u) i.src = u; } });
      if(tentativa < 2 && [...document.querySelectorAll("img[data-fpath]")].some(i => !i.getAttribute("src"))) await new Promise(r => setTimeout(r, 1500 * (tentativa + 1)));
    }
  } finally { hidratando = false; }
}
new MutationObserver(() => { if(document.querySelector("img[data-fpath]:not([src])")) hidratarFotos(); }).observe(document.body, { childList: true, subtree: true });
/* link vencido ou falha ao carregar: pede de novo uma vez */
document.addEventListener("error", e => {
  const i = e.target; if(!(i instanceof HTMLImageElement) || !i.dataset.fpath || i.dataset.refeito) return;
  i.dataset.refeito = "1"; delete D.urls[i.dataset.fpath]; i.removeAttribute("src"); hidratarFotos();
}, true);
async function loadDiario(){
  if(!S.aluno) return;
  const { data, error } = await sb.from("diario").select("*").eq("aluno_id", S.aluno.id)
    .order("data", { ascending: false }).order("criado_em", { ascending: false });
  if(error){ if(D.itens === null) D.itens = []; return; }
  D.itens = data || [];
  try{ await assinarFotos(D.itens.flatMap(i => i.fotos || [])); }catch(_){}
}

/* cartão do diário (mesma peça para o aluno e para a equipe) */
function cartaoDiario(i, attr){
  const fotos = i.fotos || [], capa = fotos[0];
  const trecho = String(i.texto || "").replace(/\s+/g, " ").trim();
  const temCorpo = i.titulo || (trecho && !capa) || (trecho && capa);
  return `<button class="dcard${capa ? " foto" : ""}" ${attr}="${i.id}">
    ${capa ? `<span class="dimg">${fotoImg(capa)}${fotos.length > 1 ? `<span class="dmais tnum">+${fotos.length - 1}</span>` : ""}</span>` : ""}
    ${temCorpo ? `<span class="dbody">${i.titulo ? `<span class="dtit">${esc(i.titulo)}</span>` : ""}${trecho ? `<span class="dtxt">${esc(trecho.slice(0, 220))}</span>` : ""}</span>` : ""}
    <span class="dfoot"><span>${dataLonga(fromKey(i.data))}</span><span class="dtag">${DTIPO[i.tipo] || "Notas"}</span></span>
  </button>`;
}
function listaDiarioHTML(lista, attr){
  let html = "", mesAtual = "";
  const ano = now().getFullYear();
  lista.forEach(i => {
    const d = fromKey(i.data), k = `${d.getFullYear()}-${d.getMonth()}`;
    if(k !== mesAtual){ mesAtual = k; html += `<h2 class="dmes">${MES[d.getMonth()]}${d.getFullYear() !== ano ? ` de ${d.getFullYear()}` : ""}</h2>`; }
    html += cartaoDiario(i, attr);
  });
  return html;
}

function viewDiario(){
  const topo = `<div class="dtopo"><button class="dvoltar" data-go="voce">${CHEV_L}<span>Você</span></button>
    <button class="iconbtn" id="dBusca" aria-label="Buscar no diário" aria-pressed="${D.buscando}">${ICO_BUSCA}</button></div>
    <h1 class="h4">Diário</h1>`;
  if(D.itens === null) return `${topo}<div class="dlista sk-lista" aria-hidden="true"><span class="sk sk-mes"></span><span class="sk sk-card alto"></span><span class="sk sk-card"></span></div>`;
  const all = D.itens, ano = now().getFullYear();
  const doAno = all.filter(i => fromKey(i.data).getFullYear() === ano).length;
  const q = D.busca.trim().toLowerCase();
  const lista = all.filter(i => (D.filtro === "todos" || i.tipo === D.filtro) && (!q || `${i.titulo || ""} ${i.texto || ""}`.toLowerCase().includes(q)));
  const tipos = ["todos", ...Object.keys(DTIPO).filter(t => all.some(i => i.tipo === t))];
  return `${topo}
  ${all.length ? `<div class="stats dstats">
    <div class="stat"><b class="tnum">${doAno}</b><span>${doAno === 1 ? "registro" : "registros"}<br>em ${ano}</span></div>
  </div>` : ""}
  ${D.buscando ? `<label class="field dbusca"><span class="sr">Buscar</span><input id="dBuscaIn" type="search" placeholder="Buscar nos registros" value="${esc(D.busca)}" autocomplete="off"></label>` : ""}
  ${all.length && tipos.length > 2 ? `<div class="chips">${tipos.map(t => `<button type="button" data-dfiltro="${t}" aria-pressed="${D.filtro === t}">${DTIPO_PL[t]}</button>`).join("")}</div>` : ""}
  ${!all.length ? `<section class="dvazio">
      <p class="label">Seu diário</p>
      <h2 class="h5">Comece pelo que você fez hoje</h2>
      <div class="dsug">
        ${[["anotacao", "Notas", "Ideias para<br>composições e<br>próximos estudos"], ["obra", "Processo", "Etapas de um<br>estudo, em foto<br>ou anotação"], ["aula", "Em aula", "O que você viu,<br>ouviu ou aprendeu<br>durante a aula"], ["referencia", "Referência", "Artistas e obras<br>que dialogam com<br>seu trabalho"]]
          .map(([t, l, d]) => `<button class="dsug-i" data-dsug="${t}"><span class="dsug-t">${l}</span><span class="dsug-d">${d}</span></button>`).join("")}
      </div></section>`
    : lista.length ? `<div class="dlista">${listaDiarioHTML(lista, "data-dreg")}</div>` : `<p class="empty">Nenhum registro encontrado.</p>`}
  <button class="fab" id="dNovo" aria-label="Novo registro">${ICO_MAIS}</button>`;
}
function bindDiario(){
  const nb = $("#dNovo"); if(nb) nb.onclick = () => abrirEditor(null);
  $$("#view [data-dsug]").forEach(b => b.onclick = () => { abrirEditor(null); if(D.ed){ D.ed.tipo = b.dataset.dsug; const t = $("#edTipoTxt"); if(t) t.textContent = DTIPO[D.ed.tipo]; $$("#dEditor [data-edtipo]").forEach(x => x.setAttribute("aria-pressed", x.dataset.edtipo === D.ed.tipo)); } });
  const bb = $("#dBusca"); if(bb) bb.onclick = () => { D.buscando = !D.buscando; if(!D.buscando) D.busca = ""; render(); const i = $("#dBuscaIn"); if(i) i.focus(); };
  const bi = $("#dBuscaIn"); if(bi) bi.oninput = () => { D.busca = bi.value; const pos = bi.selectionStart; render(); const n = $("#dBuscaIn"); if(n){ n.focus(); n.setSelectionRange(pos, pos); } };
  $$("#view [data-dfiltro]").forEach(b => b.onclick = () => { D.filtro = b.dataset.dfiltro; render(); });
  $$("#view [data-dreg]").forEach(b => b.onclick = () => sheetRegistro(D.itens.find(x => x.id === b.dataset.dreg), true));
}

function sheetRegistro(i, meu){
  if(!i) return;
  sheet(`<p class="label">${DTIPO[i.tipo] || "Notas"}</p><p class="sub dsheet-data">${dataLonga(fromKey(i.data))}</p>
    ${i.titulo ? `<h3 class="h5">${esc(i.titulo)}</h3>` : ""}
    ${(i.fotos || []).length ? `<div class="dfotos">${i.fotos.map(p => fotoImg(p)).join("")}</div>` : ""}
    ${i.texto ? `<p class="desc dtexto">${esc(i.texto)}</p>` : ""}
    <div class="btns">${meu ? `<button class="btn pri" data-deditar="${i.id}">Editar</button>` : ""}<button class="btn ghost" data-close>Fechar</button>
      ${meu ? `<button class="btn ghost dperigo" data-dapagar="${i.id}">Excluir registro</button>` : ""}</div>`);
}
function sheetApagarRegistro(id){
  const i = D.itens.find(x => x.id === id); if(!i) return;
  sheet(`<p class="label">Diário</p><h3 class="h5">Excluir este registro?</h3>
    <p class="sub">${(i.fotos || []).length ? "O texto e as fotos são apagados e não dá para desfazer." : "Não dá para desfazer."}</p>
    <div class="btns"><button class="btn danger" data-dapagarok="${id}">Excluir</button><button class="btn ghost" data-close>Manter</button></div>`);
}
async function apagarRegistro(id, btn){
  const i = D.itens.find(x => x.id === id); if(!i) return;
  busy(btn, true);
  const { error } = await sb.from("diario").delete().eq("id", id);
  if(error){ busy(btn, false); return toast(errMsg(error)); }
  if((i.fotos || []).length) sb.storage.from("diario").remove(i.fotos).catch(() => {});
  D.itens = D.itens.filter(x => x.id !== id);
  closeSheet(); render(); toast("Registro excluído");
}

/* ----- editor (tela cheia) ----- */
async function comprimir(file, max){
  let img;
  try{ img = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch(_){ img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); }
  const sc = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, "image/jpeg", .85));
}
function abrirEditor(id){
  closeSheet();
  const i = id ? D.itens.find(x => x.id === id) : null;
  D.ed = { id: i ? i.id : null, data: i ? i.data : dkey(now()), titulo: i ? (i.titulo || "") : "", texto: i ? (i.texto || "") : "",
    tipo: i ? i.tipo : "anotacao", fotos: (i ? i.fotos || [] : []).map(p => ({ path: p })), removidas: [], mudou: false };
  let el = $("#dEditor");
  if(!el){ el = document.createElement("div"); el.id = "dEditor"; el.className = "deditor"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); document.body.appendChild(el); }
  document.body.classList.add("editando");
  renderEditor();
  setTimeout(() => { const t = $(D.ed.id ? "#edTexto" : "#edTitulo"); if(t && !D.ed.id) t.focus({ preventScroll: true }); }, 50);
}
function guardarEditor(){
  const e = D.ed; if(!e) return;
  const t = $("#edTitulo"), x = $("#edTexto");
  if(t) e.titulo = t.value; if(x) e.texto = x.value;
}
const ICO_GAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="3.5" width="14" height="13" rx="2"/><path d="M3.5 7.5v11a2 2 0 0 0 2 2h11"/><circle cx="11" cy="8" r="1.4"/><path d="M20.5 13l-4-4-6.5 7.5"/></svg>';
const ICO_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
const ICO_TAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z"/><circle cx="8.5" cy="8.5" r="1.4"/></svg>';
const ICO_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
function renderEditor(){
  const e = D.ed, el = $("#dEditor"); if(!e || !el) return;
  el.innerHTML = `<div class="ded-in">
    <header class="ded-top">
      <button type="button" id="edCancel" class="ded-x">Cancelar</button>
      <span class="ded-dia" id="edDiaTxt">${dataLonga(fromKey(e.data))}</span>
      <button type="button" id="edSalvar" class="ded-ok">OK</button>
    </header>
    <div class="ded-fotos" id="edFotos"></div>
    <input id="edTitulo" class="ded-titulo" placeholder="Título" maxlength="140" value="${esc(e.titulo)}" autocomplete="off" enterkeyhint="next">
    <textarea id="edTexto" class="ded-texto" placeholder="Comece a escrever…">${esc(e.texto)}</textarea>
  </div>
  <div class="ded-barra" id="edBarra">
    <div class="ded-tipos" id="edTipos" hidden>${Object.entries(DTIPO).map(([k, l]) => `<button type="button" data-edtipo="${k}" aria-pressed="${e.tipo === k}">${l}</button>`).join("")}</div>
    <div class="ded-ferr">
      <button type="button" id="edTipoBtn" class="ded-tipo" aria-label="Tipo do registro">${ICO_TAG}<span id="edTipoTxt">${DTIPO[e.tipo]}</span></button>
      <label class="ded-ico" for="edGaleria" aria-label="Escolher fotos">${ICO_GAL}</label>
      <label class="ded-ico" for="edCamera" aria-label="Tirar foto">${ICO_CAM}</label>
      <label class="ded-ico" aria-label="Mudar a data">${ICO_CAL}<input type="date" id="edData" value="${esc(e.data)}" max="${dkey(now())}"></label>
    </div>
  </div>
  <input type="file" id="edGaleria" accept="image/*" multiple hidden>
  <input type="file" id="edCamera" accept="image/*" capture="environment" hidden>`;
  desenharFotosEd();
  const tx = $("#edTexto"), cresce = () => { tx.style.height = "auto"; tx.style.height = Math.max(240, tx.scrollHeight) + "px"; };
  tx.oninput = () => { e.mudou = true; cresce(); }; cresce();
  const ti = $("#edTitulo");
  ti.oninput = () => { e.mudou = true; };
  ti.onkeydown = ev => { if(ev.key === "Enter"){ ev.preventDefault(); tx.focus(); } };
  $("#edData").onchange = ev => { if(!ev.target.value) return; e.data = ev.target.value; e.mudou = true; $("#edDiaTxt").textContent = dataLonga(fromKey(e.data)); };
  $("#edTipoBtn").onclick = () => { const t = $("#edTipos"); t.hidden = !t.hidden; };
  $$("#dEditor [data-edtipo]").forEach(b => b.onclick = () => {
    e.tipo = b.dataset.edtipo; e.mudou = true;
    $$("#dEditor [data-edtipo]").forEach(x => x.setAttribute("aria-pressed", x === b));
    $("#edTipoTxt").textContent = DTIPO[e.tipo]; $("#edTipos").hidden = true;
  });
  const addFotos = async ev => {
    const files = [...(ev.target.files || [])].slice(0, 10 - e.fotos.length); ev.target.value = "";
    if(!files.length) return toast(e.fotos.length >= 10 ? "Até 10 fotos por registro" : "");
    for(const f of files){ try{ const blob = await comprimir(f, 1600); if(blob) e.fotos.push({ blob, url: URL.createObjectURL(blob) }); }catch(_){ toast("Não foi possível abrir uma das fotos."); } }
    e.mudou = true; desenharFotosEd();
  };
  $("#edGaleria").onchange = addFotos; $("#edCamera").onchange = addFotos;
  $("#edCancel").onclick = () => { guardarEditor(); if(e.mudou && !window.confirm(e.id ? "Descartar as alterações?" : "Descartar este registro?")) return; fecharEditor(); };
  $("#edSalvar").onclick = ev => salvarRegistro(ev.currentTarget);
  ajustarTeclado();
}
function desenharFotosEd(){
  const e = D.ed, box = $("#edFotos"); if(!e || !box) return;
  box.hidden = !e.fotos.length;
  box.innerHTML = e.fotos.map((f, k) => `<div class="ded-foto">${f.url ? `<img src="${esc(f.url)}" alt="">` : fotoImg(f.path)}<button type="button" data-edrm="${k}" aria-label="Remover foto">×</button></div>`).join("");
  $$("#edFotos [data-edrm]").forEach(b => b.onclick = () => {
    const f = e.fotos.splice(+b.dataset.edrm, 1)[0];
    if(f){ if(f.url) URL.revokeObjectURL(f.url); else if(f.path) e.removidas.push(f.path); }
    e.mudou = true; desenharFotosEd();
  });
}
/* a barra de ferramentas acompanha o teclado (como no Diário do iPhone) */
function ajustarTeclado(){
  const vv = window.visualViewport; if(!vv) return;
  const f = () => { const b = $("#edBarra"); if(!b) return; const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop); b.style.bottom = kb + "px"; b.classList.toggle("teclado", kb > 80); };
  if(!ajustarTeclado.ok){ vv.addEventListener("resize", f); vv.addEventListener("scroll", f); ajustarTeclado.ok = true; }
  f();
}
function fecharEditor(){
  if(D.ed) D.ed.fotos.forEach(f => f.url && URL.revokeObjectURL(f.url));
  D.ed = null; const el = $("#dEditor"); if(el) el.remove();
  document.body.classList.remove("editando");
}
async function salvarRegistro(btn){
  guardarEditor(); const e = D.ed; if(!e) return;
  if(!e.titulo.trim() && !e.texto.trim() && !e.fotos.length) return toast("Escreva algo ou adicione uma foto");
  busy(btn, true);
  try{
    const uid = S.session.user.id, paths = [];
    for(const f of e.fotos){
      if(f.path){ paths.push(f.path); continue; }
      const path = `${uid}/${novoId()}.jpg`;
      const { error } = await sb.storage.from("diario").upload(path, f.blob, { contentType: "image/jpeg" });
      if(error) throw error;
      f.path = path; paths.push(path);
    }
    const row = { data: e.data, titulo: e.titulo.trim() || null, texto: e.texto.trim() || null, tipo: e.tipo, fotos: paths };
    const r = e.id ? await sb.from("diario").update(row).eq("id", e.id) : await sb.from("diario").insert({ ...row, aluno_id: S.aluno.id });
    if(r.error) throw r.error;
    if(e.removidas.length) sb.storage.from("diario").remove(e.removidas).catch(() => {});
    const editou = !!e.id;
    fecharEditor(); await loadDiario(); if(S.tab !== "diario") S.tab = "diario"; render(); window.scrollTo(0, 0);
    vibrar(); toast(editou ? "Registro atualizado" : "Registro salvo");
  }catch(ex){ busy(btn, false); toast(errMsg(ex)); }
}

/* resumo do diário na aba Você */
function blocoDiario(){
  const it = D.itens || [], ult = it[0], capa = it.find(i => (i.fotos || []).length);
  const foto = capa && capa.fotos[0];
  return `<button class="dteaser" data-go="diario">
    <span class="dteaser-t"><span class="label">Diário</span>
      <span class="title">${it.length ? plural(it.length, "registro", "registros") : "Comece seu diário"}</span>
      <span class="sub">${ult ? `Último em ${dataLonga(fromKey(ult.data)).replace(/^./, c => c.toLowerCase())}` : "Notas e fotos do seu percurso no atelier"}</span></span>
    ${foto ? `<span class="dteaser-img">${fotoImg(foto)}</span>` : `<span class="dteaser-mais">${ICO_MAIS}</span>`}
  </button>`;
}

/* equipe: diário de um aluno (só leitura) */
async function sheetDiarioEq(pid){
  const p = (S.eq.alunos || []).find(x => x.id === pid) || {};
  sheet(`<p class="label">Diário</p><h3 class="h5">${esc(p.nome || "Aluno")}</h3><p class="sub">Carregando…</p>`);
  const { data, error } = await sb.from("diario").select("*").eq("aluno_id", pid).order("data", { ascending: false }).order("criado_em", { ascending: false });
  if(error) return sheet(`<p class="label">Diário</p><h3 class="h5">${esc(p.nome || "Aluno")}</h3><p class="sub">${esc(errMsg(error))}</p><div class="btns"><button class="btn ghost" data-close>Fechar</button></div>`);
  D.eq = data || [];
  try{ await assinarFotos(D.eq.flatMap(i => i.fotos || [])); }catch(_){}
  sheet(`<p class="label">Diário</p><h3 class="h5">${esc(p.nome || "Aluno")}</h3>
    <p class="sub">${D.eq.length ? plural(D.eq.length, "registro", "registros") : "Ainda não escreveu no diário."}</p>
    ${D.eq.length ? `<div class="dlista dlista-eq">${listaDiarioHTML(D.eq, "data-dregeq")}</div>` : ""}
    <div class="btns"><button class="btn ghost" data-dvoltarpessoa="${pid}">Voltar ao cadastro</button></div>`);
}
$("#sheetBody").addEventListener("click", e => {
  const t = e.target.closest("button"); if(!t) return;
  if(t.dataset.delevask){ const e = S.eventos.find(x => x.id === t.dataset.delevask);
    return sheet(`<p class="label">Evento</p><h3 class="h5">Excluir ${esc(e ? e.titulo : "este evento")}?</h3>
      <p class="sub">${e && e.inscritos ? `${plural(e.inscritos, "pessoa inscrita perde", "pessoas inscritas perdem")} a inscrição. ` : ""}Não dá para desfazer.</p>
      <div class="btns"><button class="btn danger" data-delev="${t.dataset.delevask}">Excluir evento</button><button class="btn ghost" data-editev="${t.dataset.delevask}">Voltar</button></div>`); }
  if(t.dataset.espera || t.dataset.saiespera){
    const entrar = !!t.dataset.espera, id = t.dataset.espera || t.dataset.saiespera; busy(t, true);
    sb.rpc(entrar ? "entrar_lista_espera" : "sair_lista_espera", { p_aula: id }).then(async ({ error }) => {
      if(error){ busy(t, false); return toast(errMsg(error)); }
      closeSheet(); await loadAluno(); render(); if(entrar) vibrar(); toast(entrar ? "Você entrou na lista de espera" : "Você saiu da lista de espera");
    });
    return;
  }
  if(t.dataset.deditar) return abrirEditor(t.dataset.deditar);
  if(t.dataset.dapagar) return sheetApagarRegistro(t.dataset.dapagar);
  if(t.dataset.dapagarok) return apagarRegistro(t.dataset.dapagarok, t);
  if(t.dataset.dregeq){ const i = (D.eq || []).find(x => x.id === t.dataset.dregeq); return sheetRegistro(i, false); }
  if(t.dataset.diarioeq) return sheetDiarioEq(t.dataset.diarioeq);
  if(t.dataset.dvoltarpessoa) return sheetPessoaEq(t.dataset.dvoltarpessoa);
});

function bind(){
  bindDiario();
  bindRecados();
  $$("#view [data-alerta-pessoa]").forEach(b => b.onclick = () => abrirPessoaAlerta(b.dataset.alertaPessoa));
  bindPush();
  $$("#view [data-abreaula]").forEach(b => b.onclick = () => { const a = S.agenda.find(x => x.aula_id === b.dataset.abreaula); a && sheetAula(a); });
  $$("#view [data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  $$("#view [data-ev]").forEach(b => b.onclick = () => abrirEvento(b.dataset.ev));
  bindEventoPag();
  $$("#view [data-evf]").forEach(b => b.onclick = () => { S.evFiltro = b.dataset.evf; render(); });
  $$("#view [data-day]").forEach(b => b.onclick = () => S.visitante ? sheetDiaV(b.dataset.day) : sheetDia(b.dataset.day));
  const vf = $("#voltarFixos"); if(vf) vf.onclick = sheetVoltar;
  const lb = $("#liveBtn"); if(lb) lb.onclick = sheetPessoas;
  const db = $("#desmBtn"); if(db) db.onclick = () => { const a = S.agenda.find(x => x.aula_id === db.dataset.aula); a && sheetDesmarcar(a); };
  const p = $("#prevM"), n = $("#nextM");
  if(p) p.onclick = () => { S.mes = new Date(S.mes.getFullYear(), S.mes.getMonth()-1, 1); render(); };
  if(n) n.onclick = () => { S.mes = new Date(S.mes.getFullYear(), S.mes.getMonth()+1, 1); render(); };
  const ci = $("#capaIn"); if(ci) ci.onchange = () => uploadFoto(ci, "capa");
  const ai = $("#avIn"); if(ai) ai.onchange = () => uploadFoto(ai, "avatar");
  const sair = $("#sair"); if(sair) sair.onclick = () => S.comoAluno ? trocarModoAluno(false) : sb.auth.signOut();
  const ts = $("#trocarSenha"); if(ts) ts.onclick = () => S.comoAluno ? toast("No modo aluno a senha não muda") : abrirTrocaSenha();
  const pm = $("#pedMudar"); if(pm) pm.onclick = sheetMudanca;
  const pc = $("#pedCancelar"); if(pc) pc.onclick = async () => { busy(pc, true); const { error } = await sb.rpc("cancelar_pedido_mudanca"); if(error){ busy(pc, false); return toast(errMsg(error)); } await loadAluno(); render(); toast("Pedido cancelado"); };
  const vp = $("#verPedidos"); if(vp) vp.onclick = sheetPedidosEq;
  const on = (id, fn) => { const el = $(id); if(el) el.onclick = fn; };
  on("#pnPedidos", () => (S.eq.pedidos || []).length ? sheetPedidosEq() : toast("Nenhum pedido aguardando"));
  on("#pnEmails", sheetEmailsEq);
  on("#pnEvento", () => sheetEventoEq("novo"));
  on("#pnHorario", () => go("eq:turmas"));
  on("#pnPerfil", sheetPerfilEq);
  on("#pnFantasma", () => trocarModoAluno(true));
  // equipe
  $$("#view [data-eqsec]").forEach(b => b.onclick = () => { S.eq.sec = b.dataset.eqsec; render(); eqLoad(); });
  $$("#view [data-eqday]").forEach(b => b.onclick = () => { S.eq.dia = addDays(S.eq.dia, +b.dataset.eqday); eqLoad(); });
  $$("#view [data-eqdia]").forEach(b => b.onclick = () => sheetDiaEq(b.dataset.eqdia));
  $$("#view [data-tabgo]").forEach(b => b.onclick = () => go(b.dataset.tabgo));
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
      closeSheet(); toast(`Aula cancelada. ${cap1(plural(data,"aluno avisado","alunos com reposição"))}`); eqLoad();
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
const listaEmAula = () => S.live.length
  ? `<div class="people">${S.live.map(p => `<div class="person"><div class="av">${esc(initials(p.nome))}</div><span>${esc(p.nome)}</span><span class="tag">${p.sou_eu ? "você" : p.tipo === "reposicao" ? "reposição" : ""}</span></div>`).join("")}</div>`
  : `<p class="sub">Ninguém confirmado nesta aula.</p>`;
function sheetPessoas(){
  const cur = S.agenda.find(a => !a.cancelada && a.ini <= now() && a.fim > now());
  sheet(`<p class="label">Agora no atelier</p><h3 class="h5">${plural(S.live.length,"aluno em aula","alunos em aula")}</h3>
    ${cur ? `<p class="sub">${cap1(WD[cur.ini.getDay()])}, ${hh(cur.ini)} às ${hh(cur.fim)}, ${plural(vagas(cur),"vaga livre","vagas livres")}</p>` : ""}
    ${listaEmAula()}
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
  if(t.dataset.inev){ busy(t, true); const { error } = await sb.rpc("inscrever_evento", { p_evento: t.dataset.inev }); if(error){ busy(t,false); return toast(errMsg(error)); } closeSheet(); vibrar(); toast("Inscrição feita"); await loadEventos(); return render(); }
  if(t.dataset.unev){ busy(t, true); const { error } = await sb.rpc("cancelar_inscricao", { p_evento: t.dataset.unev }); if(error){ busy(t,false); return toast(errMsg(error)); } closeSheet(); toast("Inscrição cancelada"); await loadEventos(); return render(); }
  if(t.dataset.editev) return sheetEventoEq(t.dataset.editev);
  if(t.dataset.delev){ busy(t, true); const { error } = await sb.from("eventos").delete().eq("id", t.dataset.delev); if(error){ busy(t,false); return toast(errMsg(error)); } closeSheet(); toast("Evento excluído"); await loadEventos(); if(S.tab === "evento") return go(EV.volta || "eventos"); return render(); }
  if(t.dataset.excluir) return sheetExcluirEq(t.dataset.excluir);
  if(t.dataset.aprovar){ busy(t, true); const { error } = await sb.rpc("aprovar_mudanca", { p_pedido: t.dataset.aprovar }); busy(t, false);
    if(error) return toast(errMsg(error));
    S.eq.pedidos = (S.eq.pedidos || []).filter(x => x.id !== t.dataset.aprovar); toast("Mudança aprovada. A agenda do aluno já foi ajustada."); sheetPedidosEq(); return S.tab === "painel" ? loadPainel() : eqLoad(); }
  if(t.dataset.recusar) return sheetRecusarEq(t.dataset.recusar);
  if(t.dataset.recusarok){ busy(t, true); const msg = ($("#rMsg") || {}).value || null; const { error } = await sb.rpc("recusar_mudanca", { p_pedido: t.dataset.recusarok, p_resposta: msg }); busy(t, false);
    if(error) return toast(errMsg(error));
    S.eq.pedidos = (S.eq.pedidos || []).filter(x => x.id !== t.dataset.recusarok); toast("Pedido recusado"); sheetPedidosEq(); return S.tab === "painel" ? loadPainel() : eqLoad(); }
  if(t.dataset.excluirok){ busy(t, true); const { error } = await sb.rpc("excluir_pessoa", { p_pessoa: t.dataset.excluirok }); busy(t, false);
    if(error) return toast(/excluir_pessoa|function/.test(error.message || "") ? "A exclusão ainda não foi ativada no banco." : errMsg(error));
    closeSheet(); toast("Cadastro excluído"); return eqLoad(); }
  if(t.dataset.dar){ busy(t, true); const { error } = await sb.rpc("dar_credito", { p_aluno: t.dataset.dar }); busy(t, false); if(error) return toast(errMsg(error)); toast("Reposição adicionada"); closeSheet(); return eqLoad(); }
});

if(!CFG.url || CFG.url.includes("__")) { $("#view").innerHTML = `<div class="loading">App ainda não configurado.</div>`; }
else boot();

/* vibração curta: Android usa vibrate; no iPhone (iOS 18+) o toque num interruptor nativo escondido gera o "toc" */
const vibrar = (() => {
  let lbl = null;
  return () => {
    try{
      if(navigator.vibrate){ navigator.vibrate(12); return; }
      if(!lbl){
        lbl = document.createElement("label"); lbl.setAttribute("aria-hidden", "true");
        lbl.style.cssText = "position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9px;top:-9px";
        const cb = document.createElement("input"); cb.type = "checkbox"; cb.setAttribute("switch", ""); cb.tabIndex = -1;
        lbl.appendChild(cb); document.body.appendChild(lbl);
      }
      lbl.click();
    }catch(_){}
  };
})();
/* ---------- puxar para atualizar (Hoje, Agenda, Eventos e telas da equipe) ---------- */
(function(){
  const LIM = 64, el = document.createElement("div");
  el.id = "ptr"; el.className = "ptr"; el.setAttribute("aria-hidden", "true");
  el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v11M7 11l5 5 5-5"/></svg>';
  document.body.appendChild(el);
  let y0 = null, d = 0, ocupado = false, vibrou = false;
  const pode = () => S.session && !NS.ativo && !precisaCompletar() && !document.querySelector("#sheet.show") && !document.querySelector("#dEditor")
    && (["hoje","agenda","eventos","evento","eqhoje","painel"].includes(S.tab) || isEqTab());
  const pos = v => {
    el.style.transform = `translate(-50%, ${v}px)`; el.style.opacity = Math.min(1, v / 40); el.classList.toggle("pronto", v >= LIM);
    const vw = $("#view"); vw.style.transform = v ? `translateY(${v}px)` : "";
    if(v >= LIM && !vibrou && y0 !== null){ vibrou = true; vibrar(); }
    if(v < LIM - 8) vibrou = false;
  };
  const volta = () => { const vw = $("#view"); el.classList.add("volta"); vw.classList.add("volta");
    setTimeout(() => { el.classList.remove("volta"); vw.classList.remove("volta"); }, 300); };
  document.addEventListener("touchstart", e => { if(ocupado || window.scrollY > 0 || !pode() || e.touches.length !== 1) { y0 = null; return; } y0 = e.touches[0].clientY; d = 0; }, { passive: true });
  document.addEventListener("touchmove", e => {
    if(y0 === null) return;
    const dy = e.touches[0].clientY - y0;
    if(dy <= 0 || window.scrollY > 0){ d = 0; pos(0); return; }
    d = Math.min(96, dy * .5); pos(d);
    if(e.cancelable) e.preventDefault();
  }, { passive: false });
  document.addEventListener("touchend", async () => {
    if(y0 === null) return; y0 = null;
    if(d < LIM){ volta(); pos(0); return; }
    ocupado = true; el.classList.add("girando"); pos(56);
    try{
      if(S.tab === "evento") await Promise.all([loadEventos(), loadEventoPag()]);
      else if(S.visitante && !S.equipe) await loadVisitante();
      else if(S.tab === "eqhoje") await loadHojeEq();
      else if(S.tab === "painel") await loadPainel();
      else if(isEqTab()) await eqLoad();
      else await Promise.all([loadAluno(), loadEventos()]);
      render();
    }catch(_){ toast("Não foi possível atualizar. Verifique a conexão."); }
    el.classList.remove("girando"); volta(); pos(0);
    setTimeout(() => { ocupado = false; }, 300);
  });
})();

/* ---------- boas-vindas (primeira vez do aluno neste aparelho) ---------- */
const TOUR_ICO = {
  agenda: ICO.agenda,
  fila: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M3 19c.6-2.8 2.6-4.5 5-4.5s4.4 1.7 5 4.5M13.5 15.2c.8-.5 1.6-.7 2.5-.7 2.4 0 4.4 1.7 5 4.5"/></svg>',
  diario: '<svg viewBox="0 0 24 24"><path d="M5 4.5h11a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2z"/><path d="M5 17.5a2 2 0 0 1 2-2h11M9 8.5h5M9 11.5h3"/></svg>',
  sino: '<svg viewBox="0 0 24 24"><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>'
};
const TOUR = [
  { ico: "agenda", t: "Sua agenda no atelier", d: "Seus dias fixos já estão marcados. Se não puder ir, desmarque até 4 horas antes e ganhe uma reposição para usar em outro dia." },
  { ico: "fila", t: "Dia lotado? Entre na fila", d: "Na lista de espera, você recebe um aviso assim que alguém desmarcar. Quem marcar primeiro fica com a vaga." },
  { ico: "diario", t: "Seu diário de atelier", d: "Guarde processos, notas e referências. Com o tempo, ele vira o mapa do seu percurso." },
  { ico: "sino", t: "Lembretes no celular", d: "Avisamos na véspera da aula, se ela for cancelada e quando abrir vaga na sua lista de espera." }
];
const tourChave = () => "alma-tour-v1" + (S.comoAluno ? "-fantasma" : "");
function talvezTour(){
  if(!S.aluno || precisaCompletar() || NS.ativo || $("#tour")) return;
  try{ if(localStorage.getItem(tourChave())) return; }catch(_){ return; }
  abrirTour();
}
function abrirTour(){
  const el = document.createElement("div"); el.id = "tour"; el.className = "tour"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
  document.body.appendChild(el); document.body.classList.add("editando");
  let i = 0;
  const fim = () => { try{ localStorage.setItem(tourChave(), "1"); }catch(_){ } el.classList.add("sai"); document.body.classList.remove("editando"); setTimeout(() => el.remove(), 260); };
  const desenha = () => {
    const p = TOUR[i], ultimo = i === TOUR.length - 1;
    const pushAcao = ultimo && !S.comoAluno && ["desligado","instalar","bloqueado"].includes(P.estado);
    el.innerHTML = `<div class="tour-in">
      <button class="tour-pular" id="tourPular" ${ultimo ? "hidden" : ""}>Pular</button>
      <div class="tour-arte"><span class="tour-ico">${TOUR_ICO[p.ico]}</span></div>
      <div class="tour-txt"><p class="apasso">${i + 1} de ${TOUR.length}</p><h1>${p.t}</h1><p>${p.d}</p></div>
      <div class="tour-pontos" aria-hidden="true">${TOUR.map((_, k) => `<span class="${k === i ? "on" : ""}"></span>`).join("")}</div>
      <div class="tour-acoes">
        ${ultimo ? (pushAcao ? `<button class="abtn light" id="tourPush">${P.estado === "instalar" ? "Como ativar no iPhone" : "Ativar lembretes"}</button><button class="abtn line" id="tourFim">Começar</button>`
          : `<button class="abtn light" id="tourFim">Começar</button>`) : `<button class="abtn light" id="tourProx">Próximo</button>`}
      </div></div>`;
    const q = id => el.querySelector(id);
    if(q("#tourProx")) q("#tourProx").onclick = () => { i++; desenha(); };
    if(q("#tourPular")) q("#tourPular").onclick = fim;
    if(q("#tourFim")) q("#tourFim").onclick = fim;
    if(q("#tourPush")) q("#tourPush").onclick = ev => { if(P.estado === "instalar"){ fim(); setTimeout(sheetInstalarApp, 280); } else { ativarPush(ev.currentTarget).then(fim); } };
  };
  let x0 = null;
  el.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener("touchend", e => {
    if(x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if(dx < -50 && i < TOUR.length - 1){ i++; desenha(); } else if(dx > 50 && i > 0){ i--; desenha(); }
  });
  desenha();
}

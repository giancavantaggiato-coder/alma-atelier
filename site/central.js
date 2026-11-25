/* Alma Atelier — Central (gestão), só para a direção.
   Conteúdo, Financeiro e Loja. Carrega antes do app.js e usa as utilidades dele só dentro das funções.
   As tabelas (cont_pecas, fin_contas, loja_fornecedores) só respondem para quem é direção. */
"use strict";
const C = { sec: "resumo", pronto: false, erro: false, pecas: [], contas: [], forn: [], emails: [], conta: "todas", fin: "pagar", cv: "etapas" };

const C_SECOES = [["resumo","Resumo"],["emails","E-mails"],["conteudo","Conteúdo"],["financeiro","Financeiro"],["loja","Loja"]];
const C_ESTADOS = [["ideia","Ideia"],["texto","Texto"],["revisao_texto","Revisão do texto"],["design","Design"],["revisao_design","Revisão do design"],["agendar","Pronto para agendar"],["agendado","Agendado"],["publicado","Publicado"]];
/* o que fazer em cada etapa e quantos dias antes da publicação precisa estar feito (igual a cont_prazo no banco) */
const C_TAREFA = { texto: "Escrever o texto", revisao_texto: "Revisar o texto", design: "Fazer o design", revisao_design: "Revisar o design", agendar: "Agendar a publicação", agendado: "Conferir se publicou" };
const C_PRAZO = { post: { texto: 7, revisao_texto: 5, design: 4, revisao_design: 2, agendar: 1, agendado: 0 }, blog: { texto: 14, revisao_texto: 10, design: 6, revisao_design: 3, agendar: 1, agendado: 0 } };
const cPrazoDe = (p, estado) => { const t = C_PRAZO[p.formato === "blog" ? "blog" : "post"][estado]; return !p.dia || t == null ? null : dkey(addDays(fromKey(p.dia), -t)); };
const cPrazo = p => cPrazoDe(p, p.estado);
const C_TIPOS_EMAIL = { conta: "Conta", fornecedor: "Fornecedor", aluno: "Aluno", interessado: "Interessado", loja: "Loja", parceria: "Parceria", sistema: "Sistema", outro: "Outro" };
const C_CONTAS = [["atelier","Atelier"],["loja","Loja"],["blog","Blog"]];
const C_CONTA_CURTA = { atelier: "Atelier", loja: "Loja", blog: "Blog" };
const C_FORMATOS = [["feed","Post"],["carrossel","Carrossel"],["stories","Stories"],["reels","Reels"],["blog","Texto do blog"]];
const C_CATEGORIAS = ["Aluguel","Contabilidade","Fornecedores","Sistemas e assinaturas","Produção e fotos","Mídia paga","Impostos e taxas","Manutenção","Materiais do atelier","Mensalidades","Vendas","Outros"];
const C_FRENTES = [["geral","Geral"],["atelier","Atelier"],["loja","Loja"],["circulo","Círculo Alma"]];
const C_ICO = '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M17 13.5v7M13.5 17h7"/></svg>';

const cEstado = k => (C_ESTADOS.find(e => e[0] === k) || [k, k])[1];
const cFormato = k => (C_FORMATOS.find(e => e[0] === k) || [k, k])[1];
const cHoje = () => dkey(new Date());
const cValor = s => { s = String(s || "").trim().replace(/[R$\s]/g, ""); if(s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); const v = Number(s); return isFinite(v) ? Math.round(v * 100) / 100 : NaN; };
const cBrl = v => "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cDia = k => { const d = fromKey(k), h = startOfDay(new Date()), dif = Math.round((d - h) / 864e5);
  return dif === 0 ? "Hoje" : dif === 1 ? "Amanhã" : dif === -1 ? "Ontem" : `${cap1(WD[d.getDay()])}, ${dm(d)}`; };
const cSoma = l => l.reduce((t, x) => t + Number(x.valor || 0), 0);
const cPronta = p => ["agendar","agendado","publicado"].includes(p.estado);

async function loadCentral(){
  if(!S.direcao) return;
  const hoje = new Date(), desde = dkey(addDays(hoje, -45)), mesPassado = dkey(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1));
  const [pc, ct, fo, em] = await Promise.all([
    sb.from("cont_pecas").select("*").or(`dia.is.null,dia.gte.${desde}`).order("dia", { ascending: true, nullsFirst: false }).order("hora", { ascending: true, nullsFirst: true }),
    sb.from("fin_contas").select("*").or(`pago_em.is.null,pago_em.gte.${mesPassado}`).order("vencimento", { ascending: true }),
    sb.from("loja_fornecedores").select("*").order("nome", { ascending: true }),
    sb.from("central_emails").select("*").or(`estado.in.(aberto,enviar,erro),criado_em.gte.${dkey(addDays(hoje, -21))}`).order("recebido_em", { ascending: false, nullsFirst: false })
  ]);
  C.erro = !!(pc.error || ct.error || fo.error);
  C.pecas = pc.data || []; C.contas = ct.data || []; C.forn = fo.data || []; C.emails = em.data || [];
  C.pronto = true;
  if(S.tab === "central" || S.tab === "eqhoje") render();
}

/* ---------- tela ---------- */
function viewCentral(){
  const n = new Date();
  const head = `<header class="hello"><p class="label">${cap1(WD[n.getDay()])}, ${dm(n)}</p><h1 class="h4">Central</h1></header>
    <div class="seg c-seg" role="group" aria-label="Seção">${C_SECOES.map(([k, l]) => `<button data-csec="${k}" aria-pressed="${C.sec === k}">${l}</button>`).join("")}</div>`;
  if(!C.pronto) return head + esqueleto();
  if(C.erro) return head + `<p class="empty">A Central ainda está sendo preparada no banco. Assim que as tabelas forem criadas, tudo aparece aqui.</p>`;
  const corpo = { resumo: cResumo, emails: cEmails, conteudo: cConteudo, financeiro: cFinanceiro, loja: cLoja }[C.sec] || cResumo;
  return head + corpo();
}

function cEmBreve(itens){
  return `<section class="c-bloco"><p class="label">Chegando</p><div class="list c-list">${itens.map(([t, d]) =>
    `<div class="li c-breve"><span class="ind n"></span><span class="al-t"><span>${t}</span><span class="sub">${d}</span></span></div>`).join("")}</div></section>`;
}

function cResumo(){
  const h = cHoje(), sem = dkey(addDays(new Date(), 7));
  const abertas = C.contas.filter(c => c.tipo === "pagar" && !c.pago_em);
  const atraso = abertas.filter(c => c.vencimento < h), semana = abertas.filter(c => c.vencimento >= h && c.vencimento <= sem);
  const pecasSem = C.pecas.filter(p => p.dia && p.dia >= h && p.dia <= sem);
  const prontas = pecasSem.filter(cPronta).length;
  const etapas = C.pecas.filter(p => { const z = cPrazo(p); return z && z <= h; }).sort((a, b) => cPrazo(a).localeCompare(cPrazo(b)));
  const emails = C.emails.filter(e => e.decisao === "pendente");
  const linhas = [
    ...emails.map(e => [`data-cemail="${e.id}"`, e.assunto || "(sem assunto)", `E-mail de ${e.remetente_nome || e.remetente || "remetente"}, decidir quem responde`, e.prioridade === "alta" ? "warn" : ""]),
    ...atraso.map(c => [`data-cconta="${c.id}"`, c.descricao, `venceu ${dm(fromKey(c.vencimento))}, ${cBrl(c.valor)}`, "warn"]),
    ...etapas.map(p => [`data-cpeca="${p.id}"`, `${C_TAREFA[p.estado]}: ${p.titulo}`, `${cPrazo(p) < h ? `era para ${dm(fromKey(cPrazo(p)))}` : "para hoje"}, publica ${dm(fromKey(p.dia))}`, cPrazo(p) < h ? "warn" : ""]),
    ...abertas.filter(c => c.vencimento === h).map(c => [`data-cconta="${c.id}"`, c.descricao, `vence hoje, ${cBrl(c.valor)}`, ""])
  ];
  return `<div class="tiles">
      <button class="tile" data-csec="financeiro"><div class="tl"><h2 class="tt">A pagar em 7 dias</h2>${atraso.length ? `<span class="chip warn">${plural(atraso.length, "atrasada", "atrasadas")}</span>` : ""}</div>
        <div class="tv tnum c-tv">${cBrl(cSoma(semana))}</div><p class="ts">${semana.length ? plural(semana.length, "conta", "contas") : "Nenhuma conta"}</p></button>
      <button class="tile" data-csec="conteudo"><div class="tl"><h2 class="tt">Publicações na semana</h2></div>
        <div class="tv tnum">${prontas}<small> de ${pecasSem.length}</small></div><p class="ts">prontas</p></button>
    </div>
    <section class="c-bloco"><p class="label">Hoje</p>${linhas.length ? `<div class="list c-list">${linhas.map(([a, t, d, w]) =>
      `<button class="li al" ${a}><span class="ind ${w}"></span><span class="al-t"><span>${esc(t)}</span><span class="sub">${esc(d)}</span></span></button>`).join("")}</div>`
      : `<p class="sub c-ok">Nada pendente na Central hoje.</p>`}</section>
    ${cEmBreve([["Mensalidades do atelier","Entram sozinhas quando o Asaas for ligado"],["Pedidos da loja","Vindos da Shopify, com o que separar e as retiradas no atelier"],["Estoque e compras","Saldo do Bling, itens perto do mínimo e pedidos de compra"],["Extrato do Inter","Entradas e saídas conferidas com o previsto"]])}`;
}

/* ---------- E-mails ---------- */
function cCartaoEmail(e){
  const q = e.recebido_em ? new Date(e.recebido_em) : null;
  const det = [C_TIPOS_EMAIL[e.tipo], e.remetente_nome || e.remetente, q ? `${dm(q)} às ${hh(q)}` : ""].filter(Boolean).join(", ");
  const pill = e.estado === "enviar" ? `<span class="pill wait">enviando</span>` : e.estado === "enviado" ? `<span class="pill mute">respondido</span>` : e.estado === "erro" ? `<span class="pill warn">não enviou</span>`
    : e.decisao === "arquivado" ? `<span class="pill mute">arquivado</span>` : e.decisao === "eu" && e.estado === "feito" ? `<span class="pill mute">resolvido</span>` : e.prioridade === "alta" ? `<span class="pill ok">importante</span>` : "";
  return `<button class="card c-card" data-cemail="${e.id}"><div class="row"><span class="title">${esc(e.assunto || "(sem assunto)")}</span>${pill}</div>
    <p class="sub">${esc(det)}</p>${e.resumo ? `<p class="sub c-resumo">${esc(e.resumo)}</p>` : ""}</button>`;
}
function cEmails(){
  const pend = C.emails.filter(e => e.decisao === "pendente").sort((a, b) => (a.prioridade === "alta" ? 0 : 1) - (b.prioridade === "alta" ? 0 : 1));
  const meus = C.emails.filter(e => e.decisao === "eu" && e.estado === "aberto");
  const indo = C.emails.filter(e => ["enviar","erro"].includes(e.estado));
  const feitos = C.emails.filter(e => !pend.includes(e) && !meus.includes(e) && !indo.includes(e)).slice(0, 15);
  const grupo = (t, l) => l.length ? `<p class="c-grupo">${t}<span class="tnum">${l.length}</span></p><div class="cards c-cards">${l.map(cCartaoEmail).join("")}</div>` : "";
  return `<p class="sub c-intro">O Claude lê o e-mail três vezes por dia e traz para cá o que pede atenção. Você decide quem responde.</p>
    ${grupo("Para decidir", pend)}${grupo("Para você responder", meus)}${grupo("O Claude vai enviar", indo)}
    ${!pend.length && !meus.length && !indo.length ? `<p class="empty">Nenhum e-mail esperando decisão.</p>` : ""}
    ${grupo("Resolvidos recentemente", feitos)}`;
}
function sheetEmail(id){
  const e = C.emails.find(x => x.id === id); if(!e) return;
  const q = e.recebido_em ? new Date(e.recebido_em) : null;
  const conta = e.fin_conta_id ? C.contas.find(c => c.id === e.fin_conta_id) : null;
  const aberto = e.decisao === "pendente" || (e.decisao === "eu" && e.estado === "aberto") || e.estado === "erro";
  sheet(`<p class="label">${esc(C_TIPOS_EMAIL[e.tipo] || "E-mail")}${q ? `, ${dm(q)} às ${hh(q)}` : ""}</p><h3 class="h5">${esc(e.assunto || "(sem assunto)")}</h3>
    <p class="sub c-de">${esc(e.remetente_nome ? `${e.remetente_nome}, ${e.remetente || ""}` : e.remetente || "")}</p>
    ${e.resumo ? `<p class="c-texto">${esc(e.resumo)}</p>` : ""}
    ${conta ? `<button class="li c-li-conta" data-cconta-em="${conta.id}"><span class="ind"></span>Lançada no financeiro<span class="end tnum">${cBrl(conta.valor)}, ${dm(fromKey(conta.vencimento))}</span></button>` : ""}
    ${e.estado === "erro" && e.erro ? `<p class="err">${esc(e.erro)}</p>` : ""}
    <form class="form" id="ceForm">
      ${e.estado === "enviado" ? `<label class="field"><span>Resposta enviada</span><textarea rows="6" readonly>${esc(e.resposta || "")}</textarea></label>`
        : aberto ? `<label class="field"><span>Resposta (o Claude envia este texto, do jeito que estiver aqui)</span><textarea id="ce_resp" rows="8" placeholder="Escreva ou ajuste a resposta">${esc(e.resposta || e.sugestao || "")}</textarea></label>` : ""}
      <p class="err" id="ceErr" hidden></p>
      <div class="btns">
        ${aberto ? `<button class="btn pri" type="submit">Aprovar e o Claude envia</button>` : ""}
        ${e.decisao === "pendente" ? `<button class="btn ghost" type="button" id="ceEu">Eu respondo</button>` : ""}
        ${e.decisao === "eu" && e.estado === "aberto" ? `<button class="btn ghost" type="button" id="ceFeito">Já respondi</button>` : ""}
        ${e.estado === "enviar" ? `<button class="btn ghost" type="button" id="ceCancela">Não enviar</button>` : ""}
        ${e.link ? `<a class="btn ghost c-link" href="${esc(e.link)}" target="_blank" rel="noopener">Abrir no Gmail</a>` : ""}
        ${aberto ? `<button class="btn ghost dperigo" type="button" id="ceArq">Arquivar sem responder</button>` : ""}
        <button class="btn ghost" type="button" data-close>Fechar</button></div>
    </form>`);
  const salvar = async (row, btn, msg) => {
    busy(btn, true);
    const { error } = await sb.from("central_emails").update({ ...row, decidido_em: new Date().toISOString() }).eq("id", id);
    if(error){ busy(btn, false); const x = $("#ceErr"); x.textContent = errMsg(error); x.hidden = false; return; }
    closeSheet(); toast(msg); loadCentral();
  };
  const f = $("#ceForm");
  f.onsubmit = ev => { ev.preventDefault(); const t = ($("#ce_resp") || {}).value || "";
    if(!t.trim()){ const x = $("#ceErr"); x.textContent = "Escreva a resposta antes de aprovar."; x.hidden = false; return; }
    salvar({ decisao: "claude", estado: "enviar", resposta: t.trim(), erro: null }, f.querySelector("button[type=submit]"), "Aprovado. O Claude envia na próxima leitura"); };
  const on = (sel, fn) => { const b = $(sel); if(b) b.onclick = () => fn(b); };
  on("#ceEu", b => salvar({ decisao: "eu", estado: "aberto" }, b, "Fica com você"));
  on("#ceFeito", b => salvar({ estado: "feito" }, b, "Marcado como respondido"));
  on("#ceCancela", b => salvar({ decisao: "pendente", estado: "aberto" }, b, "Envio cancelado"));
  on("#ceArq", b => salvar({ decisao: "arquivado", estado: "feito" }, b, "Arquivado"));
  on("[data-cconta-em]", b => sheetConta(b.dataset.ccontaEm));
}

/* ---------- Conteúdo ---------- */
function cCartaoPeca(p, comTarefa){
  const h = cHoje(), z = cPrazo(p), atras = z && z < h;
  const det = comTarefa ? [C_CONTA_CURTA[p.conta], cFormato(p.formato), `publica ${cDia(p.dia).toLowerCase()}`].join(", ")
    : [C_CONTA_CURTA[p.conta], cFormato(p.formato), p.hora ? hm(p.hora) : ""].filter(Boolean).join(", ");
  const cls = p.estado === "publicado" ? "mute" : cPronta(p) ? "ok" : atras ? "warn" : ["revisao_texto","revisao_design"].includes(p.estado) ? "wait" : "";
  const titulo = comTarefa ? `${C_TAREFA[p.estado]}` : p.titulo;
  return `<button class="card c-card" data-cpeca="${p.id}"><div class="row"><span class="title">${esc(titulo)}</span><span class="pill ${cls}">${comTarefa ? (atras ? "atrasada" : cEstado(p.estado)) : cEstado(p.estado)}</span></div>
    ${comTarefa ? `<p class="c-peca-t">${esc(p.titulo)}</p>` : ""}<p class="sub">${esc(det)}</p></button>`;
}
function cConteudo(){
  const h = cHoje(), lim = dkey(addDays(new Date(), 14));
  const base = C.pecas.filter(p => C.conta === "todas" || p.conta === C.conta);
  const conta = k => C.pecas.filter(p => (k === "todas" || p.conta === k) && p.estado !== "publicado").length;
  const grupo = (titulo, lista, tarefa) => lista.length ? `<p class="c-grupo">${titulo}</p><div class="cards c-cards">${lista.map(p => cCartaoPeca(p, tarefa)).join("")}</div>` : "";
  const topo = `<div class="chips">${[["todas","Todas"],["atelier","Atelier"],["loja","Loja"],["blog","Blog"]].map(([k, l]) =>
      `<button data-cconta-f="${k}" aria-pressed="${C.conta === k}">${l} <span class="tnum">${conta(k)}</span></button>`).join("")}</div>
    <div class="seg c-vis" role="group" aria-label="Ver">${[["etapas","Etapas"],["calendario","Calendário"]].map(([k, l]) => `<button data-ccv="${k}" aria-pressed="${C.cv === k}">${l}</button>`).join("")}</div>`;
  if(C.cv === "etapas"){
    const ativas = base.filter(p => cPrazo(p)).sort((a, b) => cPrazo(a).localeCompare(cPrazo(b)) || a.dia.localeCompare(b.dia));
    const sem = dkey(addDays(new Date(), 7));
    const atras = ativas.filter(p => cPrazo(p) < h), hoje = ativas.filter(p => cPrazo(p) === h);
    const semana = ativas.filter(p => cPrazo(p) > h && cPrazo(p) <= sem), depois = ativas.filter(p => cPrazo(p) > sem);
    const porDia = {}; semana.forEach(p => (porDia[cPrazo(p)] ||= []).push(p));
    return topo + `<div class="daybar"><p class="sub">${ativas.length ? plural(ativas.length, "etapa em andamento", "etapas em andamento") : "Nenhuma etapa em andamento"}</p><button class="addbtn" data-cpeca="novo">Nova</button></div>
      ${grupo("Atrasadas", atras, true)}${grupo("Para hoje", hoje, true)}
      ${Object.keys(porDia).sort().map(k => grupo(`Até ${cDia(k).toLowerCase()}`, porDia[k], true)).join("")}
      ${grupo("Mais adiante", depois, true)}
      ${!ativas.length ? `<p class="empty">Quando uma publicação tem data, cada etapa ganha um prazo e aparece aqui.</p>` : ""}`;
  }
  const atras = base.filter(p => p.dia && p.dia < h && p.estado !== "publicado");
  const prox = base.filter(p => p.dia && p.dia >= h && p.dia <= lim);
  const depois = base.filter(p => p.dia && p.dia > lim);
  const ideias = base.filter(p => !p.dia);
  const publicadas = base.filter(p => p.dia && p.dia < h && p.estado === "publicado").reverse().slice(0, 10);
  const dias = {}; prox.forEach(p => (dias[p.dia] ||= []).push(p));
  return topo + `<div class="daybar"><p class="sub">${prox.length ? plural(prox.length, "publicação nas próximas 2 semanas", "publicações nas próximas 2 semanas") : "Nada marcado para as próximas 2 semanas"}</p><button class="addbtn" data-cpeca="novo">Nova</button></div>
    ${grupo("Atrasadas", atras)}
    ${Object.keys(dias).sort().map(k => grupo(cDia(k), dias[k])).join("")}
    ${grupo("Mais adiante", depois)}
    ${grupo("Ideias sem data", ideias)}
    ${grupo("Publicadas", publicadas)}
    ${!base.length ? `<p class="empty">Nenhuma publicação ainda. Toque em Nova para começar o calendário.</p>` : ""}`;
}
/* linha de agenda da publicação: cada etapa com o seu prazo */
function cLinhaEtapas(p){
  if(!p.dia || p.estado === "ideia") return "";
  const h = cHoje(), ordem = C_ESTADOS.map(e => e[0]), atual = ordem.indexOf(p.estado);
  const etapas = ["texto","revisao_texto","design","revisao_design","agendar","agendado"];
  return `<ol class="c-linha">${etapas.map(k => {
    const i = ordem.indexOf(k), z = cPrazoDe(p, k), feito = i < atual, agora = i === atual, atras = agora && z < h;
    return `<li class="${feito ? "feito" : agora ? "agora" : ""}${atras ? " atras" : ""}"><span class="c-marca"></span><span class="c-etapa">${C_TAREFA[k]}</span><span class="c-data tnum">${z === h ? "hoje" : dm(fromKey(z))}</span></li>`;
  }).join("")}<li class="${p.estado === "publicado" ? "feito" : ""}"><span class="c-marca"></span><span class="c-etapa">Publicação</span><span class="c-data tnum">${dm(fromKey(p.dia))}</span></li></ol>`;
}
function sheetPeca(id, diaPadrao){
  const novo = id === "novo";
  const p = novo ? { titulo: "", conta: C.conta !== "todas" ? C.conta : "atelier", formato: C.conta === "blog" ? "blog" : "feed", dia: diaPadrao || "", hora: "", estado: "texto", texto: "", link_figma: "", link_publicado: "", notas: "" } : C.pecas.find(x => x.id === id);
  if(!p) return;
  const opts = (l, v) => l.map(([k, t]) => `<option value="${k}" ${v === k ? "selected" : ""}>${t}</option>`).join("");
  const i = C_ESTADOS.findIndex(e => e[0] === p.estado), prox = !novo && p.estado !== "ideia" && i >= 0 && i < C_ESTADOS.length - 1 ? C_ESTADOS[i + 1] : null;
  sheet(`<p class="label">${novo ? "Nova publicação" : `${C_CONTA_CURTA[p.conta]}, ${cFormato(p.formato)}`}</p><h3 class="h5">${esc(p.titulo || "Publicação")}</h3>
    ${novo ? "" : cLinhaEtapas(p)}
    <form class="form" id="cpForm">
      <label class="field"><span>Título</span><input id="cp_tit" value="${esc(p.titulo)}" maxlength="200" placeholder="Grisalha e verdaccio" required></label>
      <div class="row2"><label class="field"><span>Conta</span><select id="cp_conta">${opts(C_CONTAS, p.conta)}</select></label>
        <label class="field"><span>Formato</span><select id="cp_form">${opts(C_FORMATOS, p.formato)}</select></label></div>
      <div class="row2"><label class="field"><span>Publica em</span><input id="cp_dia" type="date" value="${esc(p.dia || "")}"></label>
        <label class="field"><span>Horário</span><input id="cp_hora" type="time" value="${esc(String(p.hora || "").slice(0, 5))}"></label></div>
      <label class="field"><span>Etapa atual</span><select id="cp_est">${opts(C_ESTADOS, p.estado)}</select></label>
      <label class="field"><span>Texto ou legenda</span><textarea id="cp_txt" rows="6">${esc(p.texto || "")}</textarea></label>
      <label class="field"><span>Página no Figma</span><input id="cp_fig" type="url" value="${esc(p.link_figma || "")}" placeholder="https://www.figma.com/…"></label>
      <label class="field"><span>Link publicado</span><input id="cp_pub" type="url" value="${esc(p.link_publicado || "")}" placeholder="https://www.instagram.com/p/…"></label>
      <label class="field"><span>Anotações</span><textarea id="cp_notas">${esc(p.notas || "")}</textarea></label>
      <p class="err" id="cpErr" hidden></p>
      <div class="btns">${prox ? `<button class="btn pri" type="button" id="cpAvanca">${esc(C_TAREFA[p.estado] ? `Concluir: ${C_TAREFA[p.estado].toLowerCase()}` : `Passar para ${prox[1].toLowerCase()}`)}</button>` : ""}
        <button class="btn ${prox ? "ghost" : "pri"}" type="submit">Salvar</button>
        ${!novo && p.link_figma ? `<a class="btn ghost c-link" href="${esc(p.link_figma)}" target="_blank" rel="noopener">Abrir no Figma</a>` : ""}
        ${novo ? "" : `<button class="btn ghost dperigo" type="button" id="cpApagar">Apagar</button>`}
        <button class="btn ghost" type="button" data-close>Cancelar</button></div>
    </form>`);
  const ler = () => ({ titulo: $("#cp_tit").value.trim(), conta: $("#cp_conta").value, formato: $("#cp_form").value, dia: $("#cp_dia").value || null,
    hora: $("#cp_hora").value || null, estado: $("#cp_est").value, texto: $("#cp_txt").value.trim() || null, link_figma: $("#cp_fig").value.trim() || null,
    link_publicado: $("#cp_pub").value.trim() || null, notas: $("#cp_notas").value.trim() || null });
  const gravar = async (row, btn, msg) => {
    busy(btn, true);
    try{
      if(!row.titulo) throw new Error("Dê um título à publicação.");
      if(!row.dia && row.estado !== "ideia") row.estado = row.estado === "publicado" ? row.estado : "ideia";
      if(row.dia && row.estado === "ideia") row.estado = "texto";
      const { error } = novo ? await sb.from("cont_pecas").insert(row) : await sb.from("cont_pecas").update(row).eq("id", id);
      if(error) throw error;
      closeSheet(); toast(msg); loadCentral();
    }catch(ex){ const e = $("#cpErr"); e.textContent = errMsg(ex); e.hidden = false; busy(btn, false); }
  };
  $("#cp_conta").onchange = () => { if($("#cp_conta").value === "blog") $("#cp_form").value = "blog"; else if($("#cp_form").value === "blog") $("#cp_form").value = "feed"; };
  $("#cpForm").onsubmit = ev => { ev.preventDefault(); gravar(ler(), $("#cpForm button[type=submit]"), novo ? "Publicação criada" : "Publicação salva"); };
  const av = $("#cpAvanca"); if(av) av.onclick = () => gravar({ ...ler(), estado: prox[0] }, av, prox[0] === "publicado" ? "Publicada" : `Próxima etapa: ${(C_TAREFA[prox[0]] || prox[1]).toLowerCase()}`);
  const ap = $("#cpApagar"); if(ap) ap.onclick = () => cConfirmarApagar("cont_pecas", id, "esta publicação", "Publicação apagada");
}

/* ---------- Financeiro ---------- */
function cCartaoConta(c){
  const h = cHoje(), pago = !!c.pago_em, atras = !pago && c.vencimento < h;
  const det = [pago ? `paga em ${dm(fromKey(c.pago_em))}` : c.vencimento === h ? "vence hoje" : `${atras ? "venceu" : "vence"} ${dm(fromKey(c.vencimento))}`,
    c.categoria, c.frente !== "geral" ? (C_FRENTES.find(f => f[0] === c.frente) || [, ""])[1] : "", c.mensal ? "todo mês" : ""].filter(Boolean).join(", ");
  return `<button class="card c-card" data-cconta="${c.id}"><div class="row"><span class="title">${esc(c.descricao)}</span><span class="title tnum c-valor">${cBrl(c.valor)}</span></div>
    <p class="sub">${atras ? `<span class="pill warn">em atraso</span> ` : ""}${esc(det)}</p></button>`;
}
function cFinanceiro(){
  const h = cHoje(), sem = dkey(addDays(new Date(), 7)), n = new Date(), iniMes = dkey(new Date(n.getFullYear(), n.getMonth(), 1)), fimMes = dkey(new Date(n.getFullYear(), n.getMonth() + 1, 0));
  const tipo = C.fin === "receber" ? "receber" : "pagar";
  const abertas = C.contas.filter(c => !c.pago_em && (C.fin === "pagas" || c.tipo === tipo));
  const doTipo = abertas.filter(c => c.tipo === tipo);
  const atraso = doTipo.filter(c => c.vencimento < h), semana = doTipo.filter(c => c.vencimento >= h && c.vencimento <= sem);
  const mes = doTipo.filter(c => c.vencimento > sem && c.vencimento <= fimMes), depois = doTipo.filter(c => c.vencimento > fimMes);
  const pagasMes = C.contas.filter(c => c.pago_em && c.pago_em >= iniMes);
  const saiu = cSoma(pagasMes.filter(c => c.tipo === "pagar")), entrou = cSoma(pagasMes.filter(c => c.tipo === "receber"));
  const grupo = (t, l) => l.length ? `<p class="c-grupo">${t}<span class="tnum">${cBrl(cSoma(l))}</span></p><div class="cards c-cards">${l.map(cCartaoConta).join("")}</div>` : "";
  let corpo;
  if(C.fin === "pagas"){
    const pagas = C.contas.filter(c => c.pago_em).sort((a, b) => b.pago_em.localeCompare(a.pago_em));
    corpo = pagas.length ? `<div class="cards c-cards">${pagas.map(cCartaoConta).join("")}</div>` : `<p class="empty">Nenhum pagamento registrado ainda.</p>`;
  } else {
    corpo = grupo("Em atraso", atraso) + grupo("Próximos 7 dias", semana) + grupo("Até o fim do mês", mes) + grupo("Depois", depois)
      || `<p class="empty">${tipo === "pagar" ? "Nenhuma conta a pagar lançada. Comece pelas contas fixas do mês." : "Nenhum valor a receber lançado."}</p>`;
  }
  return `<div class="stats c-stats">
      <div class="stat"><b class="tnum c-stat">${cBrl(cSoma(C.contas.filter(c => !c.pago_em && c.tipo === "pagar" && c.vencimento < h)))}</b><span>a pagar<br>em atraso</span></div>
      <div class="stat"><b class="tnum c-stat">${cBrl(saiu)}</b><span>pago<br>no mês</span></div>
      <div class="stat"><b class="tnum c-stat">${cBrl(entrou)}</b><span>recebido<br>no mês</span></div>
    </div>
    <div class="chips">${[["pagar","A pagar"],["receber","A receber"],["pagas","Pagas"]].map(([k, l]) => `<button data-cfin="${k}" aria-pressed="${C.fin === k}">${l}</button>`).join("")}</div>
    <div class="daybar"><p class="sub">${C.fin === "pagas" ? "Últimos dois meses" : plural(doTipo.length, "lançamento em aberto", "lançamentos em aberto")}</p><button class="addbtn" data-cconta="novo">Lançar</button></div>
    ${corpo}
    ${cEmBreve([["Mensalidades e Círculo Alma","Pelo Asaas, com quem pagou, quem está pendente e quem atrasou"],["Vendas da loja","Pela Shopify e pela Appmax"],["Extrato do Inter","Cada entrada e saída conferida com estes lançamentos"]])}`;
}
function sheetConta(id){
  const novo = id === "novo";
  const c = novo ? { tipo: C.fin === "receber" ? "receber" : "pagar", descricao: "", valor: "", vencimento: cHoje(), categoria: "Outros", frente: "geral", mensal: false, fornecedor_id: null, notas: "", pago_em: null } : C.contas.find(x => x.id === id);
  if(!c) return;
  const opts = (l, v) => l.map(([k, t]) => `<option value="${esc(k)}" ${v === k ? "selected" : ""}>${esc(t)}</option>`).join("");
  const valorTxt = c.valor === "" ? "" : Number(c.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  sheet(`<p class="label">${novo ? "Novo lançamento" : c.pago_em ? `Paga em ${dm(fromKey(c.pago_em))}` : c.tipo === "pagar" ? "Conta a pagar" : "A receber"}</p><h3 class="h5">${esc(c.descricao || "Lançamento")}</h3>
    <form class="form" id="ccForm">
      <div class="row2"><label class="field"><span>Tipo</span><select id="cc_tipo">${opts([["pagar","A pagar"],["receber","A receber"]], c.tipo)}</select></label>
        <label class="field"><span>Valor (R$)</span><input id="cc_valor" inputmode="decimal" value="${esc(valorTxt)}" placeholder="0,00" required></label></div>
      <label class="field"><span>Descrição</span><input id="cc_desc" value="${esc(c.descricao)}" maxlength="160" placeholder="Aluguel do atelier" required></label>
      <div class="row2"><label class="field"><span>Vencimento</span><input id="cc_venc" type="date" value="${esc(c.vencimento)}" required></label>
        <label class="field"><span>Frente</span><select id="cc_frente">${opts(C_FRENTES, c.frente)}</select></label></div>
      <label class="field"><span>Categoria</span><select id="cc_cat">${opts(C_CATEGORIAS.map(x => [x, x]), c.categoria)}</select></label>
      ${C.forn.length ? `<label class="field"><span>Fornecedor (opcional)</span><select id="cc_forn"><option value="">Nenhum</option>${opts(C.forn.map(f => [f.id, f.nome]), c.fornecedor_id || "")}</select></label>` : ""}
      <label class="check"><input type="checkbox" id="cc_mensal" ${c.mensal ? "checked" : ""}>Repete todo mês (ao pagar, a do mês seguinte já fica lançada)</label>
      <label class="field"><span>Anotações</span><textarea id="cc_notas" placeholder="Código de barras, chave Pix, número da nota">${esc(c.notas || "")}</textarea></label>
      <p class="err" id="ccErr" hidden></p>
      <div class="btns"><button class="btn pri" type="submit">Salvar</button>
        ${novo ? "" : c.pago_em ? `<button class="btn ghost" type="button" id="ccDesfaz">Desfazer pagamento</button>` : `<button class="btn ghost" type="button" id="ccPaga">${c.tipo === "pagar" ? "Marcar como paga hoje" : "Marcar como recebida hoje"}</button>`}
        ${novo ? "" : `<button class="btn ghost dperigo" type="button" id="ccApagar">Apagar</button>`}
        <button class="btn ghost" type="button" data-close>Cancelar</button></div>
    </form>`);
  const ler = () => { const f = $("#cc_forn");
    return { tipo: $("#cc_tipo").value, descricao: $("#cc_desc").value.trim(), valor: cValor($("#cc_valor").value), vencimento: $("#cc_venc").value,
      frente: $("#cc_frente").value, categoria: $("#cc_cat").value, fornecedor_id: f && f.value ? f.value : null, mensal: $("#cc_mensal").checked, notas: $("#cc_notas").value.trim() || null }; };
  const gravar = async (row, btn, msg) => {
    busy(btn, true);
    try{
      if(!row.descricao) throw new Error("Escreva a descrição.");
      if(!(row.valor >= 0)) throw new Error("Confira o valor. Use só números, como 1.250,00.");
      if(!row.vencimento) throw new Error("Escolha o vencimento.");
      const { error } = novo ? await sb.from("fin_contas").insert(row) : await sb.from("fin_contas").update(row).eq("id", id);
      if(error) throw error;
      closeSheet(); toast(msg); loadCentral();
    }catch(ex){ const e = $("#ccErr"); e.textContent = errMsg(ex); e.hidden = false; busy(btn, false); }
  };
  $("#ccForm").onsubmit = ev => { ev.preventDefault(); gravar(ler(), $("#ccForm button[type=submit]"), novo ? "Lançado" : "Lançamento salvo"); };
  const pg = $("#ccPaga"); if(pg) pg.onclick = () => gravar({ ...ler(), pago_em: cHoje() }, pg, c.tipo === "pagar" ? (c.mensal ? "Paga. A do próximo mês já está lançada" : "Conta paga") : "Recebido");
  const dz = $("#ccDesfaz"); if(dz) dz.onclick = () => gravar({ ...ler(), pago_em: null }, dz, "Pagamento desfeito");
  const ap = $("#ccApagar"); if(ap) ap.onclick = () => cConfirmarApagar("fin_contas", id, "este lançamento", "Lançamento apagado");
}

/* ---------- Loja ---------- */
function cLoja(){
  const ativos = C.forn.filter(f => f.ativo), inativos = C.forn.filter(f => !f.ativo);
  const card = f => {
    const det = [f.prazo_dias != null ? `entrega em ${plural(f.prazo_dias, "dia", "dias")}` : "", f.pedido_minimo != null ? `pedido mínimo ${cBrl(f.pedido_minimo)}` : "", f.condicao || ""].filter(Boolean).join(", ");
    return `<button class="card c-card" data-cforn="${f.id}"><div class="row"><span class="title">${esc(f.nome)}</span>${f.ativo ? "" : `<span class="pill mute">inativo</span>`}</div>
      <p class="sub">${esc(det || "Sem prazo, pedido mínimo ou condição anotados")}</p></button>`;
  };
  return `<div class="daybar"><p class="sub">${plural(ativos.length, "fornecedor", "fornecedores")}</p><button class="addbtn" data-cforn="novo">Novo fornecedor</button></div>
    ${ativos.length ? `<div class="cards c-cards">${ativos.map(card).join("")}</div>` : `<p class="empty">Nenhum fornecedor cadastrado. O prazo de entrega, o pedido mínimo e a condição de pagamento de cada um vão orientar a reposição automática.</p>`}
    ${inativos.length ? `<p class="c-grupo">Inativos</p><div class="cards c-cards">${inativos.map(card).join("")}</div>` : ""}
    ${cEmBreve([["Pedidos da loja","Fila de separação e retiradas no atelier, com o prazo de 7 dias"],["Estoque","Saldo do Bling e venda por semana de cada item"],["Reposição","Itens perto do mínimo e rascunhos de pedido por fornecedor"]])}`;
}
function sheetFornecedor(id){
  const novo = id === "novo";
  const f = novo ? { nome: "", contato: "", email: "", whatsapp: "", prazo_dias: null, pedido_minimo: null, condicao: "", notas: "", ativo: true } : C.forn.find(x => x.id === id);
  if(!f) return;
  const min = f.pedido_minimo == null ? "" : Number(f.pedido_minimo).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  sheet(`<p class="label">${novo ? "Novo fornecedor" : "Fornecedor"}</p><h3 class="h5">${esc(f.nome || "Fornecedor")}</h3>
    <form class="form" id="cfForm">
      <label class="field"><span>Nome</span><input id="cf_nome" value="${esc(f.nome)}" maxlength="120" placeholder="Canson" required></label>
      <label class="field"><span>Contato</span><input id="cf_cont" value="${esc(f.contato || "")}" placeholder="Nome do representante"></label>
      <div class="row2"><label class="field"><span>E-mail</span><input id="cf_mail" type="email" value="${esc(f.email || "")}"></label>
        <label class="field"><span>WhatsApp</span><input id="cf_zap" inputmode="tel" value="${esc(f.whatsapp || "")}"></label></div>
      <div class="row2"><label class="field"><span>Entrega (dias)</span><input id="cf_prazo" inputmode="numeric" value="${f.prazo_dias ?? ""}" placeholder="7"></label>
        <label class="field"><span>Pedido mínimo (R$)</span><input id="cf_min" inputmode="decimal" value="${esc(min)}" placeholder="500,00"></label></div>
      <label class="field"><span>Condição de pagamento</span><input id="cf_cond" value="${esc(f.condicao || "")}" placeholder="Boleto 28 dias"></label>
      <label class="field"><span>Anotações</span><textarea id="cf_notas">${esc(f.notas || "")}</textarea></label>
      <label class="check"><input type="checkbox" id="cf_ativo" ${f.ativo ? "checked" : ""}>Fornecedor ativo</label>
      <p class="err" id="cfErr" hidden></p>
      <div class="btns"><button class="btn pri" type="submit">Salvar</button>
        ${novo ? "" : `<button class="btn ghost dperigo" type="button" id="cfApagar">Apagar</button>`}
        <button class="btn ghost" type="button" data-close>Cancelar</button></div>
    </form>`);
  $("#cfForm").onsubmit = async ev => {
    ev.preventDefault(); const btn = $("#cfForm button[type=submit]"); busy(btn, true);
    const prazo = $("#cf_prazo").value.trim(), minimo = $("#cf_min").value.trim();
    const row = { nome: $("#cf_nome").value.trim(), contato: $("#cf_cont").value.trim() || null, email: $("#cf_mail").value.trim() || null, whatsapp: $("#cf_zap").value.trim() || null,
      prazo_dias: prazo === "" ? null : parseInt(prazo, 10), pedido_minimo: minimo === "" ? null : cValor(minimo), condicao: $("#cf_cond").value.trim() || null,
      notas: $("#cf_notas").value.trim() || null, ativo: $("#cf_ativo").checked };
    try{
      if(!row.nome) throw new Error("Escreva o nome do fornecedor.");
      if(row.prazo_dias !== null && !(row.prazo_dias >= 0)) throw new Error("O prazo de entrega é um número de dias.");
      if(row.pedido_minimo !== null && !(row.pedido_minimo >= 0)) throw new Error("Confira o pedido mínimo.");
      const { error } = novo ? await sb.from("loja_fornecedores").insert(row) : await sb.from("loja_fornecedores").update(row).eq("id", id);
      if(error) throw error;
      closeSheet(); toast(novo ? "Fornecedor cadastrado" : "Fornecedor salvo"); loadCentral();
    }catch(ex){ const e = $("#cfErr"); e.textContent = errMsg(ex); e.hidden = false; busy(btn, false); }
  };
  const ap = $("#cfApagar"); if(ap) ap.onclick = () => cConfirmarApagar("loja_fornecedores", id, "este fornecedor", "Fornecedor apagado");
}

function cConfirmarApagar(tabela, id, oque, msg){
  sheet(`<p class="label">Apagar</p><h3 class="h5">Apagar ${oque}?</h3><p class="sub">Não dá para desfazer.</p>
    <div class="btns"><button class="btn pri" id="cxSim">Apagar</button><button class="btn ghost" data-close>Voltar</button></div>`);
  $("#cxSim").onclick = async () => { const b = $("#cxSim"); busy(b, true);
    const { error } = await sb.from(tabela).delete().eq("id", id);
    if(error){ busy(b, false); return toast(errMsg(error)); }
    closeSheet(); toast(msg); loadCentral(); };
}

/* resumo da Central no Hoje da equipe (só direção) */
function blocoCentralHoje(){
  if(!S.direcao || !C.pronto || C.erro) return "";
  const h = cHoje(), tres = dkey(addDays(new Date(), 3));
  const abertas = C.contas.filter(c => c.tipo === "pagar" && !c.pago_em);
  const atraso = abertas.filter(c => c.vencimento < h), logo = abertas.filter(c => c.vencimento >= h && c.vencimento <= tres);
  const etHoje = C.pecas.filter(p => cPrazo(p) === h), etAtras = C.pecas.filter(p => { const z = cPrazo(p); return z && z < h; });
  const emails = C.emails.filter(e => e.decisao === "pendente");
  const l = [];
  if(emails.length) l.push(["emails", emails.some(e => e.prioridade === "alta") ? "warn" : "", plural(emails.length, "e-mail para decidir", "e-mails para decidir"), ""]);
  if(atraso.length) l.push(["financeiro", "warn", plural(atraso.length, "conta em atraso", "contas em atraso"), cBrl(cSoma(atraso))]);
  if(logo.length) l.push(["financeiro", "", `A pagar até ${dm(fromKey(tres))}`, cBrl(cSoma(logo))]);
  if(etAtras.length) l.push(["conteudo", "warn", plural(etAtras.length, "etapa de conteúdo atrasada", "etapas de conteúdo atrasadas"), ""]);
  if(etHoje.length) l.push(["conteudo", "", plural(etHoje.length, "etapa de conteúdo para hoje", "etapas de conteúdo para hoje"), ""]);
  if(!l.length) return "";
  return `<section class="alertas"><p class="label">Central</p><div class="list alertas-l">${l.map(([s, w, t, e]) =>
    `<button class="li" data-cir="${s}"><span class="ind ${w}"></span>${esc(t)}<span class="end tnum">${esc(e)}</span></button>`).join("")}</div></section>`;
}

function bindCentral(){
  const v = document.getElementById("view"); if(!v) return;
  v.querySelectorAll("[data-csec]").forEach(b => b.onclick = () => { C.sec = b.dataset.csec; window.scrollTo(0, 0); render(); });
  v.querySelectorAll("[data-cir]").forEach(b => b.onclick = () => { C.sec = b.dataset.cir; go("central"); });
  v.querySelectorAll("[data-cconta-f]").forEach(b => b.onclick = () => { C.conta = b.dataset.ccontaF; render(); });
  v.querySelectorAll("[data-cfin]").forEach(b => b.onclick = () => { C.fin = b.dataset.cfin; render(); });
  v.querySelectorAll("[data-cpeca]").forEach(b => b.onclick = () => sheetPeca(b.dataset.cpeca));
  v.querySelectorAll("[data-cconta]").forEach(b => b.onclick = () => sheetConta(b.dataset.cconta));
  v.querySelectorAll("[data-cforn]").forEach(b => b.onclick = () => sheetFornecedor(b.dataset.cforn));
  v.querySelectorAll("[data-cemail]").forEach(b => b.onclick = () => sheetEmail(b.dataset.cemail));
  v.querySelectorAll("[data-ccv]").forEach(b => b.onclick = () => { C.cv = b.dataset.ccv; render(); });
}

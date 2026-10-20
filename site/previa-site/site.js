(function () {
  var C = window.ALMA_CONFIG || {};

  // Gaveta (menu no celular)
  var gav = document.getElementById('gaveta'), veu = document.querySelector('.veu'), abrir = document.querySelector('.nav .abrir');
  function menu(on) {
    if (!gav) return;
    gav.classList.toggle('aberta', on); veu.classList.toggle('aberto', on);
    abrir && abrir.setAttribute('aria-expanded', on ? 'true' : 'false');
    document.body.style.overflow = on ? 'hidden' : '';
    if (on) { var f = gav.querySelector('a'); f && f.focus(); } else abrir && abrir.focus();
  }
  abrir && abrir.addEventListener('click', function () { menu(true); });
  document.querySelectorAll('[data-fechar]').forEach(function (b) { b.addEventListener('click', function () { menu(false); }); });
  gav && gav.querySelectorAll('nav a').forEach(function (a) { a.addEventListener('click', function () { menu(false); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && gav && gav.classList.contains('aberta')) menu(false); });

  // Revelar ao rolar
  var rev = document.querySelectorAll('.rev');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    rev.forEach(function (el) { io.observe(el); });
  } else rev.forEach(function (el) { el.classList.add('on'); });

  // WhatsApp do atelier
  document.querySelectorAll('[data-whatsapp]').forEach(function (a) {
    if (C.whatsapp) { a.href = 'https://wa.me/' + C.whatsapp; a.target = '_blank'; a.rel = 'noopener'; }
    else a.href = 'contato.html';
  });

  // Formulários → Supabase (tabela site_contatos, só inserção)
  function enviar(dados) {
    return fetch(C.url + '/rest/v1/site_contatos', {
      method: 'POST',
      headers: { apikey: C.key, Authorization: 'Bearer ' + C.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(dados)
    }).then(function (r) { if (!r.ok) throw new Error(r.status); });
  }
  var OK = {
    whatsapp: 'Recebemos seu número. Vamos chamar você no WhatsApp para combinar a aula experimental.',
    novidades: 'Inscrição feita. Obrigado!',
    candidatura: 'Recebemos sua candidatura. Responderemos em breve.'
  };
  document.querySelectorAll('form[data-form]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var tipo = f.dataset.form, aviso = f.parentNode.querySelector('.aviso') || f.querySelector('.aviso');
      var d = { tipo: tipo, pagina: location.pathname };
      new FormData(f).forEach(function (v, k) { d[k] = String(v).trim(); });
      if (d.whatsapp !== undefined && d.whatsapp.replace(/\D/g, '').length < 10) return dizer(aviso, 'Confira o número com DDD.');
      if (d.email !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return dizer(aviso, 'Confira o e-mail.');
      if (tipo === 'candidatura' && (!d.nome || !d.mensagem)) return dizer(aviso, 'Preencha nome e carta de motivação.');
      var b = f.querySelector('button[type=submit]'); b.disabled = true;
      enviar(d).then(function () { f.reset(); dizer(aviso, OK[tipo]); })
        .catch(function () { dizer(aviso, 'Não foi possível enviar agora. Escreva para contato@almaestudosvisuais.com.br.'); })
        .finally(function () { b.disabled = false; });
    });
  });
  function dizer(el, t) { if (el) el.textContent = t; }

  // Blog: filtro por tema e busca
  var posts = document.querySelectorAll('.post'), q = document.getElementById('q'), cont = document.querySelector('.contagem'), vazio = document.querySelector('.vazio');
  if (posts.length) {
    var tag = null;
    function sem(t) { return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
    function filtrar() {
      var termo = sem(q ? q.value.trim() : ''), n = 0;
      posts.forEach(function (p) {
        var ok = (!tag || p.dataset.tag === tag) && (!termo || sem(p.textContent).indexOf(termo) >= 0);
        p.hidden = !ok; if (ok) { n++; p.classList.add('on'); }
      });
      var filtrando = tag || termo;
      cont.textContent = filtrando ? n + (n === 1 ? ' texto encontrado' : ' textos encontrados') : cont.dataset.total + ' textos publicados';
      vazio.hidden = n > 0;
    }
    document.querySelectorAll('.tags button').forEach(function (b) {
      b.addEventListener('click', function () {
        var on = b.getAttribute('aria-pressed') !== 'true';
        document.querySelectorAll('.tags button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', on ? 'true' : 'false'); tag = on ? b.dataset.tag : null; filtrar();
      });
    });
    q && q.addEventListener('input', filtrar);
  }
})();

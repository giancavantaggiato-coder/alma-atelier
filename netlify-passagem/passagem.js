/* Endereço antigo do app. Leva quem ainda abre por aqui para app.almaestudosvisuais.com.br, levando o login junto. */
(function(){
  var NOVO = "https://app.almaestudosvisuais.com.br/";
  var destino = NOVO;
  try{
    var s = JSON.parse(localStorage.getItem("alma-atelier-auth") || "null");
    var rt = s && (s.refresh_token || (s.currentSession && s.currentSession.refresh_token));
    if(rt) destino = NOVO + "#passagem=" + encodeURIComponent(rt);
  }catch(_){}
  location.replace(destino);
})();

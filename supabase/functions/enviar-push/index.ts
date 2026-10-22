// Envia os avisos pendentes (public.notificacoes) para os celulares inscritos.
// Chamada pelo próprio banco (pg_net) quando entra um aviso novo e a cada 10 min por segurança.
// As chaves ficam no Vault; quem chama precisa mandar o x-alma-segredo certo.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let cfg: Record<string, string> | null = null;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (!cfg) {
    const { data, error } = await admin.rpc("push_config");
    if (error || !data) return json({ erro: "config" }, 500);
    cfg = data as Record<string, string>;
    webpush.setVapidDetails("mailto:giancarlo@almaestudosvisuais.com.br", cfg.vapid_publica, cfg.vapid_privada);
  }
  if (req.headers.get("x-alma-segredo") !== cfg.push_segredo) return json({ erro: "nao autorizado" }, 401);

  const { data: pend } = await admin.from("notificacoes").select("*")
    .is("enviado_em", null).lt("tentativas", 5).order("criado_em").limit(100);
  if (!pend || !pend.length) return json({ enviados: 0 });

  // quem recebe: a pessoa (pelo login dela) ou toda a equipe
  const pessoaIds = [...new Set(pend.filter((n) => n.pessoa_id).map((n) => n.pessoa_id))];
  const { data: pessoas } = pessoaIds.length
    ? await admin.from("pessoas").select("id, auth_user_id").in("id", pessoaIds)
    : { data: [] };
  const userDe: Record<string, string> = {};
  (pessoas || []).forEach((p) => { if (p.auth_user_id) userDe[p.id] = p.auth_user_id; });
  const { data: eq } = await admin.from("equipe").select("auth_user_id").not("auth_user_id", "is", null);
  const equipeUsers = (eq || []).map((e) => e.auth_user_id);
  const users = [...new Set([...Object.values(userDe), ...equipeUsers])];
  const { data: subs } = users.length
    ? await admin.from("push_inscricoes").select("*").in("auth_user_id", users)
    : { data: [] };

  let enviados = 0;
  const mortas = new Set<string>();
  for (const n of pend) {
    const alvos = n.destino === "equipe" ? equipeUsers : (userDe[n.pessoa_id] ? [userDe[n.pessoa_id]] : []);
    const meus = (subs || []).filter((s) => alvos.includes(s.auth_user_id) && !mortas.has(s.endpoint));
    const payload = JSON.stringify({ title: n.titulo, body: n.corpo || "", url: n.url || "./", tag: n.chave || n.id });
    let ok = meus.length === 0, falhou = false; // sem aparelho inscrito: dá como resolvido
    for (const s of meus) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 12, urgency: "normal" });
        ok = true; enviados++;
        await admin.from("push_inscricoes").update({ usado_em: new Date().toISOString() }).eq("endpoint", s.endpoint);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) { mortas.add(s.endpoint); await admin.from("push_inscricoes").delete().eq("endpoint", s.endpoint); }
        else { falhou = true; console.error("push", code, String((e as Error).message || e).slice(0, 200)); }
      }
    }
    if (ok || !falhou) await admin.from("notificacoes").update({ enviado_em: new Date().toISOString() }).eq("id", n.id);
    else await admin.from("notificacoes").update({ tentativas: (n.tentativas || 0) + 1 }).eq("id", n.id);
  }
  return json({ avisos: pend.length, enviados });
});

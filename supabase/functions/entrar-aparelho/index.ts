// Entrar só com o e-mail num aparelho conhecido (onde o aluno já entrou antes).
// Confere o token guardado no aparelho e, se bater com o e-mail, devolve um
// token de uso único que o app troca por uma sessão normal (verifyOtp com token_hash).
// Equipe não entra por aqui. Nenhum e-mail é enviado.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "metodo" }, 405);
  let email = "", token = "";
  try {
    const b = await req.json();
    email = String(b.email || "").trim().toLowerCase();
    token = String(b.token || "");
  } catch (_) { return json({ erro: "pedido" }, 400); }
  if (!/^\S+@\S+\.\S+$/.test(email) || token.length < 32 || token.length > 200) return json({ status: "invalido" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: status, error } = await admin.rpc("conferir_aparelho", { p_email: email, p_token: token });
  if (error) return json({ erro: "servidor" }, 500);
  if (status !== "ok") return json({ status });

  const { data: link, error: e2 } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (e2 || !link?.properties?.hashed_token) return json({ erro: "servidor" }, 500);
  return json({ status: "ok", token_hash: link.properties.hashed_token });
});

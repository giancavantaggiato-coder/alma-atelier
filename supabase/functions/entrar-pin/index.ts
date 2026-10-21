// Entrar com a senha de 4 números.
// Confere a senha no banco (com limite de 5 erros) e, se estiver certa, devolve um
// token de uso único que o app troca por uma sessão normal (verifyOtp com token_hash).
// Nenhum e-mail é enviado aqui.
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
  let email = "", pin = "";
  try {
    const b = await req.json();
    email = String(b.email || "").trim().toLowerCase();
    pin = String(b.pin || "");
  } catch (_) { return json({ erro: "pedido" }, 400); }
  if (!/^\S+@\S+\.\S+$/.test(email) || !/^\d{4}$/.test(pin)) return json({ status: "invalido" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: status, error } = await admin.rpc("conferir_senha", { p_email: email, p_pin: pin });
  if (error) return json({ erro: "servidor" }, 500);
  if (status !== "ok") return json({ status });

  const { data: link, error: e2 } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (e2 || !link?.properties?.hashed_token) return json({ erro: "servidor" }, 500);
  return json({ status: "ok", token_hash: link.properties.hashed_token });
});

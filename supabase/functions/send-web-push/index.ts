import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import webpush from "npm:web-push";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const publicVapidKey = Deno.env.get("VAPID_PUBLIC_KEY") || "BHUicMvZIyz2f9F33OIj9S6EMlh-UdP39ZEl02XMqPJfXXpJM_HkIHKcS4n2k3pJ0NaXNeQkGoSHOL495TuAUMw";
const privateVapidKey = Deno.env.get("VAPID_PRIVATE_KEY") || "hB_BNDtovRl4AVceGvmsQq1txhaZPlCaeiDmZbZPY2s";

webpush.setVapidDetails(
  "mailto:suporte@xpointsolucoes.com",
  publicVapidKey,
  privateVapidKey
);

serve(async (req) => {
  return new Response(JSON.stringify({ success: true, message: "Disabled to avoid duplicate notifications (Node.js backend handles this)" }), {
    headers: { "Content-Type": "application/json" },
  });
});

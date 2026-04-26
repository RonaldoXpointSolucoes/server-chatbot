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
  try {
    const body = await req.json();
    const record = body.record; // The inserted message row from DB webhook

    if (!record || !record.tenant_id) {
      return new Response("No valid record or tenant_id", { status: 400 });
    }

    const isOutgoing = record.direction === 'outbound';
    const isSystemSender = ['bot', 'human', 'agent', 'system'].includes(record.sender_type);

    if (isOutgoing || isSystemSender) {
      return new Response(JSON.stringify({ success: true, message: "No push for outgoing messages" }), { status: 200 });
    }

    // Use service role to bypass RLS and fetch all user subscriptions for this tenant
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("tenant_id", record.tenant_id);

    if (error) {
      console.error("Error fetching subscriptions:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No subscriptions" }), { status: 200 });
    }

    // Optional: Get contact details to show their name
    let contactName = 'Novo Contato';
    let contactAvatar = undefined;
    
    if (record.contact_id) {
       const { data: contact } = await supabase.from("contacts").select("name, custom_name, phone, profile_picture_url").eq("id", record.contact_id).single();
       if (contact) {
         contactName = contact.custom_name || contact.name || `+${contact.phone}`;
         if (contact.profile_picture_url) {
             contactAvatar = contact.profile_picture_url;
         }
       }
    }

    let messageBody = record.text_content 
        ? `${record.text_content.substring(0, 100)}${record.text_content.length > 100 ? '...' : ''}` 
        : 'Nova mídia recebida';
        
    if (record.message_type === 'image') messageBody = '📷 Enviou uma imagem';
    if (record.message_type === 'audio') messageBody = '🎤 Enviou um áudio';
    if (record.message_type === 'document') messageBody = '📄 Enviou um documento';

    // Prepare notification payload
    const payload = JSON.stringify({
      title: contactName,
      body: messageBody,
      icon: contactAvatar,
      data: {
        url: `/?conversation=${record.conversation_id}`,
      }
    });

    const sendPromises = subscriptions.map((sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      return webpush.sendNotification(pushSubscription, payload).catch(async (err) => {
        console.error("Error sending push to", sub.endpoint, err);
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      });
    });

    await Promise.all(sendPromises);

    return new Response(JSON.stringify({ success: true, notified: sendPromises.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

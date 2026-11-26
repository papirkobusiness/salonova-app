/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("REMINDER_FROM_EMAIL");
  if (!supabaseUrl || !serviceRoleKey || !resendKey || !fromEmail) {
    return new Response(JSON.stringify({ error: "Missing server secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, REMINDER_FROM_EMAIL" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
  const db = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date().toISOString();
  const { data: reminders, error } = await db.from("booking_reminders")
    .select("id,booking_id,salon_id,recipient_email,send_at")
    .eq("status", "pending").lte("send_at", now).limit(100);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  let sent = 0, failed = 0;
  for (const reminder of reminders ?? []) {
    const { data: booking } = await db.from("bookings").select("client_name,booking_date,booking_time,service,status,salon_id").eq("id", reminder.booking_id).maybeSingle();
    const { data: salon } = await db.from("salons").select("name,timezone").eq("id", reminder.salon_id).maybeSingle();
    if (!booking || booking.status === "cancelled" || !salon) {
      await db.from("booking_reminders").update({ status: "cancelled" }).eq("id", reminder.id);
      continue;
    }
    const date = new Date(`${booking.booking_date}T${String(booking.booking_time).slice(0,8)}`);
    const dateLabel = new Intl.DateTimeFormat("hr-HR", { dateStyle: "full", timeZone: salon.timezone || "Europe/Zagreb" }).format(date);
    const timeLabel = String(booking.booking_time).slice(0,5);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: [reminder.recipient_email], subject: `Podsjetnik: termin u salonu ${salon.name}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#292b25"><h2>Podsjetnik na vaš termin</h2><p>Poštovani/a ${escapeHtml(booking.client_name)},</p><p>podsjećamo vas na termin u salonu <strong>${escapeHtml(salon.name)}</strong>.</p><p><strong>${escapeHtml(booking.service || "Rezervacija")}</strong><br>${escapeHtml(dateLabel)} u ${escapeHtml(timeLabel)}</p><p>Veselimo se vašem dolasku!</p></div>` })
    });
    if (response.ok) { await db.from("booking_reminders").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("id", reminder.id); sent++; }
    else { const body = await response.text(); await db.from("booking_reminders").update({ status: "failed", last_error: body.slice(0,1000) }).eq("id", reminder.id); failed++; }
  }
  return new Response(JSON.stringify({ processed: (reminders ?? []).length, sent, failed }), { headers: { ...cors, "Content-Type": "application/json" } });
});
function escapeHtml(value: unknown) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)); }

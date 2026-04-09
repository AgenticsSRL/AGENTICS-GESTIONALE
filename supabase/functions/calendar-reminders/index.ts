/**
 * Edge Function: calendar-reminders
 *
 * Da schedulare come cron job giornaliero alle 08:00 (Europe/Rome).
 *
 * Come schedulare via Supabase Dashboard:
 *   Dashboard → Edge Functions → calendar-reminders → Schedule
 *   Cron: "0 6 * * *"  (06:00 UTC = 08:00 CEST)
 *
 * In alternativa via pg_cron (SQL su Supabase):
 *   select cron.schedule(
 *     'calendar-reminders-daily',
 *     '0 6 * * *',
 *     $$select net.http_post(
 *       url := 'https://<PROJECT_REF>.supabase.co/functions/v1/calendar-reminders',
 *       headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
 *       body := '{}'::jsonb
 *     )$$
 *   );
 *
 * Secrets necessari:
 *   N8N_WEBHOOK_URL       — URL webhook n8n
 *   SUPABASE_URL          — URL progetto (automatico nelle edge functions)
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (automatico nelle edge functions)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const APP_URL = 'https://gestionale.agentics.eu'
const ADMIN_EMAIL = 'lorenzo@agentics.eu.com'

interface CalendarioEvento {
  id: string
  user_id: string
  titolo: string
  descrizione: string | null
  data_inizio: string
  data_fine: string
  ora_inizio: string
  ora_fine: string
  tipo: string
  luogo: string | null
  partecipanti: string | null
  promemoria_minuti: number | null
  colore: string
}

interface UserProfile {
  user_id: string
  nome: string | null
  cognome: string | null
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmtDateIt(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

function buildReminderHtml(opts: {
  titolo: string
  data: string
  oraInizio: string
  oraFine: string
  tipo: string
  luogo: string | null
  descrizione: string | null
  giorniMancanti: number
  recipientNome: string
}): string {
  const giorni = opts.giorniMancanti === 1 ? 'domani' : `tra ${opts.giorniMancanti} giorni`
  const tipoLabel: Record<string, string> = {
    appuntamento: 'Appuntamento',
    meeting: 'Meeting',
    scadenza: 'Scadenza',
    promemoria: 'Promemoria',
    altro: 'Altro',
  }

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Promemoria: ${esc(opts.titolo)} - Agentics</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    html,body{margin:0!important;padding:0!important;width:100%!important;background:#f4f7fb;}
    *{box-sizing:border-box;}
    table,td{border-collapse:collapse!important;}
    img{border:0;display:block;max-width:100%;}
    a{text-decoration:none;}
    @media screen and (max-width:620px){
      .container{width:100%!important;}
      .px{padding-left:16px!important;padding-right:16px!important;}
      .hero-title{font-size:24px!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f7fb;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0" class="container" style="width:620px;max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(17,24,39,0.08);">

          <tr><td style="height:6px;background:#294CCA;font-size:0;line-height:0;">&nbsp;</td></tr>

          <tr>
            <td align="center" style="padding:28px 24px 18px;">
              <img src="https://tfrkdvnboioqufwgszpi.supabase.co/storage/v1/object/public/logo%20mail/Group%2010.png" alt="Agentics" width="152" style="width:152px;height:auto;margin:0 auto;">
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:0 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#294CCA 0%,#355de8 100%);border-radius:16px;">
                <tr>
                  <td style="padding:22px 22px 20px;">
                    <div style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#c7d2fe;">
                      PROMEMORIA CALENDARIO — ${opts.giorniMancanti === 1 ? '1 GIORNO' : `${opts.giorniMancanti} GIORNI`}
                    </div>
                    <div class="hero-title" style="font-family:'DM Sans',Arial,sans-serif;font-size:28px;line-height:1.18;font-weight:800;color:#ffffff;margin-top:8px;">
                      ${opts.giorniMancanti === 1 ? 'Domani hai un evento!' : `Evento ${giorni}`}
                    </div>
                    <div style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;line-height:1.7;color:#dbe5ff;margin-top:12px;">
                      ${esc(opts.titolo)}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:28px 28px 12px;">
              <div style="font-family:'DM Sans',Arial,sans-serif;color:#475569;font-size:15px;line-height:1.8;">
                Ciao <strong style="color:#111827;">${esc(opts.recipientNome)}</strong>,<br><br>
                Questo è un promemoria automatico per l'evento in programma <strong>${esc(giorni)}</strong>.
              </div>
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:12px 28px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;">
                <tr><td style="padding:18px 18px 6px;">
                  <div style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.9px;text-transform:uppercase;color:#64748b;">dettagli evento</div>
                </td></tr>
                <tr><td style="padding:0 18px 18px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

                    <tr><td style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#64748b;font-weight:600;">Evento</td>
                          <td align="right" style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#111827;font-weight:700;">${esc(opts.titolo)}</td>
                        </tr>
                      </table>
                    </td></tr>

                    <tr><td style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#64748b;font-weight:600;">Data</td>
                          <td align="right" style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#111827;font-weight:700;">${esc(opts.data)}</td>
                        </tr>
                      </table>
                    </td></tr>

                    <tr><td style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#64748b;font-weight:600;">Orario</td>
                          <td align="right" style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#111827;font-weight:700;">${esc(opts.oraInizio)} – ${esc(opts.oraFine)}</td>
                        </tr>
                      </table>
                    </td></tr>

                    <tr><td style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#64748b;font-weight:600;">Tipo</td>
                          <td align="right" style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#111827;font-weight:700;">${esc(tipoLabel[opts.tipo] ?? opts.tipo)}</td>
                        </tr>
                      </table>
                    </td></tr>

                    ${opts.luogo ? `
                    <tr><td style="padding:12px 0 6px;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#64748b;font-weight:600;">Luogo</td>
                          <td align="right" style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#111827;font-weight:700;">${esc(opts.luogo)}</td>
                        </tr>
                      </table>
                    </td></tr>` : ''}

                    <tr><td style="padding:12px 0 6px;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#64748b;font-weight:600;">Quando</td>
                          <td align="right">
                            <span style="display:inline-block;padding:8px 12px;border-radius:999px;background:#e8efff;font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#294CCA;font-weight:800;">
                              ${esc(giorni.charAt(0).toUpperCase() + giorni.slice(1))}
                            </span>
                          </td>
                        </tr>
                      </table>
                    </td></tr>

                  </table>
                </td></tr>
              </table>
            </td>
          </tr>

          ${opts.descrizione ? `
          <tr>
            <td class="px" style="padding:18px 28px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;">
                <tr>
                  <td style="padding:18px;">
                    <div style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.9px;text-transform:uppercase;color:#64748b;margin-bottom:8px;">note</div>
                    <div style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#334155;line-height:1.7;">${esc(opts.descrizione)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : ''}

          <tr>
            <td class="px" style="padding:24px 28px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="#294CCA" style="border-radius:12px;">
                    <a href="${APP_URL}/calendario" target="_blank" style="display:inline-block;padding:15px 24px;font-family:'DM Sans',Arial,sans-serif;font-size:14px;font-weight:800;color:#ffffff;border-radius:12px;background:#294CCA;">
                      Apri il Calendario →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:24px 28px 0;">
              <div style="height:1px;background:#e2e8f0;"></div>
            </td>
          </tr>

          <tr>
            <td class="px" style="padding:18px 28px 28px;">
              <div style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#111827;font-weight:800;">Agentics</div>
              <div style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;line-height:1.7;color:#94a3b8;margin-top:6px;">
                Promemoria inviato automaticamente dal gestionale.<br>
                Ricevi questa email perché sei registrato come partecipante all'evento.
              </div>
            </td>
          </tr>

          <tr><td style="height:6px;background:#294CCA;font-size:0;line-height:0;">&nbsp;</td></tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

async function sendViaWebhook(webhookUrl: string, to: string[], subject: string, html: string) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, html }),
  })
  if (!res.ok) {
    console.error('[calendar-reminders] webhook error:', res.status, await res.text())
  }
}

serve(async () => {
  const webhookUrl = Deno.env.get('N8N_WEBHOOK_URL')
  if (!webhookUrl) {
    console.error('[calendar-reminders] N8N_WEBHOOK_URL non configurato')
    return new Response(JSON.stringify({ error: 'N8N_WEBHOOK_URL mancante' }), { status: 500 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(supabaseUrl, serviceKey)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Calcola le 3 date target: oggi+1, oggi+3, oggi+5
  const targets = [1, 3, 5].map(d => {
    const dt = new Date(today)
    dt.setDate(dt.getDate() + d)
    return { days: d, iso: dt.toISOString().slice(0, 10) }
  })

  // Carica tutti i profili utente per risolvere nome dai user_id
  const { data: profiles } = await db
    .from('user_profiles')
    .select('user_id, nome, cognome')

  const profileMap = new Map<string, UserProfile>()
  for (const p of (profiles ?? [])) {
    profileMap.set(p.user_id, p)
  }

  let sent = 0
  let errors = 0

  for (const target of targets) {
    // Carica eventi che iniziano in questa data
    const { data: eventi, error } = await db
      .from('calendario_eventi')
      .select('*')
      .eq('data_inizio', target.iso)

    if (error) {
      console.error(`[calendar-reminders] query error per ${target.iso}:`, error)
      errors++
      continue
    }

    for (const ev of (eventi ?? []) as CalendarioEvento[]) {
      // Raccoglie destinatari: partecipanti + owner evento
      const destinatari = new Set<string>()

      // Owner dell'evento — cerca il suo auth email
      const { data: authUser } = await db.auth.admin.getUserById(ev.user_id)
      if (authUser?.user?.email) destinatari.add(authUser.user.email)

      // Partecipanti (campo testo, email separate da virgola o spazio)
      if (ev.partecipanti) {
        const parts = ev.partecipanti.split(/[,;\s]+/).map((s: string) => s.trim()).filter((s: string) => s.includes('@'))
        parts.forEach((email: string) => destinatari.add(email))
      }

      if (destinatari.size === 0) {
        // Fallback: notifica admin
        destinatari.add(ADMIN_EMAIL)
      }

      const profile = profileMap.get(ev.user_id)
      const recipientNome = profile?.nome ?? 'Team'

      const html = buildReminderHtml({
        titolo: ev.titolo,
        data: fmtDateIt(ev.data_inizio),
        oraInizio: ev.ora_inizio,
        oraFine: ev.ora_fine,
        tipo: ev.tipo,
        luogo: ev.luogo,
        descrizione: ev.descrizione,
        giorniMancanti: target.days,
        recipientNome,
      })

      const subject = target.days === 1
        ? `⏰ Domani: ${ev.titolo}`
        : `📅 Tra ${target.days} giorni: ${ev.titolo}`

      await sendViaWebhook(webhookUrl, [...destinatari], subject, html)
      sent++
    }
  }

  const result = { ok: true, sent, errors, targets: targets.map(t => t.iso) }
  console.log('[calendar-reminders] done:', result)
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

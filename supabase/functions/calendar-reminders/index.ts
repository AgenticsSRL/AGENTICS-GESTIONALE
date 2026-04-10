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
  const giorni = opts.giorniMancanti === 0 ? 'oggi' : opts.giorniMancanti === 1 ? 'domani' : `tra ${opts.giorniMancanti} giorni`
  const giorniLabel = opts.giorniMancanti === 0 ? 'OGGI' : opts.giorniMancanti === 1 ? '1 GIORNO' : `${opts.giorniMancanti} GIORNI`
  const tipoLabel: Record<string, string> = {
    appuntamento: 'Appuntamento',
    meeting: 'Meeting',
    scadenza: 'Scadenza',
    promemoria: 'Promemoria',
    altro: 'Altro',
  }

  return `<!doctype html>
<html lang="it" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Promemoria: ${esc(opts.titolo)} — Agentics</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    html,body{margin:0!important;padding:0!important;width:100%!important;background:#F0F2F5;}
    *{box-sizing:border-box;-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;}
    table,td{border-collapse:collapse!important;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;}
    img{border:0;outline:none;text-decoration:none;display:block;max-width:100%;height:auto;}
    a{text-decoration:none;}
    @media screen and (max-width:600px){
      .container{width:100%!important;}
      .mob-px{padding-left:20px!important;padding-right:20px!important;}
      .mob-title{font-size:22px!important;}
      .stack,.stack td{display:block!important;width:100%!important;text-align:left!important;}
      .stack td:last-child{padding-top:4px!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#F0F2F5;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F5;">
  <tr>
    <td align="center" style="padding:40px 16px 48px;">

      <table role="presentation" width="580" cellpadding="0" cellspacing="0" border="0" class="container" style="width:580px;max-width:580px;">

        <!-- HEADER DARK -->
        <tr>
          <td style="background:#111827;padding:0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="height:3px;background:#294CCA;font-size:0;line-height:0;">&nbsp;</td></tr>
              <tr>
                <td style="padding:28px 36px 24px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td>
                        <img src="https://tfrkdvnboioqufwgszpi.supabase.co/storage/v1/object/public/logo%20mail/Group%2010.png" alt="Agentics" width="130" style="width:130px;height:auto;display:block;">
                      </td>
                      <td align="right" valign="middle">
                        <span style="display:inline-block;background:#1E293B;border:1px solid #334155;padding:5px 12px;font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.7px;text-transform:uppercase;color:#94A3B8;">
                          PROMEMORIA — ${giorniLabel}
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="mob-px" style="padding:0 36px 32px;">
                  <div class="mob-title" style="font-family:'DM Sans',Arial,sans-serif;font-size:26px;font-weight:700;line-height:1.2;color:#FFFFFF;margin:0 0 10px;">
                    ${opts.giorniMancanti === 0 ? 'Hai un evento oggi' : opts.giorniMancanti === 1 ? 'Domani hai un evento' : `Evento ${giorni}`}
                  </div>
                  <div style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;font-weight:400;color:#64748B;line-height:1.5;margin:0;">
                    ${esc(opts.titolo)}
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="background:#FFFFFF;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- saluto -->
              <tr>
                <td class="mob-px" style="padding:32px 36px 24px;border-bottom:1px solid #F1F5F9;">
                  <p style="margin:0 0 4px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:500;color:#1E293B;">
                    Ciao <strong style="font-weight:700;">${esc(opts.recipientNome)}</strong>,
                  </p>
                  <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:15px;color:#475569;line-height:1.75;">
                    Promemoria automatico per l'evento in programma <strong style="color:#1E293B;">${esc(giorni)}</strong>.
                  </p>
                </td>
              </tr>

              <!-- dettagli evento -->
              <tr>
                <td class="mob-px" style="padding:0 36px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

                    <tr><td style="padding:16px 0;border-bottom:1px solid #F1F5F9;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="stack">
                        <tr>
                          <td style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#94A3B8;white-space:nowrap;">Evento</td>
                          <td align="right" style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;font-weight:600;color:#1E293B;">${esc(opts.titolo)}</td>
                        </tr>
                      </table>
                    </td></tr>

                    <tr><td style="padding:16px 0;border-bottom:1px solid #F1F5F9;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="stack">
                        <tr>
                          <td style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#94A3B8;white-space:nowrap;">Data</td>
                          <td align="right" style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;font-weight:600;color:#1E293B;">${esc(opts.data)}</td>
                        </tr>
                      </table>
                    </td></tr>

                    <tr><td style="padding:16px 0;border-bottom:1px solid #F1F5F9;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="stack">
                        <tr>
                          <td style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#94A3B8;white-space:nowrap;">Orario</td>
                          <td align="right" style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;font-weight:600;color:#1E293B;">${esc(opts.oraInizio)} – ${esc(opts.oraFine)}</td>
                        </tr>
                      </table>
                    </td></tr>

                    <tr><td style="padding:16px 0;${opts.luogo ? 'border-bottom:1px solid #F1F5F9;' : ''}">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="stack">
                        <tr>
                          <td style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#94A3B8;white-space:nowrap;">Tipo</td>
                          <td align="right">
                            <span style="display:inline-block;padding:4px 12px;background:#EFF6FF;border:1px solid #BFDBFE;font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.3px;color:#1D4ED8;">
                              ${esc(tipoLabel[opts.tipo] ?? opts.tipo)}
                            </span>
                          </td>
                        </tr>
                      </table>
                    </td></tr>

                    ${opts.luogo ? `
                    <tr><td style="padding:16px 0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="stack">
                        <tr>
                          <td style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#94A3B8;white-space:nowrap;">Luogo</td>
                          <td align="right" style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;font-weight:600;color:#1E293B;">${esc(opts.luogo)}</td>
                        </tr>
                      </table>
                    </td></tr>` : ''}

                  </table>
                </td>
              </tr>

              ${opts.descrizione ? `
              <!-- note -->
              <tr>
                <td style="border-top:1px solid #F1F5F9;border-bottom:1px solid #F1F5F9;background:#F8FAFC;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="width:4px;background:#294CCA;font-size:0;line-height:0;">&nbsp;</td>
                      <td class="mob-px" style="padding:20px 28px;">
                        <p style="margin:0 0 4px;font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.7px;text-transform:uppercase;color:#94A3B8;">Note</p>
                        <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#334155;line-height:1.75;">${esc(opts.descrizione)}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>` : ''}

              <!-- CTA -->
              <tr>
                <td class="mob-px" style="padding:28px 36px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="background:#294CCA;">
                        <a href="${APP_URL}/calendario" target="_blank" style="display:inline-block;padding:13px 28px;font-family:'DM Sans',Arial,sans-serif;font-size:14px;font-weight:700;color:#FFFFFF;letter-spacing:0.2px;background:#294CCA;text-decoration:none;">
                          Apri il Calendario
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#F8FAFC;border:1px solid #E2E8F0;border-top:none;padding:24px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <p style="margin:0 0 4px;font-family:'DM Sans',Arial,sans-serif;font-size:13px;font-weight:700;color:#1E293B;">Agentics</p>
                  <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#94A3B8;line-height:1.6;">
                    Promemoria automatico — ricevi questa email perché sei associato all'evento.
                  </p>
                </td>
                <td align="right" valign="top">
                  <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:11px;color:#CBD5E1;">agentics.eu</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

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

  // Calcola le 4 date target: oggi, oggi+1, oggi+3, oggi+5
  const targets = [0, 1, 3, 5].map(d => {
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

      const subject = target.days === 0
        ? `🔔 Oggi: ${ev.titolo}`
        : target.days === 1
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

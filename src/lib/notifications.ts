/**
 * Notification Service — invia email tramite n8n webhook via Supabase Edge Function
 *
 * Flusso: React → supabase.functions.invoke('send-notification') → n8n webhook → email
 * URL n8n salvato nel secret Supabase: N8N_WEBHOOK_URL
 */

import { supabase } from './supabase'

/* ─── Tipi ─── */

export interface EmailParams {
  notification_label: string   // es. "NOTIFICA TASK"
  email_title: string          // es. "Nuovo task assegnato"
  email_subtitle: string       // es. "Un task ti è stato assegnato"
  recipient_name: string       // es. "Lorenzo"
  intro_text: string           // paragrafo intro
  update_type: string          // es. "Task Assegnato"
  subject: string              // es. "Fix bug login"
  reference_code: string       // es. "Progetto: Agentics Web"
  date: string                 // es. "10 Apr 2026"
  status: string               // es. "Urgente"
  message_body: string         // corpo principale del messaggio
  next_steps: string           // cosa fare adesso
  cta_url: string              // link CTA
  cta_label: string            // label bottone
  secondary_note: string       // nota secondaria
  footer_text: string          // testo footer
}

export interface NotificationPayload {
  to: string[]       // email destinatari
  subject: string    // oggetto email
  params: EmailParams
}

/* ─── Helper: escape HTML ─── */

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* ─── Builder HTML ─── */

export function buildEmailHtml(p: EmailParams): string {
  return `<!doctype html>
<html lang="it" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>${esc(p.email_title)} — Agentics</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">
  <style>
    html,body{margin:0!important;padding:0!important;width:100%!important;background:#ECEEF2;}
    *{box-sizing:border-box;-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;}
    table,td{border-collapse:collapse!important;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;}
    img{border:0;outline:none;text-decoration:none;display:block;max-width:100%;height:auto;-ms-interpolation-mode:bicubic;}
    a{text-decoration:none;}
    a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
    #MessageViewBody a{color:inherit!important;text-decoration:none!important;}
    @media screen and (max-width:600px){
      .container{width:100%!important;max-width:100%!important;}
      .mob-px{padding-left:24px!important;padding-right:24px!important;}
      .mob-title{font-size:21px!important;line-height:1.3!important;}
      .mob-text{font-size:14px!important;}
      .stack,.stack td{display:block!important;width:100%!important;text-align:left!important;}
      .stack td:last-child{padding-top:4px!important;}
      .mob-btn{display:block!important;width:100%!important;text-align:center!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#ECEEF2;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ECEEF2;">
  <tr>
    <td align="center" style="padding:40px 16px 48px;">

      <table role="presentation" width="580" cellpadding="0" cellspacing="0" border="0" class="container" style="width:580px;max-width:580px;">

        <!-- barra brand top -->
        <tr><td style="height:4px;background:#294CCA;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- logo + label — BIANCO -->
        <tr>
          <td style="background:#FFFFFF;padding:26px 36px 20px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle">
                  <img src="https://tfrkdvnboioqufwgszpi.supabase.co/storage/v1/object/public/logo%20mail/Group%2010.png" alt="Agentics" width="128" style="width:128px;height:auto;display:block;">
                </td>
                <td align="right" valign="middle">
                  <span style="display:inline-block;border:1px solid #E2E8F0;padding:4px 11px;font-family:'DM Sans',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#64748B;background:#F8FAFC;">
                    ${esc(p.notification_label)}
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- titolo — BIANCO con bordo blu bottom -->
        <tr>
          <td class="mob-px" style="background:#FFFFFF;padding:20px 36px 28px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;border-bottom:3px solid #294CCA;">
            <div class="mob-title" style="font-family:'DM Sans',Arial,sans-serif;font-size:23px;font-weight:700;line-height:1.25;color:#0F172A;margin:0 0 6px;">
              ${esc(p.email_title)}
            </div>
            <div style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#64748B;line-height:1.55;margin:0;">
              ${esc(p.email_subtitle)}
            </div>
          </td>
        </tr>

        <!-- body bianco -->
        <tr>
          <td style="background:#FFFFFF;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- saluto -->
              <tr>
                <td class="mob-px" style="padding:26px 36px 20px;border-bottom:1px solid #F1F5F9;">
                  <p style="margin:0 0 4px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:400;color:#334155;">
                    Ciao <strong style="font-weight:700;color:#0F172A;">${esc(p.recipient_name)}</strong>,
                  </p>
                  <p class="mob-text" style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:15px;color:#475569;line-height:1.75;">
                    ${esc(p.intro_text)}
                  </p>
                </td>
              </tr>

              <!-- tabella dati -->
              <tr>
                <td class="mob-px" style="padding:0 36px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

                    <tr><td style="padding:14px 0;border-bottom:1px solid #F1F5F9;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="stack"><tr>
                        <td style="font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:#94A3B8;white-space:nowrap;">Tipo</td>
                        <td align="right" style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;font-weight:600;color:#1E293B;">${esc(p.update_type)}</td>
                      </tr></table>
                    </td></tr>

                    <tr><td style="padding:14px 0;border-bottom:1px solid #F1F5F9;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="stack"><tr>
                        <td style="font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:#94A3B8;white-space:nowrap;">Oggetto</td>
                        <td align="right" style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;font-weight:600;color:#1E293B;">${esc(p.subject)}</td>
                      </tr></table>
                    </td></tr>

                    <tr><td style="padding:14px 0;border-bottom:1px solid #F1F5F9;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="stack"><tr>
                        <td style="font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:#94A3B8;white-space:nowrap;">Riferimento</td>
                        <td align="right" style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;font-weight:600;color:#1E293B;">${esc(p.reference_code)}</td>
                      </tr></table>
                    </td></tr>

                    <tr><td style="padding:14px 0;border-bottom:1px solid #F1F5F9;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="stack"><tr>
                        <td style="font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:#94A3B8;white-space:nowrap;">Data</td>
                        <td align="right" style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;font-weight:600;color:#1E293B;">${esc(p.date)}</td>
                      </tr></table>
                    </td></tr>

                    <tr><td style="padding:14px 0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="stack"><tr>
                        <td style="font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:#94A3B8;white-space:nowrap;">Stato</td>
                        <td align="right">
                          <span style="display:inline-block;padding:3px 10px;background:#EFF6FF;border:1px solid #BFDBFE;font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#1D4ED8;">
                            ${esc(p.status)}
                          </span>
                        </td>
                      </tr></table>
                    </td></tr>

                  </table>
                </td>
              </tr>

              <!-- dettaglio -->
              <tr>
                <td style="border-top:1px solid #F1F5F9;border-bottom:1px solid #F1F5F9;background:#F8FAFC;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="width:3px;background:#294CCA;font-size:0;line-height:0;">&nbsp;</td>
                      <td class="mob-px" style="padding:22px 28px;">
                        <p style="margin:0 0 8px;font-family:'DM Sans',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:#94A3B8;">Dettaglio</p>
                        <div class="mob-text" style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;line-height:1.8;color:#334155;">
                          ${p.message_body}
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- prossimi passi -->
              <tr>
                <td class="mob-px" style="padding:22px 36px;border-bottom:1px solid #F1F5F9;">
                  <p style="margin:0 0 8px;font-family:'DM Sans',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:#94A3B8;">Prossimi passi</p>
                  <p class="mob-text" style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#475569;line-height:1.75;">${esc(p.next_steps)}</p>
                </td>
              </tr>

              <!-- CTA -->
              <tr>
                <td class="mob-px" style="padding:24px 36px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="background:#294CCA;">
                        <a href="${p.cta_url}" target="_blank" class="mob-btn" style="display:inline-block;padding:12px 26px;font-family:'DM Sans',Arial,sans-serif;font-size:13px;font-weight:700;color:#FFFFFF;letter-spacing:0.3px;background:#294CCA;text-decoration:none;">
                          ${esc(p.cta_label)}
                        </a>
                      </td>
                    </tr>
                  </table>
                  ${p.secondary_note ? `<p style="margin:12px 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#94A3B8;line-height:1.6;">${esc(p.secondary_note)}</p>` : ''}
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- footer -->
        <tr>
          <td style="background:#F8FAFC;border:1px solid #E2E8F0;border-top:none;padding:18px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <p style="margin:0 0 2px;font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:700;color:#1E293B;">Agentics</p>
                  <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:11px;color:#94A3B8;line-height:1.6;">
                    Notifica automatica dal gestionale — ${esc(p.footer_text)}
                  </p>
                </td>
                <td align="right" valign="middle">
                  <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:11px;color:#CBD5E1;letter-spacing:0.3px;">agentics.eu</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- barra brand bottom -->
        <tr><td style="height:4px;background:#294CCA;font-size:0;line-height:0;">&nbsp;</td></tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>`
}

/* ─── Invia notifica tramite Edge Function ─── */

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  try {
    const html = buildEmailHtml(payload.params)
    // #region agent log
    fetch('http://127.0.0.1:7677/ingest/86fc2cc9-7fe9-449c-8120-f182727f1670',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5e512b'},body:JSON.stringify({sessionId:'5e512b',location:'notifications.ts:sendNotification',message:'sending',data:{to:payload.to,hypothesisId:'H2'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const { error } = await supabase.functions.invoke('send-notification', {
      body: { to: payload.to, subject: payload.subject, html },
    })
    // #region agent log
    fetch('http://127.0.0.1:7677/ingest/86fc2cc9-7fe9-449c-8120-f182727f1670',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5e512b'},body:JSON.stringify({sessionId:'5e512b',location:'notifications.ts:sendNotification',message:'result',data:{errorMsg:error?.message??null,hypothesisId:'H2'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (error) console.error('[notifications] send error:', error)
  } catch (err) {
    console.error('[notifications] unexpected error:', err)
  }
}

/* ─── Helpers di formato ─── */

const APP_URL = 'https://gestionale.agentics.eu'

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const today = () => new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })

/* ─── Notifiche TASK ─── */

export async function notifyTaskAssegnato(opts: {
  taskTitolo: string
  taskId: string
  progetto: string
  priorita: string
  scadenza: string | null
  assegnatarioEmail: string
  assegnatarioNome: string
}) {
  const prioritaLabel: Record<string, string> = { bassa: 'Bassa', media: 'Media', alta: 'Alta', urgente: 'URGENTE' }
  await sendNotification({
    to: [opts.assegnatarioEmail],
    subject: `Task assegnato: ${opts.taskTitolo}`,
    params: {
      notification_label: 'NOTIFICA TASK',
      email_title: 'Nuovo task assegnato',
      email_subtitle: 'Hai un nuovo task da prendere in carico',
      recipient_name: opts.assegnatarioNome,
      intro_text: `Ti è stato assegnato un nuovo task sul progetto ${opts.progetto}. Controlla i dettagli e prendilo in carico appena puoi.`,
      update_type: 'Task Assegnato',
      subject: opts.taskTitolo,
      reference_code: `Progetto: ${opts.progetto}`,
      date: today(),
      status: prioritaLabel[opts.priorita] ?? opts.priorita,
      message_body: `Il task <strong>${esc(opts.taskTitolo)}</strong> è stato assegnato a te sul progetto <strong>${esc(opts.progetto)}</strong>.<br><br>Priorità: <strong>${prioritaLabel[opts.priorita] ?? opts.priorita}</strong>${opts.scadenza ? `<br>Scadenza: <strong>${fmtDate(opts.scadenza)}</strong>` : ''}`,
      next_steps: 'Apri il gestionale, vai nella sezione Task e prendi in carico questo task.',
      cta_url: `${APP_URL}/task`,
      cta_label: 'Vai ai Task →',
      secondary_note: opts.scadenza ? `Ricorda: la scadenza è il ${fmtDate(opts.scadenza)}.` : 'Nessuna scadenza definita.',
      footer_text: 'Ricevi questa email perché ti è stato assegnato un task nel gestionale Agentics.',
    },
  })
}

export async function notifyTaskUrgente(opts: {
  taskTitolo: string
  progetto: string
  scadenza: string | null
  assegnatarioEmail: string
  assegnatarioNome: string
  adminEmail: string
}) {
  const destinatari = [...new Set([opts.assegnatarioEmail, opts.adminEmail])]
  await sendNotification({
    to: destinatari,
    subject: `🚨 Task URGENTE: ${opts.taskTitolo}`,
    params: {
      notification_label: 'ALERT URGENTE',
      email_title: 'Nuovo task urgente creato',
      email_subtitle: 'Richiede attenzione immediata',
      recipient_name: 'Team',
      intro_text: `È stato creato un nuovo task con priorità URGENTE sul progetto ${opts.progetto}. Questo task richiede attenzione immediata.`,
      update_type: 'Task Urgente',
      subject: opts.taskTitolo,
      reference_code: `Progetto: ${opts.progetto}`,
      date: today(),
      status: '🔴 URGENTE',
      message_body: `Il task <strong>${esc(opts.taskTitolo)}</strong> è stato creato con priorità <strong>URGENTE</strong> sul progetto <strong>${esc(opts.progetto)}</strong>.<br><br>Assegnato a: <strong>${esc(opts.assegnatarioEmail)}</strong>${opts.scadenza ? `<br>Scadenza: <strong>${fmtDate(opts.scadenza)}</strong>` : ''}`,
      next_steps: 'Apri il gestionale e gestisci subito questo task. La priorità è massima.',
      cta_url: `${APP_URL}/task`,
      cta_label: 'Gestisci il task →',
      secondary_note: 'Questo alert è stato generato automaticamente per un task con priorità URGENTE.',
      footer_text: 'Notifica automatica per task urgente — gestionale Agentics.',
    },
  })
}

export async function notifyTaskInReview(opts: {
  taskTitolo: string
  progetto: string
  assegnatarioEmail: string
  reviewerEmail: string
  reviewerNome: string
}) {
  await sendNotification({
    to: [opts.reviewerEmail],
    subject: `Task in review: ${opts.taskTitolo}`,
    params: {
      notification_label: 'REVIEW RICHIESTA',
      email_title: 'Task pronto per la review',
      email_subtitle: 'Un task è in attesa di revisione',
      recipient_name: opts.reviewerNome,
      intro_text: `Il task "${opts.taskTitolo}" sul progetto ${opts.progetto} è stato marcato come "In Review". Dai un'occhiata e approva o richiedi modifiche.`,
      update_type: 'Task In Review',
      subject: opts.taskTitolo,
      reference_code: `Progetto: ${opts.progetto}`,
      date: today(),
      status: 'In Review',
      message_body: `Il task <strong>${esc(opts.taskTitolo)}</strong> (progetto: <strong>${esc(opts.progetto)}</strong>) è pronto per la revisione.<br><br>Sviluppato da: <strong>${esc(opts.assegnatarioEmail)}</strong><br><br>Controlla il lavoro svolto e aggiorna lo stato di conseguenza.`,
      next_steps: 'Accedi al gestionale, apri il task e verifica il lavoro. Puoi approvarlo impostando lo stato su "Completato" oppure richiedere modifiche.',
      cta_url: `${APP_URL}/task`,
      cta_label: 'Apri il task →',
      secondary_note: 'Il task è in attesa della tua approvazione.',
      footer_text: 'Notifica automatica — gestionale Agentics.',
    },
  })
}

export async function notifyTaskCompletato(opts: {
  taskTitolo: string
  progetto: string
  assegnatarioEmail: string
  notificaEmail: string
  notificaNome: string
}) {
  await sendNotification({
    to: [opts.notificaEmail],
    subject: `Task completato: ${opts.taskTitolo}`,
    params: {
      notification_label: 'TASK COMPLETATO',
      email_title: 'Task portato a termine',
      email_subtitle: 'Un task è stato completato con successo',
      recipient_name: opts.notificaNome,
      intro_text: `Ottima notizia! Il task "${opts.taskTitolo}" sul progetto ${opts.progetto} è stato completato.`,
      update_type: 'Task Completato',
      subject: opts.taskTitolo,
      reference_code: `Progetto: ${opts.progetto}`,
      date: today(),
      status: '✅ Completato',
      message_body: `Il task <strong>${esc(opts.taskTitolo)}</strong> sul progetto <strong>${esc(opts.progetto)}</strong> è stato marcato come <strong>Completato</strong> da <strong>${esc(opts.assegnatarioEmail)}</strong>.`,
      next_steps: 'Verifica il lavoro svolto nel gestionale e procedi con i prossimi task.',
      cta_url: `${APP_URL}/task`,
      cta_label: 'Vai ai Task →',
      secondary_note: 'Il task è stato completato e rimosso dalla coda attiva.',
      footer_text: 'Notifica automatica — gestionale Agentics.',
    },
  })
}

export async function notifyTaskPartecipanteAggiunto(opts: {
  taskTitolo: string
  taskId: string
  progetto: string
  priorita: string
  scadenza: string | null
  partecipanteEmail: string
  partecipanteNome: string
}) {
  const prioritaLabel: Record<string, string> = { bassa: 'Bassa', media: 'Media', alta: 'Alta', urgente: 'URGENTE' }
  await sendNotification({
    to: [opts.partecipanteEmail],
    subject: `Sei stato aggiunto al task: ${opts.taskTitolo}`,
    params: {
      notification_label: 'NOTIFICA TASK',
      email_title: 'Aggiunto a un task',
      email_subtitle: 'Sei stato aggiunto come partecipante',
      recipient_name: opts.partecipanteNome,
      intro_text: `Sei stato aggiunto come partecipante al task "${opts.taskTitolo}" sul progetto ${opts.progetto}.`,
      update_type: 'Partecipante Aggiunto',
      subject: opts.taskTitolo,
      reference_code: `Progetto: ${opts.progetto}`,
      date: today(),
      status: prioritaLabel[opts.priorita] ?? opts.priorita,
      message_body: `Sei stato aggiunto come partecipante al task <strong>${esc(opts.taskTitolo)}</strong> sul progetto <strong>${esc(opts.progetto)}</strong>.<br><br>Priorità: <strong>${prioritaLabel[opts.priorita] ?? opts.priorita}</strong>${opts.scadenza ? `<br>Scadenza: <strong>${fmtDate(opts.scadenza)}</strong>` : ''}`,
      next_steps: 'Accedi al gestionale per visualizzare i dettagli del task e iniziare a collaborare.',
      cta_url: `${APP_URL}/task`,
      cta_label: 'Vai ai Task →',
      secondary_note: opts.scadenza ? `Scadenza: ${fmtDate(opts.scadenza)}.` : '',
      footer_text: 'Ricevi questa email perché sei stato aggiunto a un task nel gestionale Agentics.',
    },
  })
}

/* ─── Notifiche PROGETTI ─── */

const STATO_LABEL: Record<string, string> = {
  cliente_demo:   'Cliente Demo',
  demo_accettata: 'Demo Accettata',
  firmato:        '🎉 Firmato',
  completato:     'Completato',
  archiviato:     'Archiviato',
}

export async function notifyProgettoPipelineAdvance(opts: {
  progettoNome: string
  progettoId: string
  statoPrecedente: string
  statoNuovo: string
  cliente: string
  pagamentoMensile: number | null
  adminEmail: string
}) {
  const isFirmato = opts.statoNuovo === 'firmato'
  await sendNotification({
    to: [opts.adminEmail],
    subject: isFirmato
      ? `🎉 Deal won! ${opts.progettoNome} firmato`
      : `Progetto avanzato: ${opts.progettoNome} → ${STATO_LABEL[opts.statoNuovo] ?? opts.statoNuovo}`,
    params: {
      notification_label: isFirmato ? '🎉 DEAL WON' : 'AGGIORNAMENTO PROGETTO',
      email_title: isFirmato ? 'Contratto firmato!' : 'Progetto avanzato in pipeline',
      email_subtitle: isFirmato
        ? `${opts.progettoNome} è ora attivo e fatturabile`
        : `${opts.progettoNome}: ${STATO_LABEL[opts.statoPrecedente] ?? opts.statoPrecedente} → ${STATO_LABEL[opts.statoNuovo] ?? opts.statoNuovo}`,
      recipient_name: 'Lorenzo',
      intro_text: isFirmato
        ? `Ottima notizia! Il progetto "${opts.progettoNome}" per il cliente ${opts.cliente} è passato allo stato Firmato. Il contratto è attivo.`
        : `Il progetto "${opts.progettoNome}" ha avanzato nella pipeline da "${STATO_LABEL[opts.statoPrecedente] ?? opts.statoPrecedente}" a "${STATO_LABEL[opts.statoNuovo] ?? opts.statoNuovo}".`,
      update_type: 'Avanzamento Pipeline',
      subject: opts.progettoNome,
      reference_code: `Cliente: ${opts.cliente}`,
      date: today(),
      status: STATO_LABEL[opts.statoNuovo] ?? opts.statoNuovo,
      message_body: isFirmato
        ? `Il progetto <strong>${esc(opts.progettoNome)}</strong> per <strong>${esc(opts.cliente)}</strong> è ora <strong>Firmato</strong>.${opts.pagamentoMensile ? `<br><br>Entrata mensile ricorrente: <strong>€${opts.pagamentoMensile.toLocaleString('it-IT')}</strong>` : ''}<br><br>Ricordati di configurare le scadenze di fatturazione nel tab Contratto del progetto.`
        : `Il progetto <strong>${esc(opts.progettoNome)}</strong> è passato da <strong>${esc(STATO_LABEL[opts.statoPrecedente] ?? opts.statoPrecedente)}</strong> a <strong>${esc(STATO_LABEL[opts.statoNuovo] ?? opts.statoNuovo)}</strong>.`,
      next_steps: isFirmato
        ? 'Configura le milestone di fatturazione, aggiungi i task di onboarding e imposta il team sul progetto.'
        : 'Apri il progetto nel gestionale per aggiornare i dettagli e pianificare i prossimi passi.',
      cta_url: `${APP_URL}/progetti`,
      cta_label: 'Apri il progetto →',
      secondary_note: opts.pagamentoMensile && isFirmato
        ? `Ricavo mensile aggiunto al totale: €${opts.pagamentoMensile.toLocaleString('it-IT')}/mese.`
        : '',
      footer_text: 'Notifica automatica aggiornamento pipeline — gestionale Agentics.',
    },
  })
}

/* ─── Notifiche SICUREZZA ─── */

const SEVERITY_LABEL: Record<string, string> = {
  critical: '🔴 CRITICAL',
  high:     '🟠 HIGH',
  medium:   '🟡 MEDIUM',
  low:      '🟢 LOW',
}

const EVENT_LABEL: Record<string, string> = {
  geo_blocked:            'Geo-Block',
  ai_crawler_blocked:     'AI Crawler Bloccato',
  scanner_blocked:        'Scanner Tool',
  honeypot:               'Honeypot Hit',
  reconnaissance_pattern: 'Reconnaissance',
  api_enumeration:        'API Enumeration',
  rate_limit:             'Rate Limit',
  xss_attempt:            'Tentativo XSS',
  sqli_attempt:           'Tentativo SQL Injection',
  path_traversal:         'Path Traversal',
  suspicious_headers:     'Headers Sospetti',
  bot_blocked:            'Bot Bloccato',
  ua_blocked:             'User-Agent Bloccato',
}

export async function notifySecurityCritical(opts: {
  severity: string
  eventType: string
  ip: string | null
  country: string | null
  path: string | null
  blocked: boolean
  adminEmail: string
  rayId: string | null
}) {
  const eventLabel = EVENT_LABEL[opts.eventType] ?? opts.eventType
  await sendNotification({
    to: [opts.adminEmail],
    subject: `🚨 Security Alert [${opts.severity.toUpperCase()}]: ${eventLabel}`,
    params: {
      notification_label: `SECURITY ALERT — ${opts.severity.toUpperCase()}`,
      email_title: 'Attacco rilevato',
      email_subtitle: `${eventLabel} — ${opts.blocked ? 'BLOCCATO' : 'REGISTRATO'}`,
      recipient_name: 'Lorenzo',
      intro_text: `È stato rilevato un evento di sicurezza con severità ${opts.severity.toUpperCase()} sul gestionale Agentics. Controlla i dettagli e verifica che tutto sia sotto controllo.`,
      update_type: eventLabel,
      subject: opts.path ?? 'N/A',
      reference_code: opts.rayId ? `Ray ID: ${opts.rayId}` : 'N/A',
      date: new Date().toLocaleString('it-IT'),
      status: SEVERITY_LABEL[opts.severity] ?? opts.severity,
      message_body: `Tipo evento: <strong>${esc(eventLabel)}</strong><br>IP: <strong>${esc(opts.ip ?? 'N/A')}</strong><br>Paese: <strong>${esc(opts.country ?? 'N/A')}</strong><br>Path: <strong>${esc(opts.path ?? 'N/A')}</strong><br>Esito: <strong>${opts.blocked ? '⛔ BLOCCATO' : '⚠️ SOLO LOG'}</strong>`,
      next_steps: opts.severity === 'critical'
        ? 'Accedi alla dashboard Security Events per analizzare l\'attacco. Considera di bloccare l\'IP o la nazione sorgente su Cloudflare.'
        : 'Monitora la Security dashboard per verificare se si tratta di un attacco continuato.',
      cta_url: `${APP_URL}/security`,
      cta_label: 'Apri Security Events →',
      secondary_note: opts.rayId ? `Cloudflare Ray ID: ${opts.rayId}` : '',
      footer_text: 'Notifica automatica sistema di sicurezza — gestionale Agentics.',
    },
  })
}

/* ─── Notifiche CALENDARIO (usate dall'edge function cron) ─── */

export function buildCalendarReminderHtml(opts: {
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
  return buildEmailHtml({
    notification_label: 'PROMEMORIA CALENDARIO',
    email_title: opts.giorniMancanti === 1 ? 'Evento domani!' : `Evento ${giorni}`,
    email_subtitle: opts.titolo,
    recipient_name: opts.recipientNome,
    intro_text: `Hai un evento in programma ${giorni}: "${opts.titolo}". Non dimenticarti di prepararti in anticipo.`,
    update_type: 'Promemoria Evento',
    subject: opts.titolo,
    reference_code: `Tipo: ${opts.tipo}`,
    date: `${opts.data} — ${opts.oraInizio}/${opts.oraFine}`,
    status: `${giorni.charAt(0).toUpperCase() + giorni.slice(1)}`,
    message_body: `Hai un evento programmato <strong>${esc(giorni)}</strong>:<br><br><strong>${esc(opts.titolo)}</strong><br>Data: <strong>${esc(opts.data)}</strong><br>Orario: <strong>${esc(opts.oraInizio)} – ${esc(opts.oraFine)}</strong>${opts.luogo ? `<br>Luogo: <strong>${esc(opts.luogo)}</strong>` : ''}${opts.descrizione ? `<br><br>${esc(opts.descrizione)}` : ''}`,
    next_steps: 'Apri il calendario nel gestionale per visualizzare tutti i dettagli e i partecipanti.',
    cta_url: `${APP_URL}/calendario`,
    cta_label: 'Apri il Calendario →',
    secondary_note: opts.luogo ? `Luogo: ${opts.luogo}` : '',
    footer_text: 'Promemoria automatico — gestionale Agentics.',
  })
}

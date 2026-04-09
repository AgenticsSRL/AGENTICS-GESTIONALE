/**
 * Edge Function: send-notification
 *
 * Proxy tra il frontend React e il webhook n8n.
 * L'URL del webhook è nel secret Supabase: N8N_WEBHOOK_URL
 *
 * Per impostare il secret:
 *   supabase secrets set N8N_WEBHOOK_URL=https://bao02.app.n8n.cloud/webhook/18c8d619-a315-4918-9b32-e3afab4b1733
 *
 * Payload atteso (JSON body dalla richiesta):
 *   { to: string[], subject: string, html: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Gestione preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const webhookUrl = Deno.env.get('N8N_WEBHOOK_URL')
    if (!webhookUrl) {
      console.error('[send-notification] N8N_WEBHOOK_URL non configurato')
      return new Response(
        JSON.stringify({ error: 'N8N_WEBHOOK_URL secret non configurato' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await req.json() as {
      to: string | string[]
      subject: string
      html: string
    }

    if (!body.to || !body.subject || !body.html) {
      return new Response(
        JSON.stringify({ error: 'Campi obbligatori mancanti: to, subject, html' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Normalizza "to" sempre come array
    const recipients = Array.isArray(body.to) ? body.to : [body.to]

    // Chiama il webhook n8n
    const n8nResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: recipients,
        subject: body.subject,
        html: body.html,
      }),
    })

    if (!n8nResponse.ok) {
      const errText = await n8nResponse.text()
      console.error('[send-notification] n8n error:', n8nResponse.status, errText)
      return new Response(
        JSON.stringify({ error: 'Errore n8n webhook', details: errText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ ok: true, recipients }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[send-notification] exception:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

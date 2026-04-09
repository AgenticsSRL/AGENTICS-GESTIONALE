import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { notifySecurityCritical } from '../lib/notifications'

const ADMIN_EMAIL = 'lorenzo@agentics.eu.com'

const BRAND = '#005DEF'

interface SecurityEvent {
  id: string
  created_at: string
  event_type: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  ip: string | null
  country: string | null
  path: string | null
  method: string | null
  user_agent: string | null
  blocked: boolean
  details: Record<string, unknown>
  ray_id: string | null
}

const SEVERITY_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: '#FEF2F2', text: '#991B1B', border: '#FCA5A5' },
  high:     { bg: '#FFF7ED', text: '#9A3412', border: '#FDBA74' },
  medium:   { bg: '#FEFCE8', text: '#854D0E', border: '#FDE047' },
  low:      { bg: '#F0FDF4', text: '#166534', border: '#86EFAC' },
}

const EVENT_LABEL: Record<string, string> = {
  geo_blocked:            'Geo-Block',
  ai_crawler_blocked:     'AI Crawler',
  scanner_blocked:        'Scanner Tool',
  honeypot:               'Honeypot',
  reconnaissance_pattern: 'Reconnaissance',
  api_enumeration:        'API Enum',
  rate_limit:             'Rate Limit',
  xss_attempt:            'XSS',
  sqli_attempt:           'SQL Injection',
  path_traversal:         'Path Traversal',
  suspicious_headers:     'Headers Sospetti',
  bot_blocked:            'Bot Bloccato',
  ua_blocked:             'UA Bloccato',
}

const FLAG: Record<string, string> = {
  IT:'🇮🇹', DE:'🇩🇪', FR:'🇫🇷', ES:'🇪🇸', GB:'🇬🇧', US:'🇺🇸', CN:'🇨🇳',
  RU:'🇷🇺', KP:'🇰🇵', IR:'🇮🇷', BY:'🇧🇾', SY:'🇸🇾', VN:'🇻🇳', PK:'🇵🇰',
  BD:'🇧🇩', NG:'🇳🇬', NL:'🇳🇱', BE:'🇧🇪', AT:'🇦🇹', CH:'🇨🇭', SE:'🇸🇪',
}

export const SecurityEventsPage = () => {
  const [events, setEvents] = useState<SecurityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(true)
  const [filterSeverity, setFilterSeverity] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [newEventFlash, setNewEventFlash] = useState(false)
  const tableBottomRef = useRef<HTMLDivElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // Suono alert per eventi critici
  const playAlert = (severity: string) => {
    if (severity !== 'critical' && severity !== 'high') return
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      const ctx = audioCtxRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = severity === 'critical' ? 880 : 660
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.3)
    } catch {
      // browser può bloccare AudioContext senza interazione
    }
  }

  // Carica eventi iniziali (ultimi 200)
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('security_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      if (!error && data) setEvents(data as SecurityEvent[])
      setLoading(false)
    }
    load()
  }, [])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('security_events_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'security_events' },
        (payload) => {
          const newEvent = payload.new as SecurityEvent
          setEvents(prev => [newEvent, ...prev].slice(0, 500))
          setNewEventFlash(true)
          setTimeout(() => setNewEventFlash(false), 800)
          playAlert(newEvent.severity)
          // Notifica email per eventi critical e high
          if (newEvent.severity === 'critical' || newEvent.severity === 'high') {
            notifySecurityCritical({
              severity: newEvent.severity,
              eventType: newEvent.event_type,
              ip: newEvent.ip,
              country: newEvent.country,
              path: newEvent.path,
              blocked: newEvent.blocked,
              adminEmail: ADMIN_EMAIL,
              rayId: newEvent.ray_id,
            })
          }
          if (live) {
            setTimeout(() => tableBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [live])

  const filtered = events.filter(e => {
    if (filterSeverity !== 'all' && e.severity !== filterSeverity) return false
    if (filterType !== 'all' && e.event_type !== filterType) return false
    return true
  })

  // Statistiche
  const stats = {
    total:    events.length,
    critical: events.filter(e => e.severity === 'critical').length,
    high:     events.filter(e => e.severity === 'high').length,
    blocked:  events.filter(e => e.blocked).length,
    last24h:  events.filter(e => new Date(e.created_at) > new Date(Date.now() - 86400000)).length,
  }

  const uniqueTypes = [...new Set(events.map(e => e.event_type))]

  const formatTime = (ts: string) => {
    const d = new Date(ts)
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
      ' ' + d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <p style={{ color: '#6C7F94', fontSize: 14 }}>Caricamento eventi...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1400 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ color: BRAND, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 15, fontWeight: 700, margin: 0 }}>
            Security Events
          </h2>
          <p style={{ color: '#6C7F94', fontSize: 13, margin: '4px 0 0' }}>
            Log in tempo reale di tutti gli attacchi bloccati da Cloudflare
          </p>
        </div>
        {/* Live indicator */}
        <button
          onClick={() => setLive(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
            background: live ? '#DCFCE7' : '#F3F4F6',
            color: live ? '#166534' : '#6B7280', fontSize: 13, fontWeight: 600,
          }}
        >
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: live ? '#22C55E' : '#9CA3AF',
            boxShadow: live ? '0 0 0 3px rgba(34,197,94,0.3)' : 'none',
            animation: live ? 'pulse 1.5s infinite' : 'none',
          }} />
          {live ? 'LIVE' : 'Pausa'}
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Totale', value: stats.total, color: BRAND },
          { label: 'Critici', value: stats.critical, color: '#DC2626' },
          { label: 'Alto rischio', value: stats.high, color: '#EA580C' },
          { label: 'Bloccati', value: stats.blocked, color: '#7C3AED' },
          { label: 'Ultime 24h', value: stats.last24h, color: '#0891B2' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10,
            padding: '16px 20px',
          }}>
            <p style={{ margin: 0, fontSize: 12, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
            <p style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 700, color }}>{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Filtri */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={filterSeverity}
          onChange={e => setFilterSeverity(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 13, color: '#374151', background: '#fff', cursor: 'pointer' }}
        >
          <option value="all">Tutte le severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 13, color: '#374151', background: '#fff', cursor: 'pointer' }}
        >
          <option value="all">Tutti i tipi</option>
          {uniqueTypes.map(t => (
            <option key={t} value={t}>{EVENT_LABEL[t] ?? t}</option>
          ))}
        </select>

        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#6C7F94', alignSelf: 'center' }}>
          {filtered.length} eventi
        </span>
      </div>

      {/* Tabella eventi */}
      <div style={{
        background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden',
        boxShadow: newEventFlash ? `0 0 0 3px ${BRAND}40` : 'none',
        transition: 'box-shadow 0.3s',
      }}>
        {/* Header tabella */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '160px 110px 120px 80px 80px 1fr 60px',
          padding: '10px 16px',
          background: '#F9FAFB',
          borderBottom: '1px solid #E5E7EB',
          fontSize: 11, fontWeight: 700, color: '#6C7F94',
          textTransform: 'uppercase', letterSpacing: '0.06em',
          gap: 8,
        }}>
          <span>Orario</span>
          <span>Tipo</span>
          <span>IP</span>
          <span>Paese</span>
          <span>Severity</span>
          <span>Path / Dettagli</span>
          <span>Stato</span>
        </div>

        {/* Righe */}
        <div style={{ maxHeight: 600, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
              Nessun evento trovato
            </div>
          ) : filtered.map((event, idx) => {
            const sev = SEVERITY_COLOR[event.severity] ?? SEVERITY_COLOR.low
            return (
              <div
                key={event.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 110px 120px 80px 80px 1fr 60px',
                  padding: '10px 16px',
                  borderBottom: idx < filtered.length - 1 ? '1px solid #F3F4F6' : 'none',
                  background: idx === 0 && newEventFlash ? `${sev.bg}` : '#fff',
                  transition: 'background 0.5s',
                  gap: 8,
                  alignItems: 'center',
                  fontSize: 12,
                }}
              >
                {/* Orario */}
                <span style={{ color: '#6C7F94', fontFamily: 'monospace', fontSize: 11 }}>
                  {formatTime(event.created_at)}
                </span>

                {/* Tipo */}
                <span style={{
                  background: sev.bg, color: sev.text, border: `1px solid ${sev.border}`,
                  borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 600,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {EVENT_LABEL[event.event_type] ?? event.event_type}
                </span>

                {/* IP */}
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#374151' }}>
                  {event.ip ?? '—'}
                </span>

                {/* Paese */}
                <span style={{ fontSize: 12 }}>
                  {event.country ? `${FLAG[event.country] ?? ''} ${event.country}` : '—'}
                </span>

                {/* Severity badge */}
                <span style={{
                  background: sev.bg, color: sev.text, border: `1px solid ${sev.border}`,
                  borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {event.severity}
                </span>

                {/* Path + dettagli */}
                <span style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={`${event.path ?? ''} ${JSON.stringify(event.details)}`}>
                  <span style={{ color: '#6C7F94' }}>{event.method ?? ''} </span>
                  <span>{event.path ?? ''}</span>
                  {event.details && Object.keys(event.details).length > 0 && (
                    <span style={{ color: '#9CA3AF', marginLeft: 6 }}>
                      {Object.entries(event.details).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                    </span>
                  )}
                </span>

                {/* Stato */}
                <span style={{
                  color: event.blocked ? '#DC2626' : '#059669',
                  fontWeight: 700, fontSize: 11,
                }}>
                  {event.blocked ? '⛔ BLOCK' : '⚠️ LOG'}
                </span>
              </div>
            )
          })}
          <div ref={tableBottomRef} />
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

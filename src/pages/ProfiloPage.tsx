import { useEffect, useState, useCallback } from 'react'
import { Save, Monitor, Smartphone, Tablet, Shield, Clock, Users, FolderOpen, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { UserProfile, AccessLogEntry } from '../types'
import { useCurrentRole } from '../hooks/useCurrentRole'

const BRAND = '#005DEF'

interface ProfileForm {
  nome: string
  cognome: string
  telefono: string
  ruolo: string
  azienda: string
  partita_iva: string
}

const emptyForm: ProfileForm = { nome: '', cognome: '', telefono: '', ruolo: '', azienda: '', partita_iva: '' }

interface Stats {
  clienti: number
  progettiAttivi: number
  progettiCompletati: number
  taskCompletatiMese: number
}

const emptyStats: Stats = { clienti: 0, progettiAttivi: 0, progettiCompletati: 0, taskCompletatiMese: 0 }

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function parseDevice(ua: string | null): { label: string; icon: typeof Monitor } {
  if (!ua) return { label: 'Sconosciuto', icon: Monitor }
  const lower = ua.toLowerCase()
  if (/mobile|android|iphone/.test(lower)) return { label: 'Mobile', icon: Smartphone }
  if (/ipad|tablet/.test(lower)) return { label: 'Tablet', icon: Tablet }
  return { label: 'Desktop', icon: Monitor }
}

function parseBrowser(ua: string | null): string {
  if (!ua) return 'Sconosciuto'
  if (ua.includes('Edg/')) return 'Edge'
  if (ua.includes('Chrome/')) return 'Chrome'
  if (ua.includes('Firefox/')) return 'Firefox'
  if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari'
  return 'Browser'
}

const SectionHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="mb-5">
    <h3
      className="text-xs font-bold tracking-widest uppercase"
      style={{ color: BRAND, letterSpacing: '0.08em' }}
    >
      {title}
    </h3>
    {subtitle && (
      <p className="text-xs mt-1" style={{ color: '#6C7F94' }}>{subtitle}</p>
    )}
  </div>
)

const StatCard = ({ icon: Icon, label, value, accent }: { icon: typeof Users; label: string; value: string; accent?: string }) => (
  <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', padding: '18px 20px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <Icon style={{ width: 14, height: 14, color: accent ?? BRAND }} />
      <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6C7F94' }}>{label}</span>
    </div>
    <div style={{ fontSize: 22, fontWeight: 700, color: accent ?? '#1A2332', lineHeight: 1 }}>{value}</div>
  </div>
)

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div style={{ padding: '12px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6C7F94' }}>{label}</span>
    <span style={{ fontSize: 13, color: '#1A2332', fontWeight: 500 }}>{value}</span>
  </div>
)

export const ProfiloPage = () => {
  const { role } = useCurrentRole()
  const isDeveloper = role === 'developer'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState<ProfileForm>({ ...emptyForm })
  const [email, setEmail] = useState('')
  const [createdAt, setCreatedAt] = useState('')
  const [mfaActive, setMfaActive] = useState(false)
  const [mfaApp, setMfaApp] = useState('')
  const [mfaDate, setMfaDate] = useState('')
  const [accessLog, setAccessLog] = useState<AccessLogEntry[]>([])
  const [totalAccesses, setTotalAccesses] = useState(0)
  const [stats, setStats] = useState<Stats>({ ...emptyStats })

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setEmail(user.email ?? '')
    setCreatedAt(user.created_at ?? '')

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profile) {
      setForm({
        nome: profile.nome ?? '',
        cognome: profile.cognome ?? '',
        telefono: profile.telefono ?? '',
        ruolo: profile.ruolo ?? '',
        azienda: profile.azienda ?? '',
        partita_iva: profile.partita_iva ?? '',
      })
    }
  }, [])

  const loadMfa = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors()
    const verified = data?.totp?.find(f => f.status === 'verified')
    if (verified) {
      setMfaActive(true)
      setMfaApp(verified.friendly_name ?? 'Google Authenticator')
      setMfaDate(fmtDate(verified.created_at))
    }
  }, [])

  const loadAccessLog = useCallback(async () => {
    const [{ data: log }, { count }] = await Promise.all([
      supabase
        .from('access_log')
        .select('*')
        .order('logged_in_at', { ascending: false })
        .limit(50),
      supabase
        .from('access_log')
        .select('*', { count: 'exact', head: true }),
    ])

    setAccessLog(log ?? [])
    setTotalAccesses(count ?? 0)
  }, [])

  const loadStats = useCallback(async () => {
    const now = new Date()
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

    const [
      { count: clienti },
      { count: progettiAttivi },
      { count: progettiCompletati },
      { count: taskCompletatiMese },
    ] = await Promise.all([
      supabase.from('clienti').select('*', { count: 'exact', head: true }),
      supabase.from('progetti').select('*', { count: 'exact', head: true }).in('stato', ['cliente_demo', 'demo_accettata', 'firmato']),
      supabase.from('progetti').select('*', { count: 'exact', head: true }).eq('stato', 'completato'),
      supabase.from('task').select('*', { count: 'exact', head: true }).eq('stato', 'done').gte('updated_at', firstOfMonth),
    ])

    setStats({
      clienti: clienti ?? 0,
      progettiAttivi: progettiAttivi ?? 0,
      progettiCompletati: progettiCompletati ?? 0,
      taskCompletatiMese: taskCompletatiMese ?? 0,
    })
  }, [])

  useEffect(() => {
    Promise.all([loadProfile(), loadMfa(), loadAccessLog(), loadStats()]).finally(() => setLoading(false))
  }, [loadProfile, loadMfa, loadAccessLog, loadStats])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const payload: Partial<UserProfile> & { user_id: string } = {
      user_id: user.id,
      nome: form.nome || null,
      cognome: form.cognome || null,
      telefono: form.telefono || null,
      ruolo: form.ruolo || null,
      azienda: form.azienda || null,
      partita_iva: form.partita_iva || null,
      updated_at: new Date().toISOString(),
    }

    const { data: existing } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      await supabase.from('user_profiles').update(payload).eq('user_id', user.id)
    } else {
      await supabase.from('user_profiles').insert(payload)
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const patch = (key: keyof ProfileForm, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 400 }}>
        <p className="text-sm" style={{ color: '#6C7F94' }}>Caricamento...</p>
      </div>
    )
  }

  const lastAccess = accessLog[0] ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 900 }}>

      {/* ── Profilo ── */}
      <section>
        <SectionHeader title="Profilo" subtitle="I tuoi dati personali e aziendali." />
        <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px', padding: '20px 20px 0' }}>
            {([
              ['Nome', 'nome'],
              ['Cognome', 'cognome'],
              ['Telefono', 'telefono'],
              ['Ruolo / Posizione', 'ruolo'],
              ['Azienda', 'azienda'],
              ['Partita IVA', 'partita_iva'],
            ] as [string, keyof ProfileForm][]).map(([label, key]) => (
              <div key={key} style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6C7F94', marginBottom: 6 }}>{label}</label>
                <input
                  value={form[key]}
                  onChange={e => patch(key, e.target.value)}
                  placeholder={label}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    fontSize: 13,
                    border: '1px solid #E5E7EB',
                    borderRadius: 4,
                    outline: 'none',
                    color: '#1A2332',
                    backgroundColor: '#fff',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = BRAND)}
                  onBlur={e => (e.currentTarget.style.borderColor = '#E5E7EB')}
                />
              </div>
            ))}
          </div>
          <div style={{ padding: '0 20px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 20px',
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
                backgroundColor: BRAND,
                border: 'none',
                borderRadius: 4,
                cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.7 : 1,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                transition: 'opacity 0.15s',
              }}
            >
              <Save style={{ width: 13, height: 13 }} />
              {saving ? 'Salvataggio...' : 'Salva Profilo'}
            </button>
            {saved && (
              <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>Salvato con successo</span>
            )}
          </div>
        </div>
      </section>

      {/* ── Info Account ── */}
      <section>
        <SectionHeader title="Account" subtitle="Informazioni del tuo account e sicurezza." />
        <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}>
          <InfoRow label="Email" value={email} />
          <InfoRow label="Registrato il" value={createdAt ? fmtDate(createdAt) : '—'} />
          {!isDeveloper && (
            <>
              <InfoRow
                label="Autenticazione 2FA"
                value={mfaActive ? `Attiva — ${mfaApp}` : 'Non attiva'}
              />
              {mfaActive && <InfoRow label="2FA attivata il" value={mfaDate} />}
            </>
          )}
          <InfoRow label="Accessi totali" value={String(totalAccesses)} />
        </div>
      </section>

      {/* ── Ultimo Accesso ── */}
      {lastAccess && (
        <section>
          <SectionHeader title="Ultimo Accesso" />
          <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
            <div style={{ padding: '16px 20px', borderRight: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6C7F94', marginBottom: 6 }}>
                <Clock style={{ width: 12, height: 12, display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                Data e Ora
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A2332' }}>{fmtDateTime(lastAccess.logged_in_at)}</div>
            </div>
            <div style={{ padding: '16px 20px', borderRight: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6C7F94', marginBottom: 6 }}>
                <Shield style={{ width: 12, height: 12, display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                Indirizzo IP
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A2332' }}>{lastAccess.ip_address ?? '—'}</div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {(() => {
                const d = parseDevice(lastAccess.user_agent)
                const DevIcon = d.icon
                return (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6C7F94', marginBottom: 6 }}>
                      <DevIcon style={{ width: 12, height: 12, display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                      Dispositivo
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1A2332' }}>{d.label} — {parseBrowser(lastAccess.user_agent)}</div>
                  </>
                )
              })()}
            </div>
          </div>
        </section>
      )}

      {/* ── Statistiche Personali ── */}
      <section>
        <SectionHeader title="Le tue Statistiche" subtitle="Riepilogo del mese corrente e totali." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <StatCard icon={Users} label="Clienti" value={String(stats.clienti)} />
          <StatCard icon={FolderOpen} label="Progetti attivi" value={String(stats.progettiAttivi)} accent="#15803D" />
          <StatCard icon={CheckCircle2} label="Progetti completati" value={String(stats.progettiCompletati)} accent="#1D4ED8" />
          <StatCard icon={CheckCircle2} label="Task completati (mese)" value={String(stats.taskCompletatiMese)} accent="#7C3AED" />
        </div>
      </section>

      {/* ── Storico Accessi ── */}
      <section>
        <SectionHeader title="Storico Accessi" subtitle={`Ultimi ${accessLog.length} accessi su ${totalAccesses} totali.`} />
        <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', maxHeight: 420, overflowY: 'auto' }}>
          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '200px 140px 1fr',
            padding: '10px 20px',
            borderBottom: '1px solid #E5E7EB',
            backgroundColor: '#F9FAFB',
            position: 'sticky',
            top: 0,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>Data e Ora</span>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>IP</span>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>Dispositivo</span>
          </div>

          {accessLog.length === 0 ? (
            <div style={{ padding: '24px 20px', fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
              Nessun accesso registrato
            </div>
          ) : (
            accessLog.map((entry, i) => {
              const d = parseDevice(entry.user_agent)
              const DevIcon = d.icon
              return (
                <div
                  key={entry.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '200px 140px 1fr',
                    padding: '10px 20px',
                    borderBottom: i < accessLog.length - 1 ? '1px solid #F3F4F6' : 'none',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 13, color: '#1A2332' }}>{fmtDateTime(entry.logged_in_at)}</span>
                  <span style={{ fontSize: 13, color: '#6C7F94', fontFamily: 'monospace' }}>{entry.ip_address ?? '—'}</span>
                  <span style={{ fontSize: 13, color: '#6C7F94', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <DevIcon style={{ width: 13, height: 13 }} />
                    {d.label} — {parseBrowser(entry.user_agent)}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}

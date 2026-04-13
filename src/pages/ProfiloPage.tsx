import { useEffect, useState, useCallback } from 'react'
import { Monitor, Smartphone, Tablet, Shield, Clock, Users, FolderOpen, CheckCircle2, CheckSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { isMobilePlatform } from '../lib/webauthn'
import type { AccessLogEntry, Task, StatoTask, PrioritaTask } from '../types'
import { useCurrentRole, useT } from '../hooks/useCurrentRole'
import { Badge } from '../components/ui/Badge'

const BRAND = '#005DEF'

interface ProfileData {
  nome: string | null
  cognome: string | null
  telefono: string | null
  ruolo: string | null
  azienda: string | null
  partita_iva: string | null
}

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
  const t = useT()
  const isDeveloper = role === 'developer'
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [email, setEmail] = useState('')
  const [createdAt, setCreatedAt] = useState('')
  const [mfaActive, setMfaActive] = useState(false)
  const [mfaApp, setMfaApp] = useState('')
  const [mfaDate, setMfaDate] = useState('')
  const [biometricDevice, setBiometricDevice] = useState<string | null>(null)
  const isMobile = isMobilePlatform()
  const [accessLog, setAccessLog] = useState<AccessLogEntry[]>([])
  const [totalAccesses, setTotalAccesses] = useState(0)
  const [stats, setStats] = useState<Stats>({ ...emptyStats })
  const [myTasks, setMyTasks] = useState<Task[]>([])

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setEmail(user.email ?? '')
    setCreatedAt(user.created_at ?? '')

    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (data) {
      setProfile({
        nome: data.nome ?? null,
        cognome: data.cognome ?? null,
        telefono: data.telefono ?? null,
        ruolo: data.ruolo ?? null,
        azienda: data.azienda ?? null,
        partita_iva: data.partita_iva ?? null,
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

  const loadBiometric = useCallback(async () => {
    const { data } = await supabase
      .from('webauthn_credentials')
      .select('device_name')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) setBiometricDevice(data.device_name ?? 'Dispositivo')
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

  const loadMyTasks = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('task')
      .select('*, progetti(nome)')
      .or(`assegnatario.eq.${user.email},partecipanti.cs.{${user.email}}`)
      .order('created_at', { ascending: false })
    setMyTasks(data ?? [])
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
    Promise.all([loadProfile(), loadMfa(), loadBiometric(), loadAccessLog(), loadStats(), loadMyTasks()]).finally(() => setLoading(false))
  }, [loadProfile, loadMfa, loadBiometric, loadAccessLog, loadStats, loadMyTasks])

  const statoBadge: Record<StatoTask, { label: string; color: 'gray' | 'purple' | 'blue' | 'green' }> = {
    todo:        { label: t('status.da_fare'),    color: 'gray' },
    in_progress: { label: t('status.in_corso'),   color: 'purple' },
    in_review:   { label: 'In review',            color: 'blue' },
    done:        { label: t('status.completato'), color: 'green' },
  }

  const prioritaBadge: Record<PrioritaTask, { label: string; color: 'green' | 'yellow' | 'orange' | 'red' }> = {
    bassa:   { label: t('priority.bassa'),   color: 'green' },
    media:   { label: t('priority.media'),   color: 'yellow' },
    alta:    { label: t('priority.alta'),    color: 'orange' },
    urgente: { label: t('priority.urgente'), color: 'red' },
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 400 }}>
        <p className="text-sm" style={{ color: '#6C7F94' }}>{t('common.loading')}</p>
      </div>
    )
  }

  const lastAccess = accessLog[0] ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 900 }}>

      {/* ── Profilo ── */}
      <section>
        <SectionHeader title={t('profile.title')} subtitle={t('profile.subtitle')} />
        <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}>
          {profile ? (
            <>
              <InfoRow label={t('profile.name')} value={profile.nome ?? '—'} />
              <InfoRow label={t('profile.surname')} value={profile.cognome ?? '—'} />
              <InfoRow label={t('profile.phone')} value={profile.telefono ?? '—'} />
              <InfoRow label={t('profile.role')} value={profile.ruolo ?? '—'} />
              <InfoRow label={t('profile.company')} value={profile.azienda ?? '—'} />
              <InfoRow label={t('profile.vat')} value={profile.partita_iva ?? '—'} />
            </>
          ) : (
            <div style={{ padding: '24px 20px', fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
              {t('profile.not_configured')}
            </div>
          )}
        </div>
      </section>

      {/* ── Info Account ── */}
      <section>
        <SectionHeader title={t('profile.account')} subtitle={t('profile.account_sub')} />
        <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}>
          <InfoRow label={t('profile.email')} value={email} />
          <InfoRow label={t('profile.registered')} value={createdAt ? fmtDate(createdAt) : '—'} />
          {!isDeveloper && isMobile && (
            <InfoRow
              label={t('profile.biometric')}
              value={biometricDevice ? `${t('profile.biometric_active')} — ${biometricDevice}` : t('profile.biometric_none')}
            />
          )}
          {!isDeveloper && !isMobile && (
            <>
              <InfoRow
                label={t('profile.2fa')}
                value={mfaActive ? `${t('profile.2fa_active')} — ${mfaApp}` : t('profile.2fa_inactive')}
              />
              {mfaActive && <InfoRow label={t('profile.2fa_date')} value={mfaDate} />}
            </>
          )}
          <InfoRow label={t('profile.total_accesses')} value={String(totalAccesses)} />
        </div>
      </section>

      {/* ── Ultimo Accesso ── */}
      {lastAccess && (
        <section>
          <SectionHeader title={t('profile.last_access')} />
          <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
            <div style={{ padding: '16px 20px', borderRight: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6C7F94', marginBottom: 6 }}>
                <Clock style={{ width: 12, height: 12, display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                {t('profile.date_time')}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A2332' }}>{fmtDateTime(lastAccess.logged_in_at)}</div>
            </div>
            <div style={{ padding: '16px 20px', borderRight: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6C7F94', marginBottom: 6 }}>
                <Shield style={{ width: 12, height: 12, display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                {t('profile.ip')}
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
                      {t('profile.device')}
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
        <SectionHeader title={t('profile.stats')} subtitle={t('profile.stats_sub')} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <StatCard icon={Users} label={t('profile.clients')} value={String(stats.clienti)} />
          <StatCard icon={FolderOpen} label={t('profile.active_projects')} value={String(stats.progettiAttivi)} accent="#15803D" />
          <StatCard icon={CheckCircle2} label={t('profile.done_projects')} value={String(stats.progettiCompletati)} accent="#1D4ED8" />
          <StatCard icon={CheckCircle2} label={t('profile.done_tasks_month')} value={String(stats.taskCompletatiMese)} accent="#7C3AED" />
        </div>
      </section>

      {/* ── I miei Task ── */}
      <section>
        <SectionHeader title={t('profile.my_tasks')} subtitle={t('profile.my_tasks_sub')} />
        {myTasks.length === 0 ? (
          <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', padding: '24px 20px', fontSize: 13, color: '#9CA3AF', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <CheckSquare style={{ width: 16, height: 16 }} />
            {t('profile.no_task')}
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', overflowX: 'auto' }}>
            <div style={{ minWidth: 540 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 1fr 1fr 0.9fr', padding: '10px 20px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
                {[t('task.title'), t('task.project'), t('task.status'), t('task.priority'), t('task.due')].map(h => (
                  <span key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
                ))}
              </div>
              {myTasks.map(task => {
                const sb = statoBadge[task.stato]
                const pb = prioritaBadge[task.priorita]
                return (
                  <div key={task.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 1fr 1fr 0.9fr', padding: '12px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2332' }}>{task.titolo}</div>
                      {task.descrizione && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{task.descrizione}</div>}
                    </div>
                    <span style={{ fontSize: 13, color: '#4B5563' }}>{(task.progetti as { nome?: string } | null)?.nome ?? '—'}</span>
                    <Badge label={sb.label} color={sb.color} />
                    <Badge label={pb.label} color={pb.color} />
                    <span style={{ fontSize: 13, color: '#4B5563' }}>{task.scadenza ? new Date(task.scadenza).toLocaleDateString('it-IT') : '—'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* ── Storico Accessi ── */}
      <section>
        <SectionHeader title={t('profile.access_log')} subtitle={`Ultimi ${accessLog.length} accessi su ${totalAccesses} totali.`} />
        <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', maxHeight: 420, overflowY: 'auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '200px 140px 1fr',
            padding: '10px 20px',
            borderBottom: '1px solid #E5E7EB',
            backgroundColor: '#F9FAFB',
            position: 'sticky',
            top: 0,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{t('profile.date_time')}</span>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{t('profile.ip')}</span>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{t('profile.device')}</span>
          </div>

          {accessLog.length === 0 ? (
            <div style={{ padding: '24px 20px', fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
              {t('profile.no_access')}
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

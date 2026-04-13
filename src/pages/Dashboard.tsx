import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Page } from '../components/layout/Sidebar'
import type { StatoProgetto, StatoTask, SpesaRicorrente } from '../types'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useIsMobile } from '../hooks/useIsMobile'
import { useCurrentRole, useT } from '../hooks/useCurrentRole'

const BRAND = '#005DEF'

/* ─── Types ─── */

interface Stats {
  totalClienti: number
  progettiAttivi: number
  taskInCorso: number
  ricavoMensile: number
  speseMese: number
  ricorrentiMese: number
  taskScaduti: number
  pipeline: Record<StatoProgetto, number>
  taskPerStato: Record<StatoTask, number>
}

interface RecenteProgetto {
  id: string
  nome: string
  stato: StatoProgetto
  cliente: string | null
  pagamento_mensile: number | null
}

interface TaskItem {
  id: string
  titolo: string
  scadenza: string | null
  progetto: string | null
  priorita: string
}

interface EventoItem {
  id: string
  titolo: string
  data_inizio: string
  ora_inizio: string
  tipo: string
  colore: string
}

interface AttivitaItem {
  id: string
  azione: string
  dettaglio: string | null
  created_at: string
  progetto_nome: string | null
}

/* ─── Palette (cool tones only) ─── */

const pipelineColor: Record<StatoProgetto, string> = {
  cliente_demo: '#93C5FD',
  demo_accettata: '#3B82F6',
  firmato: '#1D4ED8',
  completato: '#1E3A5F',
  archiviato: '#D1D5DB',
}

const taskStatoColor: Record<StatoTask, string> = {
  todo: '#D1D5DB',
  in_progress: '#3B82F6',
  in_review: '#1D4ED8',
  done: '#111827',
}

const prioritaWeight: Record<string, number> = { urgente: 700, alta: 600, media: 400, bassa: 400 }
const prioritaColor: Record<string, string> = { urgente: '#DC2626', alta: '#1D4ED8', media: '#6B7280', bassa: '#9CA3AF' }

/* ─── Helpers ─── */

const fmtEur = (v: number) =>
  `€ ${v.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })

const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })

/* ─── Components ─── */

const StatCard = ({ label, value, sub, onClick, compact }: {
  label: string; value: string | number; sub?: string; onClick?: () => void; compact?: boolean
}) => (
  <div
    onClick={onClick}
    style={{
      backgroundColor: '#fff', borderBottom: `2px solid ${BRAND}`,
      padding: compact ? '14px 16px' : '22px 24px',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'background-color 0.12s',
    }}
    onMouseEnter={e => { if (onClick) e.currentTarget.style.backgroundColor = '#F9FAFB' }}
    onMouseLeave={e => { if (onClick) e.currentTarget.style.backgroundColor = '#fff' }}
  >
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6B7280', marginBottom: compact ? 6 : 10 }}>{label}</div>
    <div style={{ fontSize: compact ? 22 : 30, fontWeight: 700, color: '#111827', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    {sub && !compact && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>{sub}</div>}
  </div>
)

const Section = ({ title, action, children }: {
  title: string; action?: { label: string; onClick: () => void }; children: React.ReactNode
}) => (
  <div style={{ backgroundColor: '#fff', overflow: 'hidden' }}>
    <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#111827' }}>{title}</span>
      {action && (
        <button onClick={action.onClick} style={{ fontSize: 11, color: BRAND, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, letterSpacing: '0.04em' }}>
          {action.label} &rarr;
        </button>
      )}
    </div>
    {children}
  </div>
)

const Empty = ({ text }: { text: string }) => (
  <div style={{ padding: '28px 20px', fontSize: 12, color: '#9CA3AF', textAlign: 'center' }}>{text}</div>
)

const ChartTooltipStyle = {
  contentStyle: { backgroundColor: '#111827', border: 'none', borderRadius: 0, fontSize: 12, color: '#fff', padding: '6px 12px' },
  itemStyle: { color: '#fff' },
}

/* ─── Main ─── */

interface DashboardProps { onNavigate: (p: Page) => void }

export const Dashboard = ({ onNavigate }: DashboardProps) => {
  const { role, loading: roleLoading } = useCurrentRole()
  const t = useT()
  const isAdmin = role === 'admin'
  const isDeveloper = role === 'developer'
  const [stats, setStats] = useState<Stats | null>(null)
  const [progetti, setProgetti] = useState<RecenteProgetto[]>([])
  const [taskUrgenti, setTaskUrgenti] = useState<TaskItem[]>([])
  const [taskProssimi, setTaskProssimi] = useState<TaskItem[]>([])
  const [mieiTask, setMieiTask] = useState<TaskItem[]>([])
  const [eventi, setEventi] = useState<EventoItem[]>([])
  const [attivita, setAttivita] = useState<AttivitaItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (roleLoading) return
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const userEmail = user?.email ?? null

      const oggi = new Date()
      const oggiISO = oggi.toISOString().split('T')[0]
      const fra7gg = new Date(oggi)
      fra7gg.setDate(fra7gg.getDate() + 7)
      const fra7ggISO = fra7gg.toISOString().split('T')[0]

      const inizioMese = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-01`

      const userId = user?.id ?? null

      // Per developer: ottieni prima gli ID dei progetti assegnati (più affidabile dell'!inner join)
      let devProjectIds: string[] = []
      if (isDeveloper && userId) {
        const { data: memberships } = await supabase
          .from('project_members')
          .select('project_id')
          .eq('user_id', userId)
        devProjectIds = (memberships ?? []).map((m: any) => m.project_id)
      }

      const mieiTaskQuery = isAdmin
        ? supabase.from('task').select('id, titolo, scadenza, priorita, progetti(nome)').neq('stato', 'done').order('scadenza', { ascending: true }).limit(20)
        : supabase.from('task').select('id, titolo, scadenza, priorita, progetti(nome)').neq('stato', 'done').ilike('assegnatario', `%${userEmail}%`).order('scadenza', { ascending: true }).limit(20)

      const progettiRecentiQuery = isDeveloper
        ? (devProjectIds.length > 0
            ? supabase.from('progetti').select('id, nome, stato, pagamento_mensile, clienti(nome)').in('id', devProjectIds).order('created_at', { ascending: false }).limit(6)
            : Promise.resolve({ data: [] }))
        : supabase.from('progetti').select('id, nome, stato, pagamento_mensile, clienti(nome)').order('created_at', { ascending: false }).limit(6)

      const taskUrgentiQuery = isDeveloper
        ? supabase.from('task').select('id, titolo, scadenza, priorita, progetti(nome)').in('stato', ['todo', 'in_progress']).in('priorita', ['alta', 'urgente']).ilike('assegnatario', `%${userEmail}%`).order('scadenza', { ascending: true }).limit(6)
        : supabase.from('task').select('id, titolo, scadenza, priorita, progetti(nome)').in('stato', ['todo', 'in_progress']).in('priorita', ['alta', 'urgente']).order('scadenza', { ascending: true }).limit(6)

      const taskProssimiQuery = isDeveloper
        ? supabase.from('task').select('id, titolo, scadenza, priorita, progetti(nome)').gte('scadenza', oggiISO).lte('scadenza', fra7ggISO).neq('stato', 'done').ilike('assegnatario', `%${userEmail}%`).order('scadenza', { ascending: true }).limit(8)
        : supabase.from('task').select('id, titolo, scadenza, priorita, progetti(nome)').gte('scadenza', oggiISO).lte('scadenza', fra7ggISO).neq('stato', 'done').order('scadenza', { ascending: true }).limit(8)

      const eventiQuery = isDeveloper && userId && userEmail
        ? supabase.from('calendario_eventi').select('id, titolo, data_inizio, ora_inizio, tipo, colore').gte('data_inizio', oggiISO).or(`user_id.eq.${userId},partecipanti.ilike.*${userEmail}*`).order('data_inizio', { ascending: true }).limit(5)
        : supabase.from('calendario_eventi').select('id, titolo, data_inizio, ora_inizio, tipo, colore').gte('data_inizio', oggiISO).order('data_inizio', { ascending: true }).limit(5)

      const tuttiProgettiQuery = isDeveloper
        ? (devProjectIds.length > 0
            ? supabase.from('progetti').select('id, stato, pagamento_mensile, spese_ricorrenti').in('id', devProjectIds)
            : Promise.resolve({ data: [] }))
        : supabase.from('progetti').select('id, stato, pagamento_mensile, spese_ricorrenti')

      const tuttiTaskQuery = isDeveloper && userEmail
        ? supabase.from('task').select('stato').ilike('assegnatario', `%${userEmail}%`)
        : supabase.from('task').select('stato')

      const taskScadutiQuery = isDeveloper && userEmail
        ? supabase.from('task').select('*', { count: 'exact', head: true }).lt('scadenza', oggiISO).neq('stato', 'done').ilike('assegnatario', `%${userEmail}%`)
        : supabase.from('task').select('*', { count: 'exact', head: true }).lt('scadenza', oggiISO).neq('stato', 'done')

      const [
        { count: totalClienti },
        { data: tuttiProgetti },
        { data: tuttiTask },
        { count: taskScaduti },
        { data: progettiRecenti },
        { data: taskUrgentiData },
        { data: taskProssimiData },
        { data: eventiData },
        { data: attivitaData },
        { data: speseMeseData },
        { data: mieiTaskData },
      ] = await Promise.all([
        supabase.from('clienti').select('*', { count: 'exact', head: true }),
        tuttiProgettiQuery,
        tuttiTaskQuery,
        taskScadutiQuery,
        progettiRecentiQuery,
        taskUrgentiQuery,
        taskProssimiQuery,
        eventiQuery,
        supabase.from('progetto_attivita').select('id, azione, dettaglio, created_at, progetti(nome)').order('created_at', { ascending: false }).limit(10),
        supabase.from('spese').select('importo').gte('data', inizioMese),
        mieiTaskQuery,
      ])

      const pipeline: Record<StatoProgetto, number> = { cliente_demo: 0, demo_accettata: 0, firmato: 0, completato: 0, archiviato: 0 }
      let ricavoMensile = 0
      let progettiAttivi = 0
      let ricorrentiMese = 0
      const freqDiv: Record<string, number> = { mensile: 1, trimestrale: 3, semestrale: 6, annuale: 12 }
      for (const p of tuttiProgetti ?? []) {
        pipeline[p.stato as StatoProgetto] = (pipeline[p.stato as StatoProgetto] || 0) + 1
        if (p.stato === 'firmato' || p.stato === 'demo_accettata') {
          progettiAttivi++
          ricavoMensile += Number(p.pagamento_mensile) || 0
        }
        const stored = (p as any).spese_ricorrenti as { items?: SpesaRicorrente[] } | null
        for (const r of stored?.items ?? []) {
          if (r.attiva === false) continue
          ricorrentiMese += r.importo / (freqDiv[r.frequenza ?? 'mensile'] ?? 1)
        }
      }

      // Per developer: conta tutti i progetti assegnati indipendentemente dallo stato
      if (isDeveloper) {
        progettiAttivi = (tuttiProgetti ?? []).length
      }

      const speseMese = (speseMeseData ?? []).reduce((s: number, x: any) => s + (Number(x.importo) || 0), 0)

      const taskPerStato: Record<StatoTask, number> = { todo: 0, in_progress: 0, in_review: 0, done: 0 }
      for (const taskRow of tuttiTask ?? []) {
        taskPerStato[taskRow.stato as StatoTask] = (taskPerStato[taskRow.stato as StatoTask] || 0) + 1
      }

      setStats({
        totalClienti: totalClienti ?? 0,
        progettiAttivi,
        taskInCorso: taskPerStato.in_progress,
        ricavoMensile,
        speseMese,
        ricorrentiMese,
        taskScaduti: taskScaduti ?? 0,
        pipeline,
        taskPerStato,
      })

      setProgetti((progettiRecenti ?? []).map((p: any) => ({
        id: p.id, nome: p.nome, stato: p.stato, cliente: p.clienti?.nome ?? null, pagamento_mensile: p.pagamento_mensile,
      })))

      setTaskUrgenti((taskUrgentiData ?? []).map((t: any) => ({
        id: t.id, titolo: t.titolo, scadenza: t.scadenza, priorita: t.priorita, progetto: t.progetti?.nome ?? null,
      })))

      setTaskProssimi((taskProssimiData ?? []).map((t: any) => ({
        id: t.id, titolo: t.titolo, scadenza: t.scadenza, priorita: t.priorita, progetto: t.progetti?.nome ?? null,
      })))

      setMieiTask((mieiTaskData ?? []).map((t: any) => ({
        id: t.id, titolo: t.titolo, scadenza: t.scadenza, priorita: t.priorita, progetto: t.progetti?.nome ?? null,
      })))

      setEventi((eventiData ?? []).map((e: any) => ({
        id: e.id, titolo: e.titolo, data_inizio: e.data_inizio, ora_inizio: e.ora_inizio, tipo: e.tipo, colore: e.colore,
      })))

      setAttivita((attivitaData ?? []).map((a: any) => ({
        id: a.id, azione: a.azione, dettaglio: a.dettaglio, created_at: a.created_at, progetto_nome: a.progetti?.nome ?? null,
      })))

      setLoading(false)
    }
    load()
  }, [roleLoading, isAdmin])

  const isMobile = useIsMobile()

  const pipelineLabel: Record<StatoProgetto, string> = {
    cliente_demo: t('project_status.cliente_demo'),
    demo_accettata: t('project_status.demo_accettata'),
    firmato: t('project_status.firmato'),
    completato: t('project_status.completato'),
    archiviato: t('project_status.archiviato'),
  }

  const taskStatoLabel: Record<StatoTask, string> = {
    todo: t('status.da_fare'),
    in_progress: t('status.in_corso'),
    in_review: 'In review',
    done: t('dash.done'),
  }

  const tipoEventoLabel: Record<string, string> = {
    appuntamento: t('cal.type.appuntamento'),
    meeting: 'Meeting',
    scadenza: t('cal.type.scadenza'),
    promemoria: t('cal.type.promemoria'),
    altro: t('cal.type.altro'),
  }

  const prioritaLabel = (p: string) => {
    const m: Record<string, string> = {
      bassa: t('priority.bassa'),
      media: t('priority.media'),
      alta: t('priority.alta'),
      urgente: t('priority.urgente'),
    }
    return m[p] ?? p
  }

  const daysUntil = (d: string) => {
    const diff = Math.ceil((new Date(d).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)
    if (diff === 0) return t('common.today')
    if (diff === 1) return t('dash.tomorrow')
    return `${t('dash.in_days')} ${diff}${t('dash.days')}`
  }

  if (loading) return <div style={{ color: '#6B7280', fontSize: 12, padding: 20, letterSpacing: '0.04em' }}>{t('common.loading')}</div>
  if (!stats) return null

  const pipelineTotal = Object.values(stats.pipeline).reduce((a, b) => a + b, 0)
  const taskTotal = Object.values(stats.taskPerStato).reduce((a, b) => a + b, 0)

  const pipelineData = (['cliente_demo', 'demo_accettata', 'firmato', 'completato', 'archiviato'] as StatoProgetto[])
    .filter(s => stats.pipeline[s] > 0)
    .map(s => ({ name: pipelineLabel[s], value: stats.pipeline[s], color: pipelineColor[s] }))

  const taskBarData = (['todo', 'in_progress', 'in_review', 'done'] as StatoTask[])
    .map(s => ({ name: taskStatoLabel[s], value: stats.taskPerStato[s], fill: taskStatoColor[s] }))

  /* ── Mobile layout ── */
  if (isMobile) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Alert task scaduti */}
      {stats.taskScaduti > 0 && (
        <div
          onClick={() => onNavigate('task')}
          style={{ backgroundColor: '#FEF2F2', borderLeft: '3px solid #DC2626', padding: '10px 16px', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 12, color: '#7F1D1D' }}>
            <strong>{stats.taskScaduti}</strong> task {stats.taskScaduti === 1 ? t('dash.expired') : t('dash.expired_plural')}
          </span>
        </div>
      )}

      {/* I miei task */}
      <Section
        title={isAdmin ? t('dash.active_tasks') : t('dash.my_tasks')}
        action={{ label: t('dash.all'), onClick: () => onNavigate('task') }}
      >
        {mieiTask.length === 0
          ? <Empty text={isAdmin ? t('dash.no_active') : t('dash.no_assigned')} />
          : mieiTask.map((task, i) => (
            <div key={task.id} style={{ padding: '12px 16px', borderTop: i ? '1px solid #F3F4F6' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.titolo}</div>
                {task.progetto && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{task.progetto}</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: prioritaColor[task.priorita] ?? '#6B7280' }}>
                  {prioritaLabel(task.priorita)}
                </span>
                {task.scadenza && (
                  <span style={{ fontSize: 11, color: daysUntil(task.scadenza) === t('common.today') ? '#DC2626' : '#9CA3AF', fontVariantNumeric: 'tabular-nums' }}>
                    {daysUntil(task.scadenza)}
                  </span>
                )}
              </div>
            </div>
          ))
        }
      </Section>

      {/* Progetti recenti */}
      <Section title={t('dash.recent_projects')} action={{ label: t('dash.all'), onClick: () => onNavigate('progetti') }}>
        {progetti.length === 0
          ? <Empty text={t('dash.no_projects')} />
          : progetti.slice(0, 5).map((p, i) => (
            <div key={p.id} style={{ padding: '11px 16px', borderTop: i ? '1px solid #F3F4F6' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                {p.cliente && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{p.cliente}</div>}
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: pipelineColor[p.stato] === '#D1D5DB' ? '#6B7280' : pipelineColor[p.stato], flexShrink: 0, marginLeft: 8 }}>
                {pipelineLabel[p.stato] ?? p.stato}
              </span>
            </div>
          ))
        }
      </Section>

      {/* Scadenze 7 giorni */}
      <Section title={t('dash.upcoming_due')} action={{ label: 'Task', onClick: () => onNavigate('task') }}>
        {taskProssimi.length === 0
          ? <Empty text={t('dash.no_due')} />
          : taskProssimi.map((task, i) => (
            <div key={task.id} style={{ padding: '11px 16px', borderTop: i ? '1px solid #F3F4F6' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.titolo}</div>
                {task.progetto && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{task.progetto}</div>}
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, flexShrink: 0, marginLeft: 12, color: daysUntil(task.scadenza!) === t('common.today') ? '#DC2626' : '#374151' }}>
                {daysUntil(task.scadenza!)}
              </span>
            </div>
          ))
        }
      </Section>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Alert ── */}
      {stats.taskScaduti > 0 && (
        <div
          onClick={() => onNavigate('task')}
          style={{ backgroundColor: '#FEF2F2', borderLeft: '3px solid #DC2626', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        >
          <span style={{ fontSize: 12, color: '#7F1D1D' }}>
            <strong>{stats.taskScaduti}</strong> task {stats.taskScaduti === 1 ? t('dash.expired') : t('dash.expired_plural')}
          </span>
        </div>
      )}

      {/* ── KPI ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isDeveloper ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 1, backgroundColor: '#E5E7EB' }}>
        {!isDeveloper && <StatCard label={t('dash.clients')} value={stats.totalClienti} onClick={() => onNavigate('clienti')} compact={isMobile} />}
        <StatCard label={t('dash.active_projects')} value={stats.progettiAttivi} sub={`${pipelineTotal} ${t('dash.total')}`} onClick={() => onNavigate('progetti')} compact={isMobile} />
        <StatCard label={t('dash.tasks_in_progress')} value={stats.taskInCorso} sub={`${taskTotal} ${t('dash.total')}`} onClick={() => onNavigate('task')} compact={isMobile} />
        {!isDeveloper && <StatCard label={t('dash.monthly_revenue')} value={fmtEur(stats.ricavoMensile)} sub="progetti attivi" compact={isMobile} />}
        {!isDeveloper && <StatCard label={t('dash.monthly_expenses')} value={fmtEur(stats.speseMese + stats.ricorrentiMese)} sub={`${fmtEur(stats.speseMese)} una tantum + ${fmtEur(stats.ricorrentiMese)} ricorrenti`} compact={isMobile} />}
      </div>

      {/* ── Charts ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isDeveloper ? '1fr' : '1fr 1fr', gap: 1, backgroundColor: '#E5E7EB' }}>

        {/* Pipeline donut – hidden for developer */}
        {!isDeveloper && <div style={{ backgroundColor: '#fff', padding: '20px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6B7280', marginBottom: 16 }}>{t('dash.pipeline')}</div>
          {pipelineData.length === 0
            ? <Empty text={t('dash.no_projects')} />
            : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <ResponsiveContainer width="50%" height={160}>
                  <PieChart>
                    <Pie data={pipelineData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={70} strokeWidth={0}>
                      {pipelineData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip {...ChartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  {pipelineData.map(d => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, backgroundColor: d.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: '#374151' }}>{d.name}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          }
        </div>}

        {/* Task per stato bar chart */}
        <div style={{ backgroundColor: '#fff', padding: '20px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6B7280', marginBottom: 16 }}>{t('dash.tasks_by_status')}</div>
          {taskTotal === 0
            ? <Empty text={t('task.empty')} />
            : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={taskBarData} layout="vertical" barCategoryGap={6} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <Tooltip {...ChartTooltipStyle} cursor={{ fill: '#F9FAFB' }} />
                  <Bar dataKey="value" barSize={14} radius={0}>
                    {taskBarData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </div>
      </div>

      {/* ── Progetti recenti + Task urgenti ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 1, backgroundColor: '#E5E7EB' }}>
        <Section title={t('dash.recent_projects')} action={{ label: t('dash.all'), onClick: () => onNavigate('progetti') }}>
          {progetti.length === 0
            ? <Empty text={t('dash.no_projects')} />
            : progetti.map((p, i) => (
              <div key={p.id} style={{ padding: '10px 20px', borderTop: i ? '1px solid #F3F4F6' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                  {p.cliente && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{p.cliente}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 12 }}>
                  {!isDeveloper && p.pagamento_mensile != null && p.pagamento_mensile > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{fmtEur(p.pagamento_mensile)}/m</span>
                  )}
                  <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: pipelineColor[p.stato] === '#D1D5DB' ? '#6B7280' : pipelineColor[p.stato] }}>
                    {pipelineLabel[p.stato] ?? p.stato}
                  </span>
                </div>
              </div>
            ))
          }
        </Section>

        <Section title={t('dash.urgent_tasks')} action={{ label: t('dash.all'), onClick: () => onNavigate('task') }}>
          {taskUrgenti.length === 0
            ? <Empty text={t('dash.no_urgent')} />
            : taskUrgenti.map((task, i) => (
              <div key={task.id} style={{ padding: '10px 20px', borderTop: i ? '1px solid #F3F4F6' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.titolo}</div>
                  {task.progetto && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{task.progetto}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 12 }}>
                  {task.scadenza && <span style={{ fontSize: 11, color: '#9CA3AF', fontVariantNumeric: 'tabular-nums' }}>{fmtDate(task.scadenza)}</span>}
                  <span style={{ fontSize: 10, fontWeight: prioritaWeight[task.priorita] ?? 400, textTransform: 'uppercase', letterSpacing: '0.06em', color: prioritaColor[task.priorita] ?? '#6B7280' }}>
                    {prioritaLabel(task.priorita)}
                  </span>
                </div>
              </div>
            ))
          }
        </Section>
      </div>

      {/* ── Scadenze + Eventi ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 1, backgroundColor: '#E5E7EB' }}>
        <Section title={t('dash.upcoming_due')} action={{ label: 'Task', onClick: () => onNavigate('task') }}>
          {taskProssimi.length === 0
            ? <Empty text={t('dash.no_due')} />
            : taskProssimi.map((task, i) => (
              <div key={task.id} style={{ padding: '10px 20px', borderTop: i ? '1px solid #F3F4F6' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.titolo}</div>
                  {task.progetto && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{task.progetto}</div>}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, flexShrink: 0, marginLeft: 12,
                  color: daysUntil(task.scadenza!) === t('common.today') ? '#DC2626' : '#374151',
                }}>
                  {daysUntil(task.scadenza!)}
                </span>
              </div>
            ))
          }
        </Section>

        <Section title={t('dash.upcoming_events')} action={{ label: 'Calendario', onClick: () => onNavigate('calendario') }}>
          {eventi.length === 0
            ? <Empty text={t('dash.no_events')} />
            : eventi.map((ev, i) => (
              <div key={ev.id} style={{ padding: '10px 20px', borderTop: i ? '1px solid #F3F4F6' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 3, height: 28, backgroundColor: ev.colore || BRAND, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.titolo}</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{tipoEventoLabel[ev.tipo] ?? ev.tipo}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{fmtDate(ev.data_inizio)}</div>
                  {ev.ora_inizio && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{ev.ora_inizio}</div>}
                </div>
              </div>
            ))
          }
        </Section>
      </div>

      {/* ── Attività recente ── */}
      {!isDeveloper && (
        <Section title={t('dash.recent_activity')}>
          {attivita.length === 0
            ? <Empty text={t('dash.no_activity')} />
            : attivita.map((a, i) => (
              <div key={a.id} style={{ padding: '9px 20px', borderTop: i ? '1px solid #F3F4F6' : 'none', display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0, width: 100, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtTime(a.created_at)}
                  <span style={{ marginLeft: 4 }}>{fmtDate(a.created_at)}</span>
                </span>
                <div style={{ width: 1, height: 16, backgroundColor: '#E5E7EB', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong style={{ color: '#111827' }}>{a.azione}</strong>
                  {a.dettaglio && <span> — {a.dettaglio}</span>}
                </div>
                {a.progetto_nome && (
                  <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>{a.progetto_nome}</span>
                )}
              </div>
            ))
          }
        </Section>
      )}
    </div>
  )
}

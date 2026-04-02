import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Page } from '../components/layout/Sidebar'
import type { StatoProgetto, StatoTask, SpesaRicorrente } from '../types'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

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

const pipelineLabel: Record<StatoProgetto, string> = {
  cliente_demo: 'Demo', demo_accettata: 'Accettata', firmato: 'Firmato', completato: 'Completato', archiviato: 'Archiviato',
}

const taskStatoColor: Record<StatoTask, string> = {
  todo: '#D1D5DB',
  in_progress: '#3B82F6',
  in_review: '#1D4ED8',
  done: '#111827',
}

const taskStatoLabel: Record<StatoTask, string> = {
  todo: 'Da fare', in_progress: 'In corso', in_review: 'In review', done: 'Completati',
}

const prioritaWeight: Record<string, number> = { urgente: 700, alta: 600, media: 400, bassa: 400 }
const prioritaColor: Record<string, string> = { urgente: '#DC2626', alta: '#1D4ED8', media: '#6B7280', bassa: '#9CA3AF' }

const tipoEventoLabel: Record<string, string> = {
  appuntamento: 'Appuntamento', meeting: 'Meeting', scadenza: 'Scadenza', promemoria: 'Promemoria', altro: 'Altro',
}

/* ─── Helpers ─── */

const fmtEur = (v: number) =>
  `€ ${v.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })

const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })

const daysUntil = (d: string) => {
  const diff = Math.ceil((new Date(d).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)
  if (diff === 0) return 'Oggi'
  if (diff === 1) return 'Domani'
  return `tra ${diff}gg`
}

/* ─── Components ─── */

const StatCard = ({ label, value, sub, onClick }: {
  label: string; value: string | number; sub?: string; onClick?: () => void
}) => (
  <div
    onClick={onClick}
    style={{
      backgroundColor: '#fff', borderBottom: `2px solid ${BRAND}`,
      padding: '22px 24px', cursor: onClick ? 'pointer' : 'default',
      transition: 'background-color 0.12s',
    }}
    onMouseEnter={e => { if (onClick) e.currentTarget.style.backgroundColor = '#F9FAFB' }}
    onMouseLeave={e => { if (onClick) e.currentTarget.style.backgroundColor = '#fff' }}
  >
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6B7280', marginBottom: 10 }}>{label}</div>
    <div style={{ fontSize: 30, fontWeight: 700, color: '#111827', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>{sub}</div>}
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
  const [stats, setStats] = useState<Stats | null>(null)
  const [progetti, setProgetti] = useState<RecenteProgetto[]>([])
  const [taskUrgenti, setTaskUrgenti] = useState<TaskItem[]>([])
  const [taskProssimi, setTaskProssimi] = useState<TaskItem[]>([])
  const [eventi, setEventi] = useState<EventoItem[]>([])
  const [attivita, setAttivita] = useState<AttivitaItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const oggi = new Date()
      const oggiISO = oggi.toISOString().split('T')[0]
      const fra7gg = new Date(oggi)
      fra7gg.setDate(fra7gg.getDate() + 7)
      const fra7ggISO = fra7gg.toISOString().split('T')[0]

      const inizioMese = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-01`

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
      ] = await Promise.all([
        supabase.from('clienti').select('*', { count: 'exact', head: true }),
        supabase.from('progetti').select('id, stato, pagamento_mensile, spese_ricorrenti'),
        supabase.from('task').select('stato'),
        supabase.from('task').select('*', { count: 'exact', head: true }).lt('scadenza', oggiISO).neq('stato', 'done'),
        supabase.from('progetti').select('id, nome, stato, pagamento_mensile, clienti(nome)').order('created_at', { ascending: false }).limit(6),
        supabase.from('task').select('id, titolo, scadenza, priorita, progetti(nome)').in('stato', ['todo', 'in_progress']).in('priorita', ['alta', 'urgente']).order('scadenza', { ascending: true }).limit(6),
        supabase.from('task').select('id, titolo, scadenza, priorita, progetti(nome)').gte('scadenza', oggiISO).lte('scadenza', fra7ggISO).neq('stato', 'done').order('scadenza', { ascending: true }).limit(8),
        supabase.from('calendario_eventi').select('id, titolo, data_inizio, ora_inizio, tipo, colore').gte('data_inizio', oggiISO).order('data_inizio', { ascending: true }).limit(5),
        supabase.from('progetto_attivita').select('id, azione, dettaglio, created_at, progetti(nome)').order('created_at', { ascending: false }).limit(10),
        supabase.from('spese').select('importo').gte('data', inizioMese),
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

      const speseMese = (speseMeseData ?? []).reduce((s: number, x: any) => s + (Number(x.importo) || 0), 0)

      const taskPerStato: Record<StatoTask, number> = { todo: 0, in_progress: 0, in_review: 0, done: 0 }
      for (const t of tuttiTask ?? []) {
        taskPerStato[t.stato as StatoTask] = (taskPerStato[t.stato as StatoTask] || 0) + 1
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

      setEventi((eventiData ?? []).map((e: any) => ({
        id: e.id, titolo: e.titolo, data_inizio: e.data_inizio, ora_inizio: e.ora_inizio, tipo: e.tipo, colore: e.colore,
      })))

      setAttivita((attivitaData ?? []).map((a: any) => ({
        id: a.id, azione: a.azione, dettaglio: a.dettaglio, created_at: a.created_at, progetto_nome: a.progetti?.nome ?? null,
      })))

      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ color: '#6B7280', fontSize: 12, padding: 20, letterSpacing: '0.04em' }}>Caricamento...</div>
  if (!stats) return null

  const pipelineTotal = Object.values(stats.pipeline).reduce((a, b) => a + b, 0)
  const taskTotal = Object.values(stats.taskPerStato).reduce((a, b) => a + b, 0)

  const pipelineData = (['cliente_demo', 'demo_accettata', 'firmato', 'completato', 'archiviato'] as StatoProgetto[])
    .filter(s => stats.pipeline[s] > 0)
    .map(s => ({ name: pipelineLabel[s], value: stats.pipeline[s], color: pipelineColor[s] }))

  const taskBarData = (['todo', 'in_progress', 'in_review', 'done'] as StatoTask[])
    .map(s => ({ name: taskStatoLabel[s], value: stats.taskPerStato[s], fill: taskStatoColor[s] }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Alert ── */}
      {stats.taskScaduti > 0 && (
        <div
          onClick={() => onNavigate('task')}
          style={{ backgroundColor: '#FEF2F2', borderLeft: '3px solid #DC2626', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        >
          <span style={{ fontSize: 12, color: '#7F1D1D' }}>
            <strong>{stats.taskScaduti}</strong> task {stats.taskScaduti === 1 ? 'scaduto' : 'scaduti'}
          </span>
        </div>
      )}

      {/* ── KPI ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, backgroundColor: '#E5E7EB' }}>
        <StatCard label="Clienti" value={stats.totalClienti} onClick={() => onNavigate('clienti')} />
        <StatCard label="Progetti attivi" value={stats.progettiAttivi} sub={`${pipelineTotal} totali`} onClick={() => onNavigate('progetti')} />
        <StatCard label="Task in corso" value={stats.taskInCorso} sub={`${taskTotal} totali`} onClick={() => onNavigate('task')} />
        <StatCard label="Ricavo mensile" value={fmtEur(stats.ricavoMensile)} sub="progetti attivi" />
        <StatCard label="Spese mese" value={fmtEur(stats.speseMese + stats.ricorrentiMese)} sub={`${fmtEur(stats.speseMese)} una tantum + ${fmtEur(stats.ricorrentiMese)} ricorrenti`} />
      </div>

      {/* ── Charts ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, backgroundColor: '#E5E7EB' }}>

        {/* Pipeline donut */}
        <div style={{ backgroundColor: '#fff', padding: '20px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6B7280', marginBottom: 16 }}>Pipeline progetti</div>
          {pipelineData.length === 0
            ? <Empty text="Nessun progetto" />
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
        </div>

        {/* Task per stato bar chart */}
        <div style={{ backgroundColor: '#fff', padding: '20px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6B7280', marginBottom: 16 }}>Task per stato</div>
          {taskTotal === 0
            ? <Empty text="Nessun task" />
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, backgroundColor: '#E5E7EB' }}>
        <Section title="Progetti recenti" action={{ label: 'Tutti', onClick: () => onNavigate('progetti') }}>
          {progetti.length === 0
            ? <Empty text="Nessun progetto" />
            : progetti.map((p, i) => (
              <div key={p.id} style={{ padding: '10px 20px', borderTop: i ? '1px solid #F3F4F6' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                  {p.cliente && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{p.cliente}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 12 }}>
                  {p.pagamento_mensile != null && p.pagamento_mensile > 0 && (
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

        <Section title="Task urgenti" action={{ label: 'Tutti', onClick: () => onNavigate('task') }}>
          {taskUrgenti.length === 0
            ? <Empty text="Nessun task urgente" />
            : taskUrgenti.map((t, i) => (
              <div key={t.id} style={{ padding: '10px 20px', borderTop: i ? '1px solid #F3F4F6' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.titolo}</div>
                  {t.progetto && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{t.progetto}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 12 }}>
                  {t.scadenza && <span style={{ fontSize: 11, color: '#9CA3AF', fontVariantNumeric: 'tabular-nums' }}>{fmtDate(t.scadenza)}</span>}
                  <span style={{ fontSize: 10, fontWeight: prioritaWeight[t.priorita] ?? 400, textTransform: 'uppercase', letterSpacing: '0.06em', color: prioritaColor[t.priorita] ?? '#6B7280' }}>
                    {t.priorita}
                  </span>
                </div>
              </div>
            ))
          }
        </Section>
      </div>

      {/* ── Scadenze + Eventi ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, backgroundColor: '#E5E7EB' }}>
        <Section title="Scadenze prossimi 7 giorni" action={{ label: 'Task', onClick: () => onNavigate('task') }}>
          {taskProssimi.length === 0
            ? <Empty text="Nessuna scadenza" />
            : taskProssimi.map((t, i) => (
              <div key={t.id} style={{ padding: '10px 20px', borderTop: i ? '1px solid #F3F4F6' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.titolo}</div>
                  {t.progetto && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{t.progetto}</div>}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, flexShrink: 0, marginLeft: 12,
                  color: daysUntil(t.scadenza!) === 'Oggi' ? '#DC2626' : '#374151',
                }}>
                  {daysUntil(t.scadenza!)}
                </span>
              </div>
            ))
          }
        </Section>

        <Section title="Prossimi eventi" action={{ label: 'Calendario', onClick: () => onNavigate('calendario') }}>
          {eventi.length === 0
            ? <Empty text="Nessun evento" />
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
      <Section title="Attività recente">
        {attivita.length === 0
          ? <Empty text="Nessuna attività" />
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
    </div>
  )
}

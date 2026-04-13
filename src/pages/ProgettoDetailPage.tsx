import { useEffect, useState, useCallback, useRef } from 'react'
import {
  notifyTaskAssegnato,
  notifyTaskInReview,
  notifyTaskCompletato,
  notifyTaskPartecipanteAggiunto,
  notifyTaskUrgente,
  notifyProgettoPipelineAdvance,
} from '../lib/notifications'

const ADMIN_EMAIL = 'lorenzo@agentics.eu.com'
import {
  ArrowLeft, Plus, Pencil, Trash2, Upload, Download,
  FileText, Clock, Shield, StickyNote, Briefcase, Lock, EyeOff, Copy, KeyRound,
  CheckSquare, ChevronDown, ChevronRight, Send, X, Eye, Users,
} from 'lucide-react'
import { supabase, verifyPassword } from '../lib/supabase'
import { taskSchema, progettoSchema, progettoNotaSchema, progettoCredenzialeSchema, spesaSchema, validate, type ValidationErrors } from '../lib/validation'
import { safeErrorMessage } from '../lib/errors'
import type {
  Progetto, Cliente, Task, StatoProgetto, StatoTask, PrioritaTask, CategoriaTask,
  ProgettoAttivita, ProgettoDocumento, ProgettoNota, ProgettoContratto, ContrattoDocumento,
  ProgettoCredenziale, TipoCredenziale,
  ChecklistItem, TaskCommento, MilestoneItem, ScadenzaFatturazione,
  LegalSection, LegalDocument, TeamMember, RuoloTeam,
  Spesa, CategoriaSpesa, SpesaRicorrente, FrequenzaSpesa,
  OrgMember,
} from '../types'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { FormField, Input, Select, TextArea } from '../components/ui/FormField'
import { useIsMobile } from '../hooks/useIsMobile'
import { useCurrentRole } from '../hooks/useCurrentRole'

const BRAND = '#005DEF'

/* ─── Mapping ─── */

const statoBadge: Record<StatoProgetto, { label: string; color: 'green' | 'blue' | 'yellow' | 'gray' | 'orange' | 'purple' }> = {
  cliente_demo:   { label: 'Cliente Demo',   color: 'yellow' },
  demo_accettata: { label: 'Demo Accettata', color: 'orange' },
  firmato:        { label: 'Firmato',        color: 'green' },
  completato:     { label: 'Completato',     color: 'blue' },
  archiviato:     { label: 'Archiviato',     color: 'gray' },
}

const taskStatoBadge: Record<StatoTask, { label: string; color: 'gray' | 'purple' | 'blue' | 'green' }> = {
  todo:        { label: 'Da fare',    color: 'gray' },
  in_progress: { label: 'In corso',   color: 'purple' },
  in_review:   { label: 'In review',  color: 'blue' },
  done:        { label: 'Completato', color: 'green' },
}

const prioritaBadge: Record<PrioritaTask, { label: string; color: 'green' | 'yellow' | 'orange' | 'red' }> = {
  bassa:   { label: 'Bassa',   color: 'green' },
  media:   { label: 'Media',   color: 'yellow' },
  alta:    { label: 'Alta',    color: 'orange' },
  urgente: { label: 'Urgente', color: 'red' },
}

const CATEGORIE_GRUPPI: Record<string, { label: string; items: { value: CategoriaTask; label: string }[] }> = {
  sviluppo: {
    label: 'Sviluppo',
    items: [
      { value: 'sviluppo_frontend', label: 'Frontend' },
      { value: 'sviluppo_backend', label: 'Backend' },
      { value: 'sviluppo_api', label: 'API' },
      { value: 'sviluppo_ai', label: 'AI' },
    ],
  },
  design: {
    label: 'Design',
    items: [
      { value: 'design_ui', label: 'UI' },
      { value: 'design_ux', label: 'UX' },
      { value: 'design_componenti', label: 'Componenti' },
    ],
  },
  infra: {
    label: 'Infrastruttura',
    items: [
      { value: 'infra_hosting', label: 'Hosting' },
      { value: 'infra_database', label: 'Database' },
      { value: 'infra_deploy', label: 'Deploy' },
      { value: 'infra_dns', label: 'DNS' },
    ],
  },
  security: {
    label: 'Security',
    items: [
      { value: 'security_auth', label: 'Autenticazione' },
      { value: 'security_authz', label: 'Autorizzazioni' },
      { value: 'security_test', label: 'Test' },
      { value: 'security_api', label: 'API Security' },
    ],
  },
  analytics: {
    label: 'Analytics',
    items: [
      { value: 'analytics_tracking', label: 'Tracking' },
      { value: 'analytics_dashboard', label: 'Dashboard' },
      { value: 'analytics_metriche', label: 'Metriche' },
    ],
  },
  docs: {
    label: 'Documentazione',
    items: [
      { value: 'docs_manuali', label: 'Manuali' },
      { value: 'docs_specifiche', label: 'Specifiche' },
      { value: 'docs_guide', label: 'Guide' },
    ],
  },
}

const ALL_CATEGORIE = Object.values(CATEGORIE_GRUPPI).flatMap(g => g.items)

function getCategoriaLabel(cat: CategoriaTask | null): string {
  if (!cat) return '—'
  return ALL_CATEGORIE.find(c => c.value === cat)?.label ?? cat
}

function getCategoriaGruppo(cat: CategoriaTask | null): string {
  if (!cat) return ''
  for (const [, g] of Object.entries(CATEGORIE_GRUPPI)) {
    if (g.items.some(i => i.value === cat)) return g.label
  }
  return ''
}

const fmtEur = (v: number | null) =>
  v != null ? `€ ${Number(v).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : '—'

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const fmtFileSize = (bytes: number | null) => {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/* ─── Team role helpers ─── */

const RUOLI_TEAM: { value: RuoloTeam; label: string }[] = [
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'developer_frontend', label: 'Developer Frontend' },
  { value: 'developer_backend', label: 'Developer Backend' },
  { value: 'developer_fullstack', label: 'Developer Fullstack' },
  { value: 'designer', label: 'Designer UI/UX' },
  { value: 'devops', label: 'DevOps' },
  { value: 'qa_tester', label: 'QA / Tester' },
  { value: 'data_analyst', label: 'Data Analyst' },
  { value: 'ai_specialist', label: 'AI Specialist' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'legal', label: 'Legal' },
  { value: 'account_manager', label: 'Account Manager' },
  { value: 'altro', label: 'Altro' },
]

const ruoloLabel = (r: RuoloTeam) => RUOLI_TEAM.find(x => x.value === r)?.label ?? r

/* ─── Security Checklist default structure ─── */

interface SecurityCheckItem { id: string; label: string; checked: boolean; note: string }
interface SecuritySection { title: string; items: SecurityCheckItem[] }

const DEFAULT_SECURITY_CHECKLIST: SecuritySection[] = [
  {
    title: 'Autenticazione',
    items: [
      { id: 'auth_mfa', label: 'MFA attivata per tutti gli utenti admin', checked: false, note: '' },
      { id: 'auth_pwd', label: 'Policy password robusta (min 12 char, complessità)', checked: false, note: '' },
      { id: 'auth_session', label: 'Timeout sessione configurato', checked: false, note: '' },
      { id: 'auth_brute', label: 'Protezione brute-force attiva', checked: false, note: '' },
    ],
  },
  {
    title: 'Autorizzazioni',
    items: [
      { id: 'authz_rbac', label: 'RBAC / controllo accessi implementato', checked: false, note: '' },
      { id: 'authz_least', label: 'Principio least privilege applicato', checked: false, note: '' },
      { id: 'authz_rls', label: 'Row Level Security attivo su tutte le tabelle', checked: false, note: '' },
    ],
  },
  {
    title: 'API Security',
    items: [
      { id: 'api_rate', label: 'Rate limiting configurato', checked: false, note: '' },
      { id: 'api_cors', label: 'CORS policy restrittiva', checked: false, note: '' },
      { id: 'api_input', label: 'Validazione input su tutti gli endpoint', checked: false, note: '' },
      { id: 'api_https', label: 'Solo HTTPS', checked: false, note: '' },
    ],
  },
  {
    title: 'Infrastruttura',
    items: [
      { id: 'infra_backup', label: 'Backup automatici configurati', checked: false, note: '' },
      { id: 'infra_logs', label: 'Logging centralizzato attivo', checked: false, note: '' },
      { id: 'infra_monitor', label: 'Monitoring e alerting configurati', checked: false, note: '' },
      { id: 'infra_secrets', label: 'Secrets gestiti in modo sicuro (no hardcoded)', checked: false, note: '' },
    ],
  },
  {
    title: 'Data Protection',
    items: [
      { id: 'data_encrypt', label: 'Dati sensibili criptati at rest', checked: false, note: '' },
      { id: 'data_transit', label: 'Dati criptati in transit', checked: false, note: '' },
      { id: 'data_gdpr', label: 'Compliance GDPR verificata', checked: false, note: '' },
      { id: 'data_pii', label: 'PII identificati e protetti', checked: false, note: '' },
    ],
  },
  {
    title: 'Test',
    items: [
      { id: 'test_pentest', label: 'Penetration test eseguito', checked: false, note: '' },
      { id: 'test_vuln', label: 'Vulnerability scan eseguito', checked: false, note: '' },
      { id: 'test_deps', label: 'Dipendenze verificate per CVE', checked: false, note: '' },
    ],
  },
]

/* ─── Tab definitions ─── */

type Tab = 'overview' | 'task' | 'spese' | 'team' | 'timeline' | 'documenti' | 'cybersecurity' | 'legal' | 'credenziali' | 'note' | 'contratto'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'task', label: 'Task' },
  { id: 'spese', label: 'Spese' },
  { id: 'team', label: 'Team' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'documenti', label: 'Documenti' },
  { id: 'cybersecurity', label: 'Cybersecurity' },
  { id: 'legal', label: 'Legal' },
  { id: 'credenziali', label: 'Credenziali' },
  { id: 'note', label: 'Note' },
  { id: 'contratto', label: 'Contratto' },
]

/* ─── Helpers ─── */

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #F3F4F6' }}>
    <span style={{ fontSize: 13, color: '#6C7F94' }}>{label}</span>
    <span style={{ fontSize: 13, fontWeight: 600, color: '#1A2332' }}>{value}</span>
  </div>
)

const SectionTitle = ({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1A2332', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{children}</h3>
    {action}
  </div>
)

const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', ...style }}>{children}</div>
)

/* ════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════ */

interface Props {
  progettoId: string
  onBack: () => void
}

export const ProgettoDetailPage = ({ progettoId, onBack }: Props) => {
  const isMobile = useIsMobile()
  const { role } = useCurrentRole()
  const isDeveloper = role === 'developer'
  const [tab, setTab] = useState<Tab>('overview')
  const [progetto, setProgetto] = useState<Progetto | null>(null)
  const [clienti, setClienti] = useState<Pick<Cliente, 'id' | 'nome'>[]>([])
  const [loading, setLoading] = useState(true)

  /* ─── Edit project modal ─── */
  const [editModal, setEditModal] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, unknown>>({})
  const [editErrors, setEditErrors] = useState<ValidationErrors>({})
  const [editSaving, setEditSaving] = useState(false)

  /* ─── Delete project modal ─── */
  const [deleteModal, setDeleteModal] = useState(false)

  const loadProgetto = useCallback(async () => {
    const { data } = await supabase.from('progetti').select('*, clienti(nome)').eq('id', progettoId).single()
    if (data) setProgetto(data)
    setLoading(false)
  }, [progettoId])

  useEffect(() => {
    loadProgetto()
    supabase.from('clienti').select('id, nome').order('nome').then(({ data }) => setClienti(data ?? []))
  }, [loadProgetto])

  const openEditProject = () => {
    if (!progetto) return
    setEditForm({
      nome: progetto.nome,
      cliente_id: progetto.cliente_id,
      descrizione: progetto.descrizione ?? '',
      stato: progetto.stato,
      data_inizio: progetto.data_inizio ?? '',
      data_fine: progetto.data_fine ?? '',
      budget: progetto.budget,
      pagamento_mensile: progetto.pagamento_mensile,
      responsabile: progetto.responsabile ?? '',
      team: progetto.team ?? [],
      priorita_progetto: progetto.priorita_progetto ?? 'media',
      marginalita_stimata: progetto.marginalita_stimata,
      commerciale: progetto.commerciale ?? '',
      percentuale_commissione: progetto.percentuale_commissione,
      link_demo: progetto.link_demo ?? '',
      link_deploy: progetto.link_deploy ?? '',
    })
    setEditErrors({})
    setEditModal(true)
  }

  const saveProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!progetto) return
    const result = validate(progettoSchema, editForm)
    if (!result.success) { setEditErrors(result.errors); return }
    setEditErrors({}); setEditSaving(true)
    const { error } = await supabase.from('progetti').update(result.data).eq('id', progettoId)
    if (error) { setEditErrors({ _form: safeErrorMessage(error) }); setEditSaving(false); return }
    setEditSaving(false); setEditModal(false)
    await logActivity('Progetto aggiornato', `Modificati i dati del progetto`)
    // Notifica avanzamento pipeline se lo stato è cambiato
    const statoNuovo = editForm.stato as string
    if (statoNuovo && statoNuovo !== progetto.stato) {
      const clienteNome = clienti.find(c => c.id === editForm.cliente_id)?.nome ?? progetto.clienti?.nome ?? 'N/A'
      notifyProgettoPipelineAdvance({
        progettoNome: editForm.nome as string ?? progetto.nome,
        progettoId,
        statoPrecedente: progetto.stato,
        statoNuovo,
        cliente: clienteNome,
        pagamentoMensile: (editForm.pagamento_mensile as number) ?? progetto.pagamento_mensile,
        adminEmail: ADMIN_EMAIL,
      })
    }
    loadProgetto()
  }

  const deleteProject = async () => {
    await supabase.from('progetti').delete().eq('id', progettoId)
    onBack()
  }

  const ef = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEditForm(p => ({ ...p, [k]: e.target.value }))

  /* ─── Activity logger ─── */
  const logActivity = async (azione: string, dettaglio?: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('progetto_attivita').insert({
      progetto_id: progettoId,
      user_id: user.id,
      utente: user.email ?? 'Utente',
      azione,
      dettaglio: dettaglio ?? null,
    })
  }

  if (loading) return <div style={{ color: '#6C7F94', fontSize: 13, padding: 32 }}>Caricamento...</div>
  if (!progetto) return <div style={{ color: '#DC2626', fontSize: 13, padding: 32 }}>Progetto non trovato.</div>

  const sb = statoBadge[progetto.stato]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Back + project title bar */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'flex-start' : 'center',
        gap: isMobile ? 12 : 0,
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', fontSize: 13, fontWeight: 500, padding: 0 }}>
            <ArrowLeft style={{ width: 14, height: 14 }} /> Progetti
          </button>
          <span style={{ color: '#E5E7EB' }}>|</span>
          <span style={{ fontSize: isMobile ? 15 : 16, fontWeight: 700, color: '#1A2332' }}>{progetto.nome}</span>
          <Badge label={sb.label} color={sb.color} />
        </div>
        {!isDeveloper && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Button variant="ghost" size="sm" onClick={openEditProject}><Pencil style={{ width: 12, height: 12 }} /> {isMobile ? '' : 'Modifica'}</Button>
            <Button variant="danger" size="sm" onClick={() => setDeleteModal(true)}><Trash2 style={{ width: 12, height: 12 }} /> {isMobile ? '' : 'Elimina'}</Button>
          </div>
        )}
      </div>

      {/* Tabs — scrollable on mobile */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderBottom: '2px solid #E5E7EB',
        marginBottom: 20,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}>
        {(isDeveloper ? TABS.filter(t => !['spese', 'legal', 'contratto'].includes(t.id)) : TABS).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: isMobile ? '9px 14px' : '10px 20px',
              fontSize: 11,
              fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? BRAND : '#6C7F94',
              background: 'none',
              border: 'none',
              borderBottom: tab === t.id ? `2px solid ${BRAND}` : '2px solid transparent',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: -2,
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab progetto={progetto} onSave={loadProgetto} isDeveloper={isDeveloper} />}
      {tab === 'task' && <TaskTab progettoId={progettoId} progettoNome={progetto.nome} logActivity={logActivity} />}
      {tab === 'spese' && <SpeseProgettoTab progetto={progetto} onSave={loadProgetto} logActivity={logActivity} />}
      {tab === 'team' && <TeamTab progetto={progetto} onSave={loadProgetto} logActivity={logActivity} />}
      {tab === 'timeline' && <TimelineTab progettoId={progettoId} />}
      {tab === 'documenti' && <DocumentiTab progettoId={progettoId} logActivity={logActivity} />}
      {tab === 'cybersecurity' && <CybersecurityTab progetto={progetto} onSave={loadProgetto} logActivity={logActivity} />}
      {tab === 'legal' && <LegalTab progetto={progetto} onSave={loadProgetto} logActivity={logActivity} />}
      {tab === 'credenziali' && <CredenzialiTab progettoId={progettoId} logActivity={logActivity} />}
      {tab === 'note' && <NoteTab progettoId={progettoId} logActivity={logActivity} />}
      {tab === 'contratto' && <ContrattoTab progettoId={progettoId} logActivity={logActivity} />}

      {/* Edit project modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Modifica progetto" width="640px">
        <form onSubmit={saveProject} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {editErrors._form && <p style={{ fontSize: 12, color: '#DC2626' }}>{editErrors._form}</p>}
          <FormField label="Nome progetto" required error={editErrors.nome}>
            <Input value={(editForm.nome as string) ?? ''} onChange={ef('nome')} maxLength={200} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <FormField label="Cliente" error={editErrors.cliente_id}>
              <Select value={(editForm.cliente_id as string) ?? ''} onChange={ef('cliente_id')}>
                <option value="">— Seleziona —</option>
                {clienti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Select>
            </FormField>
            <FormField label="Stato" error={editErrors.stato}>
              <Select value={(editForm.stato as string) ?? 'firmato'} onChange={ef('stato')}>
                <option value="cliente_demo">Cliente Demo</option>
                <option value="demo_accettata">Demo Accettata</option>
                <option value="firmato">Firmato</option>
                <option value="completato">Completato</option>
                <option value="archiviato">Archiviato</option>
              </Select>
            </FormField>
          </div>
          <FormField label="Descrizione" error={editErrors.descrizione}>
            <TextArea value={(editForm.descrizione as string) ?? ''} onChange={ef('descrizione')} maxLength={2000} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <FormField label="Data inizio" error={editErrors.data_inizio}>
              <Input type="date" value={(editForm.data_inizio as string) ?? ''} onChange={ef('data_inizio')} />
            </FormField>
            <FormField label="Data fine" error={editErrors.data_fine}>
              <Input type="date" value={(editForm.data_fine as string) ?? ''} onChange={ef('data_fine')} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <FormField label="Responsabile" error={editErrors.responsabile}>
              <Input value={(editForm.responsabile as string) ?? ''} onChange={ef('responsabile')} />
            </FormField>
            <FormField label="Priorità" error={editErrors.priorita_progetto}>
              <Select value={(editForm.priorita_progetto as string) ?? 'media'} onChange={ef('priorita_progetto')}>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="bassa">Bassa</option>
              </Select>
            </FormField>
          </div>
          {!isDeveloper && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                <FormField label="Pagamento mensile (€)" error={editErrors.pagamento_mensile}>
                  <Input type="number" step="0.01" value={(editForm.pagamento_mensile as number) ?? ''} onChange={ef('pagamento_mensile')} />
                </FormField>
                <FormField label="Marginalità stimata (%)" error={editErrors.marginalita_stimata}>
                  <Input type="number" step="0.1" value={(editForm.marginalita_stimata as number) ?? ''} onChange={ef('marginalita_stimata')} />
                </FormField>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                <FormField label="Commerciale" error={editErrors.commerciale} hint="Chi ha chiuso il contratto">
                  <Input value={(editForm.commerciale as string) ?? ''} onChange={ef('commerciale')} placeholder="Es. Mario Rossi" />
                </FormField>
                <FormField label="% Commissione" error={editErrors.percentuale_commissione} hint="Percentuale sul pagamento mensile">
                  <Input type="number" step="0.1" min="0" max="100" value={(editForm.percentuale_commissione as number) ?? ''} onChange={ef('percentuale_commissione')} placeholder="Es. 10" />
                </FormField>
              </div>
            </>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <FormField label="Link Demo" error={editErrors.link_demo} hint="URL ambiente demo">
              <Input value={(editForm.link_demo as string) ?? ''} onChange={ef('link_demo')} placeholder="https://demo.progetto.com" />
            </FormField>
            <FormField label="Link Deploy" error={editErrors.link_deploy} hint="URL produzione">
              <Input value={(editForm.link_deploy as string) ?? ''} onChange={ef('link_deploy')} placeholder="https://progetto.com" />
            </FormField>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setEditModal(false)}>Annulla</Button>
            <Button type="submit" disabled={editSaving}>{editSaving ? 'Salvataggio...' : 'Salva'}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete modal */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Elimina progetto" width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>Sei sicuro di voler eliminare questo progetto? L'operazione non è reversibile.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteModal(false)}>Annulla</Button>
          <Button variant="danger" onClick={deleteProject}>Elimina</Button>
        </div>
      </Modal>
    </div>
  )
}

/* ════════════════════════════════════════
   TAB: OVERVIEW
   ════════════════════════════════════════ */

const overviewRicToMensile = (r: SpesaRicorrente) => {
  const div: Record<string, number> = { mensile: 1, trimestrale: 3, semestrale: 6, annuale: 12 }
  return r.importo / (div[r.frequenza ?? 'mensile'] ?? 1)
}

const OverviewTab = ({ progetto, onSave, isDeveloper = false }: { progetto: Progetto; onSave: () => void; isDeveloper?: boolean }) => {
  const isMobile = useIsMobile()
  const [spese, setSpese] = useState<Spesa[]>([])
  const [contratto, setContratto] = useState<ProgettoContratto | null>(null)
  const [taskStats, setTaskStats] = useState({ total: 0, done: 0 })

  const [linkDemo, setLinkDemo] = useState(progetto.link_demo ?? '')
  const [linkDeploy, setLinkDeploy] = useState(progetto.link_deploy ?? '')
  const [editingLink, setEditingLink] = useState(false)
  const [savingLink, setSavingLink] = useState(false)

  useEffect(() => {
    const pid = progetto.id
    supabase.from('task').select('stato').eq('progetto_id', pid).then(({ data }) => {
      if (!data) return
      setTaskStats({ total: data.length, done: data.filter(t => t.stato === 'done').length })
    })
    supabase.from('spese').select('*').eq('progetto_id', pid).order('data', { ascending: false }).then(({ data }) => setSpese(data ?? []))
    supabase.from('progetto_contratto').select('*').eq('progetto_id', pid).maybeSingle().then(({ data }) => setContratto(data ?? null))
  }, [progetto.id])

  useEffect(() => { setLinkDemo(progetto.link_demo ?? ''); setLinkDeploy(progetto.link_deploy ?? '') }, [progetto.link_demo, progetto.link_deploy])

  const prio = progetto.priorita_progetto ?? 'media'
  const prioBadge: Record<string, { label: string; color: 'red' | 'yellow' | 'green' }> = {
    alta: { label: 'Alta', color: 'red' }, media: { label: 'Media', color: 'yellow' }, bassa: { label: 'Bassa', color: 'green' },
  }
  const pb = prioBadge[prio] ?? prioBadge.media

  const teamStored = progetto.team_membri as { members?: TeamMember[] } | null
  const activeTeam = teamStored?.members?.filter(m => m.attivo) ?? []

  const totalSpese = spese.reduce((s, x) => s + x.importo, 0)
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const totalSpeseMese = spese.filter(s => s.data >= firstOfMonth).reduce((s, x) => s + x.importo, 0)

  const storedRic = progetto.spese_ricorrenti as { items?: SpesaRicorrente[] } | null
  const ricorrentiAttive = (storedRic?.items ?? []).filter(r => r.attiva !== false)
  const costoRicMensile = ricorrentiAttive.reduce((s, r) => s + overviewRicToMensile(r), 0)

  const ricavoMensile = contratto?.pagamento_mensile ?? progetto.pagamento_mensile ?? 0

  const saveLink = async () => {
    setSavingLink(true)
    await supabase.from('progetti').update({
      link_demo: linkDemo.trim() || null,
      link_deploy: linkDeploy.trim() || null,
    }).eq('id', progetto.id)
    setSavingLink(false)
    setEditingLink(false)
    onSave()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Link Demo + Deploy */}
      <Card style={{ padding: isMobile ? '14px 16px' : '16px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editingLink ? 12 : 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Link progetto</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {editingLink ? (
              <>
                <Button size="sm" onClick={saveLink} disabled={savingLink}>{savingLink ? '...' : 'Salva'}</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditingLink(false); setLinkDemo(progetto.link_demo ?? ''); setLinkDeploy(progetto.link_deploy ?? '') }}>Annulla</Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setEditingLink(true)}><Pencil style={{ width: 11, height: 11 }} /> Modifica</Button>
            )}
          </div>
        </div>
        {editingLink ? (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Demo</div>
              <input value={linkDemo} onChange={e => setLinkDemo(e.target.value)} placeholder="https://demo.progetto.com" style={{ width: '100%', fontSize: 13, color: '#1A2332', border: '1px solid #E5E7EB', padding: '6px 10px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} autoFocus />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Produzione</div>
              <input value={linkDeploy} onChange={e => setLinkDeploy(e.target.value)} placeholder="https://progetto.com" style={{ width: '100%', fontSize: 13, color: '#1A2332', border: '1px solid #E5E7EB', padding: '6px 10px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 12 : 24, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Demo</div>
              {linkDemo
                ? <a href={linkDemo} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: BRAND, textDecoration: 'none', wordBreak: 'break-all' }}>{linkDemo}</a>
                : <span style={{ fontSize: 13, color: '#9CA3AF' }}>—</span>
              }
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Produzione</div>
              {linkDeploy
                ? <a href={linkDeploy} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: BRAND, textDecoration: 'none', wordBreak: 'break-all' }}>{linkDeploy}</a>
                : <span style={{ fontSize: 13, color: '#9CA3AF' }}>—</span>
              }
            </div>
          </div>
        )}
      </Card>

      {progetto.descrizione && (
        <Card style={{ padding: isMobile ? '14px 16px' : '16px 24px' }}>
          <div style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.7 }}>{progetto.descrizione}</div>
        </Card>
      )}

      {/* KPI */}
      <Card style={{ padding: isMobile ? '14px 16px' : '16px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isDeveloper ? '1fr' : (isMobile ? '1fr 1fr' : 'repeat(4, 1fr)'), gap: isMobile ? 16 : 24 }}>
          {!isDeveloper && (
            <>
              <div>
                <div style={{ fontSize: 10, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Spese totali</div>
                <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 700, color: '#1A2332', marginTop: 2 }}>{fmtEur(totalSpese)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Costi ric. / mese</div>
                <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 700, color: '#1A2332', marginTop: 2 }}>{fmtEur(costoRicMensile)}</div>
              </div>
            </>
          )}
          <div>
            <div style={{ fontSize: 10, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Task</div>
            <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 700, color: '#1A2332', marginTop: 2 }}>{taskStats.done}/{taskStats.total}</div>
          </div>
          {!isDeveloper && (
            <div>
              <div style={{ fontSize: 10, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Margine mese</div>
              <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 700, color: (ricavoMensile - totalSpeseMese - costoRicMensile) >= 0 ? '#1A2332' : '#DC2626', marginTop: 2 }}>
                {fmtEur(ricavoMensile - totalSpeseMese - costoRicMensile)}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Info + Economic */}
      <div style={{ display: 'grid', gridTemplateColumns: isDeveloper ? '1fr' : (isMobile ? '1fr' : '1fr 1fr'), gap: 16 }}>
        <Card>
          <div style={{ padding: isMobile ? '12px 16px' : '14px 24px', borderBottom: '1px solid #E5E7EB', fontSize: 11, fontWeight: 700, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Informazioni
          </div>
          <div style={{ padding: isMobile ? '0 16px' : '0 24px' }}>
            <InfoRow label="Cliente" value={progetto.clienti?.nome ?? '—'} />
            <InfoRow label="Responsabile" value={progetto.responsabile ?? '—'} />
            <InfoRow label="Team" value={activeTeam.length > 0 ? `${activeTeam.length} membri` : (progetto.team?.length ? progetto.team.join(', ') : '—')} />
            <InfoRow label="Priorità" value={<Badge label={pb.label} color={pb.color} />} />
            <InfoRow label="Data inizio" value={fmtDate(progetto.data_inizio)} />
            <InfoRow label="Data fine" value={fmtDate(progetto.data_fine)} />
          </div>
        </Card>
        {!isDeveloper && (
          <Card>
            <div style={{ padding: isMobile ? '12px 16px' : '14px 24px', borderBottom: '1px solid #E5E7EB', fontSize: 11, fontWeight: 700, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Riepilogo economico
            </div>
            <div style={{ padding: isMobile ? '0 16px' : '0 24px' }}>
              <InfoRow label="Ricavo mensile" value={fmtEur(ricavoMensile || null)} />
              <InfoRow label="Budget" value={fmtEur(progetto.budget)} />
              <InfoRow label="Spese totali" value={fmtEur(totalSpese)} />
              <InfoRow label="Costi ric. / mese" value={fmtEur(costoRicMensile)} />
              <InfoRow label="Margine mese" value={
                <span style={{ color: (ricavoMensile - totalSpeseMese - costoRicMensile) >= 0 ? '#1A2332' : '#DC2626', fontWeight: 600 }}>
                  {fmtEur(ricavoMensile - totalSpeseMese - costoRicMensile)}
                </span>
              } />
              <InfoRow label="Marginalità stimata" value={progetto.marginalita_stimata != null ? `${progetto.marginalita_stimata}%` : '—'} />
              <InfoRow label="Commerciale" value={progetto.commerciale ?? '—'} />
              {progetto.commerciale && progetto.percentuale_commissione != null && (
                <InfoRow
                  label="Commissione"
                  value={`${progetto.percentuale_commissione}% = ${fmtEur((ricavoMensile * progetto.percentuale_commissione) / 100)}/mese`}
                />
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Contratto summary */}
      {!isDeveloper && contratto && (
        <Card>
          <div style={{ padding: '14px 24px', borderBottom: '1px solid #E5E7EB', fontSize: 11, fontWeight: 700, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Contratto
          </div>
          <div style={{ padding: '0 24px' }}>
            <InfoRow label="Valore progetto" value={fmtEur(contratto.valore_progetto)} />
            <InfoRow label="Setup iniziale" value={fmtEur(contratto.setup_iniziale)} />
            <InfoRow label="Pagamento mensile" value={fmtEur(contratto.pagamento_mensile)} />
            <InfoRow label="Durata" value={contratto.durata_mesi ? `${contratto.durata_mesi} mesi` : '—'} />
            <InfoRow label="Data firma" value={fmtDate(contratto.data_firma)} />
            <InfoRow label="Scadenza" value={fmtDate(contratto.data_scadenza_contratto)} />
            <InfoRow label="Stato pagamento" value={contratto.stato_pagamento === 'saldato' ? 'Saldato' : contratto.stato_pagamento === 'parziale' ? 'Parziale' : 'Da fatturare'} />
          </div>
        </Card>
      )}
    </div>
  )
}

/* ════════════════════════════════════════
   TAB: TASK
   ════════════════════════════════════════ */

type TaskForm = {
  titolo: string; descrizione: string | null; stato: StatoTask; priorita: PrioritaTask
  scadenza: string | null; categoria: CategoriaTask | null; assegnatario: string | null
  dipendenza_id: string | null; checklist: ChecklistItem[]; commenti: TaskCommento[]
}

const emptyTaskForm: TaskForm = {
  titolo: '', descrizione: null, stato: 'todo', priorita: 'media',
  scadenza: null, categoria: null, assegnatario: null,
  dipendenza_id: null, checklist: [], commenti: [],
}

const TaskTab = ({ progettoId, progettoNome, logActivity }: { progettoId: string; progettoNome: string; logActivity: (a: string, d?: string) => Promise<void> }) => {
  const isMobile = useIsMobile()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState<TaskForm>({ ...emptyTaskForm })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [filterStato, setFilterStato] = useState<StatoTask | ''>('')
  const [filterCategoria, setFilterCategoria] = useState<string>('')
  const [newCheckItem, setNewCheckItem] = useState('')
  const [newComment, setNewComment] = useState('')
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([])

  const memberName = (email: string) => {
    const m = orgMembers.find(o => o.email === email)
    return m ? [m.nome, m.cognome].filter(Boolean).join(' ') || email.split('@')[0] : email.split('@')[0]
  }

  const loadTasks = useCallback(async () => {
    const { data } = await supabase.from('task').select('*').eq('progetto_id', progettoId).order('created_at', { ascending: false })
    setTasks(data ?? [])
    setLoading(false)
  }, [progettoId])

  useEffect(() => {
    loadTasks()
    supabase.rpc('get_org_members').then(({ data }) => setOrgMembers(data ?? []))
  }, [loadTasks])

  const openNew = () => {
    setEditing(null); setForm({ ...emptyTaskForm }); setErrors({}); setModal(true)
  }

  const openEdit = (t: Task) => {
    setEditing(t)
    setForm({
      titolo: t.titolo, descrizione: t.descrizione, stato: t.stato, priorita: t.priorita,
      scadenza: t.scadenza, categoria: t.categoria, assegnatario: t.assegnatario,
      dipendenza_id: t.dipendenza_id, checklist: t.checklist ?? [], commenti: t.commenti ?? [],
    })
    setErrors({}); setModal(true)
  }

  const saveTask = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = { ...form, progetto_id: progettoId }
    const result = validate(taskSchema, payload)
    if (!result.success) { setErrors(result.errors); return }
    setErrors({}); setSaving(true)
    const { error } = editing
      ? await supabase.from('task').update(result.data).eq('id', editing.id)
      : await supabase.from('task').insert(result.data)
    if (error) { setErrors({ _form: safeErrorMessage(error) }); setSaving(false); return }

    // Notifiche
    const { data: { user } } = await supabase.auth.getUser()
    const currentEmail = user?.email ?? ADMIN_EMAIL
    if (!editing) {
      // Nuovo task
      if (form.assegnatario && form.assegnatario !== currentEmail) {
        notifyTaskAssegnato({
          taskTitolo: form.titolo, taskId: '', progetto: progettoNome,
          priorita: form.priorita, scadenza: form.scadenza,
          assegnatarioEmail: form.assegnatario, assegnatarioNome: memberName(form.assegnatario),
        })
      }
      if (form.priorita === 'urgente') {
        notifyTaskUrgente({
          taskTitolo: form.titolo, progetto: progettoNome, scadenza: form.scadenza,
          assegnatarioEmail: form.assegnatario ?? ADMIN_EMAIL,
          assegnatarioNome: memberName(form.assegnatario ?? ADMIN_EMAIL),
          adminEmail: ADMIN_EMAIL,
        })
      }
    } else {
      // Modifica
      if (form.assegnatario && form.assegnatario !== editing.assegnatario && form.assegnatario !== currentEmail) {
        notifyTaskAssegnato({
          taskTitolo: form.titolo, taskId: editing.id, progetto: progettoNome,
          priorita: form.priorita, scadenza: form.scadenza,
          assegnatarioEmail: form.assegnatario, assegnatarioNome: memberName(form.assegnatario),
        })
      }
      if (form.stato === 'in_review' && editing.stato !== 'in_review') {
        notifyTaskInReview({
          taskTitolo: form.titolo, progetto: progettoNome,
          assegnatarioEmail: form.assegnatario ?? currentEmail,
          reviewerEmail: ADMIN_EMAIL, reviewerNome: 'Lorenzo',
        })
      }
      if (form.stato === 'done' && editing.stato !== 'done') {
        const notificaEmail = form.assegnatario !== currentEmail ? ADMIN_EMAIL : (editing.assegnatario ?? ADMIN_EMAIL)
        notifyTaskCompletato({
          taskTitolo: form.titolo, progetto: progettoNome,
          assegnatarioEmail: form.assegnatario ?? currentEmail,
          notificaEmail, notificaNome: notificaEmail === ADMIN_EMAIL ? 'Lorenzo' : memberName(notificaEmail),
        })
      }
      // Nuovi partecipanti (se il form ha campo partecipanti)
      const vecchiPartecipanti = (editing as Task & { partecipanti?: string[] }).partecipanti ?? []
      const formPartecipanti = (form as TaskForm & { partecipanti?: string[] }).partecipanti ?? []
      for (const email of formPartecipanti.filter(e => !vecchiPartecipanti.includes(e))) {
        if (email !== currentEmail) {
          notifyTaskPartecipanteAggiunto({
            taskTitolo: form.titolo, taskId: editing.id, progetto: progettoNome,
            priorita: form.priorita, scadenza: form.scadenza,
            partecipanteEmail: email, partecipanteNome: memberName(email),
          })
        }
      }
    }

    setSaving(false); setModal(false)
    await logActivity(editing ? 'Task aggiornato' : 'Task creato', `"${form.titolo}"`)
    loadTasks()
  }

  const removeTask = async () => {
    if (!deleteId) return
    const t = tasks.find(x => x.id === deleteId)
    await supabase.from('task').delete().eq('id', deleteId)
    setDeleteId(null)
    if (t) await logActivity('Task eliminato', `"${t.titolo}"`)
    loadTasks()
  }

  const toggleCheck = async (taskId: string, idx: number) => {
    const t = tasks.find(x => x.id === taskId)
    if (!t) return
    const updated = [...(t.checklist ?? [])]
    updated[idx] = { ...updated[idx], completato: !updated[idx].completato }
    await supabase.from('task').update({ checklist: updated }).eq('id', taskId)
    loadTasks()
  }

  const addComment = async (taskId: string) => {
    if (!newComment.trim()) return
    const t = tasks.find(x => x.id === taskId)
    if (!t) return
    const { data: { user } } = await supabase.auth.getUser()
    const comment: TaskCommento = { autore: user?.email ?? 'Utente', testo: newComment.trim(), timestamp: new Date().toISOString() }
    const updated = [...(t.commenti ?? []), comment]
    await supabase.from('task').update({ commenti: updated }).eq('id', taskId)
    setNewComment('')
    loadTasks()
  }

  const quickStatusChange = async (taskId: string, stato: StatoTask) => {
    const t = tasks.find(x => x.id === taskId)
    await supabase.from('task').update({ stato }).eq('id', taskId)
    if (t) {
      const { data: { user } } = await supabase.auth.getUser()
      const currentEmail = user?.email ?? ADMIN_EMAIL
      if (stato === 'in_review' && t.stato !== 'in_review') {
        notifyTaskInReview({
          taskTitolo: t.titolo, progetto: progettoNome,
          assegnatarioEmail: t.assegnatario ?? currentEmail,
          reviewerEmail: ADMIN_EMAIL, reviewerNome: 'Lorenzo',
        })
      }
      if (stato === 'done' && t.stato !== 'done') {
        const notificaEmail = t.assegnatario !== currentEmail ? ADMIN_EMAIL : (t.assegnatario ?? ADMIN_EMAIL)
        notifyTaskCompletato({
          taskTitolo: t.titolo, progetto: progettoNome,
          assegnatarioEmail: t.assegnatario ?? currentEmail,
          notificaEmail, notificaNome: notificaEmail === ADMIN_EMAIL ? 'Lorenzo' : memberName(notificaEmail),
        })
      }
    }
    loadTasks()
  }

  const tf = (k: keyof TaskForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const filtered = tasks.filter(t => {
    if (filterStato && t.stato !== filterStato) return false
    if (filterCategoria) {
      const gruppo = CATEGORIE_GRUPPI[filterCategoria]
      if (gruppo && !gruppo.items.some(i => i.value === t.categoria)) return false
      if (!gruppo && t.categoria !== filterCategoria) return false
    }
    return true
  })

  const addChecklistItem = () => {
    if (!newCheckItem.trim()) return
    setForm(p => ({ ...p, checklist: [...p.checklist, { testo: newCheckItem.trim(), completato: false }] }))
    setNewCheckItem('')
  }

  const removeChecklistItem = (idx: number) => {
    setForm(p => ({ ...p, checklist: p.checklist.filter((_, i) => i !== idx) }))
  }

  if (loading) return <div style={{ color: '#6C7F94', fontSize: 13 }}>Caricamento...</div>

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Select value={filterStato} onChange={e => setFilterStato(e.target.value as StatoTask | '')} style={{ flex: 1, minWidth: 120, height: 34, fontSize: 12 }}>
            <option value="">Tutti gli stati</option>
            <option value="todo">Da fare</option>
            <option value="in_progress">In corso</option>
            <option value="in_review">In review</option>
            <option value="done">Completato</option>
          </Select>
          <Select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)} style={{ flex: 1, minWidth: 130, height: 34, fontSize: 12 }}>
            <option value="">Tutte le categorie</option>
            {Object.entries(CATEGORIE_GRUPPI).map(([key, g]) => (
              <option key={key} value={key}>{g.label}</option>
            ))}
          </Select>
        </div>
        <Button size="sm" onClick={openNew} style={isMobile ? { width: '100%', justifyContent: 'center' } : {}}><Plus style={{ width: 12, height: 12 }} /> Nuovo task</Button>
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <EmptyState icon={CheckSquare} title="Nessun task" description="Crea il primo task per questo progetto." action={{ label: 'Nuovo task', onClick: openNew }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(t => {
            const tsb = taskStatoBadge[t.stato]
            const tpb = prioritaBadge[t.priorita]
            const isExpanded = expandedTask === t.id
            const checkDone = (t.checklist ?? []).filter(c => c.completato).length
            const checkTotal = (t.checklist ?? []).length

            return (
              <Card key={t.id}>
                {/* Main row */}
                {isMobile ? (
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ flex: 1, marginRight: 8 }}>
                        <div
                          style={{ fontSize: 13, fontWeight: 600, color: '#1A2332', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                          onClick={() => setExpandedTask(isExpanded ? null : t.id)}
                        >
                          {isExpanded
                            ? <ChevronDown style={{ width: 13, height: 13, color: '#6C7F94', flexShrink: 0 }} />
                            : <ChevronRight style={{ width: 13, height: 13, color: '#6C7F94', flexShrink: 0 }} />
                          }
                          {t.titolo}
                        </div>
                        {t.categoria && (
                          <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 19 }}>{getCategoriaGruppo(t.categoria)} / {getCategoriaLabel(t.categoria)}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button onClick={() => openEdit(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 6, display: 'flex' }}><Pencil style={{ width: 13, height: 13 }} /></button>
                        <button onClick={() => setDeleteId(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 6, display: 'flex' }}><Trash2 style={{ width: 13, height: 13 }} /></button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginLeft: 19 }}>
                      <Badge label={tsb.label} color={tsb.color} />
                      <Badge label={tpb.label} color={tpb.color} />
                      {t.assegnatario && <span style={{ fontSize: 11, color: '#6C7F94' }}>{t.assegnatario}</span>}
                      {t.scadenza && <span style={{ fontSize: 11, color: '#6C7F94' }}>· {fmtDate(t.scadenza)}</span>}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{ display: 'grid', gridTemplateColumns: '28px 2fr 0.8fr 0.8fr 0.7fr 0.6fr 100px', padding: '12px 16px', alignItems: 'center', cursor: 'pointer' }}
                    onClick={() => setExpandedTask(isExpanded ? null : t.id)}
                  >
                    <div style={{ display: 'flex' }}>
                      {isExpanded
                        ? <ChevronDown style={{ width: 14, height: 14, color: '#6C7F94' }} />
                        : <ChevronRight style={{ width: 14, height: 14, color: '#6C7F94' }} />
                      }
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2332' }}>{t.titolo}</div>
                      {t.categoria && (
                        <span style={{ fontSize: 10, color: '#9CA3AF' }}>{getCategoriaGruppo(t.categoria)} / {getCategoriaLabel(t.categoria)}</span>
                      )}
                    </div>
                    <Badge label={tsb.label} color={tsb.color} />
                    <Badge label={tpb.label} color={tpb.color} />
                    <span style={{ fontSize: 12, color: '#4B5563' }}>{t.assegnatario ?? '—'}</span>
                    <span style={{ fontSize: 12, color: '#4B5563' }}>{t.scadenza ? fmtDate(t.scadenza) : '—'}</span>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 4, display: 'flex' }} title="Modifica"><Pencil style={{ width: 13, height: 13 }} /></button>
                      <button onClick={() => setDeleteId(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, display: 'flex' }} title="Elimina"><Trash2 style={{ width: 13, height: 13 }} /></button>
                    </div>
                  </div>
                )}

                {/* Expanded section */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #F3F4F6', padding: isMobile ? '14px 14px' : '16px 16px 16px 44px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 20 : 24 }}>
                      {/* Left: details + checklist */}
                      <div>
                        {t.descrizione && (
                          <div style={{ fontSize: 13, color: '#4B5563', marginBottom: 16, lineHeight: 1.6 }}>{t.descrizione}</div>
                        )}

                        {/* Quick status change */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                          {(['todo', 'in_progress', 'in_review', 'done'] as StatoTask[]).map(s => (
                            <button
                              key={s}
                              onClick={() => quickStatusChange(t.id, s)}
                              style={{
                                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                border: t.stato === s ? '1.5px solid ' + BRAND : '1px solid #E5E7EB',
                                background: t.stato === s ? '#EFF6FF' : '#fff',
                                color: t.stato === s ? BRAND : '#6C7F94',
                                cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em',
                              }}
                            >
                              {taskStatoBadge[s].label}
                            </button>
                          ))}
                        </div>

                        {/* Checklist */}
                        {checkTotal > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                              Checklist ({checkDone}/{checkTotal})
                            </div>
                            {(t.checklist ?? []).map((item, idx) => (
                              <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 13, color: item.completato ? '#9CA3AF' : '#1A2332', textDecoration: item.completato ? 'line-through' : 'none' }}>
                                <input type="checkbox" checked={item.completato} onChange={() => toggleCheck(t.id, idx)} />
                                {item.testo}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Right: comments */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                          Commenti ({(t.commenti ?? []).length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
                          {(t.commenti ?? []).length === 0 && (
                            <div style={{ fontSize: 12, color: '#9CA3AF' }}>Nessun commento</div>
                          )}
                          {(t.commenti ?? []).map((c, idx) => (
                            <div key={idx} style={{ padding: '8px 12px', backgroundColor: '#F9FAFB', border: '1px solid #F3F4F6' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#1A2332' }}>{c.autore}</span>
                                <span style={{ fontSize: 10, color: '#9CA3AF' }}>{fmtDateTime(c.timestamp)}</span>
                              </div>
                              <div style={{ fontSize: 12, color: '#4B5563' }}>{c.testo}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            value={newComment}
                            onChange={e => setNewComment(e.target.value)}
                            placeholder="Scrivi un commento..."
                            style={{ flex: 1, fontSize: 12, border: '1px solid #E5E7EB', padding: '6px 10px', outline: 'none' }}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addComment(t.id) } }}
                          />
                          <button onClick={() => addComment(t.id)} style={{ background: BRAND, color: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                            <Send style={{ width: 12, height: 12 }} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Task modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifica task' : 'Nuovo task'} width="640px">
        <form onSubmit={saveTask} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {errors._form && <p style={{ fontSize: 12, color: '#DC2626' }}>{errors._form}</p>}
          <FormField label="Titolo" required error={errors.titolo}>
            <Input value={form.titolo} onChange={tf('titolo')} maxLength={200} />
          </FormField>
          <FormField label="Descrizione" error={errors.descrizione}>
            <TextArea value={form.descrizione ?? ''} onChange={tf('descrizione')} maxLength={2000} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: 12 }}>
            <FormField label="Stato">
              <Select value={form.stato} onChange={tf('stato')}>
                <option value="todo">Da fare</option>
                <option value="in_progress">In corso</option>
                <option value="in_review">In review</option>
                <option value="done">Completato</option>
              </Select>
            </FormField>
            <FormField label="Priorità">
              <Select value={form.priorita} onChange={tf('priorita')}>
                <option value="bassa">Bassa</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </Select>
            </FormField>
            <div style={isMobile ? { gridColumn: '1 / -1' } : {}}>
              <FormField label="Scadenza">
                <Input type="date" value={form.scadenza ?? ''} onChange={tf('scadenza')} />
              </FormField>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <FormField label="Categoria">
              <Select value={form.categoria ?? ''} onChange={tf('categoria')}>
                <option value="">— Nessuna —</option>
                {Object.values(CATEGORIE_GRUPPI).map(g => (
                  <optgroup key={g.label} label={g.label}>
                    {g.items.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                  </optgroup>
                ))}
              </Select>
            </FormField>
            <FormField label="Assegnatario">
              <Input value={form.assegnatario ?? ''} onChange={tf('assegnatario')} placeholder="Nome o email" />
            </FormField>
          </div>

          {/* Checklist builder */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Checklist</div>
            {form.checklist.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <input type="checkbox" checked={item.completato} onChange={() => {
                  const updated = [...form.checklist]
                  updated[idx] = { ...updated[idx], completato: !updated[idx].completato }
                  setForm(p => ({ ...p, checklist: updated }))
                }} />
                <span style={{ fontSize: 13, flex: 1 }}>{item.testo}</span>
                <button type="button" onClick={() => removeChecklistItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', display: 'flex' }}>
                  <X style={{ width: 12, height: 12 }} />
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Input value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)} placeholder="Aggiungi elemento..." style={{ flex: 1, height: 32 }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem() } }} />
              <Button type="button" size="sm" variant="ghost" onClick={addChecklistItem}>Aggiungi</Button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>Annulla</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete modal */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Elimina task" width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>Sei sicuro di voler eliminare questo task?</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Annulla</Button>
          <Button variant="danger" onClick={removeTask}>Elimina</Button>
        </div>
      </Modal>
    </div>
  )
}

/* ════════════════════════════════════════
   TAB: TIMELINE
   ════════════════════════════════════════ */

const TimelineTab = ({ progettoId }: { progettoId: string }) => {
  const [activities, setActivities] = useState<ProgettoAttivita[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('progetto_attivita')
      .select('*')
      .eq('progetto_id', progettoId)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => { setActivities(data ?? []); setLoading(false) })
  }, [progettoId])

  if (loading) return <div style={{ color: '#6C7F94', fontSize: 13 }}>Caricamento...</div>

  if (activities.length === 0) {
    return <EmptyState icon={Clock} title="Nessuna attività" description="Le attività verranno registrate automaticamente." />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {activities.map((a, idx) => (
        <div key={a.id} style={{ display: 'flex', gap: 16, padding: '16px 0', borderBottom: idx < activities.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: BRAND, marginTop: 6, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1A2332' }}>{a.azione}</span>
                {a.dettaglio && <span style={{ fontSize: 13, color: '#4B5563', marginLeft: 8 }}>— {a.dettaglio}</span>}
              </div>
              <span style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap', marginLeft: 16 }}>{fmtDateTime(a.created_at)}</span>
            </div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{a.utente}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ════════════════════════════════════════
   TAB: DOCUMENTI
   ════════════════════════════════════════ */

const DocumentiTab = ({ progettoId, logActivity }: { progettoId: string; logActivity: (a: string, d?: string) => Promise<void> }) => {
  const isMobile = useIsMobile()
  const [docs, setDocs] = useState<ProgettoDocumento[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const loadDocs = useCallback(async () => {
    const { data } = await supabase.from('progetto_documenti').select('*').eq('progetto_id', progettoId).order('created_at', { ascending: false })
    setDocs(data ?? [])
    setLoading(false)
  }, [progettoId])

  useEffect(() => { loadDocs() }, [loadDocs])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    for (const file of Array.from(files)) {
      const path = `${progettoId}/${Date.now()}_${file.name}`
      const { error: uploadErr } = await supabase.storage.from('progetto-documenti').upload(path, file)
      if (uploadErr) { console.error(uploadErr); continue }

      const { data: urlData } = supabase.storage.from('progetto-documenti').getPublicUrl(path)

      await supabase.from('progetto_documenti').insert({
        progetto_id: progettoId,
        user_id: user.id,
        nome: file.name,
        tipo_file: file.type || null,
        url: urlData.publicUrl,
        dimensione: file.size,
        tags: [],
        note: null,
        caricato_da: user.email ?? 'Utente',
      })
      await logActivity('Documento caricato', file.name)
    }

    setUploading(false)
    e.target.value = ''
    loadDocs()
  }

  const handleDownload = async (doc: ProgettoDocumento) => {
    const path = doc.url.split('/progetto-documenti/')[1]
    if (!path) { window.open(doc.url, '_blank'); return }
    const { data } = await supabase.storage.from('progetto-documenti').download(path)
    if (!data) return
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url; a.download = doc.nome; a.click()
    URL.revokeObjectURL(url)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const doc = docs.find(d => d.id === deleteId)
    if (doc) {
      const path = doc.url.split('/progetto-documenti/')[1]
      if (path) await supabase.storage.from('progetto-documenti').remove([path])
      await supabase.from('progetto_documenti').delete().eq('id', deleteId)
      await logActivity('Documento eliminato', doc.nome)
    }
    setDeleteId(null)
    loadDocs()
  }

  if (loading) return <div style={{ color: '#6C7F94', fontSize: 13 }}>Caricamento...</div>

  return (
    <div>
      {/* Upload bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <label style={{ cursor: uploading ? 'wait' : 'pointer' }}>
          <input type="file" multiple style={{ display: 'none' }} onChange={handleUpload} disabled={uploading} />
          <Button as="span" size="sm" disabled={uploading}>
            <Upload style={{ width: 12, height: 12 }} /> {uploading ? 'Caricamento...' : 'Carica file'}
          </Button>
        </label>
      </div>

      {docs.length === 0 ? (
        <EmptyState icon={FileText} title="Nessun documento" description="Carica il primo documento per questo progetto." />
      ) : (
        <Card>
          {isMobile ? (
            /* Mobile: card per documento */
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {docs.map((d, idx) => (
                <div key={d.id} style={{ padding: '14px 16px', borderBottom: idx < docs.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2332', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <FileText style={{ width: 13, height: 13, color: '#6C7F94', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nome}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#9CA3AF', display: 'flex', gap: 10 }}>
                        <span>{fmtFileSize(d.dimensione)}</span>
                        <span>·</span>
                        <span>{fmtDateTime(d.created_at)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => handleDownload(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: BRAND, padding: 6, display: 'flex' }}><Download style={{ width: 14, height: 14 }} /></button>
                      <button onClick={() => setDeleteId(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 6, display: 'flex' }}><Trash2 style={{ width: 14, height: 14 }} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Desktop: table grid */
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.7fr 1fr 80px', padding: '10px 20px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
                {['Nome', 'Tipo', 'Dimensione', 'Data', ''].map(h => (
                  <span key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
                ))}
              </div>
              {docs.map(d => (
                <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.7fr 1fr 80px', padding: '12px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2332', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText style={{ width: 14, height: 14, color: '#6C7F94' }} /> {d.nome}
                  </div>
                  <span style={{ fontSize: 12, color: '#6C7F94' }}>{d.tipo_file ?? '—'}</span>
                  <span style={{ fontSize: 12, color: '#6C7F94' }}>{fmtFileSize(d.dimensione)}</span>
                  <span style={{ fontSize: 12, color: '#6C7F94' }}>{fmtDateTime(d.created_at)}</span>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => handleDownload(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: BRAND, padding: 4, display: 'flex' }} title="Scarica"><Download style={{ width: 13, height: 13 }} /></button>
                    <button onClick={() => setDeleteId(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, display: 'flex' }} title="Elimina"><Trash2 style={{ width: 13, height: 13 }} /></button>
                  </div>
                </div>
              ))}
            </>
          )}
        </Card>
      )}

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Elimina documento" width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>Eliminare questo documento?</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Annulla</Button>
          <Button variant="danger" onClick={handleDelete}>Elimina</Button>
        </div>
      </Modal>
    </div>
  )
}

/* ════════════════════════════════════════
   TAB: TEAM
   ════════════════════════════════════════ */

const emptyMember = (): TeamMember => ({
  id: crypto.randomUUID(),
  nome: '',
  cognome: '',
  ruolo: 'developer_fullstack',
  email: '',
  telefono: '',
  data_ingresso: new Date().toISOString().slice(0, 10),
  data_uscita: null,
  tariffa_oraria: null,
  note: '',
  attivo: true,
})

/* ════════════════════════════════════════
   TAB: SPESE PROGETTO
   ════════════════════════════════════════ */

const categoriaSpesaLabel: Record<CategoriaSpesa, string> = {
  software: 'Software', hardware: 'Hardware', servizi: 'Servizi', trasferta: 'Trasferta', altro: 'Altro',
}

const FREQUENZA_LABEL: Record<FrequenzaSpesa, string> = {
  mensile: 'Mensile', trimestrale: 'Trimestrale', semestrale: 'Semestrale', annuale: 'Annuale',
}

const FREQUENZA_DIVISORE: Record<FrequenzaSpesa, number> = {
  mensile: 1, trimestrale: 3, semestrale: 6, annuale: 12,
}

const ricorrenteToMensile = (r: SpesaRicorrente) =>
  r.importo / FREQUENZA_DIVISORE[r.frequenza ?? 'mensile']

const normalizeRicorrente = (r: SpesaRicorrente): SpesaRicorrente => ({
  ...r,
  frequenza: r.frequenza ?? 'mensile',
  attiva: r.attiva ?? true,
  data_inizio: r.data_inizio ?? '',
})

type SpesaForm = {
  data: string; categoria: CategoriaSpesa; importo: string; descrizione: string
}

const emptySpesaForm: SpesaForm = {
  data: new Date().toISOString().slice(0, 10), categoria: 'software', importo: '', descrizione: '',
}

const emptyRicForm = (): SpesaRicorrente => ({
  id: crypto.randomUUID(),
  nome: '',
  importo: 0,
  categoria: 'software',
  frequenza: 'mensile',
  attiva: true,
  data_inizio: new Date().toISOString().slice(0, 10),
  note: '',
})

const SpeseProgettoTab = ({ progetto, onSave, logActivity }: {
  progetto: Progetto; onSave: () => void; logActivity: (a: string, d?: string) => Promise<void>
}) => {
  const isMobile = useIsMobile()
  const progettoId = progetto.id

  /* ─ Una tantum state ─ */
  const [spese, setSpese] = useState<Spesa[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Spesa | null>(null)
  const [form, setForm] = useState<SpesaForm>({ ...emptySpesaForm })
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [filterCat, setFilterCat] = useState<CategoriaSpesa | ''>('')

  /* ─ Ricorrenti state ─ */
  const storedRic = progetto.spese_ricorrenti as { items?: SpesaRicorrente[] } | null
  const [ricorrenti, setRicorrenti] = useState<SpesaRicorrente[]>((storedRic?.items ?? []).map(normalizeRicorrente))
  const [ricModal, setRicModal] = useState(false)
  const [ricEditing, setRicEditing] = useState<SpesaRicorrente | null>(null)
  const [ricForm, setRicForm] = useState<SpesaRicorrente>(emptyRicForm())
  const [ricDeleteId, setRicDeleteId] = useState<string | null>(null)
  const [savingRic, setSavingRic] = useState(false)

  useEffect(() => {
    const s = progetto.spese_ricorrenti as { items?: SpesaRicorrente[] } | null
    setRicorrenti((s?.items ?? []).map(normalizeRicorrente))
  }, [progetto.spese_ricorrenti])

  /* ─ Load una tantum ─ */
  const loadSpese = useCallback(async () => {
    const { data } = await supabase
      .from('spese')
      .select('*')
      .eq('progetto_id', progettoId)
      .order('data', { ascending: false })
    setSpese(data ?? [])
    setLoading(false)
  }, [progettoId])

  useEffect(() => { loadSpese() }, [loadSpese])

  /* ─ Una tantum CRUD ─ */
  const openNew = () => { setEditing(null); setForm({ ...emptySpesaForm }); setErrors({}); setModal(true) }
  const openEdit = (s: Spesa) => {
    setEditing(s)
    setForm({ data: s.data, categoria: s.categoria, importo: String(s.importo), descrizione: s.descrizione })
    setErrors({}); setModal(true)
  }

  const saveSpesa = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = { ...form, progetto_id: progettoId, importo: Number(form.importo) || 0 }
    const result = validate(spesaSchema, payload)
    if (!result.success) { setErrors(result.errors); return }
    setErrors({}); setSaving(true)
    const { error } = editing
      ? await supabase.from('spese').update(result.data).eq('id', editing.id)
      : await supabase.from('spese').insert(result.data)
    if (error) { setErrors({ _form: safeErrorMessage(error) }); setSaving(false); return }
    setSaving(false); setModal(false)
    await logActivity(editing ? 'Spesa aggiornata' : 'Spesa registrata', `${fmtEur(Number(form.importo))} — ${form.descrizione}`)
    loadSpese()
  }

  const removeSpesa = async () => {
    if (!deleteId) return
    const s = spese.find(x => x.id === deleteId)
    await supabase.from('spese').delete().eq('id', deleteId)
    setDeleteId(null)
    if (s) await logActivity('Spesa eliminata', `${fmtEur(s.importo)} — ${s.descrizione}`)
    loadSpese()
  }

  const sf = (k: keyof SpesaForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  /* ─ Ricorrenti CRUD ─ */
  const saveRicorrenti = async (updated: SpesaRicorrente[]) => {
    setSavingRic(true)
    await supabase.from('progetti').update({ spese_ricorrenti: { items: updated } }).eq('id', progettoId)
    setSavingRic(false)
    onSave()
  }

  const openNewRic = () => { setRicEditing(null); setRicForm(emptyRicForm()); setRicModal(true) }
  const openEditRic = (r: SpesaRicorrente) => { setRicEditing(r); setRicForm({ ...r }); setRicModal(true) }

  const saveRicForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ricForm.nome.trim() || ricForm.importo <= 0) return
    let updated: SpesaRicorrente[]
    if (ricEditing) {
      updated = ricorrenti.map(r => r.id === ricEditing.id ? { ...ricForm } : r)
    } else {
      updated = [...ricorrenti, { ...ricForm }]
    }
    setRicorrenti(updated)
    setRicModal(false)
    await saveRicorrenti(updated)
    await logActivity(ricEditing ? 'Spesa ricorrente aggiornata' : 'Spesa ricorrente aggiunta', `${ricForm.nome} — ${fmtEur(ricForm.importo)}/${ricForm.frequenza}`)
  }

  const removeRic = async () => {
    if (!ricDeleteId) return
    const r = ricorrenti.find(x => x.id === ricDeleteId)
    const updated = ricorrenti.filter(x => x.id !== ricDeleteId)
    setRicorrenti(updated)
    setRicDeleteId(null)
    await saveRicorrenti(updated)
    if (r) await logActivity('Spesa ricorrente eliminata', r.nome)
  }

  const toggleRicAttiva = async (id: string) => {
    const updated = ricorrenti.map(r => r.id === id ? { ...r, attiva: !r.attiva } : r)
    setRicorrenti(updated)
    await saveRicorrenti(updated)
  }

  /* ─ Computed ─ */
  const filtered = filterCat ? spese.filter(s => s.categoria === filterCat) : spese
  const totalFiltered = filtered.reduce((acc, s) => acc + s.importo, 0)
  const totalAll = spese.reduce((acc, s) => acc + s.importo, 0)

  const ricAttive = ricorrenti.filter(r => r.attiva)
  const costoRicMensile = ricAttive.reduce((s, r) => s + ricorrenteToMensile(r), 0)
  const costoRicAnnuo = costoRicMensile * 12

  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const totalSpeseMese = spese.filter(s => s.data >= firstOfMonth).reduce((s, x) => s + x.importo, 0)

  const contratto = progetto as any
  const ricavoMensile = contratto?.pagamento_mensile ?? 0
  const margineMese = ricavoMensile - totalSpeseMese - costoRicMensile

  if (loading) return <div style={{ color: '#6C7F94', fontSize: 13 }}>Caricamento...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── KPI ── */}
      <Card style={{ padding: isMobile ? '14px 16px' : '16px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? 16 : 24 }}>
          <div>
            <div style={{ fontSize: 10, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Costi ric. / mese</div>
            <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 700, color: '#1A2332', marginTop: 2 }}>{fmtEur(costoRicMensile)}</div>
            <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{ricAttive.length} voci attive</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Spese una tantum</div>
            <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 700, color: '#1A2332', marginTop: 2 }}>{fmtEur(totalAll)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Spese mese</div>
            <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 700, color: '#1A2332', marginTop: 2 }}>{fmtEur(totalSpeseMese)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Margine mese</div>
            <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 700, color: margineMese >= 0 ? '#1A2332' : '#DC2626', marginTop: 2 }}>{fmtEur(margineMese)}</div>
            <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>ric. − spese − ricorr.</div>
          </div>
        </div>
      </Card>

      {/* ══════════════ SPESE RICORRENTI ══════════════ */}
      <Card>
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#1A2332', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Spese ricorrenti</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {savingRic && <span style={{ fontSize: 11, color: '#6C7F94' }}>Salvataggio...</span>}
            <Button size="sm" variant="ghost" onClick={openNewRic}><Plus style={{ width: 11, height: 11 }} /> Aggiungi</Button>
          </div>
        </div>
        {ricorrenti.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', fontSize: 12, color: '#9CA3AF' }}>Nessuna spesa ricorrente. Aggiungi hosting, domini, licenze, API...</div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                  <th style={{ textAlign: 'left', padding: '8px 24px', fontWeight: 600, color: '#6C7F94', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Descrizione</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: '#6C7F94', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Categoria</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: '#6C7F94', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Frequenza</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600, color: '#6C7F94', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Importo</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600, color: '#6C7F94', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Equiv. / mese</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, color: '#6C7F94', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Stato</th>
                  <th style={{ width: 80, padding: '8px 16px' }} />
                </tr>
              </thead>
              <tbody>
                {ricorrenti.map(r => {
                  const mensile = ricorrenteToMensile(r)
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #F3F4F6', opacity: r.attiva ? 1 : 0.45 }}>
                      <td style={{ padding: '8px 24px', color: '#1A2332', fontWeight: 500 }}>
                        {r.nome}
                        {r.note && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{r.note}</div>}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#6C7F94' }}>{categoriaSpesaLabel[r.categoria]}</td>
                      <td style={{ padding: '8px 12px', color: '#6C7F94' }}>{FREQUENZA_LABEL[r.frequenza ?? 'mensile']}</td>
                      <td style={{ padding: '8px 12px', color: '#1A2332', fontWeight: 600, textAlign: 'right' }}>{fmtEur(r.importo)}</td>
                      <td style={{ padding: '8px 12px', color: '#6C7F94', textAlign: 'right', fontSize: 11 }}>{fmtEur(mensile)}/m</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <button
                          onClick={() => toggleRicAttiva(r.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: r.attiva ? '#15803D' : '#9CA3AF', padding: '2px 8px' }}
                        >
                          {r.attiva ? 'Attiva' : 'Disattivata'}
                        </button>
                      </td>
                      <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button onClick={() => openEditRic(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 2, display: 'flex' }}><Pencil style={{ width: 12, height: 12 }} /></button>
                          <button onClick={() => setRicDeleteId(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 2, display: 'flex' }}><Trash2 style={{ width: 12, height: 12 }} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 24px', borderTop: '1px solid #E5E7EB' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1A2332' }}>Totale mensile (attive)</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1A2332' }}>{fmtEur(costoRicMensile)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 24px 10px' }}>
              <span style={{ fontSize: 11, color: '#6C7F94' }}>Proiezione annua</span>
              <span style={{ fontSize: 11, color: '#6C7F94' }}>{fmtEur(costoRicAnnuo)}</span>
            </div>
          </>
        )}
      </Card>

      {/* ══════════════ SPESE UNA TANTUM ══════════════ */}
      <Card>
        <div style={{ padding: isMobile ? '12px 14px' : '14px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1A2332', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Spese una tantum</span>
            <Select value={filterCat} onChange={e => setFilterCat(e.target.value as CategoriaSpesa | '')} style={{ flex: 1, minWidth: 120, height: 28, fontSize: 11 }}>
              <option value="">Tutte</option>
              {Object.entries(categoriaSpesaLabel).map(([val, lab]) => (
                <option key={val} value={val}>{lab}</option>
              ))}
            </Select>
            {filterCat && (
              <span style={{ fontSize: 11, color: '#6C7F94' }}>{filtered.length} — {fmtEur(totalFiltered)}</span>
            )}
          </div>
          <Button size="sm" onClick={openNew} style={isMobile ? { width: '100%', justifyContent: 'center' } : {}}><Plus style={{ width: 12, height: 12 }} /> Nuova spesa</Button>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', fontSize: 12, color: '#9CA3AF' }}>
            {spese.length === 0 ? 'Nessuna spesa registrata.' : 'Nessuna spesa per questa categoria.'}
          </div>
        ) : isMobile ? (
          /* Mobile: card per spesa */
          <>
            {filtered.map((s, idx) => (
              <div key={s.id} style={{ padding: '12px 14px', borderBottom: idx < filtered.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2332', marginBottom: 2 }}>{s.descrizione}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', display: 'flex', gap: 8 }}>
                      <span>{fmtDate(s.data)}</span>
                      <span>·</span>
                      <span>{categoriaSpesaLabel[s.categoria] ?? s.categoria}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1A2332' }}>{fmtEur(s.importo)}</span>
                    <button onClick={() => openEdit(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 6, display: 'flex' }}><Pencil style={{ width: 13, height: 13 }} /></button>
                    <button onClick={() => setDeleteId(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 6, display: 'flex' }}><Trash2 style={{ width: 13, height: 13 }} /></button>
                  </div>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid #E5E7EB' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1A2332' }}>Totale</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1A2332' }}>{fmtEur(filterCat ? totalFiltered : totalAll)}</span>
            </div>
          </>
        ) : (
          /* Desktop: table grid */
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 2fr 1fr 1fr 80px', padding: '8px 20px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
              {['Data', 'Descrizione', 'Categoria', 'Importo', ''].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
              ))}
            </div>
            {filtered.map(s => (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '0.8fr 2fr 1fr 1fr 80px', padding: '10px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#4B5563' }}>{fmtDate(s.data)}</span>
                <span style={{ fontSize: 13, color: '#1A2332', fontWeight: 500 }}>{s.descrizione}</span>
                <span style={{ fontSize: 11, color: '#6C7F94' }}>{categoriaSpesaLabel[s.categoria] ?? s.categoria}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1A2332' }}>{fmtEur(s.importo)}</span>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={() => openEdit(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 4, display: 'flex' }}><Pencil style={{ width: 13, height: 13 }} /></button>
                  <button onClick={() => setDeleteId(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, display: 'flex' }}><Trash2 style={{ width: 13, height: 13 }} /></button>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', borderTop: '1px solid #E5E7EB' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1A2332' }}>Totale</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1A2332' }}>{fmtEur(filterCat ? totalFiltered : totalAll)}</span>
            </div>
          </>
        )}
      </Card>

      {/* ── Modal spesa una tantum ── */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifica spesa' : 'Nuova spesa'} width="520px">
        <form onSubmit={saveSpesa} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {errors._form && <p style={{ fontSize: 12, color: '#DC2626' }}>{errors._form}</p>}
          <FormField label="Descrizione" required error={errors.descrizione}>
            <Input value={form.descrizione} onChange={sf('descrizione')} placeholder="Es. Licenza Cursor, Hosting Vercel..." maxLength={500} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: 12 }}>
            <FormField label="Importo (€)" required error={errors.importo}>
              <Input type="number" step="0.01" value={form.importo} onChange={sf('importo')} placeholder="0.00" />
            </FormField>
            <FormField label="Categoria" error={errors.categoria}>
              <Select value={form.categoria} onChange={sf('categoria')}>
                {Object.entries(categoriaSpesaLabel).map(([val, lab]) => (
                  <option key={val} value={val}>{lab}</option>
                ))}
              </Select>
            </FormField>
            <div style={isMobile ? { gridColumn: '1 / -1' } : {}}>
              <FormField label="Data" required error={errors.data}>
                <Input type="date" value={form.data} onChange={sf('data')} />
              </FormField>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>Annulla</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</Button>
          </div>
        </form>
      </Modal>

      {/* ── Modal spesa ricorrente ── */}
      <Modal open={ricModal} onClose={() => setRicModal(false)} title={ricEditing ? 'Modifica spesa ricorrente' : 'Nuova spesa ricorrente'} width="520px">
        <form onSubmit={saveRicForm} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormField label="Descrizione" required>
            <Input value={ricForm.nome} onChange={e => setRicForm(p => ({ ...p, nome: e.target.value }))} maxLength={200} placeholder="Es. Hosting Vercel, Dominio, API OpenAI..." />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <FormField label="Importo (€)" required>
              <Input type="number" value={ricForm.importo || ''} onChange={e => setRicForm(p => ({ ...p, importo: Number(e.target.value) || 0 }))} min={0} step="0.01" placeholder="Es. 29.90" />
            </FormField>
            <FormField label="Frequenza">
              <Select value={ricForm.frequenza} onChange={e => setRicForm(p => ({ ...p, frequenza: e.target.value as FrequenzaSpesa }))}>
                <option value="mensile">Mensile</option>
                <option value="trimestrale">Trimestrale</option>
                <option value="semestrale">Semestrale</option>
                <option value="annuale">Annuale</option>
              </Select>
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <FormField label="Categoria">
              <Select value={ricForm.categoria} onChange={e => setRicForm(p => ({ ...p, categoria: e.target.value as CategoriaSpesa }))}>
                {Object.entries(categoriaSpesaLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </FormField>
            <FormField label="Data inizio">
              <Input type="date" value={ricForm.data_inizio} onChange={e => setRicForm(p => ({ ...p, data_inizio: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Note">
            <Input value={ricForm.note} onChange={e => setRicForm(p => ({ ...p, note: e.target.value }))} maxLength={300} placeholder="Note opzionali..." />
          </FormField>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 6 }}>
            <Button type="button" variant="ghost" onClick={() => setRicModal(false)}>Annulla</Button>
            <Button type="submit" disabled={!ricForm.nome.trim() || ricForm.importo <= 0}>{ricEditing ? 'Salva' : 'Aggiungi'}</Button>
          </div>
        </form>
      </Modal>

      {/* ── Modal elimina una tantum ── */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Elimina spesa" width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>Eliminare questa spesa? L'operazione non è reversibile.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Annulla</Button>
          <Button variant="danger" onClick={removeSpesa}>Elimina</Button>
        </div>
      </Modal>

      {/* ── Modal elimina ricorrente ── */}
      <Modal open={!!ricDeleteId} onClose={() => setRicDeleteId(null)} title="Elimina spesa ricorrente" width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>Eliminare questa spesa ricorrente?</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setRicDeleteId(null)}>Annulla</Button>
          <Button variant="danger" onClick={removeRic}>Elimina</Button>
        </div>
      </Modal>
    </div>
  )
}

/* ════════════════════════════════════════
   TAB: TEAM
   ════════════════════════════════════════ */

const TeamTab = ({ progetto, onSave, logActivity }: { progetto: Progetto; onSave: () => void; logActivity: (a: string, d?: string) => Promise<void> }) => {
  const isMobile = useIsMobile()
  const stored = progetto.team_membri as { members?: TeamMember[] } | null
  const [members, setMembers] = useState<TeamMember[]>(stored?.members ?? [])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [form, setForm] = useState<TeamMember>(emptyMember())
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [viewId, setViewId] = useState<string | null>(null)

  const activeMembers = members.filter(m => m.attivo)
  const inactiveMembers = members.filter(m => !m.attivo)

  const ruoliCount: Record<string, number> = {}
  activeMembers.forEach(m => { ruoliCount[m.ruolo] = (ruoliCount[m.ruolo] ?? 0) + 1 })

  const save = async (updated: TeamMember[]) => {
    setSaving(true)
    setSaveError(null)
    const { error } = await supabase.from('progetti').update({
      team_membri: { members: updated },
    }).eq('id', progetto.id)
    if (error) {
      setSaveError(safeErrorMessage(error))
      setSaving(false)
      return
    }
    await logActivity('Team aggiornato', `${updated.filter(m => m.attivo).length} membri attivi`)
    setSaving(false)
    onSave()
  }

  const openNew = () => {
    setEditing(null)
    setForm(emptyMember())
    setModal(true)
  }

  const openEdit = (m: TeamMember) => {
    setEditing(m)
    setForm({ ...m })
    setModal(true)
  }

  const saveMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim() || !form.cognome.trim()) return
    let updated: TeamMember[]
    if (editing) {
      updated = members.map(m => m.id === editing.id ? { ...form } : m)
    } else {
      updated = [...members, { ...form }]
    }
    setMembers(updated)
    setModal(false)
    await save(updated)
  }

  const removeMember = async () => {
    if (!deleteId) return
    const m = members.find(x => x.id === deleteId)
    const updated = members.filter(x => x.id !== deleteId)
    setMembers(updated)
    setDeleteId(null)
    if (m) await logActivity('Membro rimosso dal team', `${m.nome} ${m.cognome}`)
    await save(updated)
  }

  const toggleAttivo = async (id: string) => {
    const updated = members.map(m => m.id === id ? { ...m, attivo: !m.attivo } : m)
    setMembers(updated)
    const m = updated.find(x => x.id === id)
    if (m) await logActivity(m.attivo ? 'Membro riattivato' : 'Membro disattivato', `${m.nome} ${m.cognome}`)
    await save(updated)
  }

  const ff = (k: keyof TeamMember) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const viewMember = members.find(m => m.id === viewId)

  return (
    <div>
      {saveError && (
        <div style={{ fontSize: 12, color: '#DC2626', padding: '10px 16px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', marginBottom: 16 }}>{saveError}</div>
      )}

      {/* Status bar */}
      <Card style={{ padding: isMobile ? '14px 16px' : '16px 24px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: isMobile ? 12 : 24 }}>
          <div>
            <div style={{ fontSize: 10, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Attivi</div>
            <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: '#1A2332', marginTop: 2 }}>{activeMembers.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Totale</div>
            <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: '#1A2332', marginTop: 2 }}>{members.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ruoli</div>
            <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: '#1A2332', marginTop: 2 }}>{Object.keys(ruoliCount).length}</div>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 8 }}>
        {saving && <span style={{ fontSize: 12, color: '#6C7F94', alignSelf: 'center' }}>Salvataggio...</span>}
        <Button size="sm" onClick={openNew}><Plus style={{ width: 12, height: 12 }} /> Aggiungi membro</Button>
      </div>

      {members.length === 0 ? (
        <EmptyState icon={Users} title="Nessun membro nel team" description="Aggiungi le persone che lavorano su questo progetto." action={{ label: 'Aggiungi membro', onClick: openNew }} />
      ) : (
        <>
          {/* Active members */}
          {activeMembers.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Membri attivi ({activeMembers.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeMembers.map(m => (
                  <Card key={m.id} style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#1A2332', flexShrink: 0 }}>
                          {m.nome.charAt(0).toUpperCase()}{m.cognome.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2332' }}>{m.nome} {m.cognome}</div>
                          <div style={{ fontSize: 11, color: '#6C7F94', marginTop: 1 }}>{ruoloLabel(m.ruolo)}{m.email ? ` · ${m.email}` : ''}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={() => setViewId(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 4, display: 'flex' }} title="Dettaglio">
                          <Eye style={{ width: 13, height: 13 }} />
                        </button>
                        <button onClick={() => openEdit(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 4, display: 'flex' }} title="Modifica">
                          <Pencil style={{ width: 13, height: 13 }} />
                        </button>
                        <button onClick={() => toggleAttivo(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 4, display: 'flex' }} title="Disattiva">
                          <EyeOff style={{ width: 13, height: 13 }} />
                        </button>
                        <button onClick={() => setDeleteId(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, display: 'flex' }} title="Rimuovi">
                          <Trash2 style={{ width: 13, height: 13 }} />
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Inactive members */}
          {inactiveMembers.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Non attivi ({inactiveMembers.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {inactiveMembers.map(m => (
                  <Card key={m.id} style={{ padding: '16px 20px', opacity: 0.6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#9CA3AF', flexShrink: 0 }}>
                          {m.nome.charAt(0).toUpperCase()}{m.cognome.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#6C7F94' }}>{m.nome} {m.cognome}</div>
                          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{ruoloLabel(m.ruolo)}{m.data_uscita ? ` · Uscita: ${fmtDate(m.data_uscita)}` : ''}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={() => toggleAttivo(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 4, display: 'flex' }} title="Riattiva">
                          <Eye style={{ width: 13, height: 13 }} />
                        </button>
                        <button onClick={() => setDeleteId(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, display: 'flex' }} title="Rimuovi">
                          <Trash2 style={{ width: 13, height: 13 }} />
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Ruoli breakdown */}
          {Object.keys(ruoliCount).length > 0 && (
            <Card style={{ padding: '16px 20px', marginTop: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Distribuzione ruoli</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(ruoliCount).map(([ruolo, count]) => (
                  <span key={ruolo} style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #E5E7EB', color: '#1A2332', fontWeight: 500 }}>
                    {ruoloLabel(ruolo as RuoloTeam)} ({count})
                  </span>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Add / Edit modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifica membro' : 'Aggiungi membro'} width="560px">
        <form onSubmit={saveMember} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormField label="Nome" required>
              <Input value={form.nome} onChange={ff('nome')} maxLength={100} />
            </FormField>
            <FormField label="Cognome" required>
              <Input value={form.cognome} onChange={ff('cognome')} maxLength={100} />
            </FormField>
          </div>
          <FormField label="Ruolo" required>
            <Select value={form.ruolo} onChange={ff('ruolo')}>
              {RUOLI_TEAM.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormField label="Email">
              <Input type="email" value={form.email} onChange={ff('email')} maxLength={200} />
            </FormField>
            <FormField label="Telefono">
              <Input value={form.telefono} onChange={ff('telefono')} maxLength={30} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormField label="Tariffa oraria">
              <Input type="number" value={form.tariffa_oraria ?? ''} onChange={e => setForm(p => ({ ...p, tariffa_oraria: e.target.value ? Number(e.target.value) : null }))} min={0} step="0.01" />
            </FormField>
            <FormField label="Data ingresso">
              <Input type="date" value={form.data_ingresso} onChange={ff('data_ingresso')} />
            </FormField>
          </div>
          {editing && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <FormField label="Data uscita">
                <Input type="date" value={form.data_uscita ?? ''} onChange={e => setForm(p => ({ ...p, data_uscita: e.target.value || null }))} />
              </FormField>
              <FormField label="Stato">
                <Select value={form.attivo ? 'attivo' : 'non_attivo'} onChange={e => setForm(p => ({ ...p, attivo: e.target.value === 'attivo' }))}>
                  <option value="attivo">Attivo</option>
                  <option value="non_attivo">Non attivo</option>
                </Select>
              </FormField>
            </div>
          )}
          <FormField label="Note">
            <TextArea value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} maxLength={500} style={{ minHeight: 80 }} />
          </FormField>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>Annulla</Button>
            <Button type="submit" disabled={!form.nome.trim() || !form.cognome.trim()}>{editing ? 'Salva modifiche' : 'Aggiungi'}</Button>
          </div>
        </form>
      </Modal>

      {/* View member detail modal */}
      <Modal open={!!viewMember} onClose={() => setViewId(null)} title={viewMember ? `${viewMember.nome} ${viewMember.cognome}` : ''} width="480px">
        {viewMember && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#1A2332' }}>
                {viewMember.nome.charAt(0).toUpperCase()}{viewMember.cognome.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1A2332' }}>{viewMember.nome} {viewMember.cognome}</div>
                <div style={{ fontSize: 12, color: '#6C7F94' }}>{ruoloLabel(viewMember.ruolo)}</div>
              </div>
            </div>
            <div style={{ borderTop: '1px solid #F3F4F6' }}>
              <InfoRow label="Email" value={viewMember.email || '—'} />
              <InfoRow label="Telefono" value={viewMember.telefono || '—'} />
              <InfoRow label="Tariffa oraria" value={viewMember.tariffa_oraria != null ? `${viewMember.tariffa_oraria.toFixed(2)} €/h` : '—'} />
              <InfoRow label="Data ingresso" value={fmtDate(viewMember.data_ingresso)} />
              <InfoRow label="Data uscita" value={viewMember.data_uscita ? fmtDate(viewMember.data_uscita) : '—'} />
              <InfoRow label="Stato" value={viewMember.attivo ? 'Attivo' : 'Non attivo'} />
            </div>
            {viewMember.note && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Note</div>
                <div style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{viewMember.note}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 16 }}>
              <Button variant="ghost" size="sm" onClick={() => { setViewId(null); openEdit(viewMember) }}>
                <Pencil style={{ width: 12, height: 12 }} /> Modifica
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setViewId(null)}>Chiudi</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete modal */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Rimuovi membro" width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>Rimuovere questo membro dal team del progetto?</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Annulla</Button>
          <Button variant="danger" onClick={removeMember}>Rimuovi</Button>
        </div>
      </Modal>
    </div>
  )
}

/* ════════════════════════════════════════
   TAB: CYBERSECURITY
   ════════════════════════════════════════ */

const CybersecurityTab = ({ progetto, onSave, logActivity }: { progetto: Progetto; onSave: () => void; logActivity: (a: string, d?: string) => Promise<void> }) => {
  const stored = progetto.security_checklist as { sections?: SecuritySection[] } | null
  const [sections, setSections] = useState<SecuritySection[]>(
    stored?.sections?.length ? stored.sections : DEFAULT_SECURITY_CHECKLIST
  )
  const [saving, setSaving] = useState(false)

  const totalItems = sections.reduce((s, sec) => s + sec.items.length, 0)
  const checkedItems = sections.reduce((s, sec) => s + sec.items.filter(i => i.checked).length, 0)
  const pct = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0

  const toggleItem = (sIdx: number, iIdx: number) => {
    setSections(prev => prev.map((sec, si) =>
      si === sIdx
        ? { ...sec, items: sec.items.map((item, ii) => ii === iIdx ? { ...item, checked: !item.checked } : item) }
        : sec
    ))
  }

  const updateNote = (sIdx: number, iIdx: number, note: string) => {
    setSections(prev => prev.map((sec, si) =>
      si === sIdx
        ? { ...sec, items: sec.items.map((item, ii) => ii === iIdx ? { ...item, note } : item) }
        : sec
    ))
  }

  const save = async () => {
    setSaving(true)
    await supabase.from('progetti').update({ security_checklist: { sections } }).eq('id', progetto.id)
    await logActivity('Checklist cybersecurity aggiornata', `${checkedItems}/${totalItems} completati (${pct}%)`)
    setSaving(false)
    onSave()
  }

  return (
    <div>
      {/* Status bar */}
      <Card style={{ padding: '20px 24px', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1A2332' }}>Stato complessivo</span>
            <span style={{ fontSize: 13, color: '#6C7F94', marginLeft: 12 }}>{checkedItems}/{totalItems} verificati</span>
          </div>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva checklist'}</Button>
        </div>
        <div style={{ width: '100%', height: 6, backgroundColor: '#F3F4F6', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: pct === 100 ? '#15803D' : pct >= 50 ? '#F59E0B' : '#DC2626', transition: 'width 0.3s' }} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#1A2332', marginTop: 8 }}>{pct}%</div>
      </Card>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sections.map((sec, sIdx) => {
          const secChecked = sec.items.filter(i => i.checked).length
          return (
            <Card key={sec.title}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1A2332', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{sec.title}</span>
                <span style={{ fontSize: 11, color: '#6C7F94' }}>{secChecked}/{sec.items.length}</span>
              </div>
              <div style={{ padding: '8px 20px' }}>
                {sec.items.map((item, iIdx) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: iIdx < sec.items.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                    <input type="checkbox" checked={item.checked} onChange={() => toggleItem(sIdx, iIdx)} style={{ marginTop: 2 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: item.checked ? '#9CA3AF' : '#1A2332', textDecoration: item.checked ? 'line-through' : 'none' }}>{item.label}</div>
                      <input
                        value={item.note}
                        onChange={e => updateNote(sIdx, iIdx, e.target.value)}
                        placeholder="Note..."
                        style={{ marginTop: 4, fontSize: 11, color: '#6C7F94', border: 'none', borderBottom: '1px solid #F3F4F6', width: '100%', padding: '2px 0', outline: 'none', background: 'transparent' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════
   TAB: CREDENZIALI (ACCESSO PROTETTO)
   ════════════════════════════════════════ */

const AUTHORIZED_EMAIL = 'lorenzo@agentics.eu.com'

const tipoCredenzialeLabel: Record<TipoCredenziale, string> = {
  account: 'Account',
  api_key: 'API Key',
  database: 'Database',
  server: 'Server',
  certificato: 'Certificato',
  altro: 'Altro',
}

const tipoCredenzialeIcon: Record<TipoCredenziale, string> = {
  account: '●',
  api_key: '◆',
  database: '■',
  server: '▲',
  certificato: '◎',
  altro: '○',
}

type CredForm = {
  nome: string; tipo: TipoCredenziale; url: string
  username: string; password_encrypted: string; api_key: string; note: string
}

const emptyCredForm: CredForm = {
  nome: '', tipo: 'account', url: '', username: '', password_encrypted: '', api_key: '', note: '',
}

type AuthStep = 'password' | 'totp' | 'done'
const TOTP_CODE_LENGTH = 6

const CredenzialiTab = ({ progettoId, logActivity }: { progettoId: string; logActivity: (a: string, d?: string) => Promise<void> }) => {
  const [authorized, setAuthorized] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [authStep, setAuthStep] = useState<AuthStep>('password')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [totpDigits, setTotpDigits] = useState<string[]>(Array(TOTP_CODE_LENGTH).fill(''))
  const totpRefs = useRef<(HTMLInputElement | null)[]>([])

  const [creds, setCreds] = useState<ProgettoCredenziale[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<ProgettoCredenziale | null>(null)
  const [form, setForm] = useState<CredForm>({ ...emptyCredForm })
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [revealedFields, setRevealedFields] = useState<Record<string, Set<string>>>({})
  const [copiedField, setCopiedField] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const email = user?.email ?? ''
      setUserEmail(email)
      setAuthChecking(false)
    })()
  }, [])

  const handlePasswordStep = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true); setAuthError('')
    const { ok, error } = await verifyPassword(userEmail, authPassword)
    if (!ok) {
      setAuthError(error ?? 'Password non valida. Riprova.')
      setAuthLoading(false)
      return
    }
    setAuthLoading(false)
    setAuthError('')
    setAuthStep('totp')
    setTotpDigits(Array(TOTP_CODE_LENGTH).fill(''))
    setTimeout(() => totpRefs.current[0]?.focus(), 50)
  }

  const handleTotpVerify = async (code: string) => {
    setAuthLoading(true); setAuthError('')
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.[0]
      if (!totp) { setAuthError('Nessun fattore TOTP trovato.'); setAuthLoading(false); return }

      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id })
      if (chErr) throw chErr

      const { error: vErr } = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: challenge.id, code })
      if (vErr) throw vErr

      setAuthorized(true)
      setAuthStep('done')
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Codice non valido. Riprova.')
      setTotpDigits(Array(TOTP_CODE_LENGTH).fill(''))
      totpRefs.current[0]?.focus()
    } finally {
      setAuthLoading(false)
    }
  }

  const handleTotpDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const next = [...totpDigits]
    next[index] = value.slice(-1)
    setTotpDigits(next)
    if (value && index < TOTP_CODE_LENGTH - 1) totpRefs.current[index + 1]?.focus()
    if (next.every(d => d !== '')) handleTotpVerify(next.join(''))
  }

  const handleTotpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !totpDigits[index] && index > 0) totpRefs.current[index - 1]?.focus()
  }

  const handleTotpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, TOTP_CODE_LENGTH)
    if (!text) return
    const next = Array(TOTP_CODE_LENGTH).fill('')
    text.split('').forEach((ch, i) => { next[i] = ch })
    setTotpDigits(next)
    totpRefs.current[Math.min(text.length, TOTP_CODE_LENGTH - 1)]?.focus()
    if (text.length === TOTP_CODE_LENGTH) handleTotpVerify(text)
  }

  const loadCreds = useCallback(async () => {
    const { data, error } = await supabase
      .from('progetto_credenziali')
      .select('*')
      .eq('progetto_id', progettoId)
      .order('created_at', { ascending: false })
    if (error) console.error('loadCreds error:', error.message)
    setCreds(data ?? [])
    setLoading(false)
  }, [progettoId])

  useEffect(() => {
    if (authorized) loadCreds()
  }, [authorized, loadCreds])

  const openNew = () => {
    setEditing(null); setForm({ ...emptyCredForm }); setErrors({}); setModal(true)
  }

  const openEdit = (c: ProgettoCredenziale) => {
    setEditing(c)
    setForm({
      nome: c.nome, tipo: c.tipo, url: c.url ?? '',
      username: c.username ?? '', password_encrypted: c.password_encrypted ?? '',
      api_key: c.api_key ?? '', note: c.note ?? '',
    })
    setErrors({}); setModal(true)
  }

  const saveCred = async (e: React.FormEvent) => {
    e.preventDefault()
    const dataToValidate = {
      ...form,
      api_key: form.tipo === 'api_key' ? form.api_key : '',
    }
    const result = validate(progettoCredenzialeSchema, dataToValidate)
    if (!result.success) { setErrors(result.errors); return }
    setErrors({}); setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setErrors({ _form: 'Sessione scaduta. Ricarica la pagina.' }); setSaving(false); return }
      const payload = { ...result.data, progetto_id: progettoId, user_id: user.id }
      const { error } = editing
        ? await supabase.from('progetto_credenziali').update({ ...result.data, updated_at: new Date().toISOString() }).eq('id', editing.id)
        : await supabase.from('progetto_credenziali').insert(payload)
      if (error) { setErrors({ _form: safeErrorMessage(error) }); setSaving(false); return }
      setSaving(false); setModal(false)
      await logActivity(editing ? 'Credenziale aggiornata' : 'Credenziale aggiunta', `"${form.nome}" (${tipoCredenzialeLabel[form.tipo]})`)
      loadCreds()
    } catch (err: unknown) {
      setErrors({ _form: safeErrorMessage(err, 'Errore durante il salvataggio.') })
      setSaving(false)
    }
  }

  const [delStep, setDelStep] = useState<'password' | 'totp' | 'ready'>('password')
  const [delPassword, setDelPassword] = useState('')
  const [delTotpDigits, setDelTotpDigits] = useState<string[]>(Array(TOTP_CODE_LENGTH).fill(''))
  const [delError, setDelError] = useState('')
  const [delLoading, setDelLoading] = useState(false)
  const delTotpRefs = useRef<(HTMLInputElement | null)[]>([])

  const openDelete = (id: string) => {
    setDeleteId(id)
    setDelStep('password')
    setDelPassword('')
    setDelTotpDigits(Array(TOTP_CODE_LENGTH).fill(''))
    setDelError('')
  }

  const handleDelPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setDelLoading(true); setDelError('')
    const { ok, error } = await verifyPassword(userEmail, delPassword)
    if (!ok) { setDelError(error ?? 'Password non valida.'); setDelLoading(false); return }
    setDelLoading(false); setDelStep('totp')
    setDelTotpDigits(Array(TOTP_CODE_LENGTH).fill(''))
    setTimeout(() => delTotpRefs.current[0]?.focus(), 50)
  }

  const handleDelTotp = async (code: string) => {
    setDelLoading(true); setDelError('')
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.[0]
      if (!totp) { setDelError('Nessun fattore TOTP trovato.'); setDelLoading(false); return }
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id })
      if (chErr) throw chErr
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: challenge.id, code })
      if (vErr) throw vErr
      setDelStep('ready')
      if (!deleteId) return
      const c = creds.find(x => x.id === deleteId)
      await supabase.from('progetto_credenziali').delete().eq('id', deleteId)
      setDeleteId(null)
      if (c) await logActivity('Credenziale eliminata', `"${c.nome}"`)
      loadCreds()
    } catch (err: unknown) {
      setDelError(err instanceof Error ? err.message : 'Codice non valido.')
      setDelTotpDigits(Array(TOTP_CODE_LENGTH).fill(''))
      delTotpRefs.current[0]?.focus()
    } finally {
      setDelLoading(false)
    }
  }

  const handleDelTotpDigit = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const next = [...delTotpDigits]
    next[index] = value.slice(-1)
    setDelTotpDigits(next)
    if (value && index < TOTP_CODE_LENGTH - 1) delTotpRefs.current[index + 1]?.focus()
    if (next.every(d => d !== '')) handleDelTotp(next.join(''))
  }

  const handleDelTotpKey = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !delTotpDigits[index] && index > 0) delTotpRefs.current[index - 1]?.focus()
  }

  const handleDelTotpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, TOTP_CODE_LENGTH)
    if (!text) return
    const next = Array(TOTP_CODE_LENGTH).fill('')
    text.split('').forEach((ch, i) => { next[i] = ch })
    setDelTotpDigits(next)
    delTotpRefs.current[Math.min(text.length, TOTP_CODE_LENGTH - 1)]?.focus()
    if (text.length === TOTP_CODE_LENGTH) handleDelTotp(text)
  }

  const toggleReveal = (credId: string, field: string) => {
    setRevealedFields(prev => {
      const current = new Set(prev[credId] ?? [])
      if (current.has(field)) current.delete(field)
      else current.add(field)
      return { ...prev, [credId]: current }
    })
  }

  const isRevealed = (credId: string, field: string) =>
    revealedFields[credId]?.has(field) ?? false

  const copyToClipboard = async (text: string, fieldKey: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedField(fieldKey)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const maskValue = (val: string) => '•'.repeat(Math.min(val.length, 24))

  const cf = (k: keyof CredForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  /* ─── Unauthorized ─── */
  if (authChecking) return <div style={{ color: '#6C7F94', fontSize: 13 }}>Verifica accesso...</div>

  if (userEmail !== AUTHORIZED_EMAIL) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px' }}>
        <Lock style={{ width: 48, height: 48, color: '#DC2626', margin: '0 auto 20px', opacity: 0.5 }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1A2332', marginBottom: 8 }}>Accesso negato</div>
        <div style={{ fontSize: 13, color: '#6C7F94', maxWidth: 400, margin: '0 auto' }}>
          Questa sezione contiene dati riservati ed è accessibile esclusivamente dall'account autorizzato.
        </div>
      </div>
    )
  }

  /* ─── Re-authentication gate ─── */
  if (!authorized) {
    return (
      <div style={{ maxWidth: 420, margin: '40px auto', textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', backgroundColor: '#FEF2F2',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px',
        }}>
          <Shield style={{ width: 28, height: 28, color: '#DC2626' }} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1A2332', marginBottom: 6 }}>Verifica identità richiesta</div>
        <div style={{ fontSize: 13, color: '#6C7F94', marginBottom: 8 }}>
          L'accesso alle credenziali richiede una doppia verifica: password + codice 2FA.
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px',
            backgroundColor: authStep === 'password' ? BRAND : '#15803D',
            color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>
            {authStep === 'password' ? '1. Password' : '✓ Password'}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px',
            backgroundColor: authStep === 'totp' ? BRAND : '#E5E7EB',
            color: authStep === 'totp' ? '#fff' : '#9CA3AF',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            2. Codice 2FA
          </div>
        </div>

        {authError && (
          <div style={{ borderLeft: '3px solid #DC2626', backgroundColor: '#FEF2F2', padding: '10px 14px', marginBottom: 16, textAlign: 'left' }}>
            <p style={{ fontSize: 12, color: '#991B1B' }}>{authError}</p>
          </div>
        )}

        {/* Step 1: Password */}
        {authStep === 'password' && (
          <form onSubmit={handlePasswordStep} style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}>
            <FormField label="Email" hint="Accesso limitato">
              <Input value={userEmail} disabled style={{ color: '#6C7F94', backgroundColor: '#F9FAFB' }} />
            </FormField>
            <FormField label="Password" required>
              <Input
                type="password"
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                placeholder="Inserisci la tua password"
                autoFocus
              />
            </FormField>
            <Button type="submit" disabled={authLoading || !authPassword} style={{ width: '100%', justifyContent: 'center' }}>
              {authLoading ? 'Verifica...' : 'Continua →'}
            </Button>
          </form>
        )}

        {/* Step 2: TOTP 2FA */}
        {authStep === 'totp' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#6C7F94', marginBottom: 20 }}>
              Inserisci il codice a 6 cifre dalla tua app Authenticator.
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }} onPaste={handleTotpPaste}>
              {totpDigits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { totpRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleTotpDigitChange(i, e.target.value)}
                  onKeyDown={e => handleTotpKeyDown(i, e)}
                  disabled={authLoading}
                  style={{
                    width: 44, height: 52, textAlign: 'center',
                    fontSize: '20px', fontWeight: 700,
                    border: '1px solid #E5E7EB',
                    borderBottom: `2px solid ${d ? BRAND : '#E5E7EB'}`,
                    outline: 'none', color: '#1A2332',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderBottomColor = BRAND }}
                  onBlur={e => { if (!d) e.currentTarget.style.borderBottomColor = '#E5E7EB' }}
                />
              ))}
            </div>
            {authLoading && <div style={{ fontSize: 12, color: '#6C7F94' }}>Verifica in corso...</div>}
            <button
              onClick={() => { setAuthStep('password'); setAuthError(''); setAuthPassword('') }}
              style={{ marginTop: 16, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: BRAND, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              ← Torna alla password
            </button>
          </div>
        )}
      </div>
    )
  }

  /* ─── Credentials list ─── */
  if (loading) return <div style={{ color: '#6C7F94', fontSize: 13 }}>Caricamento...</div>

  const SecureField = ({ label, value, credId, field }: { label: string; value: string | null; credId: string; field: string }) => {
    if (!value) return null
    const revealed = isRevealed(credId, field)
    const fieldKey = `${credId}_${field}`
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', width: 80, flexShrink: 0 }}>{label}</span>
        <span style={{ fontSize: 13, fontFamily: revealed ? "'JetBrains Mono', 'Fira Code', monospace" : 'inherit', color: '#1A2332', flex: 1, wordBreak: 'break-all' }}>
          {revealed ? value : maskValue(value)}
        </span>
        <button onClick={() => toggleReveal(credId, field)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 3, display: 'flex' }} title={revealed ? 'Nascondi' : 'Mostra'}>
          {revealed ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
        </button>
        <button onClick={() => copyToClipboard(value, fieldKey)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedField === fieldKey ? '#15803D' : '#6C7F94', padding: 3, display: 'flex' }} title="Copia">
          <Copy style={{ width: 14, height: 14 }} />
        </button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button size="sm" onClick={openNew}><Plus style={{ width: 12, height: 12 }} /> Nuova credenziale</Button>
      </div>

      {creds.length === 0 ? (
        <EmptyState icon={KeyRound} title="Nessuna credenziale" description="Aggiungi credenziali riservate per questo progetto." action={{ label: 'Nuova credenziale', onClick: openNew }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {creds.map(c => {
            const typeLabel = tipoCredenzialeLabel[c.tipo]
            const typeIcon = tipoCredenzialeIcon[c.tipo]
            return (
              <Card key={c.id}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 16, color: '#DC2626', lineHeight: 1 }}>{typeIcon}</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1A2332' }}>{c.nome}</div>
                      <div style={{ fontSize: 11, color: '#6C7F94', marginTop: 1 }}>
                        {typeLabel}{c.url && <> — <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ color: BRAND, textDecoration: 'none' }}>{c.url}</a></>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openEdit(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 4, display: 'flex' }} title="Modifica"><Pencil style={{ width: 13, height: 13 }} /></button>
                    <button onClick={() => openDelete(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, display: 'flex' }} title="Elimina"><Trash2 style={{ width: 13, height: 13 }} /></button>
                  </div>
                </div>
                <div style={{ padding: '8px 20px 12px' }}>
                  <SecureField label="Username" value={c.username} credId={c.id} field="username" />
                  <SecureField label="Password" value={c.password_encrypted} credId={c.id} field="password" />
                  <SecureField label="API Key" value={c.api_key} credId={c.id} field="api_key" />
                  {c.note && (
                    <div style={{ fontSize: 12, color: '#6C7F94', marginTop: 8, padding: '8px 0', borderTop: '1px solid #F3F4F6' }}>{c.note}</div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create/edit modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifica credenziale' : 'Nuova credenziale'} width="560px">
        <form onSubmit={saveCred} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {errors._form && (
            <div style={{ borderLeft: '3px solid #DC2626', backgroundColor: '#FEF2F2', padding: '10px 14px' }}>
              <p style={{ fontSize: 12, color: '#991B1B' }}>{errors._form}</p>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
            <FormField label="Nome" required error={errors.nome}>
              <Input value={form.nome} onChange={cf('nome')} placeholder="Es. Google Cloud Console" maxLength={200} />
            </FormField>
            <FormField label="Tipo" error={errors.tipo}>
              <Select value={form.tipo} onChange={e => { cf('tipo')(e); if (e.target.value !== 'api_key') setForm(p => ({ ...p, api_key: '' })) }}>
                {Object.entries(tipoCredenzialeLabel).map(([val, lab]) => (
                  <option key={val} value={val}>{lab}</option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="URL" error={errors.url}>
            <Input value={form.url} onChange={cf('url')} placeholder="https://console.cloud.google.com" />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormField label="Username / Email" error={errors.username}>
              <Input value={form.username} onChange={cf('username')} placeholder="utente@dominio.com" />
            </FormField>
            <FormField label="Password" error={errors.password_encrypted}>
              <Input value={form.password_encrypted} onChange={cf('password_encrypted')} placeholder="Inserisci la password" />
            </FormField>
          </div>
          {form.tipo === 'api_key' && (
            <FormField label="API Key / Token" error={errors.api_key}>
              <Input value={form.api_key} onChange={cf('api_key')} placeholder="sk-..." />
            </FormField>
          )}
          <FormField label="Note" error={errors.note}>
            <TextArea value={form.note} onChange={cf('note')} placeholder="Note aggiuntive..." maxLength={2000} />
          </FormField>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>Annulla</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete modal — password + TOTP required */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Elimina credenziale" width="420px">
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', backgroundColor: '#FEF2F2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
          }}>
            <Trash2 style={{ width: 20, height: 20, color: '#DC2626' }} />
          </div>
          <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 4 }}>Eliminare questa credenziale? <strong>L'operazione non è reversibile.</strong></p>
          <p style={{ fontSize: 12, color: '#9CA3AF' }}>Conferma la tua identità con password e codice 2FA.</p>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{
            padding: '3px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            backgroundColor: delStep === 'password' ? '#DC2626' : '#15803D', color: '#fff',
          }}>
            {delStep === 'password' ? '1. Password' : '✓ Password'}
          </div>
          <div style={{
            padding: '3px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            backgroundColor: delStep === 'totp' ? '#DC2626' : '#E5E7EB',
            color: delStep === 'totp' ? '#fff' : '#9CA3AF',
          }}>
            2. Codice 2FA
          </div>
        </div>

        {delError && (
          <div style={{ borderLeft: '3px solid #DC2626', backgroundColor: '#FEF2F2', padding: '8px 12px', marginBottom: 14 }}>
            <p style={{ fontSize: 12, color: '#991B1B' }}>{delError}</p>
          </div>
        )}

        {delStep === 'password' && (
          <form onSubmit={handleDelPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormField label="Password" required>
              <Input type="password" value={delPassword} onChange={e => setDelPassword(e.target.value)} placeholder="Inserisci la tua password" autoFocus />
            </FormField>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button type="button" variant="ghost" onClick={() => setDeleteId(null)}>Annulla</Button>
              <Button type="submit" variant="danger" disabled={delLoading || !delPassword}>{delLoading ? 'Verifica...' : 'Continua →'}</Button>
            </div>
          </form>
        )}

        {delStep === 'totp' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: '#6C7F94', marginBottom: 16 }}>Inserisci il codice a 6 cifre dalla tua app Authenticator.</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 16 }} onPaste={handleDelTotpPaste}>
              {delTotpDigits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { delTotpRefs.current[i] = el }}
                  type="text" inputMode="numeric" maxLength={1} value={d}
                  onChange={e => handleDelTotpDigit(i, e.target.value)}
                  onKeyDown={e => handleDelTotpKey(i, e)}
                  disabled={delLoading}
                  style={{
                    width: 40, height: 48, textAlign: 'center', fontSize: '18px', fontWeight: 700,
                    border: '1px solid #FECACA', borderBottom: `2px solid ${d ? '#DC2626' : '#E5E7EB'}`,
                    outline: 'none', color: '#1A2332', transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderBottomColor = '#DC2626' }}
                  onBlur={e => { if (!d) e.currentTarget.style.borderBottomColor = '#E5E7EB' }}
                />
              ))}
            </div>
            {delLoading && <p style={{ fontSize: 12, color: '#6C7F94' }}>Eliminazione in corso...</p>}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12 }}>
              <button onClick={() => { setDelStep('password'); setDelPassword(''); setDelError('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: BRAND, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                ← Indietro
              </button>
              <button onClick={() => setDeleteId(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#6C7F94', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Annulla
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ════════════════════════════════════════
   TAB: NOTE
   ════════════════════════════════════════ */

const NoteTab = ({ progettoId, logActivity }: { progettoId: string; logActivity: (a: string, d?: string) => Promise<void> }) => {
  const [notes, setNotes] = useState<ProgettoNota[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<ProgettoNota | null>(null)
  const [form, setForm] = useState({ titolo: '', contenuto: '', autore: '' })
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const loadNotes = useCallback(async () => {
    const { data } = await supabase.from('progetto_note').select('*').eq('progetto_id', progettoId).order('created_at', { ascending: false })
    setNotes(data ?? [])
    setLoading(false)
  }, [progettoId])

  useEffect(() => { loadNotes() }, [loadNotes])

  const openNew = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setEditing(null)
    setForm({ titolo: '', contenuto: '', autore: user?.email ?? '' })
    setErrors({}); setModal(true)
  }

  const openEdit = (n: ProgettoNota) => {
    setEditing(n)
    setForm({ titolo: n.titolo, contenuto: n.contenuto ?? '', autore: n.autore })
    setErrors({}); setModal(true)
  }

  const saveNote = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = validate(progettoNotaSchema, form)
    if (!result.success) { setErrors(result.errors); return }
    setErrors({}); setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const payload = { ...result.data, progetto_id: progettoId, user_id: user.id }
    const { error } = editing
      ? await supabase.from('progetto_note').update({ titolo: result.data.titolo, contenuto: result.data.contenuto, autore: result.data.autore, updated_at: new Date().toISOString() }).eq('id', editing.id)
      : await supabase.from('progetto_note').insert(payload)
    if (error) { setErrors({ _form: safeErrorMessage(error) }); setSaving(false); return }
    setSaving(false); setModal(false)
    await logActivity(editing ? 'Nota aggiornata' : 'Nota creata', `"${form.titolo}"`)
    loadNotes()
  }

  const removeNote = async () => {
    if (!deleteId) return
    const n = notes.find(x => x.id === deleteId)
    await supabase.from('progetto_note').delete().eq('id', deleteId)
    setDeleteId(null)
    if (n) await logActivity('Nota eliminata', `"${n.titolo}"`)
    loadNotes()
  }

  if (loading) return <div style={{ color: '#6C7F94', fontSize: 13 }}>Caricamento...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button size="sm" onClick={openNew}><Plus style={{ width: 12, height: 12 }} /> Nuova nota</Button>
      </div>

      {notes.length === 0 ? (
        <EmptyState icon={StickyNote} title="Nessuna nota" description="Aggiungi note strategiche per questo progetto." action={{ label: 'Nuova nota', onClick: openNew }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {notes.map(n => (
            <Card key={n.id} style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1A2332' }}>{n.titolo}</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{n.autore} — {fmtDateTime(n.created_at)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => openEdit(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 4, display: 'flex' }}><Pencil style={{ width: 13, height: 13 }} /></button>
                  <button onClick={() => setDeleteId(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, display: 'flex' }}><Trash2 style={{ width: 13, height: 13 }} /></button>
                </div>
              </div>
              {n.contenuto && <div style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{n.contenuto}</div>}
            </Card>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifica nota' : 'Nuova nota'} width="560px">
        <form onSubmit={saveNote} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {errors._form && <p style={{ fontSize: 12, color: '#DC2626' }}>{errors._form}</p>}
          <FormField label="Titolo" required error={errors.titolo}>
            <Input value={form.titolo} onChange={e => setForm(p => ({ ...p, titolo: e.target.value }))} maxLength={200} />
          </FormField>
          <FormField label="Contenuto" error={errors.contenuto}>
            <TextArea value={form.contenuto} onChange={e => setForm(p => ({ ...p, contenuto: e.target.value }))} maxLength={2000} style={{ minHeight: 160 }} />
          </FormField>
          <FormField label="Autore" required error={errors.autore}>
            <Input value={form.autore} onChange={e => setForm(p => ({ ...p, autore: e.target.value }))} maxLength={200} />
          </FormField>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>Annulla</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Elimina nota" width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>Eliminare questa nota?</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Annulla</Button>
          <Button variant="danger" onClick={removeNote}>Elimina</Button>
        </div>
      </Modal>
    </div>
  )
}

/* ════════════════════════════════════════
   TAB: LEGAL – COMPLIANCE AI, GDPR & DATA
   ════════════════════════════════════════ */

const LEGAL_STORAGE_BUCKET = 'legal-documenti'

const DEFAULT_LEGAL_CHECKLIST: LegalSection[] = [
  {
    id: 'dpa', emoji: '', title: 'DPA – Data Processing Agreement',
    items: [
      { id: 'dpa_firmato', label: 'DPA firmato con il cliente', checked: false, note: '', required: true },
      { id: 'dpa_ai', label: 'DPA aggiornato con clausole uso AI', checked: false, note: '', required: true },
      { id: 'dpa_fornitori', label: 'DPA include fornitori terzi (sub-processor)', checked: false, note: '', required: true },
    ],
  },
  {
    id: 'trasferimento', emoji: '', title: 'Trasferimento Dati Extra UE',
    items: [
      { id: 'scc', label: 'SCC – Standard Contractual Clauses firmate', checked: false, note: '', required: true },
      { id: 'tia', label: 'TIA – Transfer Impact Assessment completato', checked: false, note: '', required: true },
      { id: 'fornitori_mappati', label: 'Elenco completo fornitori (AI, cloud, storage, email)', checked: false, note: '', required: true },
      { id: 'dati_destinazione', label: 'Destinazione dati documentata (USA, EU, altro)', checked: false, note: '', required: false },
      { id: 'misure_mitigazione', label: 'Misure di mitigazione documentate', checked: false, note: '', required: false },
    ],
  },
  {
    id: 'ai_docs', emoji: '', title: 'Documentazione Uso AI',
    items: [
      { id: 'ai_usage_policy', label: 'AI Usage Policy (come/per cosa viene usata l\'AI)', checked: false, note: '', required: true },
      { id: 'ai_system_desc', label: 'AI System Description (architettura, flussi, I/O)', checked: false, note: '', required: true },
      { id: 'ai_risk_assessment', label: 'AI Risk Assessment (errori, bias, decisioni auto)', checked: false, note: '', required: true },
      { id: 'ai_human_oversight', label: 'Human Oversight Policy (intervento umano, controlli)', checked: false, note: '', required: true },
      { id: 'ai_disclaimer', label: 'AI Output Disclaimer (responsabilita limitata)', checked: false, note: '', required: true },
    ],
  },
  {
    id: 'ai_act', emoji: '', title: 'AI Act – Documentazione',
    items: [
      { id: 'ai_classificazione', label: 'Classificazione sistema AI (basso/limitato/alto rischio)', checked: false, note: '', required: true },
      { id: 'ai_transparency', label: 'Transparency Document (utente sa che interagisce con AI)', checked: false, note: '', required: true },
      { id: 'ai_data_governance', label: 'Data Governance Document (qualita, origine, controlli dati)', checked: false, note: '', required: false },
      { id: 'ai_model_doc', label: 'Model Documentation (modello, provider, versioni, limiti)', checked: false, note: '', required: false },
      { id: 'ai_logging', label: 'Logging & Traceability (log decisioni AI, tracciabilita)', checked: false, note: '', required: true },
      { id: 'ai_incident', label: 'Incident Reporting Process (gestione errori critici AI)', checked: false, note: '', required: true },
    ],
  },
  {
    id: 'sicurezza_gdpr', emoji: '', title: 'Sicurezza Dati (GDPR)',
    items: [
      { id: 'data_protection', label: 'Data Protection Policy (cifratura, accessi, backup, retention)', checked: false, note: '', required: true },
      { id: 'access_control', label: 'Access Control Policy (ruoli, permessi, autenticazione)', checked: false, note: '', required: true },
      { id: 'data_breach', label: 'Data Breach Procedure (notifica 72h, escalation)', checked: false, note: '', required: true },
    ],
  },
  {
    id: 'registro', emoji: '', title: 'Registro Trattamenti',
    items: [
      { id: 'registro_categorie', label: 'Categorie dati personali documentate', checked: false, note: '', required: true },
      { id: 'registro_finalita', label: 'Finalita del trattamento definite', checked: false, note: '', required: true },
      { id: 'registro_base', label: 'Base giuridica indicata per ogni trattamento', checked: false, note: '', required: true },
      { id: 'registro_tempi', label: 'Tempi di conservazione definiti', checked: false, note: '', required: true },
    ],
  },
  {
    id: 'data_flow', emoji: '', title: 'Data Flow Map',
    items: [
      { id: 'flow_origine', label: 'Schema origine dati documentato', checked: false, note: '', required: true },
      { id: 'flow_storage', label: 'Dove vengono salvati i dati', checked: false, note: '', required: true },
      { id: 'flow_invio', label: 'Dove vengono inviati i dati', checked: false, note: '', required: true },
      { id: 'flow_sistemi', label: 'Sistemi coinvolti mappati', checked: false, note: '', required: true },
    ],
  },
  {
    id: 'privacy', emoji: '', title: 'Privacy & Consensi',
    items: [
      { id: 'privacy_policy', label: 'Privacy Policy (lato utente finale)', checked: false, note: '', required: true },
      { id: 'cookie_policy', label: 'Cookie Policy (se web app)', checked: false, note: '', required: false },
      { id: 'consensi', label: 'Gestione consensi (form, AI, raccolta dati)', checked: false, note: '', required: false },
    ],
  },
  {
    id: 'validazione', emoji: '', title: 'Validazione Compliance Finale',
    items: [
      { id: 'val_dpa', label: 'DPA firmato e aggiornato', checked: false, note: '', required: true },
      { id: 'val_fornitori', label: 'Fornitori mappati completamente', checked: false, note: '', required: true },
      { id: 'val_trasferimenti', label: 'Trasferimenti coperti (SCC + TIA)', checked: false, note: '', required: true },
      { id: 'val_ai_doc', label: 'AI completamente documentata', checked: false, note: '', required: true },
      { id: 'val_sicurezza', label: 'Policy sicurezza attive e testate', checked: false, note: '', required: true },
      { id: 'val_registro', label: 'Registro trattamenti aggiornato', checked: false, note: '', required: true },
      { id: 'val_privacy', label: 'Privacy policy presente e completa', checked: false, note: '', required: true },
    ],
  },
]

const BLOCKER_IDS = ['dpa_firmato', 'scc', 'tia', 'ai_usage_policy', 'ai_system_desc', 'ai_risk_assessment', 'data_protection', 'access_control', 'data_breach']

const LegalTab = ({ progetto, onSave, logActivity }: { progetto: Progetto; onSave: () => void; logActivity: (a: string, d?: string) => Promise<void> }) => {
  const stored = progetto.legal_compliance as { sections?: LegalSection[]; documents?: LegalDocument[] } | null
  const [sections, setSections] = useState<LegalSection[]>(
    stored?.sections?.length ? stored.sections : DEFAULT_LEGAL_CHECKLIST
  )
  const [documents, setDocuments] = useState<LegalDocument[]>(stored?.documents ?? [])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadSection, setUploadSection] = useState<string | null>(null)
  const [deleteDocIdx, setDeleteDocIdx] = useState<number | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(sections.map(s => s.id)))
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState('')

  const totalItems = sections.reduce((s, sec) => s + sec.items.length, 0)
  const checkedItems = sections.reduce((s, sec) => s + sec.items.filter(i => i.checked).length, 0)
  const requiredItems = sections.reduce((s, sec) => s + sec.items.filter(i => i.required).length, 0)
  const checkedRequired = sections.reduce((s, sec) => s + sec.items.filter(i => i.required && i.checked).length, 0)
  const pct = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0
  const pctRequired = requiredItems > 0 ? Math.round((checkedRequired / requiredItems) * 100) : 0

  const blockers = sections.flatMap(sec => sec.items).filter(i => BLOCKER_IDS.includes(i.id) && !i.checked)
  const goLiveReady = blockers.length === 0

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleItem = (sIdx: number, iIdx: number) => {
    setSections(prev => prev.map((sec, si) =>
      si === sIdx
        ? { ...sec, items: sec.items.map((item, ii) => ii === iIdx ? { ...item, checked: !item.checked } : item) }
        : sec
    ))
  }

  const updateNote = (sIdx: number, iIdx: number, note: string) => {
    setSections(prev => prev.map((sec, si) =>
      si === sIdx
        ? { ...sec, items: sec.items.map((item, ii) => ii === iIdx ? { ...item, note } : item) }
        : sec
    ))
  }

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    const payload = { sections, documents }
    const { error } = await supabase.from('progetti').update({
      legal_compliance: payload,
    }).eq('id', progetto.id)
    if (error) {
      setSaveError(safeErrorMessage(error))
      setSaving(false)
      return
    }
    await logActivity('Compliance legale aggiornata', `${checkedItems}/${totalItems} completati (${pct}%)`)
    setSaving(false)
    onSave()
  }

  const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length || !uploadSection) return
    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const newDocs = [...documents]
    for (const file of Array.from(files)) {
      const storagePath = `${user.id}/${progetto.id}/legal/${uploadSection}/${Date.now()}_${file.name}`
      const { error: uploadErr } = await supabase.storage.from(LEGAL_STORAGE_BUCKET).upload(storagePath, file, { upsert: false })
      if (uploadErr) { console.error(uploadErr); continue }
      newDocs.push({
        nome: file.name,
        section_id: uploadSection,
        storage_path: storagePath,
        tipo_file: file.type || null,
        dimensione: file.size,
        caricato_da: user.email ?? 'Utente',
        caricato_il: new Date().toISOString(),
      })
      await logActivity('Documento legale caricato', `${file.name} (${sections.find(s => s.id === uploadSection)?.title ?? uploadSection})`)
    }

    setDocuments(newDocs)
    await supabase.from('progetti').update({
      legal_compliance: { sections, documents: newDocs },
    }).eq('id', progetto.id)

    setUploading(false)
    setUploadSection(null)
    e.target.value = ''
  }

  const handleDownloadDoc = async (doc: LegalDocument) => {
    const { data, error } = await supabase.storage.from(LEGAL_STORAGE_BUCKET).download(doc.storage_path)
    if (error || !data) { console.error(error); return }
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url; a.download = doc.nome; a.click()
    URL.revokeObjectURL(url)
  }

  const handlePreviewDoc = async (doc: LegalDocument) => {
    const { data, error } = await supabase.storage.from(LEGAL_STORAGE_BUCKET).download(doc.storage_path)
    if (error || !data) { console.error(error); return }
    const url = URL.createObjectURL(data)
    setPreviewUrl(url)
    setPreviewName(doc.nome)
  }

  const handleDeleteDoc = async () => {
    if (deleteDocIdx === null) return
    const doc = documents[deleteDocIdx]
    if (!doc) return
    await supabase.storage.from(LEGAL_STORAGE_BUCKET).remove([doc.storage_path])
    const newDocs = documents.filter((_, i) => i !== deleteDocIdx)
    setDocuments(newDocs)
    await supabase.from('progetti').update({
      legal_compliance: { sections, documents: newDocs },
    }).eq('id', progetto.id)
    await logActivity('Documento legale eliminato', doc.nome)
    setDeleteDocIdx(null)
  }

  const getDocsForSection = (sectionId: string) => documents.filter(d => d.section_id === sectionId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1A2332', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Compliance AI, GDPR & Trasferimento Dati</div>
          <div style={{ fontSize: 12, color: '#6C7F94', marginTop: 4 }}>Conformita legale per audit, clienti enterprise e AI Act</div>
        </div>
        <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva checklist'}</Button>
      </div>

      {saveError && (
        <div style={{ fontSize: 12, color: '#DC2626', padding: '10px 16px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>{saveError}</div>
      )}

      {/* Status bar */}
      <Card style={{ padding: '16px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Totale</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1A2332' }}>{checkedItems}/{totalItems} <span style={{ fontSize: 12, fontWeight: 500, color: '#6C7F94' }}>({pct}%)</span></div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Obbligatori</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1A2332' }}>{checkedRequired}/{requiredItems} <span style={{ fontSize: 12, fontWeight: 500, color: '#6C7F94' }}>({pctRequired}%)</span></div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Documenti</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1A2332' }}>{documents.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Go-Live</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1A2332' }}>{goLiveReady ? 'PRONTO' : `BLOCCATO (${blockers.length})`}</div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ height: 4, backgroundColor: '#E5E7EB', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, backgroundColor: '#1A2332', transition: 'width 0.4s ease' }} />
          </div>
        </div>
      </Card>

      {/* Blockers */}
      {blockers.length > 0 && (
        <Card style={{ padding: '16px 24px', borderLeft: '3px solid #1A2332' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1A2332', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Blocco Go-Live — {blockers.length} requisiti critici mancanti</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {blockers.map(b => (
              <div key={b.id} style={{ fontSize: 12, color: '#4B5563', paddingLeft: 12, borderLeft: '2px solid #E5E7EB' }}>{b.label}</div>
            ))}
          </div>
        </Card>
      )}

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sections.map((sec, sIdx) => {
          const secChecked = sec.items.filter(i => i.checked).length
          const secTotal = sec.items.length
          const isExpanded = expandedSections.has(sec.id)
          const secDocs = getDocsForSection(sec.id)

          return (
            <Card key={sec.id}>
              <div
                onClick={() => toggleSection(sec.id)}
                style={{
                  padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  cursor: 'pointer', borderBottom: isExpanded ? '1px solid #E5E7EB' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isExpanded
                    ? <ChevronDown style={{ width: 14, height: 14, color: '#6C7F94' }} />
                    : <ChevronRight style={{ width: 14, height: 14, color: '#6C7F94' }} />
                  }
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1A2332', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{sec.title}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {secDocs.length > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#4B5563', backgroundColor: '#F3F4F6', border: '1px solid #E5E7EB', padding: '2px 8px' }}>
                      {secDocs.length} doc
                    </span>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#6C7F94' }}>{secChecked}/{secTotal}</span>
                </div>
              </div>

              {isExpanded && (
                <div style={{ padding: '8px 20px 16px' }}>
                  {sec.items.map((item, iIdx) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: iIdx < sec.items.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                      <input
                        type="checkbox" checked={item.checked} onChange={() => toggleItem(sIdx, iIdx)}
                        style={{ marginTop: 2, width: 14, height: 14, flexShrink: 0 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontSize: 13,
                            color: item.checked ? '#9CA3AF' : '#1A2332',
                            textDecoration: item.checked ? 'line-through' : 'none',
                          }}>
                            {item.label}
                          </span>
                          {item.required && !item.checked && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#1A2332', border: '1px solid #E5E7EB', padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Obbligatorio
                            </span>
                          )}
                        </div>
                        <input
                          value={item.note}
                          onChange={e => updateNote(sIdx, iIdx, e.target.value)}
                          placeholder="Note, link, riferimenti..."
                          style={{ marginTop: 4, fontSize: 11, color: '#6C7F94', border: 'none', borderBottom: '1px solid #F3F4F6', width: '100%', padding: '2px 0', outline: 'none', background: 'transparent' }}
                          onFocus={e => (e.currentTarget.style.borderColor = '#1A2332')}
                          onBlur={e => (e.currentTarget.style.borderColor = '#F3F4F6')}
                        />
                      </div>
                    </div>
                  ))}

                  {/* Documents per section */}
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #E5E7EB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>
                        Documenti ({secDocs.length})
                      </span>
                      <label style={{ cursor: uploading ? 'wait' : 'pointer' }}>
                        <input
                          type="file" multiple
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.txt,.csv"
                          style={{ display: 'none' }}
                          onChange={handleUploadDoc}
                          disabled={uploading}
                          onClick={() => setUploadSection(sec.id)}
                        />
                        <Button as="span" size="sm" variant="ghost" disabled={uploading}>
                          <Upload style={{ width: 11, height: 11 }} /> {uploading && uploadSection === sec.id ? 'Caricamento...' : 'Carica'}
                        </Button>
                      </label>
                    </div>

                    {secDocs.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#9CA3AF', padding: '6px 0' }}>Nessun documento</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {secDocs.map((doc) => {
                          const globalIdx = documents.indexOf(doc)
                          return (
                            <div key={globalIdx} style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                              backgroundColor: '#F9FAFB', border: '1px solid #F3F4F6',
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2332', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.nome}</div>
                                <div style={{ fontSize: 10, color: '#9CA3AF' }}>
                                  {doc.tipo_file?.split('/')[1]?.toUpperCase() ?? 'FILE'} — {fmtFileSize(doc.dimensione)} — {doc.caricato_da} — {fmtDateTime(doc.caricato_il)}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                {doc.tipo_file && (doc.tipo_file.startsWith('image/') || doc.tipo_file === 'application/pdf') && (
                                  <button onClick={() => handlePreviewDoc(doc)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 4, display: 'flex' }} title="Anteprima">
                                    <Eye style={{ width: 13, height: 13 }} />
                                  </button>
                                )}
                                <button onClick={() => handleDownloadDoc(doc)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 4, display: 'flex' }} title="Scarica">
                                  <Download style={{ width: 13, height: 13 }} />
                                </button>
                                <button onClick={() => setDeleteDocIdx(globalIdx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 4, display: 'flex' }} title="Elimina">
                                  <Trash2 style={{ width: 13, height: 13 }} />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* All documents table */}
      {documents.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1A2332', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Archivio documenti legali ({documents.length})
          </div>
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.6fr 0.6fr 1fr 80px', padding: '10px 20px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
              {['Nome file', 'Sezione', 'Tipo', 'Dim.', 'Caricato', ''].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
              ))}
            </div>
            {documents.map((doc, idx) => {
              const sec = sections.find(s => s.id === doc.section_id)
              return (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.6fr 0.6fr 1fr 80px', padding: '10px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1A2332', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.nome}</span>
                  <span style={{ fontSize: 11, color: '#6C7F94' }}>{sec?.title ?? doc.section_id}</span>
                  <span style={{ fontSize: 11, color: '#6C7F94' }}>{doc.tipo_file?.split('/')[1]?.toUpperCase() ?? '—'}</span>
                  <span style={{ fontSize: 11, color: '#6C7F94' }}>{fmtFileSize(doc.dimensione)}</span>
                  <div>
                    <div style={{ fontSize: 11, color: '#4B5563' }}>{fmtDateTime(doc.caricato_il)}</div>
                    <div style={{ fontSize: 10, color: '#9CA3AF' }}>{doc.caricato_da}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button onClick={() => handleDownloadDoc(doc)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 4, display: 'flex' }} title="Scarica">
                      <Download style={{ width: 12, height: 12 }} />
                    </button>
                    <button onClick={() => setDeleteDocIdx(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 4, display: 'flex' }} title="Elimina">
                      <Trash2 style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                </div>
              )
            })}
          </Card>
        </div>
      )}

      {/* Preview modal */}
      <Modal open={!!previewUrl} onClose={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }} title={previewName} width="900px">
        {previewUrl && (
          <div style={{ minHeight: 500 }}>
            {previewName.toLowerCase().endsWith('.pdf') ? (
              <iframe src={previewUrl} style={{ width: '100%', height: 600, border: 'none' }} title={previewName} />
            ) : (
              <img src={previewUrl} alt={previewName} style={{ maxWidth: '100%', maxHeight: 600, display: 'block', margin: '0 auto' }} />
            )}
          </div>
        )}
      </Modal>

      {/* Delete doc modal */}
      <Modal open={deleteDocIdx !== null} onClose={() => setDeleteDocIdx(null)} title="Elimina documento" width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>Eliminare questo documento? L'operazione non e reversibile.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteDocIdx(null)}>Annulla</Button>
          <Button variant="danger" onClick={handleDeleteDoc}>Elimina</Button>
        </div>
      </Modal>
    </div>
  )
}

/* ════════════════════════════════════════
   TAB: CONTRATTO
   ════════════════════════════════════════ */

const STORAGE_BUCKET = 'contratti-privati'

interface ContrattoForm {
  valore_progetto: number | null
  setup_iniziale: number | null
  pagamento_mensile: number | null
  durata_mesi: number | null
  data_firma: string | null
  data_scadenza_contratto: string | null
  rinnovo_automatico: boolean
  preavviso_disdetta_giorni: number | null
  stato_pagamento: string
  metodo_pagamento: string | null
  giorno_fatturazione: number | null
  milestone: MilestoneItem[]
  scadenze_fatturazione: ScadenzaFatturazione[]
  note: string
}

const emptyContrattoForm: ContrattoForm = {
  valore_progetto: null,
  setup_iniziale: null,
  pagamento_mensile: null,
  durata_mesi: null,
  data_firma: null,
  data_scadenza_contratto: null,
  rinnovo_automatico: false,
  preavviso_disdetta_giorni: null,
  stato_pagamento: 'da_fatturare',
  metodo_pagamento: null,
  giorno_fatturazione: null,
  milestone: [],
  scadenze_fatturazione: [],
  note: '',
}

const ContrattoTab = ({ progettoId, logActivity }: { progettoId: string; logActivity: (a: string, d?: string) => Promise<void> }) => {
  const [contratto, setContratto] = useState<ProgettoContratto | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<ContrattoForm>({ ...emptyContrattoForm })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleteDocIdx, setDeleteDocIdx] = useState<number | null>(null)

  const loadContratto = useCallback(async () => {
    const { data } = await supabase.from('progetto_contratto').select('*').eq('progetto_id', progettoId).maybeSingle()
    setContratto(data)
    if (data) {
      setForm({
        valore_progetto: data.valore_progetto,
        setup_iniziale: data.setup_iniziale,
        pagamento_mensile: data.pagamento_mensile,
        durata_mesi: data.durata_mesi,
        data_firma: data.data_firma,
        data_scadenza_contratto: data.data_scadenza_contratto,
        rinnovo_automatico: data.rinnovo_automatico ?? false,
        preavviso_disdetta_giorni: data.preavviso_disdetta_giorni,
        stato_pagamento: data.stato_pagamento,
        metodo_pagamento: data.metodo_pagamento,
        giorno_fatturazione: data.giorno_fatturazione,
        milestone: data.milestone ?? [],
        scadenze_fatturazione: data.scadenze_fatturazione ?? [],
        note: data.note ?? '',
      })
    }
    setLoading(false)
  }, [progettoId])

  useEffect(() => { loadContratto() }, [loadContratto])

  const saveContratto = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const payload = {
      progetto_id: progettoId,
      user_id: user.id,
      valore_progetto: form.valore_progetto,
      setup_iniziale: form.setup_iniziale,
      pagamento_mensile: form.pagamento_mensile,
      durata_mesi: form.durata_mesi,
      data_firma: form.data_firma || null,
      data_scadenza_contratto: form.data_scadenza_contratto || null,
      rinnovo_automatico: form.rinnovo_automatico,
      preavviso_disdetta_giorni: form.preavviso_disdetta_giorni,
      stato_pagamento: form.stato_pagamento,
      metodo_pagamento: form.metodo_pagamento || null,
      giorno_fatturazione: form.giorno_fatturazione,
      milestone: form.milestone,
      scadenze_fatturazione: form.scadenze_fatturazione,
      documenti: contratto?.documenti ?? [],
      note: form.note || null,
      updated_at: new Date().toISOString(),
    }

    if (contratto) {
      await supabase.from('progetto_contratto').update(payload).eq('id', contratto.id)
    } else {
      await supabase.from('progetto_contratto').insert({ ...payload, documenti: [] })
    }

    await logActivity('Contratto aggiornato', `Setup: ${fmtEur(form.setup_iniziale)}, Mensile: ${fmtEur(form.pagamento_mensile)}`)
    setSaving(false); setEditing(false)
    loadContratto()
  }

  const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length || !contratto) return
    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const newDocs: ContrattoDocumento[] = [...(contratto.documenti ?? [])]

    for (const file of Array.from(files)) {
      const storagePath = `${user.id}/${progettoId}/${Date.now()}_${file.name}`
      const { error: uploadErr } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, { upsert: false })
      if (uploadErr) { console.error(uploadErr); continue }

      newDocs.push({
        nome: file.name,
        storage_path: storagePath,
        tipo_file: file.type || null,
        dimensione: file.size,
        caricato_da: user.email ?? 'Utente',
        caricato_il: new Date().toISOString(),
      })
      await logActivity('Documento contratto caricato', file.name)
    }

    await supabase.from('progetto_contratto').update({ documenti: newDocs, updated_at: new Date().toISOString() }).eq('id', contratto.id)
    setUploading(false)
    e.target.value = ''
    loadContratto()
  }

  const handleDownloadDoc = async (doc: ContrattoDocumento) => {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(doc.storage_path)
    if (error || !data) { console.error(error); return }
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url; a.download = doc.nome; a.click()
    URL.revokeObjectURL(url)
  }

  const handleDeleteDoc = async () => {
    if (deleteDocIdx === null || !contratto) return
    const docs = [...(contratto.documenti ?? [])]
    const doc = docs[deleteDocIdx]
    if (!doc) return

    await supabase.storage.from(STORAGE_BUCKET).remove([doc.storage_path])
    docs.splice(deleteDocIdx, 1)
    await supabase.from('progetto_contratto').update({ documenti: docs, updated_at: new Date().toISOString() }).eq('id', contratto.id)
    await logActivity('Documento contratto eliminato', doc.nome)
    setDeleteDocIdx(null)
    loadContratto()
  }

  const patchForm = (key: keyof ContrattoForm, value: unknown) => setForm(p => ({ ...p, [key]: value }))
  const patchNum = (key: keyof ContrattoForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    patchForm(key, e.target.value ? Number(e.target.value) : null)

  const addMilestone = () => setForm(p => ({ ...p, milestone: [...p.milestone, { descrizione: '', importo: 0, data: '', stato: 'pending' }] }))
  const removeMilestone = (idx: number) => setForm(p => ({ ...p, milestone: p.milestone.filter((_, i) => i !== idx) }))
  const updateMilestone = (idx: number, field: keyof MilestoneItem, value: unknown) =>
    setForm(p => ({ ...p, milestone: p.milestone.map((m, i) => i === idx ? { ...m, [field]: value } : m) }))

  const addScadenza = () => setForm(p => ({ ...p, scadenze_fatturazione: [...p.scadenze_fatturazione, { data: '', importo: 0, nota: '' }] }))
  const removeScadenza = (idx: number) => setForm(p => ({ ...p, scadenze_fatturazione: p.scadenze_fatturazione.filter((_, i) => i !== idx) }))
  const updateScadenza = (idx: number, field: keyof ScadenzaFatturazione, value: unknown) =>
    setForm(p => ({ ...p, scadenze_fatturazione: p.scadenze_fatturazione.map((s, i) => i === idx ? { ...s, [field]: value } : s) }))

  const statoPagLabel: Record<string, { label: string; color: 'red' | 'yellow' | 'green' }> = {
    da_fatturare: { label: 'Da fatturare', color: 'red' },
    parziale: { label: 'Parziale', color: 'yellow' },
    saldato: { label: 'Saldato', color: 'green' },
  }

  const metodoLabel: Record<string, string> = {
    bonifico: 'Bonifico', contanti: 'Contanti', carta: 'Carta', assegno: 'Assegno', riba: 'RiBa', altro: 'Altro',
  }

  if (loading) return <div style={{ color: '#6C7F94', fontSize: 13 }}>Caricamento...</div>

  if (!editing && !contratto) {
    return (
      <EmptyState
        icon={Briefcase}
        title="Nessun contratto"
        description="Configura i dettagli contrattuali, pagamenti e carica i documenti."
        action={{ label: 'Configura contratto', onClick: () => setEditing(true) }}
      />
    )
  }

  /* ─── EDIT MODE ─── */
  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <SectionTitle>Modifica contratto</SectionTitle>

        {/* Dati economici */}
        <Card style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94', marginBottom: 16 }}>Dati Economici</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <FormField label="Set-up iniziale (€)">
              <Input type="number" step="0.01" value={form.setup_iniziale ?? ''} onChange={patchNum('setup_iniziale')} placeholder="0.00" />
            </FormField>
            <FormField label="Pagamento mensile (€)">
              <Input type="number" step="0.01" value={form.pagamento_mensile ?? ''} onChange={patchNum('pagamento_mensile')} placeholder="0.00" />
            </FormField>
            <FormField label="Valore totale progetto (€)">
              <Input type="number" step="0.01" value={form.valore_progetto ?? ''} onChange={patchNum('valore_progetto')} placeholder="0.00" />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 16 }}>
            <FormField label="Stato pagamento">
              <Select value={form.stato_pagamento} onChange={e => patchForm('stato_pagamento', e.target.value)}>
                <option value="da_fatturare">Da fatturare</option>
                <option value="parziale">Parziale</option>
                <option value="saldato">Saldato</option>
              </Select>
            </FormField>
            <FormField label="Metodo pagamento">
              <Select value={form.metodo_pagamento ?? ''} onChange={e => patchForm('metodo_pagamento', e.target.value || null)}>
                <option value="">— Seleziona —</option>
                <option value="bonifico">Bonifico</option>
                <option value="contanti">Contanti</option>
                <option value="carta">Carta</option>
                <option value="assegno">Assegno</option>
                <option value="riba">RiBa</option>
                <option value="altro">Altro</option>
              </Select>
            </FormField>
            <FormField label="Giorno fatturazione (1-31)">
              <Input type="number" min={1} max={31} value={form.giorno_fatturazione ?? ''} onChange={patchNum('giorno_fatturazione')} placeholder="1" />
            </FormField>
          </div>
        </Card>

        {/* Durata e rinnovo */}
        <Card style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94', marginBottom: 16 }}>Durata e Rinnovo</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <FormField label="Data firma">
              <Input type="date" value={form.data_firma ?? ''} onChange={e => patchForm('data_firma', e.target.value || null)} />
            </FormField>
            <FormField label="Scadenza contratto">
              <Input type="date" value={form.data_scadenza_contratto ?? ''} onChange={e => patchForm('data_scadenza_contratto', e.target.value || null)} />
            </FormField>
            <FormField label="Durata (mesi)">
              <Input type="number" min={1} max={120} value={form.durata_mesi ?? ''} onChange={patchNum('durata_mesi')} placeholder="12" />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
              <input
                type="checkbox"
                checked={form.rinnovo_automatico}
                onChange={e => patchForm('rinnovo_automatico', e.target.checked)}
                id="rinnovo_auto"
                style={{ accentColor: BRAND }}
              />
              <label htmlFor="rinnovo_auto" style={{ fontSize: 13, color: '#1A2332', cursor: 'pointer' }}>Rinnovo automatico</label>
            </div>
            <FormField label="Preavviso disdetta (giorni)">
              <Input type="number" min={0} max={365} value={form.preavviso_disdetta_giorni ?? ''} onChange={patchNum('preavviso_disdetta_giorni')} placeholder="30" />
            </FormField>
          </div>
        </Card>

        {/* Milestone */}
        <Card style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>Milestone</span>
            <Button type="button" size="sm" variant="ghost" onClick={addMilestone}><Plus style={{ width: 12, height: 12 }} /> Aggiungi</Button>
          </div>
          {form.milestone.map((m, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 40px', gap: 10, marginBottom: 8, alignItems: 'end' }}>
              <FormField label={idx === 0 ? 'Descrizione' : ''}>
                <Input value={m.descrizione} onChange={e => updateMilestone(idx, 'descrizione', e.target.value)} placeholder="Descrizione" />
              </FormField>
              <FormField label={idx === 0 ? 'Importo (€)' : ''}>
                <Input type="number" step="0.01" value={m.importo} onChange={e => updateMilestone(idx, 'importo', Number(e.target.value))} />
              </FormField>
              <FormField label={idx === 0 ? 'Data' : ''}>
                <Input type="date" value={m.data} onChange={e => updateMilestone(idx, 'data', e.target.value)} />
              </FormField>
              <FormField label={idx === 0 ? 'Stato' : ''}>
                <Select value={m.stato} onChange={e => updateMilestone(idx, 'stato', e.target.value)}>
                  <option value="pending">Pending</option>
                  <option value="completato">Completato</option>
                  <option value="fatturato">Fatturato</option>
                </Select>
              </FormField>
              <button onClick={() => removeMilestone(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', display: 'flex', padding: 4, alignSelf: 'center' }}>
                <Trash2 style={{ width: 13, height: 13 }} />
              </button>
            </div>
          ))}
          {form.milestone.length === 0 && <div style={{ fontSize: 12, color: '#9CA3AF', padding: '8px 0' }}>Nessuna milestone configurata</div>}
        </Card>

        {/* Scadenze fatturazione */}
        <Card style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>Scadenze Fatturazione</span>
            <Button type="button" size="sm" variant="ghost" onClick={addScadenza}><Plus style={{ width: 12, height: 12 }} /> Aggiungi</Button>
          </div>
          {form.scadenze_fatturazione.map((s, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 40px', gap: 10, marginBottom: 8, alignItems: 'end' }}>
              <FormField label={idx === 0 ? 'Data' : ''}>
                <Input type="date" value={s.data} onChange={e => updateScadenza(idx, 'data', e.target.value)} />
              </FormField>
              <FormField label={idx === 0 ? 'Importo (€)' : ''}>
                <Input type="number" step="0.01" value={s.importo} onChange={e => updateScadenza(idx, 'importo', Number(e.target.value))} />
              </FormField>
              <FormField label={idx === 0 ? 'Nota' : ''}>
                <Input value={s.nota} onChange={e => updateScadenza(idx, 'nota', e.target.value)} />
              </FormField>
              <button onClick={() => removeScadenza(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', display: 'flex', padding: 4, alignSelf: 'center' }}>
                <Trash2 style={{ width: 13, height: 13 }} />
              </button>
            </div>
          ))}
          {form.scadenze_fatturazione.length === 0 && <div style={{ fontSize: 12, color: '#9CA3AF', padding: '8px 0' }}>Nessuna scadenza configurata</div>}
        </Card>

        {/* Note */}
        <FormField label="Note">
          <TextArea value={form.note} onChange={e => patchForm('note', e.target.value)} maxLength={2000} />
        </FormField>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
          <Button variant="ghost" onClick={() => { setEditing(false); if (contratto) loadContratto() }}>Annulla</Button>
          <Button onClick={saveContratto} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</Button>
        </div>
      </div>
    )
  }

  /* ─── VIEW MODE ─── */
  const c = contratto!
  const sp = statoPagLabel[c.stato_pagamento] ?? statoPagLabel.da_fatturare
  const docs = (c.documenti ?? []) as ContrattoDocumento[]
  const valoreTotaleContratto = (c.setup_iniziale ?? 0) + (c.pagamento_mensile ?? 0) * (c.durata_mesi ?? 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil style={{ width: 12, height: 12 }} /> Modifica</Button>}>
        Contratto
      </SectionTitle>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <Card style={{ padding: '20px 24px', borderTop: `3px solid ${BRAND}` }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Set-up Iniziale</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1A2332' }}>{fmtEur(c.setup_iniziale)}</div>
        </Card>
        <Card style={{ padding: '20px 24px', borderTop: '3px solid #15803D' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Pagamento Mensile</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#15803D' }}>{fmtEur(c.pagamento_mensile)}</div>
        </Card>
        <Card style={{ padding: '20px 24px', borderTop: '3px solid #7C3AED' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Valore Totale</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#7C3AED' }}>{c.valore_progetto != null ? fmtEur(c.valore_progetto) : fmtEur(valoreTotaleContratto > 0 ? valoreTotaleContratto : null)}</div>
        </Card>
        <Card style={{ padding: '20px 24px', borderTop: `3px solid ${sp.color === 'red' ? '#DC2626' : sp.color === 'yellow' ? '#F59E0B' : '#15803D'}` }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Stato Pagamento</div>
          <Badge label={sp.label} color={sp.color} />
        </Card>
      </div>

      {/* Info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #E5E7EB', fontSize: 12, fontWeight: 700, color: '#1A2332', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Dettagli Pagamento
          </div>
          <div style={{ padding: '0 24px' }}>
            <InfoRow label="Set-up iniziale" value={fmtEur(c.setup_iniziale)} />
            <InfoRow label="Pagamento mensile" value={fmtEur(c.pagamento_mensile)} />
            <InfoRow label="Metodo pagamento" value={c.metodo_pagamento ? metodoLabel[c.metodo_pagamento] ?? c.metodo_pagamento : '—'} />
            <InfoRow label="Giorno fatturazione" value={c.giorno_fatturazione != null ? `${c.giorno_fatturazione} del mese` : '—'} />
          </div>
        </Card>
        <Card>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #E5E7EB', fontSize: 12, fontWeight: 700, color: '#1A2332', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Durata e Rinnovo
          </div>
          <div style={{ padding: '0 24px' }}>
            <InfoRow label="Data firma" value={fmtDate(c.data_firma)} />
            <InfoRow label="Scadenza" value={fmtDate(c.data_scadenza_contratto)} />
            <InfoRow label="Durata" value={c.durata_mesi != null ? `${c.durata_mesi} mesi` : '—'} />
            <InfoRow label="Rinnovo automatico" value={c.rinnovo_automatico ? 'Sì' : 'No'} />
            <InfoRow label="Preavviso disdetta" value={c.preavviso_disdetta_giorni != null ? `${c.preavviso_disdetta_giorni} giorni` : '—'} />
          </div>
        </Card>
      </div>

      {/* Note */}
      {c.note && (
        <Card style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Note</div>
          <div style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{c.note}</div>
        </Card>
      )}

      {/* Documenti contratto (storage privato) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1A2332', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield style={{ width: 14, height: 14, color: '#15803D' }} /> Documenti Contratto
            <span style={{ fontSize: 10, fontWeight: 500, color: '#15803D', textTransform: 'none', letterSpacing: 'normal' }}>(storage privato)</span>
          </div>
          <label style={{ cursor: uploading ? 'wait' : 'pointer' }}>
            <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={handleUploadDoc} disabled={uploading} />
            <Button as="span" size="sm" disabled={uploading}>
              <Upload style={{ width: 12, height: 12 }} /> {uploading ? 'Caricamento...' : 'Carica documento'}
            </Button>
          </label>
        </div>

        {docs.length === 0 ? (
          <Card style={{ padding: '32px 24px', textAlign: 'center' }}>
            <FileText style={{ width: 28, height: 28, color: '#D1D5DB', margin: '0 auto 8px' }} />
            <div style={{ fontSize: 13, color: '#9CA3AF' }}>Nessun documento caricato</div>
            <div style={{ fontSize: 11, color: '#D1D5DB', marginTop: 4 }}>PDF, DOC, XLS, immagini — max 50MB</div>
          </Card>
        ) : (
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.7fr 1.2fr 80px', padding: '10px 20px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
              {['Nome file', 'Tipo', 'Dimensione', 'Caricato il', ''].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
              ))}
            </div>
            {docs.map((doc, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.7fr 1.2fr 80px', padding: '12px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <FileText style={{ width: 14, height: 14, color: '#6C7F94', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1A2332', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.nome}</span>
                </div>
                <span style={{ fontSize: 12, color: '#6C7F94' }}>{doc.tipo_file?.split('/')[1]?.toUpperCase() ?? '—'}</span>
                <span style={{ fontSize: 12, color: '#6C7F94' }}>{fmtFileSize(doc.dimensione)}</span>
                <div>
                  <div style={{ fontSize: 12, color: '#4B5563' }}>{fmtDateTime(doc.caricato_il)}</div>
                  <div style={{ fontSize: 10, color: '#9CA3AF' }}>{doc.caricato_da}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={() => handleDownloadDoc(doc)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: BRAND, padding: 4, display: 'flex' }} title="Scarica">
                    <Download style={{ width: 13, height: 13 }} />
                  </button>
                  <button onClick={() => setDeleteDocIdx(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, display: 'flex' }} title="Elimina">
                    <Trash2 style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Milestone */}
      {(c.milestone ?? []).length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1A2332', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Milestone</div>
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '10px 20px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
              {['Descrizione', 'Importo', 'Data', 'Stato'].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
              ))}
            </div>
            {(c.milestone as MilestoneItem[]).map((m, idx) => {
              const msBadge: Record<string, { label: string; color: 'gray' | 'green' | 'blue' }> = {
                pending: { label: 'Pending', color: 'gray' },
                completato: { label: 'Completato', color: 'green' },
                fatturato: { label: 'Fatturato', color: 'blue' },
              }
              const mb = msBadge[m.stato] ?? msBadge.pending
              return (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '12px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#1A2332' }}>{m.descrizione}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1A2332' }}>{fmtEur(m.importo)}</span>
                  <span style={{ fontSize: 12, color: '#4B5563' }}>{fmtDate(m.data)}</span>
                  <Badge label={mb.label} color={mb.color} />
                </div>
              )
            })}
          </Card>
        </div>
      )}

      {/* Scadenze fatturazione */}
      {(c.scadenze_fatturazione ?? []).length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1A2332', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Scadenze Fatturazione</div>
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', padding: '10px 20px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
              {['Data', 'Importo', 'Nota'].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
              ))}
            </div>
            {(c.scadenze_fatturazione as ScadenzaFatturazione[]).map((s, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', padding: '12px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#4B5563' }}>{fmtDate(s.data)}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1A2332' }}>{fmtEur(s.importo)}</span>
                <span style={{ fontSize: 13, color: '#4B5563' }}>{s.nota}</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Delete doc modal */}
      <Modal open={deleteDocIdx !== null} onClose={() => setDeleteDocIdx(null)} title="Elimina documento" width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>Eliminare questo documento dallo storage privato? L'operazione non e reversibile.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteDocIdx(null)}>Annulla</Button>
          <Button variant="danger" onClick={handleDeleteDoc}>Elimina</Button>
        </div>
      </Modal>
    </div>
  )
}

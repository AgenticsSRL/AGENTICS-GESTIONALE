import { useEffect, useState, useCallback } from 'react'
import {
  ArrowLeft, Pencil, Trash2, Send, Plus, X,
  CheckSquare, Calendar, User, FolderOpen, Tag, Clock, Users,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { taskSchema, validate, type ValidationErrors } from '../lib/validation'
import { safeErrorMessage } from '../lib/errors'
import type { Task, Progetto, StatoTask, PrioritaTask, CategoriaTask, TaskCommento, OrgMember } from '../types'
import { useT } from '../hooks/useCurrentRole'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { FormField, Input, Select, TextArea } from '../components/ui/FormField'
import { UserPicker } from '../components/ui/UserPicker'
import {
  notifyTaskAssegnato,
  notifyTaskInReview,
  notifyTaskCompletato,
  notifyTaskPartecipanteAggiunto,
} from '../lib/notifications'

const ADMIN_EMAIL = 'lorenzo@agentics.eu.com'

const BRAND = '#005DEF'

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
      { value: 'security_authz', label: 'Autorizzazione' },
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

function getCategoriaLabel(cat: CategoriaTask): string {
  for (const g of Object.values(CATEGORIE_GRUPPI))
    for (const i of g.items) if (i.value === cat) return `${g.label} / ${i.label}`
  return cat
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

type Form = Omit<Task, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'progetti'>

interface Props {
  taskId: string
  onBack: () => void
  onNavigateToProgetto: (id: string) => void
}

export const TaskDetailPage = ({ taskId, onBack, onNavigateToProgetto }: Props) => {
  const t = useT()
  const statoBadge: Record<StatoTask, { label: string; color: 'gray' | 'purple' | 'blue' | 'green' }> = {
    todo:        { label: t('status.da_fare'),     color: 'gray' },
    in_progress: { label: t('status.in_corso'),    color: 'purple' },
    in_review:   { label: 'In review',             color: 'blue' },
    done:        { label: t('status.completato'),  color: 'green' },
  }
  const prioritaBadge: Record<PrioritaTask, { label: string; color: 'green' | 'yellow' | 'orange' | 'red' }> = {
    bassa:   { label: t('priority.bassa'),   color: 'green' },
    media:   { label: t('priority.media'),   color: 'yellow' },
    alta:    { label: t('priority.alta'),    color: 'orange' },
    urgente: { label: t('priority.urgente'), color: 'red' },
  }

  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [progetti, setProgetti] = useState<Pick<Progetto, 'id' | 'nome'>[]>([])
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([])

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<Form>({ progetto_id: null, titolo: '', descrizione: null, stato: 'todo', priorita: 'media', scadenza: null, categoria: null, assegnatario: null, dipendenza_id: null, checklist: [], commenti: [], partecipanti: [] })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<ValidationErrors>({})

  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [newCheckItem, setNewCheckItem] = useState('')

  const loadTask = useCallback(async () => {
    const { data, error } = await supabase
      .from('task')
      .select('*, progetti(nome)')
      .eq('id', taskId)
      .single()
    if (error || !data) { console.error(safeErrorMessage(error)); onBack(); return }
    setTask(data)
    setLoading(false)
  }, [taskId, onBack])

  useEffect(() => {
    loadTask()
    supabase.from('progetti').select('id, nome').in('stato', ['cliente_demo', 'demo_accettata', 'firmato']).order('nome').then(({ data }) => setProgetti(data ?? []))
    supabase.rpc('get_org_members').then(({ data }) => setOrgMembers(data ?? []))
  }, [loadTask])

  const openEdit = () => {
    if (!task) return
    setForm({
      progetto_id: task.progetto_id, titolo: task.titolo, descrizione: task.descrizione,
      stato: task.stato, priorita: task.priorita, scadenza: task.scadenza,
      categoria: task.categoria, assegnatario: task.assegnatario,
      dipendenza_id: task.dipendenza_id, checklist: task.checklist ?? [], commenti: task.commenti ?? [],
      partecipanti: task.partecipanti ?? [],
    })
    setErrors({})
    setModal(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!task) return
    const result = validate(taskSchema, form)
    if (!result.success) { setErrors(result.errors); return }
    setErrors({}); setSaving(true)
    const { error } = await supabase.from('task').update(result.data).eq('id', taskId)
    if (error) { setErrors({ _form: safeErrorMessage(error) }); setSaving(false); return }

    // Notifiche
    const { data: { user } } = await supabase.auth.getUser()
    const currentEmail = user?.email ?? ADMIN_EMAIL
    const progettoNome = progetti.find(p => p.id === form.progetto_id)?.nome ?? (task.progetti as { nome: string } | null)?.nome ?? 'N/A'
    const memberName = (email: string) => {
      const m = orgMembers.find(o => o.email === email)
      return m ? [m.nome, m.cognome].filter(Boolean).join(' ') || email.split('@')[0] : email.split('@')[0]
    }
    // Cambio assegnatario
    if (form.assegnatario && form.assegnatario !== task.assegnatario && form.assegnatario !== currentEmail) {
      notifyTaskAssegnato({
        taskTitolo: form.titolo, taskId,
        progetto: progettoNome, priorita: form.priorita, scadenza: form.scadenza,
        assegnatarioEmail: form.assegnatario, assegnatarioNome: memberName(form.assegnatario),
      })
    }
    // Nuovi partecipanti
    const vecchiPartecipanti = task.partecipanti ?? []
    for (const email of (form.partecipanti ?? []).filter(e => !vecchiPartecipanti.includes(e))) {
      if (email !== currentEmail) {
        notifyTaskPartecipanteAggiunto({
          taskTitolo: form.titolo, taskId, progetto: progettoNome,
          priorita: form.priorita, scadenza: form.scadenza,
          partecipanteEmail: email, partecipanteNome: memberName(email),
        })
      }
    }
    // Stato → in_review
    if (form.stato === 'in_review' && task.stato !== 'in_review') {
      notifyTaskInReview({
        taskTitolo: form.titolo, progetto: progettoNome,
        assegnatarioEmail: form.assegnatario ?? currentEmail,
        reviewerEmail: ADMIN_EMAIL, reviewerNome: 'Lorenzo',
      })
    }
    // Stato → done
    if (form.stato === 'done' && task.stato !== 'done') {
      const notificaEmail = form.assegnatario !== currentEmail ? ADMIN_EMAIL : (task.assegnatario ?? ADMIN_EMAIL)
      notifyTaskCompletato({
        taskTitolo: form.titolo, progetto: progettoNome,
        assegnatarioEmail: form.assegnatario ?? currentEmail,
        notificaEmail, notificaNome: notificaEmail === ADMIN_EMAIL ? 'Lorenzo' : memberName(notificaEmail),
      })
    }

    setSaving(false); setModal(false); loadTask()
  }

  const remove = async () => {
    await supabase.from('task').delete().eq('id', taskId)
    onBack()
  }

  const quickStatusChange = async (stato: StatoTask) => {
    if (!task) return
    await supabase.from('task').update({ stato }).eq('id', taskId)
    // Notifiche cambio stato rapido
    const progettoNome = (task.progetti as { nome: string } | null)?.nome ?? 'N/A'
    const { data: { user } } = await supabase.auth.getUser()
    const currentEmail = user?.email ?? ADMIN_EMAIL
    if (stato === 'in_review' && task.stato !== 'in_review') {
      notifyTaskInReview({
        taskTitolo: task.titolo, progetto: progettoNome,
        assegnatarioEmail: task.assegnatario ?? currentEmail,
        reviewerEmail: ADMIN_EMAIL, reviewerNome: 'Lorenzo',
      })
    }
    if (stato === 'done' && task.stato !== 'done') {
      const notificaEmail = task.assegnatario !== currentEmail ? ADMIN_EMAIL : (task.assegnatario ?? ADMIN_EMAIL)
      notifyTaskCompletato({
        taskTitolo: task.titolo, progetto: progettoNome,
        assegnatarioEmail: task.assegnatario ?? currentEmail,
        notificaEmail, notificaNome: notificaEmail === ADMIN_EMAIL ? 'Lorenzo' : (task.assegnatario?.split('@')[0] ?? 'Team'),
      })
    }
    loadTask()
  }

  const toggleCheck = async (idx: number) => {
    if (!task) return
    const updated = [...(task.checklist ?? [])]
    updated[idx] = { ...updated[idx], completato: !updated[idx].completato }
    await supabase.from('task').update({ checklist: updated }).eq('id', taskId)
    loadTask()
  }

  const addChecklistItem = async () => {
    if (!task || !newCheckItem.trim()) return
    const updated = [...(task.checklist ?? []), { testo: newCheckItem.trim(), completato: false }]
    await supabase.from('task').update({ checklist: updated }).eq('id', taskId)
    setNewCheckItem('')
    loadTask()
  }

  const removeChecklistItem = async (idx: number) => {
    if (!task) return
    const updated = (task.checklist ?? []).filter((_, i) => i !== idx)
    await supabase.from('task').update({ checklist: updated }).eq('id', taskId)
    loadTask()
  }

  const addComment = async () => {
    if (!task || !newComment.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    const comment: TaskCommento = { autore: user?.email ?? 'Utente', testo: newComment.trim(), timestamp: new Date().toISOString() }
    const updated = [...(task.commenti ?? []), comment]
    await supabase.from('task').update({ commenti: updated }).eq('id', taskId)
    setNewComment('')
    loadTask()
  }

  const f = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  if (loading) return (
    <div style={{ color: '#6C7F94', fontSize: 13 }}>{t('common.loading')}</div>
  )

  if (!task) return null

  const sb = statoBadge[task.stato]
  const pb = prioritaBadge[task.priorita]
  const checkDone = (task.checklist ?? []).filter(c => c.completato).length
  const checkTotal = (task.checklist ?? []).length
  const commenti = task.commenti ?? []

  return (
    <div>
      {/* Back + actions bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', fontSize: 13, fontWeight: 500, padding: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = BRAND)}
          onMouseLeave={e => (e.currentTarget.style.color = '#6C7F94')}
        >
          <ArrowLeft style={{ width: 16, height: 16 }} />
          {t('task.back')}
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="sm" variant="ghost" onClick={openEdit}><Pencil style={{ width: 13, height: 13 }} /> {t('common.edit')}</Button>
          <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(true)}><Trash2 style={{ width: 13, height: 13 }} /> {t('common.delete')}</Button>
        </div>
      </div>

      {/* Title + badges */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Badge label={sb.label} color={sb.color} />
          <Badge label={pb.label} color={pb.color} />
        </div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1A2332', marginBottom: 8 }}>{task.titolo}</h2>
        {task.descrizione && (
          <p style={{ margin: 0, fontSize: 14, color: '#4B5563', lineHeight: 1.6 }}>{task.descrizione}</p>
        )}

        {/* Quick status change */}
        <div style={{ display: 'flex', gap: 6, marginTop: 20, paddingTop: 16, borderTop: '1px solid #F3F4F6' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', alignSelf: 'center', marginRight: 8 }}>{t('task.status_label')}</span>
          {(['todo', 'in_progress', 'in_review', 'done'] as StatoTask[]).map(s => (
            <button
              key={s}
              onClick={() => quickStatusChange(s)}
              style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 600,
                border: task.stato === s ? `1.5px solid ${BRAND}` : '1px solid #E5E7EB',
                background: task.stato === s ? '#EFF6FF' : '#fff',
                color: task.stato === s ? BRAND : '#6C7F94',
                cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em',
                borderRadius: 4,
              }}
            >
              {statoBadge[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Info grid + Checklist + Comments */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Metadata card */}
          <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', padding: 20 }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px' }}>{t('task.details')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <InfoRow icon={<FolderOpen style={{ width: 14, height: 14 }} />} label={t('task.project')}>
                {task.progetti?.nome ? (
                  <button
                    onClick={() => task.progetto_id && onNavigateToProgetto(task.progetto_id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: BRAND, fontWeight: 600, fontSize: 13, padding: 0, textDecoration: 'underline' }}
                  >
                    {task.progetti.nome}
                  </button>
                ) : <span style={{ color: '#9CA3AF' }}>—</span>}
              </InfoRow>
              <InfoRow icon={<User style={{ width: 14, height: 14 }} />} label={t('task.assignee')}>
                <span style={{ fontSize: 13, color: task.assegnatario ? '#1A2332' : '#9CA3AF' }}>{task.assegnatario ?? '—'}</span>
              </InfoRow>
              <InfoRow icon={<Calendar style={{ width: 14, height: 14 }} />} label={t('task.due')}>
                <span style={{ fontSize: 13, color: task.scadenza ? '#1A2332' : '#9CA3AF' }}>{task.scadenza ? fmtDate(task.scadenza) : '—'}</span>
              </InfoRow>
              <InfoRow icon={<Tag style={{ width: 14, height: 14 }} />} label={t('task.category')}>
                <span style={{ fontSize: 13, color: task.categoria ? '#1A2332' : '#9CA3AF' }}>{task.categoria ? getCategoriaLabel(task.categoria) : '—'}</span>
              </InfoRow>
              <InfoRow icon={<Clock style={{ width: 14, height: 14 }} />} label={t('task.created_at')}>
                <span style={{ fontSize: 13, color: '#4B5563' }}>{fmtDateTime(task.created_at)}</span>
              </InfoRow>
              {(task.partecipanti ?? []).length > 0 && (
                <InfoRow icon={<Users style={{ width: 14, height: 14 }} />} label={t('task.participants')}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(task.partecipanti ?? []).map(email => {
                      const m = orgMembers.find(o => o.email === email)
                      const label = m ? ([m.nome, m.cognome].filter(Boolean).join(' ') || email) : email
                      return (
                        <span key={email} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 3, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: '#005DEF' }}>
                          {label}
                        </span>
                      )
                    })}
                  </div>
                </InfoRow>
              )}
            </div>
          </div>

          {/* Checklist card */}
          <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                <CheckSquare style={{ width: 13, height: 13, display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
                {t('task.checklist')} {checkTotal > 0 && `(${checkDone}/${checkTotal})`}
              </h3>
            </div>

            {checkTotal > 0 && (
              <div style={{ marginBottom: 4, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${checkTotal > 0 ? (checkDone / checkTotal) * 100 : 0}%`, backgroundColor: BRAND, transition: 'width 0.3s' }} />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 12 }}>
              {(task.checklist ?? []).map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                  <input
                    type="checkbox"
                    checked={item.completato}
                    onChange={() => toggleCheck(idx)}
                    style={{ cursor: 'pointer', accentColor: BRAND }}
                  />
                  <span style={{ flex: 1, fontSize: 13, color: item.completato ? '#9CA3AF' : '#1A2332', textDecoration: item.completato ? 'line-through' : 'none' }}>
                    {item.testo}
                  </span>
                  <button
                    onClick={() => removeChecklistItem(idx)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', padding: 2, display: 'flex' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#DC2626')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#D1D5DB')}
                  >
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input
                value={newCheckItem}
                onChange={e => setNewCheckItem(e.target.value)}
                placeholder={t('task.checklist_add')}
                style={{ flex: 1, fontSize: 12, border: '1px solid #E5E7EB', padding: '7px 10px', outline: 'none', borderRadius: 4 }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem() } }}
              />
              <button
                onClick={addChecklistItem}
                style={{ background: BRAND, color: '#fff', border: 'none', padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, borderRadius: 4 }}
              >
                <Plus style={{ width: 12, height: 12 }} /> {t('common.add')}
              </button>
            </div>
          </div>
        </div>

        {/* Right column — Comments */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', padding: 20, alignSelf: 'start' }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px' }}>
            {t('task.comments')} ({commenti.length})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 400, overflowY: 'auto', marginBottom: 16 }}>
            {commenti.length === 0 && (
              <div style={{ fontSize: 13, color: '#9CA3AF', padding: '20px 0', textAlign: 'center' }}>{t('task.comments_empty')}</div>
            )}
            {commenti.map((c, idx) => (
              <div key={idx} style={{ padding: '10px 14px', backgroundColor: '#F9FAFB', border: '1px solid #F3F4F6', borderRadius: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#1A2332' }}>{c.autore}</span>
                  <span style={{ fontSize: 10, color: '#9CA3AF' }}>{fmtDateTime(c.timestamp)}</span>
                </div>
                <div style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.5 }}>{c.testo}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder={t('task.comments_ph')}
              style={{ flex: 1, fontSize: 12, border: '1px solid #E5E7EB', padding: '8px 12px', outline: 'none', borderRadius: 4 }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addComment() } }}
            />
            <button
              onClick={addComment}
              style={{ background: BRAND, color: '#fff', border: 'none', padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', borderRadius: 4 }}
            >
              <Send style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={t('task.edit')}>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {errors._form && <p style={{ fontSize: 12, color: '#DC2626' }}>{errors._form}</p>}
          <FormField label={t('task.title')} required error={errors.titolo}>
            <Input value={form.titolo} onChange={f('titolo')} placeholder={t('task.title_ph')} maxLength={200} required />
          </FormField>
          <FormField label={t('task.project')} error={errors.progetto_id}>
            <Select value={form.progetto_id ?? ''} onChange={f('progetto_id')}>
              <option value="">{t('common.no_project')}</option>
              {progetti.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </Select>
          </FormField>
          <FormField label={t('task.description')} error={errors.descrizione}>
            <TextArea value={form.descrizione ?? ''} onChange={f('descrizione')} placeholder={t('task.description_ph')} maxLength={2000} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <FormField label={t('task.status')}>
              <Select value={form.stato} onChange={f('stato')}>
                <option value="todo">{t('status.da_fare')}</option>
                <option value="in_progress">{t('status.in_corso')}</option>
                <option value="in_review">In review</option>
                <option value="done">{t('status.completato')}</option>
              </Select>
            </FormField>
            <FormField label={t('task.priority')}>
              <Select value={form.priorita} onChange={f('priorita')}>
                <option value="bassa">{t('priority.bassa')}</option>
                <option value="media">{t('priority.media')}</option>
                <option value="alta">{t('priority.alta')}</option>
                <option value="urgente">{t('priority.urgente')}</option>
              </Select>
            </FormField>
            <FormField label={t('task.due')}>
              <Input type="date" value={form.scadenza ?? ''} onChange={f('scadenza')} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <FormField label={t('task.category')}>
              <Select value={form.categoria ?? ''} onChange={f('categoria')}>
                <option value="">{t('common.none')}</option>
                {Object.values(CATEGORIE_GRUPPI).map(g =>
                  g.items.map(i => <option key={i.value} value={i.value}>{g.label} / {i.label}</option>)
                )}
              </Select>
            </FormField>
            <FormField label={t('task.assignee')}>
              <UserPicker
                single
                members={orgMembers}
                value={form.assegnatario ? [form.assegnatario] : []}
                onChange={emails => setForm(p => ({ ...p, assegnatario: emails[0] ?? null }))}
                placeholder={t('task.assignee_ph')}
              />
            </FormField>
          </div>
          <FormField label={t('task.participants')}>
            <UserPicker
              members={orgMembers}
              value={form.partecipanti ?? []}
              onChange={emails => setForm(p => ({ ...p, partecipanti: emails }))}
              placeholder={t('task.participants_ph')}
            />
          </FormField>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm modal */}
      <Modal open={deleteConfirm} onClose={() => setDeleteConfirm(false)} title={t('task.delete')} width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>{t('task.delete_confirm')}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteConfirm(false)}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={remove}>{t('common.delete')}</Button>
        </div>
      </Modal>
    </div>
  )
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ color: '#9CA3AF', flexShrink: 0 }}>{icon}</div>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', width: 90, flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  )
}

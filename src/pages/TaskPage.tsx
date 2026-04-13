import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, CheckSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { taskSchema, validate, type ValidationErrors } from '../lib/validation'
import { safeErrorMessage } from '../lib/errors'
import type { Task, Progetto, StatoTask, PrioritaTask, OrgMember } from '../types'
import { Button }     from '../components/ui/Button'
import { Badge }      from '../components/ui/Badge'
import { Modal }      from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { FormField, Input, Select, TextArea } from '../components/ui/FormField'
import { UserPicker } from '../components/ui/UserPicker'
import { useIsMobile } from '../hooks/useIsMobile'
import { useCurrentRole, useT } from '../hooks/useCurrentRole'
import {
  notifyTaskAssegnato,
  notifyTaskUrgente,
  notifyTaskInReview,
  notifyTaskCompletato,
  notifyTaskPartecipanteAggiunto,
} from '../lib/notifications'

const ADMIN_EMAIL = 'lorenzo@agentics.eu.com'

type Form = Omit<Task, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'progetti'>

const empty: Form = { progetto_id: null, titolo: '', descrizione: null, stato: 'todo', priorita: 'media', scadenza: null, categoria: null, assegnatario: null, dipendenza_id: null, checklist: [], commenti: [], partecipanti: [] }

interface TaskPageProps {
  onViewTask?: (id: string) => void
}

export const TaskPage = ({ onViewTask }: TaskPageProps) => {
  const isMobile = useIsMobile()
  const { role } = useCurrentRole()
  const t = useT()
  const isDeveloper = role === 'developer'

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
  const [rows, setRows]           = useState<Task[]>([])
  const [progetti, setProgetti]   = useState<Pick<Progetto, 'id' | 'nome'>[]>([])
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [editing, setEditing]     = useState<Task | null>(null)
  const [form, setForm]           = useState<Form>({ ...empty })
  const [saving, setSaving]       = useState(false)
  const [deleteId, setDeleteId]   = useState<string | null>(null)
  const [errors, setErrors]       = useState<ValidationErrors>({})

  const load = async () => {
    const [{ data, error }, { data: proj }, { data: members }] = await Promise.all([
      supabase.from('task').select('*, progetti(nome)').order('created_at', { ascending: false }),
      supabase.from('progetti').select('id, nome').in('stato', ['cliente_demo', 'demo_accettata', 'firmato']).order('nome'),
      supabase.rpc('get_org_members'),
    ])
    if (error) { console.error(safeErrorMessage(error)); return }
    setRows(data ?? [])
    setProgetti(proj ?? [])
    setOrgMembers(members ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm({ ...empty }); setErrors({}); setModal(true) }
  const openEdit = (task: Task) => {
    setEditing(task)
    setForm({ progetto_id: task.progetto_id, titolo: task.titolo, descrizione: task.descrizione, stato: task.stato, priorita: task.priorita, scadenza: task.scadenza, categoria: task.categoria, assegnatario: task.assegnatario, dipendenza_id: task.dipendenza_id, checklist: task.checklist ?? [], commenti: task.commenti ?? [], partecipanti: task.partecipanti ?? [] })
    setErrors({}); setModal(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = validate(taskSchema, form)
    if (!result.success) { setErrors(result.errors); return }
    setErrors({}); setSaving(true)
    const payload = result.data
    const { error } = editing
      ? await supabase.from('task').update(payload).eq('id', editing.id)
      : await supabase.from('task').insert(payload)
    if (error) { setErrors({ _form: safeErrorMessage(error) }); setSaving(false); return }

    // ── Notifiche ──────────────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser()
    const currentEmail = user?.email ?? ADMIN_EMAIL
    const progettoNome = progetti.find(p => p.id === form.progetto_id)?.nome ?? 'N/A'

    const memberName = (email: string) => {
      const m = orgMembers.find(o => o.email === email)
      return m ? [m.nome, m.cognome].filter(Boolean).join(' ') || email.split('@')[0] : email.split('@')[0]
    }

    if (!editing) {
      // Nuovo task: notifica assegnatario se diverso dall'utente corrente
      if (form.assegnatario && form.assegnatario !== currentEmail) {
        notifyTaskAssegnato({
          taskTitolo: form.titolo,
          taskId: '',
          progetto: progettoNome,
          priorita: form.priorita,
          scadenza: form.scadenza,
          assegnatarioEmail: form.assegnatario,
          assegnatarioNome: memberName(form.assegnatario),
        })
      }
      // Notifica partecipanti
      for (const email of form.partecipanti ?? []) {
        if (email !== currentEmail && email !== form.assegnatario) {
          notifyTaskPartecipanteAggiunto({
            taskTitolo: form.titolo,
            taskId: '',
            progetto: progettoNome,
            priorita: form.priorita,
            scadenza: form.scadenza,
            partecipanteEmail: email,
            partecipanteNome: memberName(email),
          })
        }
      }
      // Nuovo task urgente: avvisa assegnatario + admin
      if (form.priorita === 'urgente') {
        notifyTaskUrgente({
          taskTitolo: form.titolo,
          progetto: progettoNome,
          scadenza: form.scadenza,
          assegnatarioEmail: form.assegnatario ?? ADMIN_EMAIL,
          assegnatarioNome: memberName(form.assegnatario ?? ADMIN_EMAIL),
          adminEmail: ADMIN_EMAIL,
        })
      }
    } else {
      // Modifica: controlla cosa è cambiato
      const assegnatarioCambiato = form.assegnatario !== editing.assegnatario
      if (assegnatarioCambiato && form.assegnatario && form.assegnatario !== currentEmail) {
        notifyTaskAssegnato({
          taskTitolo: form.titolo,
          taskId: editing.id,
          progetto: progettoNome,
          priorita: form.priorita,
          scadenza: form.scadenza,
          assegnatarioEmail: form.assegnatario,
          assegnatarioNome: memberName(form.assegnatario),
        })
      }
      // Notifica nuovi partecipanti aggiunti
      const vecchiPartecipanti = editing.partecipanti ?? []
      const nuoviPartecipanti = (form.partecipanti ?? []).filter(e => !vecchiPartecipanti.includes(e))
      for (const email of nuoviPartecipanti) {
        if (email !== currentEmail) {
          notifyTaskPartecipanteAggiunto({
            taskTitolo: form.titolo,
            taskId: editing.id,
            progetto: progettoNome,
            priorita: form.priorita,
            scadenza: form.scadenza,
            partecipanteEmail: email,
            partecipanteNome: memberName(email),
          })
        }
      }
      if (form.stato === 'in_review' && editing.stato !== 'in_review') {
        notifyTaskInReview({
          taskTitolo: form.titolo,
          progetto: progettoNome,
          assegnatarioEmail: form.assegnatario ?? currentEmail,
          reviewerEmail: ADMIN_EMAIL,
          reviewerNome: 'Lorenzo',
        })
      }
      if (form.stato === 'done' && editing.stato !== 'done') {
        const notificaEmail = form.assegnatario !== currentEmail ? ADMIN_EMAIL : (editing.assegnatario ?? ADMIN_EMAIL)
        notifyTaskCompletato({
          taskTitolo: form.titolo,
          progetto: progettoNome,
          assegnatarioEmail: form.assegnatario ?? currentEmail,
          notificaEmail,
          notificaNome: notificaEmail === ADMIN_EMAIL ? 'Lorenzo' : memberName(notificaEmail),
        })
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    setSaving(false); setModal(false); load()
  }

  const remove = async () => {
    if (!deleteId) return
    await supabase.from('task').delete().eq('id', deleteId)
    setDeleteId(null); load()
  }

  const f = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      {!isDeveloper && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <Button onClick={openNew}><Plus className="w-3.5 h-3.5" />{t('task.new')}</Button>
        </div>
      )}

      {loading
        ? <div style={{ color: '#6C7F94', fontSize: 13 }}>{t('common.loading')}</div>
        : rows.length === 0
          ? <EmptyState icon={CheckSquare} title={t('task.empty')} description={t('task.empty_desc')} action={isDeveloper ? undefined : { label: t('task.new'), onClick: openNew }} />
          : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #E5E7EB', backgroundColor: '#fff' }}>
              {rows.map(task => {
                const sb = statoBadge[task.stato]
                const pb = prioritaBadge[task.priorita]
                return (
                  <div key={task.id} style={{ padding: '14px 16px', borderBottom: '1px solid #F3F4F6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                      <div
                        onClick={() => onViewTask?.(task.id)}
                        style={{ fontSize: 14, fontWeight: 600, color: '#1A2332', flex: 1, minWidth: 0, lineHeight: 1.4, cursor: onViewTask ? 'pointer' : 'default' }}
                      >
                        {task.titolo}
                      </div>
                      <div style={{ display: 'flex', gap: 0, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEdit(task)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: '8px', display: 'flex', borderRadius: 6 }} title={t('common.edit')}><Pencil className="w-4 h-4" /></button>
                        {!isDeveloper && <button onClick={() => setDeleteId(task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: '8px', display: 'flex', borderRadius: 6 }} title={t('common.delete')}><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <Badge label={sb.label} color={sb.color} />
                      <Badge label={pb.label} color={pb.color} />
                      {task.progetti?.nome && <span style={{ fontSize: 11, color: '#6C7F94' }}>{task.progetti.nome}</span>}
                      {task.scadenza && <span style={{ fontSize: 11, color: '#9CA3AF' }}>{t('task.due_short')} {new Date(task.scadenza).toLocaleDateString('it-IT')}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ minWidth: 620 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 0.8fr 80px', padding: '10px 20px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
                {[t('task.title'), t('task.project'), t('task.status'), t('task.priority'), t('task.due'), ''].map((h, i) => (
                  <span key={i} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
                ))}
              </div>
              {rows.map(task => {
                const sb = statoBadge[task.stato]
                const pb = prioritaBadge[task.priorita]
                return (
                  <div
                    key={task.id}
                    onClick={() => onViewTask?.(task.id)}
                    style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 0.8fr 80px', padding: '14px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center', cursor: onViewTask ? 'pointer' : 'default', transition: 'background-color 0.15s' }}
                    onMouseEnter={e => { if (onViewTask) e.currentTarget.style.backgroundColor = '#F9FAFB' }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2332' }}>{task.titolo}</div>
                      {task.descrizione && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{task.descrizione}</div>}
                    </div>
                    <span style={{ fontSize: 13, color: '#4B5563' }}>{task.progetti?.nome ?? '—'}</span>
                    <Badge label={sb.label} color={sb.color} />
                    <Badge label={pb.label} color={pb.color} />
                    <span style={{ fontSize: 13, color: '#4B5563' }}>{task.scadenza ? new Date(task.scadenza).toLocaleDateString('it-IT') : '—'}</span>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(task)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 6, display: 'flex', borderRadius: 4 }} title={t('common.edit')}><Pencil className="w-3.5 h-3.5" /></button>
                      {!isDeveloper && <button onClick={() => setDeleteId(task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 6, display: 'flex', borderRadius: 4 }} title={t('common.delete')}><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                  </div>
                )
              })}
              </div>
            </div>
          )
      }

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? t('task.edit') : t('task.new_modal')} width={isDeveloper ? '360px' : undefined}>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {errors._form && <p style={{ fontSize: 12, color: '#DC2626' }}>{errors._form}</p>}
          {isDeveloper ? (
            // Developer: solo aggiornamento stato
            <FormField label={t('task.status')}>
              <Select value={form.stato} onChange={f('stato')}>
                <option value="todo">{t('status.da_fare')}</option>
                <option value="in_progress">{t('status.in_corso')}</option>
                <option value="in_review">In review</option>
                <option value="done">{t('status.completato')}</option>
              </Select>
            </FormField>
          ) : (
            <>
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
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 16 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                <FormField label={t('task.assignee')}>
                  <UserPicker
                    single
                    members={orgMembers}
                    value={form.assegnatario ? [form.assegnatario] : []}
                    onChange={emails => setForm(p => ({ ...p, assegnatario: emails[0] ?? null }))}
                    placeholder={t('task.assignee_ph')}
                  />
                </FormField>
                <FormField label={t('task.participants')}>
                  <UserPicker
                    members={orgMembers}
                    value={form.partecipanti ?? []}
                    onChange={emails => setForm(p => ({ ...p, partecipanti: emails }))}
                    placeholder={t('task.participants_ph')}
                  />
                </FormField>
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title={t('task.delete')} width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>{t('task.delete_confirm')}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={remove}>{t('common.delete')}</Button>
        </div>
      </Modal>
    </div>
  )
}

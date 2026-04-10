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
import {
  notifyTaskAssegnato,
  notifyTaskUrgente,
  notifyTaskInReview,
  notifyTaskCompletato,
  notifyTaskPartecipanteAggiunto,
} from '../lib/notifications'

const ADMIN_EMAIL = 'lorenzo@agentics.eu.com'

const statoBadge: Record<StatoTask, { label: string; color: 'gray' | 'purple' | 'blue' | 'green' }> = {
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

type Form = Omit<Task, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'progetti'>

const empty: Form = { progetto_id: null, titolo: '', descrizione: null, stato: 'todo', priorita: 'media', scadenza: null, categoria: null, assegnatario: null, dipendenza_id: null, checklist: [], commenti: [], partecipanti: [] }

interface TaskPageProps {
  onViewTask?: (id: string) => void
}

export const TaskPage = ({ onViewTask }: TaskPageProps) => {
  const isMobile = useIsMobile()
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
  const openEdit = (t: Task) => {
    setEditing(t)
    setForm({ progetto_id: t.progetto_id, titolo: t.titolo, descrizione: t.descrizione, stato: t.stato, priorita: t.priorita, scadenza: t.scadenza, categoria: t.categoria, assegnatario: t.assegnatario, dipendenza_id: t.dipendenza_id, checklist: t.checklist ?? [], commenti: t.commenti ?? [], partecipanti: t.partecipanti ?? [] })
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <Button onClick={openNew}><Plus className="w-3.5 h-3.5" />Nuovo task</Button>
      </div>

      {loading
        ? <div style={{ color: '#6C7F94', fontSize: 13 }}>Caricamento...</div>
        : rows.length === 0
          ? <EmptyState icon={CheckSquare} title="Nessun task" description="Crea il primo task per iniziare." action={{ label: 'Nuovo task', onClick: openNew }} />
          : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #E5E7EB', backgroundColor: '#fff' }}>
              {rows.map(t => {
                const sb = statoBadge[t.stato]
                const pb = prioritaBadge[t.priorita]
                return (
                  <div key={t.id} style={{ padding: '14px 16px', borderBottom: '1px solid #F3F4F6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                      <div
                        onClick={() => onViewTask?.(t.id)}
                        style={{ fontSize: 14, fontWeight: 600, color: '#1A2332', flex: 1, minWidth: 0, lineHeight: 1.4, cursor: onViewTask ? 'pointer' : 'default' }}
                      >
                        {t.titolo}
                      </div>
                      <div style={{ display: 'flex', gap: 0, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEdit(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: '8px', display: 'flex', borderRadius: 6 }} title="Modifica"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteId(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: '8px', display: 'flex', borderRadius: 6 }} title="Elimina"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <Badge label={sb.label} color={sb.color} />
                      <Badge label={pb.label} color={pb.color} />
                      {t.progetti?.nome && <span style={{ fontSize: 11, color: '#6C7F94' }}>{t.progetti.nome}</span>}
                      {t.scadenza && <span style={{ fontSize: 11, color: '#9CA3AF' }}>Scad. {new Date(t.scadenza).toLocaleDateString('it-IT')}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ minWidth: 620 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 0.8fr 80px', padding: '10px 20px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
                {['Titolo', 'Progetto', 'Stato', 'Priorità', 'Scadenza', ''].map(h => (
                  <span key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
                ))}
              </div>
              {rows.map(t => {
                const sb = statoBadge[t.stato]
                const pb = prioritaBadge[t.priorita]
                return (
                  <div
                    key={t.id}
                    onClick={() => onViewTask?.(t.id)}
                    style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 0.8fr 80px', padding: '14px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center', cursor: onViewTask ? 'pointer' : 'default', transition: 'background-color 0.15s' }}
                    onMouseEnter={e => { if (onViewTask) e.currentTarget.style.backgroundColor = '#F9FAFB' }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2332' }}>{t.titolo}</div>
                      {t.descrizione && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{t.descrizione}</div>}
                    </div>
                    <span style={{ fontSize: 13, color: '#4B5563' }}>{t.progetti?.nome ?? '—'}</span>
                    <Badge label={sb.label} color={sb.color} />
                    <Badge label={pb.label} color={pb.color} />
                    <span style={{ fontSize: 13, color: '#4B5563' }}>{t.scadenza ? new Date(t.scadenza).toLocaleDateString('it-IT') : '—'}</span>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 6, display: 'flex', borderRadius: 4 }} title="Modifica"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDeleteId(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 6, display: 'flex', borderRadius: 4 }} title="Elimina"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                )
              })}
              </div>
            </div>
          )
      }

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifica task' : 'Nuovo task'}>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {errors._form && <p style={{ fontSize: 12, color: '#DC2626' }}>{errors._form}</p>}
          <FormField label="Titolo" required error={errors.titolo}>
            <Input value={form.titolo} onChange={f('titolo')} placeholder="Titolo del task" maxLength={200} required />
          </FormField>
          <FormField label="Progetto" error={errors.progetto_id}>
            <Select value={form.progetto_id ?? ''} onChange={f('progetto_id')}>
              <option value="">— Nessun progetto —</option>
              {progetti.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </Select>
          </FormField>
          <FormField label="Descrizione" error={errors.descrizione}>
            <TextArea value={form.descrizione ?? ''} onChange={f('descrizione')} placeholder="Dettagli del task..." maxLength={2000} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 16 }}>
            <FormField label="Stato">
              <Select value={form.stato} onChange={f('stato')}>
                <option value="todo">Da fare</option>
                <option value="in_progress">In corso</option>
                <option value="in_review">In review</option>
                <option value="done">Completato</option>
              </Select>
            </FormField>
            <FormField label="Priorità">
              <Select value={form.priorita} onChange={f('priorita')}>
                <option value="bassa">Bassa</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </Select>
            </FormField>
            <FormField label="Scadenza">
              <Input type="date" value={form.scadenza ?? ''} onChange={f('scadenza')} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
            <FormField label="Assegnatario">
              <UserPicker
                single
                members={orgMembers}
                value={form.assegnatario ? [form.assegnatario] : []}
                onChange={emails => setForm(p => ({ ...p, assegnatario: emails[0] ?? null }))}
                placeholder="Seleziona assegnatario..."
              />
            </FormField>
            <FormField label="Partecipanti">
              <UserPicker
                members={orgMembers}
                value={form.partecipanti ?? []}
                onChange={emails => setForm(p => ({ ...p, partecipanti: emails }))}
                placeholder="Aggiungi persone..."
              />
            </FormField>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>Annulla</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Elimina task" width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>Sei sicuro di voler eliminare questo task? L'operazione non è reversibile.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Annulla</Button>
          <Button variant="danger" onClick={remove}>Elimina</Button>
        </div>
      </Modal>
    </div>
  )
}

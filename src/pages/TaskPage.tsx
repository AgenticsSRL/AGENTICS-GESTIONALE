import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, CheckSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { taskSchema, validate, type ValidationErrors } from '../lib/validation'
import { safeErrorMessage } from '../lib/errors'
import type { Task, Progetto, StatoTask, PrioritaTask } from '../types'
import { Button }     from '../components/ui/Button'
import { Badge }      from '../components/ui/Badge'
import { Modal }      from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { FormField, Input, Select, TextArea } from '../components/ui/FormField'

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

const empty: Form = { progetto_id: null, titolo: '', descrizione: null, stato: 'todo', priorita: 'media', scadenza: null, categoria: null, assegnatario: null, dipendenza_id: null, checklist: [], commenti: [] }

export const TaskPage = () => {
  const [rows, setRows]           = useState<Task[]>([])
  const [progetti, setProgetti]   = useState<Pick<Progetto, 'id' | 'nome'>[]>([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [editing, setEditing]     = useState<Task | null>(null)
  const [form, setForm]           = useState<Form>({ ...empty })
  const [saving, setSaving]       = useState(false)
  const [deleteId, setDeleteId]   = useState<string | null>(null)
  const [errors, setErrors]       = useState<ValidationErrors>({})

  const load = async () => {
    const [{ data, error }, { data: proj }] = await Promise.all([
      supabase.from('task').select('*, progetti(nome)').order('created_at', { ascending: false }),
      supabase.from('progetti').select('id, nome').in('stato', ['cliente_demo', 'demo_accettata', 'firmato']).order('nome'),
    ])
    if (error) { console.error(safeErrorMessage(error)); return }
    setRows(data ?? [])
    setProgetti(proj ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm({ ...empty }); setErrors({}); setModal(true) }
  const openEdit = (t: Task) => {
    setEditing(t)
    setForm({ progetto_id: t.progetto_id, titolo: t.titolo, descrizione: t.descrizione, stato: t.stato, priorita: t.priorita, scadenza: t.scadenza, categoria: t.categoria, assegnatario: t.assegnatario, dipendenza_id: t.dipendenza_id, checklist: t.checklist ?? [], commenti: t.commenti ?? [] })
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
          : (
            <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 0.8fr 80px', padding: '10px 20px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
                {['Titolo', 'Progetto', 'Stato', 'Priorità', 'Scadenza', ''].map(h => (
                  <span key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
                ))}
              </div>
              {rows.map(t => {
                const sb = statoBadge[t.stato]
                const pb = prioritaBadge[t.priorita]
                return (
                  <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 0.8fr 80px', padding: '14px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2332' }}>{t.titolo}</div>
                      {t.descrizione && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{t.descrizione}</div>}
                    </div>
                    <span style={{ fontSize: 13, color: '#4B5563' }}>{t.progetti?.nome ?? '—'}</span>
                    <Badge label={sb.label} color={sb.color} />
                    <Badge label={pb.label} color={pb.color} />
                    <span style={{ fontSize: 13, color: '#4B5563' }}>{t.scadenza ? new Date(t.scadenza).toLocaleDateString('it-IT') : '—'}</span>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button onClick={() => openEdit(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 4, display: 'flex' }} title="Modifica"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDeleteId(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, display: 'flex' }} title="Elimina"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                )
              })}
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
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

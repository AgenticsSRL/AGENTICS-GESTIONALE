import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { timeEntrySchema, validate, type ValidationErrors } from '../lib/validation'
import { safeErrorMessage } from '../lib/errors'
import type { TimeEntry, Progetto, Task } from '../types'
import { Button }     from '../components/ui/Button'
import { Modal }      from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { FormField, Input, Select, TextArea } from '../components/ui/FormField'

type Form = Omit<TimeEntry, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'progetti' | 'task'>

const today = () => new Date().toISOString().split('T')[0]
const empty: Form = { progetto_id: null, task_id: null, data: today(), ore: 0, nota: null }

export const TimeTrackingPage = () => {
  const [rows, setRows]           = useState<TimeEntry[]>([])
  const [progetti, setProgetti]   = useState<Pick<Progetto, 'id' | 'nome'>[]>([])
  const [tasks, setTasks]         = useState<Pick<Task, 'id' | 'titolo' | 'progetto_id'>[]>([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [editing, setEditing]     = useState<TimeEntry | null>(null)
  const [form, setForm]           = useState<Form>({ ...empty })
  const [saving, setSaving]       = useState(false)
  const [deleteId, setDeleteId]   = useState<string | null>(null)
  const [errors, setErrors]       = useState<ValidationErrors>({})

  const load = async () => {
    const [{ data, error }, { data: proj }, { data: tsk }] = await Promise.all([
      supabase.from('time_entries').select('*, progetti(nome), task(titolo)').order('data', { ascending: false }),
      supabase.from('progetti').select('id, nome').in('stato', ['cliente_demo', 'demo_accettata', 'firmato']).order('nome'),
      supabase.from('task').select('id, titolo, progetto_id').neq('stato', 'done').order('titolo'),
    ])
    if (error) { console.error(safeErrorMessage(error)); return }
    setRows(data ?? [])
    setProgetti(proj ?? [])
    setTasks(tsk ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm({ ...empty, data: today() }); setErrors({}); setModal(true) }
  const openEdit = (te: TimeEntry) => {
    setEditing(te)
    setForm({ progetto_id: te.progetto_id, task_id: te.task_id, data: te.data, ore: te.ore, nota: te.nota })
    setErrors({}); setModal(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = validate(timeEntrySchema, form)
    if (!result.success) { setErrors(result.errors); return }
    setErrors({}); setSaving(true)
    const payload = result.data
    const { error } = editing
      ? await supabase.from('time_entries').update(payload).eq('id', editing.id)
      : await supabase.from('time_entries').insert(payload)
    if (error) { setErrors({ _form: safeErrorMessage(error) }); setSaving(false); return }
    setSaving(false); setModal(false); load()
  }

  const remove = async () => {
    if (!deleteId) return
    await supabase.from('time_entries').delete().eq('id', deleteId)
    setDeleteId(null); load()
  }

  const f = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const filteredTasks = form.progetto_id
    ? tasks.filter(t => t.progetto_id === form.progetto_id)
    : tasks

  const totaleOre = rows.reduce((s, r) => s + Number(r.ore), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: '#6C7F94' }}>
          Totale: <strong style={{ color: '#1A2332' }}>{totaleOre.toFixed(1)}h</strong>
        </div>
        <Button onClick={openNew}><Plus className="w-3.5 h-3.5" />Registra ore</Button>
      </div>

      {loading
        ? <div style={{ color: '#6C7F94', fontSize: 13 }}>Caricamento...</div>
        : rows.length === 0
          ? <EmptyState icon={Clock} title="Nessuna registrazione" description="Registra le prime ore lavorate." action={{ label: 'Registra ore', onClick: openNew }} />
          : (
            <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr 1.2fr 0.6fr 2fr 80px', padding: '10px 20px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
                {['Data', 'Progetto', 'Task', 'Ore', 'Nota', ''].map(h => (
                  <span key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
                ))}
              </div>
              {rows.map(te => (
                <div key={te.id} style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr 1.2fr 0.6fr 2fr 80px', padding: '14px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#4B5563' }}>{new Date(te.data).toLocaleDateString('it-IT')}</span>
                  <span style={{ fontSize: 13, color: '#4B5563' }}>{te.progetti?.nome ?? '—'}</span>
                  <span style={{ fontSize: 13, color: '#4B5563' }}>{te.task?.titolo ?? '—'}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1A2332' }}>{Number(te.ore).toFixed(1)}h</span>
                  <span style={{ fontSize: 13, color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{te.nota ?? '—'}</span>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => openEdit(te)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 4, display: 'flex' }} title="Modifica"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setDeleteId(te.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, display: 'flex' }} title="Elimina"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )
      }

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifica registrazione' : 'Nuova registrazione'}>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <FormField label="Data" required>
              <Input type="date" value={form.data} onChange={f('data')} required />
            </FormField>
            <FormField label="Ore" required>
              <Input type="number" step="0.25" min="0.25" value={form.ore} onChange={f('ore')} placeholder="0" required />
            </FormField>
          </div>
          <FormField label="Progetto">
            <Select value={form.progetto_id ?? ''} onChange={e => setForm(p => ({ ...p, progetto_id: e.target.value || null, task_id: null }))}>
              <option value="">— Nessun progetto —</option>
              {progetti.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </Select>
          </FormField>
          <FormField label="Task">
            <Select value={form.task_id ?? ''} onChange={f('task_id')}>
              <option value="">— Nessun task —</option>
              {filteredTasks.map(t => <option key={t.id} value={t.id}>{t.titolo}</option>)}
            </Select>
          </FormField>
          <FormField label="Nota">
            <TextArea value={form.nota ?? ''} onChange={f('nota')} placeholder="Cosa hai fatto..." />
          </FormField>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>Annulla</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Elimina registrazione" width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>Eliminare questa registrazione?</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Annulla</Button>
          <Button variant="danger" onClick={remove}>Elimina</Button>
        </div>
      </Modal>
    </div>
  )
}

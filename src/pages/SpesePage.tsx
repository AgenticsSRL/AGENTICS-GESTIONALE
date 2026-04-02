import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, CreditCard } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { spesaSchema, validate, type ValidationErrors } from '../lib/validation'
import { safeErrorMessage } from '../lib/errors'
import type { Spesa, Progetto, CategoriaSpesa } from '../types'
import { Button }     from '../components/ui/Button'
import { Badge }      from '../components/ui/Badge'
import { Modal }      from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { FormField, Input, Select, TextArea } from '../components/ui/FormField'

const catBadge: Record<CategoriaSpesa, { label: string; color: 'blue' | 'purple' | 'orange' | 'green' | 'gray' }> = {
  software:  { label: 'Software',  color: 'blue' },
  hardware:  { label: 'Hardware',  color: 'purple' },
  servizi:   { label: 'Servizi',   color: 'orange' },
  trasferta: { label: 'Trasferta', color: 'green' },
  altro:     { label: 'Altro',     color: 'gray' },
}

type Form = Omit<Spesa, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'progetti'>

const today = () => new Date().toISOString().split('T')[0]
const empty: Form = { progetto_id: null, data: today(), categoria: 'altro', importo: 0, descrizione: '' }

export const SpesePage = () => {
  const [rows, setRows]           = useState<Spesa[]>([])
  const [progetti, setProgetti]   = useState<Pick<Progetto, 'id' | 'nome'>[]>([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [editing, setEditing]     = useState<Spesa | null>(null)
  const [form, setForm]           = useState<Form>({ ...empty })
  const [saving, setSaving]       = useState(false)
  const [deleteId, setDeleteId]   = useState<string | null>(null)
  const [errors, setErrors]       = useState<ValidationErrors>({})

  const load = async () => {
    const [{ data, error }, { data: proj }] = await Promise.all([
      supabase.from('spese').select('*, progetti(nome)').order('data', { ascending: false }),
      supabase.from('progetti').select('id, nome').in('stato', ['cliente_demo', 'demo_accettata', 'firmato']).order('nome'),
    ])
    if (error) { console.error(safeErrorMessage(error)); return }
    setRows(data ?? [])
    setProgetti(proj ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm({ ...empty, data: today() }); setErrors({}); setModal(true) }
  const openEdit = (s: Spesa) => {
    setEditing(s)
    setForm({ progetto_id: s.progetto_id, data: s.data, categoria: s.categoria, importo: s.importo, descrizione: s.descrizione })
    setErrors({}); setModal(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = validate(spesaSchema, form)
    if (!result.success) { setErrors(result.errors); return }
    setErrors({}); setSaving(true)
    const payload = result.data
    const { error } = editing
      ? await supabase.from('spese').update(payload).eq('id', editing.id)
      : await supabase.from('spese').insert(payload)
    if (error) { setErrors({ _form: safeErrorMessage(error) }); setSaving(false); return }
    setSaving(false); setModal(false); load()
  }

  const remove = async () => {
    if (!deleteId) return
    await supabase.from('spese').delete().eq('id', deleteId)
    setDeleteId(null); load()
  }

  const f = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const fmtEur = (v: number) => `€ ${Number(v).toLocaleString('it-IT', { minimumFractionDigits: 2 })}`

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <Button onClick={openNew}><Plus className="w-3.5 h-3.5" />Nuova spesa</Button>
      </div>

      {loading
        ? <div style={{ color: '#6C7F94', fontSize: 13 }}>Caricamento...</div>
        : rows.length === 0
          ? <EmptyState icon={CreditCard} title="Nessuna spesa" description="Registra la prima spesa." action={{ label: 'Nuova spesa', onClick: openNew }} />
          : (
            <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr 1fr 1fr 2fr 80px', padding: '10px 20px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
                {['Data', 'Progetto', 'Categoria', 'Importo', 'Descrizione', ''].map(h => (
                  <span key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
                ))}
              </div>
              {rows.map(s => {
                const cb = catBadge[s.categoria]
                return (
                  <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr 1fr 1fr 2fr 80px', padding: '14px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#4B5563' }}>{new Date(s.data).toLocaleDateString('it-IT')}</span>
                    <span style={{ fontSize: 13, color: '#4B5563' }}>{s.progetti?.nome ?? '—'}</span>
                    <Badge label={cb.label} color={cb.color} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1A2332' }}>{fmtEur(s.importo)}</span>
                    <span style={{ fontSize: 13, color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.descrizione}</span>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button onClick={() => openEdit(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 4, display: 'flex' }} title="Modifica"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDeleteId(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, display: 'flex' }} title="Elimina"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
      }

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifica spesa' : 'Nuova spesa'}>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <FormField label="Data" required>
              <Input type="date" value={form.data} onChange={f('data')} required />
            </FormField>
            <FormField label="Importo (€)" required>
              <Input type="number" step="0.01" value={form.importo} onChange={f('importo')} placeholder="0.00" required />
            </FormField>
          </div>
          <FormField label="Progetto">
            <Select value={form.progetto_id ?? ''} onChange={f('progetto_id')}>
              <option value="">— Nessun progetto —</option>
              {progetti.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </Select>
          </FormField>
          <FormField label="Categoria">
            <Select value={form.categoria} onChange={f('categoria')}>
              <option value="software">Software</option>
              <option value="hardware">Hardware</option>
              <option value="servizi">Servizi</option>
              <option value="trasferta">Trasferta</option>
              <option value="altro">Altro</option>
            </Select>
          </FormField>
          <FormField label="Descrizione" required>
            <TextArea value={form.descrizione} onChange={f('descrizione')} placeholder="Descrizione della spesa..." required />
          </FormField>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>Annulla</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Elimina spesa" width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>Sei sicuro di voler eliminare questa spesa?</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Annulla</Button>
          <Button variant="danger" onClick={remove}>Elimina</Button>
        </div>
      </Modal>
    </div>
  )
}

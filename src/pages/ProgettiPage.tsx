import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, FolderOpen, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { progettoSchema, validate, type ValidationErrors } from '../lib/validation'
import { safeErrorMessage } from '../lib/errors'
import type { Progetto, Cliente, StatoProgetto } from '../types'
import { Button }     from '../components/ui/Button'
import { Badge }      from '../components/ui/Badge'
import { Modal }      from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { useIsMobile } from '../hooks/useIsMobile'
import { FormField, Input, Select, TextArea } from '../components/ui/FormField'

const statoBadge: Record<StatoProgetto, { label: string; color: 'green' | 'blue' | 'yellow' | 'gray' | 'orange' }> = {
  cliente_demo:   { label: 'Cliente Demo',   color: 'yellow' },
  demo_accettata: { label: 'Demo Accettata', color: 'orange' },
  firmato:        { label: 'Firmato',        color: 'green' },
  completato:     { label: 'Completato',     color: 'blue' },
  archiviato:     { label: 'Archiviato',     color: 'gray' },
}

type Form = {
  cliente_id: string | null; nome: string; descrizione: string | null
  stato: StatoProgetto; data_inizio: string | null; data_fine: string | null
  budget: number | null; pagamento_mensile: number | null
  responsabile: string | null; team: string[]; priorita_progetto: string; marginalita_stimata: number | null
  link_demo: string | null; link_deploy: string | null
}

const emptyCreate: Form = {
  cliente_id: null, nome: '', descrizione: null, stato: 'cliente_demo',
  data_inizio: null, data_fine: null, budget: null, pagamento_mensile: null,
  responsabile: null, team: [], priorita_progetto: 'media', marginalita_stimata: null,
  link_demo: null, link_deploy: null,
}

const fmtEur = (v: number | null) =>
  v != null ? `€ ${Number(v).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : '—'

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

interface Props {
  onViewProgetto: (id: string) => void
}

export const ProgettiPage = ({ onViewProgetto }: Props) => {
  const isMobile = useIsMobile()
  const [rows, setRows]         = useState<Progetto[]>([])
  const [clienti, setClienti]   = useState<Pick<Cliente, 'id' | 'nome'>[]>([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState<Progetto | null>(null)
  const [form, setForm]         = useState<Form>({ ...emptyCreate })
  const [saving, setSaving]     = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [errors, setErrors]     = useState<ValidationErrors>({})

  const load = async () => {
    const [{ data, error }, { data: cli }] = await Promise.all([
      supabase.from('progetti').select('*, clienti(nome)').order('created_at', { ascending: false }),
      supabase.from('clienti').select('id, nome').order('nome'),
    ])
    if (error) { console.error(safeErrorMessage(error)); return }
    setRows(data ?? [])
    setClienti(cli ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    setEditing(null)
    setForm({ ...emptyCreate })
    setErrors({})
    setModal(true)
  }

  const openEdit = (p: Progetto) => {
    setEditing(p)
    setForm({
      cliente_id: p.cliente_id, nome: p.nome, descrizione: p.descrizione,
      stato: p.stato, data_inizio: p.data_inizio, data_fine: p.data_fine,
      budget: p.budget, pagamento_mensile: p.pagamento_mensile,
      responsabile: p.responsabile, team: p.team ?? [],
      priorita_progetto: p.priorita_progetto ?? 'media',
      marginalita_stimata: p.marginalita_stimata,
      link_demo: p.link_demo ?? null,
      link_deploy: p.link_deploy ?? null,
    })
    setErrors({})
    setModal(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = validate(progettoSchema, form)
    if (!result.success) { setErrors(result.errors); return }
    setErrors({}); setSaving(true)
    const { error } = editing
      ? await supabase.from('progetti').update(result.data).eq('id', editing.id)
      : await supabase.from('progetti').insert(result.data)
    if (error) { setErrors({ _form: safeErrorMessage(error) }); setSaving(false); return }
    setSaving(false); setModal(false)
    await load()
  }

  const remove = async () => {
    if (!deleteId) return
    await supabase.from('progetti').delete().eq('id', deleteId)
    setDeleteId(null)
    load()
  }

  const f = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const isEditing = editing !== null

  function renderForm() {
    return (
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {errors._form && <p style={{ fontSize: 12, color: '#DC2626' }}>{errors._form}</p>}

        <FormField label="Nome progetto" required error={errors.nome}>
          <Input value={form.nome} onChange={f('nome')} placeholder="Nome del progetto" maxLength={200} required />
        </FormField>

        <FormField label="Cliente" error={errors.cliente_id}>
          <Select value={form.cliente_id ?? ''} onChange={f('cliente_id')}>
            <option value="">— Seleziona cliente —</option>
            {clienti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        </FormField>

        <FormField label="Descrizione" error={errors.descrizione}>
          <TextArea value={form.descrizione ?? ''} onChange={f('descrizione')} placeholder="Breve descrizione del progetto..." maxLength={2000} />
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
          <FormField label="Data inizio" error={errors.data_inizio}>
            <Input type="date" value={form.data_inizio ?? ''} onChange={f('data_inizio')} />
          </FormField>
          <FormField label="Data fine prevista" error={errors.data_fine}>
            <Input type="date" value={form.data_fine ?? ''} onChange={f('data_fine')} />
          </FormField>
        </div>

        {isEditing && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
              <FormField label="Stato" error={errors.stato}>
                <Select value={form.stato} onChange={f('stato')}>
                  <option value="cliente_demo">Cliente Demo</option>
                  <option value="demo_accettata">Demo Accettata</option>
                  <option value="firmato">Firmato</option>
                  <option value="completato">Completato</option>
                  <option value="archiviato">Archiviato</option>
                </Select>
              </FormField>
              <FormField label="Priorità" error={errors.priorita_progetto}>
                <Select value={form.priorita_progetto} onChange={f('priorita_progetto')}>
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="bassa">Bassa</option>
                </Select>
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
              <FormField label="Pagamento mensile (€)" error={errors.pagamento_mensile} hint="Importo mensile dal cliente">
                <Input type="number" step="0.01" value={form.pagamento_mensile ?? ''} onChange={f('pagamento_mensile')} placeholder="0.00" />
              </FormField>
              <FormField label="Responsabile" error={errors.responsabile}>
                <Input value={form.responsabile ?? ''} onChange={f('responsabile')} placeholder="Nome responsabile" />
              </FormField>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
          <Button type="button" variant="ghost" onClick={() => setModal(false)}>Annulla</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Salvataggio...' : isEditing ? 'Salva modifiche' : 'Crea progetto'}</Button>
        </div>
      </form>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <Button onClick={openNew}><Plus className="w-3.5 h-3.5" />Nuovo progetto</Button>
      </div>

      {loading
        ? <div style={{ color: '#6C7F94', fontSize: 13 }}>Caricamento...</div>
        : rows.length === 0
          ? <EmptyState icon={FolderOpen} title="Nessun progetto" description="Crea il primo progetto per iniziare." action={{ label: 'Nuovo progetto', onClick: openNew }} />
          : (
            <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ minWidth: 640 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr 1fr 1fr 80px', padding: '10px 20px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
                {['Progetto', 'Cliente', 'Stato', 'Periodo', 'Pag. mensile', ''].map(h => (
                  <span key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
                ))}
              </div>
              {rows.map(p => {
                const b = statoBadge[p.stato]
                const periodo = p.data_inizio
                  ? `${fmtDate(p.data_inizio)}${p.data_fine ? ` — ${fmtDate(p.data_fine)}` : ''}`
                  : '—'
                return (
                  <div
                    key={p.id}
                    onClick={() => onViewProgetto(p.id)}
                    style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr 1fr 1fr 80px', padding: '14px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F9FAFB')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2332', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {p.nome}
                        <ChevronRight style={{ width: 12, height: 12, color: '#9CA3AF' }} />
                      </div>
                      {p.descrizione && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{p.descrizione}</div>}
                    </div>
                    <span style={{ fontSize: 13, color: '#4B5563' }}>{p.clienti?.nome ?? '—'}</span>
                    <div><Badge label={b.label} color={b.color} /></div>
                    <span style={{ fontSize: 12, color: '#4B5563' }}>{periodo}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: p.pagamento_mensile ? '#1A2332' : '#9CA3AF' }}>{fmtEur(p.pagamento_mensile)}</span>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 4, display: 'flex' }} title="Modifica"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDeleteId(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, display: 'flex' }} title="Elimina"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                )
              })}
              </div>
            </div>
          )
      }

      <Modal open={modal} onClose={() => setModal(false)} title={isEditing ? 'Modifica progetto' : 'Nuovo progetto'} width="560px">
        {renderForm()}
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Elimina progetto" width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>Sei sicuro di voler eliminare questo progetto? L'operazione non è reversibile.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Annulla</Button>
          <Button variant="danger" onClick={remove}>Elimina</Button>
        </div>
      </Modal>
    </div>
  )
}

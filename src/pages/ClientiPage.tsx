import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Users, Eye } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { clienteSchema, validate, type ValidationErrors } from '../lib/validation'
import { safeErrorMessage } from '../lib/errors'
import type { Cliente } from '../types'
import { Button }     from '../components/ui/Button'
import { Modal }      from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { FormField, Input, TextArea } from '../components/ui/FormField'
import { useIsMobile } from '../hooks/useIsMobile'

const empty: Omit<Cliente, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  nome: '', partita_iva: null, codice_fiscale: null, codice_sdi: null,
  pec: null, indirizzo_sede: null, cap: null, citta: null, provincia: null,
  nazione: 'Italia', sito_web: null, settore: null, email: null, telefono: null, note: null,
}

interface ClientiPageProps {
  onViewCliente?: (id: string) => void
}

export const ClientiPage = ({ onViewCliente }: ClientiPageProps = {}) => {
  const isMobile = useIsMobile()
  const [clienti, setClienti]   = useState<Cliente[]>([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState<Cliente | null>(null)
  const [form, setForm]         = useState({ ...empty })
  const [saving, setSaving]     = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [errors, setErrors]     = useState<ValidationErrors>({})

  const load = async () => {
    const { data, error } = await supabase.from('clienti').select('*').order('nome')
    if (error) { console.error(safeErrorMessage(error)); return }
    setClienti(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm({ ...empty }); setErrors({}); setModal(true) }
  const openEdit = (c: Cliente) => {
    setEditing(c)
    setForm({
      nome: c.nome, partita_iva: c.partita_iva, codice_fiscale: c.codice_fiscale,
      codice_sdi: c.codice_sdi, pec: c.pec, indirizzo_sede: c.indirizzo_sede,
      cap: c.cap, citta: c.citta, provincia: c.provincia, nazione: c.nazione,
      sito_web: c.sito_web, settore: c.settore, email: c.email, telefono: c.telefono, note: c.note,
    })
    setErrors({})
    setModal(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = validate(clienteSchema, form)
    if (!result.success) { setErrors(result.errors); return }
    setErrors({})
    setSaving(true)
    const payload = result.data
    const { error } = editing
      ? await supabase.from('clienti').update(payload).eq('id', editing.id)
      : await supabase.from('clienti').insert(payload)
    if (error) { setErrors({ _form: safeErrorMessage(error) }); setSaving(false); return }
    setSaving(false)
    setModal(false)
    load()
  }

  const remove = async () => {
    if (!deleteId) return
    await supabase.from('clienti').delete().eq('id', deleteId)
    setDeleteId(null)
    load()
  }

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <Button onClick={openNew}><Plus className="w-3.5 h-3.5" />Nuovo cliente</Button>
      </div>

      {loading
        ? <div style={{ color: '#6C7F94', fontSize: 13 }}>Caricamento...</div>
        : clienti.length === 0
          ? <EmptyState icon={Users} title="Nessun cliente" description="Aggiungi il primo cliente per iniziare." action={{ label: 'Aggiungi cliente', onClick: openNew }} />
          : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #E5E7EB', backgroundColor: '#fff' }}>
              {clienti.map(c => (
                <div key={c.id} style={{ padding: '14px 16px', borderBottom: '1px solid #F3F4F6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                    <div
                      onClick={() => onViewCliente?.(c.id)}
                      style={{ fontSize: 14, fontWeight: 600, color: '#1A2332', flex: 1, minWidth: 0, cursor: onViewCliente ? 'pointer' : 'default', lineHeight: 1.4 }}
                    >
                      {c.nome}
                      {c.settore && <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 400, marginTop: 2 }}>{c.settore}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 0, flexShrink: 0 }}>
                      {onViewCliente && (
                        <button onClick={() => onViewCliente(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#005DEF', padding: '8px', display: 'flex', borderRadius: 6 }} title="Dettaglio">
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => openEdit(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: '8px', display: 'flex', borderRadius: 6 }} title="Modifica">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteId(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: '8px', display: 'flex', borderRadius: 6 }} title="Elimina">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                    {c.email && <span style={{ fontSize: 12, color: '#4B5563' }}>{c.email}</span>}
                    {c.telefono && <span style={{ fontSize: 12, color: '#4B5563' }}>{c.telefono}</span>}
                    {c.citta && <span style={{ fontSize: 12, color: '#9CA3AF' }}>{c.citta}{c.provincia ? ` (${c.provincia})` : ''}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ minWidth: 640 }}>
              {/* Intestazione */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.5fr 1fr 1fr 80px', padding: '10px 20px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
                {['Azienda', 'P.IVA / SDI', 'Email / PEC', 'Telefono', 'Sede', ''].map(h => (
                  <span key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
                ))}
              </div>
              {clienti.map(c => (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.5fr 1fr 1fr 80px', padding: '14px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
                  <div>
                    <div
                      onClick={() => onViewCliente?.(c.id)}
                      style={{ fontSize: 13, fontWeight: 600, color: '#1A2332', cursor: onViewCliente ? 'pointer' : 'default', transition: 'color 0.15s' }}
                      onMouseEnter={e => { if (onViewCliente) e.currentTarget.style.color = '#005DEF' }}
                      onMouseLeave={e => { if (onViewCliente) e.currentTarget.style.color = '#1A2332' }}
                    >
                      {c.nome}
                    </div>
                    {c.settore && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{c.settore}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: '#4B5563' }}>{c.partita_iva ?? '—'}</div>
                    {c.codice_sdi && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>SDI: {c.codice_sdi}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email ?? '—'}</div>
                    {c.pec && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.pec}</div>}
                  </div>
                  <span style={{ fontSize: 13, color: '#4B5563' }}>{c.telefono ?? '—'}</span>
                  <div>
                    <div style={{ fontSize: 13, color: '#4B5563' }}>{c.citta ?? '—'}</div>
                    {c.provincia && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>({c.provincia})</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    {onViewCliente && (
                      <button onClick={() => onViewCliente(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#005DEF', padding: 6, display: 'flex', borderRadius: 4 }} title="Dettaglio">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => openEdit(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 6, display: 'flex', borderRadius: 4 }} title="Modifica">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteId(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 6, display: 'flex', borderRadius: 4 }} title="Elimina">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              </div>
            </div>
          )
      }

      {/* Modal form */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifica cliente' : 'Nuovo cliente'} width={isMobile ? 'calc(100vw - 32px)' : '640px'}>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {errors._form && <p style={{ fontSize: 12, color: '#DC2626' }}>{errors._form}</p>}

          {/* Dati aziendali */}
          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <legend style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94', marginBottom: 4 }}>Dati aziendali</legend>
            <FormField label="Ragione Sociale" required error={errors.nome}>
              <Input value={form.nome} onChange={f('nome')} placeholder="Ragione sociale" maxLength={200} required />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
              <FormField label="Partita IVA" error={errors.partita_iva}>
                <Input value={form.partita_iva ?? ''} onChange={f('partita_iva')} placeholder="01234567890" maxLength={20} />
              </FormField>
              <FormField label="Codice Fiscale" error={errors.codice_fiscale}>
                <Input value={form.codice_fiscale ?? ''} onChange={f('codice_fiscale')} placeholder="ABCDEF01G23H456I" maxLength={20} />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
              <FormField label="Codice SDI" error={errors.codice_sdi}>
                <Input value={form.codice_sdi ?? ''} onChange={f('codice_sdi')} placeholder="ABC1234" maxLength={7} />
              </FormField>
              <FormField label="Settore" error={errors.settore}>
                <Input value={form.settore ?? ''} onChange={f('settore')} placeholder="Es. Fintech, Healthcare..." maxLength={500} />
              </FormField>
            </div>
          </fieldset>

          {/* Sede legale */}
          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <legend style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94', marginBottom: 4 }}>Sede legale</legend>
            <FormField label="Indirizzo" error={errors.indirizzo_sede}>
              <Input value={form.indirizzo_sede ?? ''} onChange={f('indirizzo_sede')} placeholder="Via Roma 1" maxLength={500} />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 16 }}>
              <FormField label="CAP" error={errors.cap}>
                <Input value={form.cap ?? ''} onChange={f('cap')} placeholder="00100" maxLength={10} />
              </FormField>
              <FormField label="Città" error={errors.citta}>
                <Input value={form.citta ?? ''} onChange={f('citta')} placeholder="Roma" maxLength={500} />
              </FormField>
              <FormField label="Provincia" error={errors.provincia}>
                <Input value={form.provincia ?? ''} onChange={f('provincia')} placeholder="RM" maxLength={5} />
              </FormField>
              <FormField label="Nazione" error={errors.nazione}>
                <Input value={form.nazione ?? ''} onChange={f('nazione')} placeholder="Italia" maxLength={500} />
              </FormField>
            </div>
          </fieldset>

          {/* Contatti */}
          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <legend style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94', marginBottom: 4 }}>Contatti</legend>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
              <FormField label="Email" error={errors.email}>
                <Input type="email" value={form.email ?? ''} onChange={f('email')} placeholder="info@azienda.com" maxLength={500} />
              </FormField>
              <FormField label="PEC" error={errors.pec}>
                <Input type="email" value={form.pec ?? ''} onChange={f('pec')} placeholder="azienda@pec.it" maxLength={500} />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
              <FormField label="Telefono" error={errors.telefono}>
                <Input value={form.telefono ?? ''} onChange={f('telefono')} placeholder="+39 02 1234567" maxLength={30} />
              </FormField>
              <FormField label="Sito Web" error={errors.sito_web}>
                <Input value={form.sito_web ?? ''} onChange={f('sito_web')} placeholder="https://www.azienda.com" maxLength={500} />
              </FormField>
            </div>
          </fieldset>

          {/* Note */}
          <FormField label="Note" error={errors.note}>
            <TextArea value={form.note ?? ''} onChange={f('note')} placeholder="Note interne..." maxLength={2000} />
          </FormField>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>Annulla</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</Button>
          </div>
        </form>
      </Modal>

      {/* Modal conferma eliminazione */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Elimina cliente" width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>Sei sicuro di voler eliminare questo cliente? L'operazione non è reversibile.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Annulla</Button>
          <Button variant="danger" onClick={remove}>Elimina</Button>
        </div>
      </Modal>
    </div>
  )
}

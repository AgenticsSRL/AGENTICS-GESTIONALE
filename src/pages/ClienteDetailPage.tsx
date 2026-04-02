import { useEffect, useState, useCallback } from 'react'
import { ArrowLeft, Pencil, Trash2, Plus, Copy, Check, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { clienteSchema, validate, type ValidationErrors } from '../lib/validation'
import { safeErrorMessage } from '../lib/errors'
import type {
  Cliente, Progetto, StatoProgetto,
  Abbonamento, StatoAbbonamento, TipoAbbonamento,
  Iscrizione, StatoIscrizione,
  Spesa, CategoriaSpesa,
} from '../types'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { FormField, Input, TextArea } from '../components/ui/FormField'

const BRAND = '#005DEF'

const statoBadge: Record<StatoProgetto, { label: string; color: 'green' | 'blue' | 'yellow' | 'gray' | 'orange' }> = {
  cliente_demo:   { label: 'Cliente Demo',   color: 'yellow' },
  demo_accettata: { label: 'Demo Accettata', color: 'orange' },
  firmato:        { label: 'Firmato',        color: 'green' },
  completato:     { label: 'Completato',     color: 'blue' },
  archiviato:     { label: 'Archiviato',     color: 'gray' },
}

const abboStatoBadge: Record<StatoAbbonamento, { label: string; color: 'green' | 'yellow' | 'gray' | 'blue' }> = {
  attivo:     { label: 'Attivo',     color: 'green' },
  sospeso:    { label: 'Sospeso',    color: 'yellow' },
  scaduto:    { label: 'Scaduto',    color: 'gray' },
  cancellato: { label: 'Cancellato', color: 'gray' },
}

const iscriStatoBadge: Record<StatoIscrizione, { label: string; color: 'green' | 'gray' }> = {
  attiva:     { label: 'Attiva',     color: 'green' },
  scaduta:    { label: 'Scaduta',    color: 'gray' },
  cancellata: { label: 'Cancellata', color: 'gray' },
}

const tipoLabels: Record<TipoAbbonamento, string> = {
  mensile: 'Mensile', trimestrale: 'Trimestrale', semestrale: 'Semestrale', annuale: 'Annuale', altro: 'Altro',
}

const catLabels: Record<CategoriaSpesa, string> = {
  software: 'Software', hardware: 'Hardware', servizi: 'Servizi', trasferta: 'Trasferta', altro: 'Altro',
}

const emptyForm: Omit<Cliente, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  nome: '', partita_iva: null, codice_fiscale: null, codice_sdi: null,
  pec: null, indirizzo_sede: null, cap: null, citta: null, provincia: null,
  nazione: 'Italia', sito_web: null, settore: null, email: null, telefono: null, note: null,
}

const emptyAbbo = { nome: '', tipo: 'mensile' as TipoAbbonamento, importo: '', data_inizio: '', data_scadenza: '', stato: 'attivo' as StatoAbbonamento, note: '' }
const emptyIscr = { nome: '', descrizione: '', importo: '', data_iscrizione: '', data_scadenza: '', stato: 'attiva' as StatoIscrizione, note: '' }

interface Props {
  clienteId: string
  onBack: () => void
}

export const ClienteDetailPage = ({ clienteId, onBack }: Props) => {
  const [cliente, setCliente]         = useState<Cliente | null>(null)
  const [progetti, setProgetti]       = useState<Progetto[]>([])
  const [abbonamenti, setAbbonamenti] = useState<Abbonamento[]>([])
  const [iscrizioni, setIscrizioni]   = useState<Iscrizione[]>([])
  const [spese, setSpese]             = useState<Spesa[]>([])
  const [loading, setLoading]         = useState(true)

  const [editModal, setEditModal]       = useState(false)
  const [deleteModal, setDeleteModal]   = useState(false)
  const [form, setForm]                 = useState({ ...emptyForm })
  const [saving, setSaving]             = useState(false)
  const [errors, setErrors]             = useState<ValidationErrors>({})
  const [copied, setCopied]             = useState<string | null>(null)

  const [abboModal, setAbboModal] = useState(false)
  const [abboForm, setAbboForm]   = useState({ ...emptyAbbo })
  const [abboSaving, setAbboSaving] = useState(false)

  const [iscrModal, setIscrModal] = useState(false)
  const [iscrForm, setIscrForm]   = useState({ ...emptyIscr })
  const [iscrSaving, setIscrSaving] = useState(false)

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const fmtCurrency = (v: number) => `€ ${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const load = useCallback(async () => {
    const [
      { data: clienteData },
      { data: progettiData },
      { data: abboData },
      { data: iscrData },
    ] = await Promise.all([
      supabase.from('clienti').select('*').eq('id', clienteId).single(),
      supabase.from('progetti').select('*').eq('cliente_id', clienteId).order('created_at', { ascending: false }),
      supabase.from('abbonamenti').select('*').eq('cliente_id', clienteId).order('data_inizio', { ascending: false }),
      supabase.from('iscrizioni').select('*').eq('cliente_id', clienteId).order('data_iscrizione', { ascending: false }),
    ])

    if (!clienteData) return
    setCliente(clienteData)
    setProgetti(progettiData ?? [])
    setAbbonamenti(abboData ?? [])
    setIscrizioni(iscrData ?? [])

    const progettoIds = (progettiData ?? []).map(p => p.id)
    if (progettoIds.length > 0) {
      const { data: speseData } = await supabase.from('spese').select('*').in('progetto_id', progettoIds).order('data', { ascending: false })
      setSpese(speseData ?? [])
    } else {
      setSpese([])
    }

    setLoading(false)
  }, [clienteId])

  useEffect(() => { load() }, [load])

  const openEdit = () => {
    if (!cliente) return
    setForm({
      nome: cliente.nome, partita_iva: cliente.partita_iva, codice_fiscale: cliente.codice_fiscale,
      codice_sdi: cliente.codice_sdi, pec: cliente.pec, indirizzo_sede: cliente.indirizzo_sede,
      cap: cliente.cap, citta: cliente.citta, provincia: cliente.provincia, nazione: cliente.nazione,
      sito_web: cliente.sito_web, settore: cliente.settore, email: cliente.email, telefono: cliente.telefono, note: cliente.note,
    })
    setErrors({}); setEditModal(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = validate(clienteSchema, form)
    if (!result.success) { setErrors(result.errors); return }
    setErrors({}); setSaving(true)
    const { error } = await supabase.from('clienti').update(result.data).eq('id', clienteId)
    if (error) { setErrors({ _form: safeErrorMessage(error) }); setSaving(false); return }
    setSaving(false); setEditModal(false); load()
  }

  const remove = async () => {
    await supabase.from('clienti').delete().eq('id', clienteId)
    onBack()
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopied(field)
    setTimeout(() => setCopied(null), 1500)
  }

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const saveAbbonamento = async (e: React.FormEvent) => {
    e.preventDefault()
    setAbboSaving(true)
    const { error } = await supabase.from('abbonamenti').insert({
      cliente_id: clienteId,
      nome: abboForm.nome.trim(),
      tipo: abboForm.tipo,
      importo: parseFloat(abboForm.importo) || 0,
      data_inizio: abboForm.data_inizio,
      data_scadenza: abboForm.data_scadenza || null,
      stato: abboForm.stato,
      note: abboForm.note.trim() || null,
    })
    setAbboSaving(false)
    if (error) { alert(safeErrorMessage(error)); return }
    setAbboModal(false); setAbboForm({ ...emptyAbbo }); load()
  }

  const deleteAbbonamento = async (id: string) => {
    await supabase.from('abbonamenti').delete().eq('id', id)
    load()
  }

  const saveIscrizione = async (e: React.FormEvent) => {
    e.preventDefault()
    setIscrSaving(true)
    const { error } = await supabase.from('iscrizioni').insert({
      cliente_id: clienteId,
      nome: iscrForm.nome.trim(),
      descrizione: iscrForm.descrizione.trim() || null,
      importo: iscrForm.importo ? parseFloat(iscrForm.importo) : null,
      data_iscrizione: iscrForm.data_iscrizione,
      data_scadenza: iscrForm.data_scadenza || null,
      stato: iscrForm.stato,
      note: iscrForm.note.trim() || null,
    })
    setIscrSaving(false)
    if (error) { alert(safeErrorMessage(error)); return }
    setIscrModal(false); setIscrForm({ ...emptyIscr }); load()
  }

  const deleteIscrizione = async (id: string) => {
    await supabase.from('iscrizioni').delete().eq('id', id)
    load()
  }

  if (loading) return <div style={{ color: '#6C7F94', fontSize: 13 }}>Caricamento...</div>
  if (!cliente) return <div style={{ color: '#DC2626', fontSize: 13 }}>Cliente non trovato.</div>

  const sectionTitle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94', margin: 0,
  }

  const card: React.CSSProperties = {
    backgroundColor: '#fff', border: '1px solid #E5E7EB', padding: '20px 24px',
  }

  const fieldLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF', marginBottom: 4,
  }

  const fieldValue: React.CSSProperties = {
    fontSize: 13, color: '#1A2332', fontWeight: 500,
  }

  const fieldEmpty: React.CSSProperties = {
    fontSize: 13, color: '#D1D5DB', fontStyle: 'italic',
  }

  const thStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94', padding: '10px 16px', textAlign: 'left',
  }

  const tdStyle: React.CSSProperties = {
    fontSize: 13, color: '#4B5563', padding: '12px 16px', borderTop: '1px solid #F3F4F6',
  }

  const CopyBtn = ({ text, field }: { text: string; field: string }) => (
    <button
      onClick={() => copyToClipboard(text, field)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === field ? '#15803D' : '#9CA3AF', padding: 2, display: 'inline-flex', marginLeft: 6, transition: 'color 0.15s' }}
      title="Copia"
    >
      {copied === field ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
    </button>
  )

  const DataRow = ({ label, value, copyable, link }: { label: string; value: string | null; copyable?: boolean; link?: string }) => (
    <div style={{ display: 'flex', padding: '10px 0', borderBottom: '1px solid #F3F4F6' }}>
      <div style={{ width: 160, flexShrink: 0 }}>
        <span style={fieldLabel}>{label}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {value ? (
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            {link ? (
              <a href={link} target="_blank" rel="noopener noreferrer" style={{ ...fieldValue, color: BRAND, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {value} <ExternalLink style={{ width: 11, height: 11 }} />
              </a>
            ) : (
              <span style={fieldValue}>{value}</span>
            )}
            {copyable && <CopyBtn text={value} field={label} />}
          </span>
        ) : (
          <span style={fieldEmpty}>—</span>
        )}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: BRAND, fontSize: 13, fontWeight: 600, padding: 0 }}
        >
          <ArrowLeft style={{ width: 15, height: 15 }} /> Torna ai clienti
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={openEdit}><Pencil className="w-3 h-3" /> Modifica</Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteModal(true)}><Trash2 className="w-3 h-3" /> Elimina</Button>
        </div>
      </div>

      {/* Header */}
      <div style={{ ...card, borderLeft: `4px solid ${BRAND}`, padding: '24px 32px' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1A2332' }}>{cliente.nome}</h2>
        <div style={{ display: 'flex', gap: 20, marginTop: 8, flexWrap: 'wrap' }}>
          {cliente.settore && <span style={{ fontSize: 12, color: '#6C7F94' }}>{cliente.settore}</span>}
          {cliente.citta && (
            <span style={{ fontSize: 12, color: '#6C7F94' }}>
              {cliente.citta}{cliente.provincia ? ` (${cliente.provincia})` : ''}
            </span>
          )}
          {cliente.email && <span style={{ fontSize: 12, color: '#6C7F94' }}>{cliente.email}</span>}
        </div>
      </div>

      {/* Info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Dati aziendali */}
        <div style={card}>
          <h3 style={{ ...sectionTitle, marginBottom: 12 }}>Dati Aziendali</h3>
          <DataRow label="Partita IVA" value={cliente.partita_iva} copyable />
          <DataRow label="Codice Fiscale" value={cliente.codice_fiscale} copyable />
          <DataRow label="Codice SDI" value={cliente.codice_sdi} copyable />
          <DataRow label="Settore" value={cliente.settore} />
        </div>

        {/* Contatti */}
        <div style={card}>
          <h3 style={{ ...sectionTitle, marginBottom: 12 }}>Contatti</h3>
          <DataRow label="Email" value={cliente.email} copyable link={cliente.email ? `mailto:${cliente.email}` : undefined} />
          <DataRow label="PEC" value={cliente.pec} copyable link={cliente.pec ? `mailto:${cliente.pec}` : undefined} />
          <DataRow label="Telefono" value={cliente.telefono} copyable link={cliente.telefono ? `tel:${cliente.telefono}` : undefined} />
          <DataRow label="Sito Web" value={cliente.sito_web} copyable link={cliente.sito_web ?? undefined} />
        </div>

        {/* Sede */}
        <div style={card}>
          <h3 style={{ ...sectionTitle, marginBottom: 12 }}>Sede Legale</h3>
          <DataRow label="Via" value={cliente.indirizzo_sede} />
          <DataRow label="CAP" value={cliente.cap} />
          <DataRow label="Città" value={cliente.citta} />
          <DataRow label="Provincia" value={cliente.provincia} />
          <DataRow label="Nazione" value={cliente.nazione} />
        </div>

        {/* Note */}
        <div style={card}>
          <h3 style={{ ...sectionTitle, marginBottom: 12 }}>Note</h3>
          {cliente.note ? (
            <p style={{ fontSize: 13, color: '#4B5563', margin: 0, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{cliente.note}</p>
          ) : (
            <span style={fieldEmpty}>Nessuna nota</span>
          )}
        </div>
      </div>

      {/* ── ABBONAMENTI ──────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={sectionTitle}>Abbonamenti ({abbonamenti.length})</h3>
          <Button size="sm" onClick={() => { setAbboForm({ ...emptyAbbo }); setAbboModal(true) }}><Plus className="w-3 h-3" /> Nuovo</Button>
        </div>

        {abbonamenti.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: 32 }}>
            <span style={{ fontSize: 13, color: '#9CA3AF' }}>Nessun abbonamento per questo cliente</span>
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#F9FAFB' }}>
                  <th style={thStyle}>Nome</th>
                  <th style={thStyle}>Tipo</th>
                  <th style={thStyle}>Importo</th>
                  <th style={thStyle}>Inizio</th>
                  <th style={thStyle}>Scadenza</th>
                  <th style={thStyle}>Stato</th>
                  <th style={{ ...thStyle, width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {abbonamenti.map(a => (
                  <tr key={a.id}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#1A2332' }}>{a.nome}</td>
                    <td style={tdStyle}>{tipoLabels[a.tipo]}</td>
                    <td style={tdStyle}>{fmtCurrency(a.importo)}</td>
                    <td style={tdStyle}>{fmtDate(a.data_inizio)}</td>
                    <td style={tdStyle}>{a.data_scadenza ? fmtDate(a.data_scadenza) : '—'}</td>
                    <td style={tdStyle}><Badge label={abboStatoBadge[a.stato].label} color={abboStatoBadge[a.stato].color} /></td>
                    <td style={tdStyle}>
                      <button onClick={() => deleteAbbonamento(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, display: 'flex' }} title="Elimina">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#F9FAFB', borderTop: '1px solid #E5E7EB' }}>
                  <td style={{ ...tdStyle, fontWeight: 700, color: '#1A2332' }}>Totale</td>
                  <td style={tdStyle} />
                  <td style={{ ...tdStyle, fontWeight: 700, color: '#1A2332' }}>{fmtCurrency(abbonamenti.reduce((s, a) => s + Number(a.importo), 0))}</td>
                  <td style={tdStyle} colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── ISCRIZIONI ───────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={sectionTitle}>Iscrizioni ({iscrizioni.length})</h3>
          <Button size="sm" onClick={() => { setIscrForm({ ...emptyIscr }); setIscrModal(true) }}><Plus className="w-3 h-3" /> Nuova</Button>
        </div>

        {iscrizioni.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: 32 }}>
            <span style={{ fontSize: 13, color: '#9CA3AF' }}>Nessuna iscrizione per questo cliente</span>
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#F9FAFB' }}>
                  <th style={thStyle}>Nome</th>
                  <th style={thStyle}>Descrizione</th>
                  <th style={thStyle}>Importo</th>
                  <th style={thStyle}>Data Iscrizione</th>
                  <th style={thStyle}>Scadenza</th>
                  <th style={thStyle}>Stato</th>
                  <th style={{ ...thStyle, width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {iscrizioni.map(i => (
                  <tr key={i.id}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#1A2332' }}>{i.nome}</td>
                    <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.descrizione ?? '—'}</td>
                    <td style={tdStyle}>{i.importo != null ? fmtCurrency(i.importo) : '—'}</td>
                    <td style={tdStyle}>{fmtDate(i.data_iscrizione)}</td>
                    <td style={tdStyle}>{i.data_scadenza ? fmtDate(i.data_scadenza) : '—'}</td>
                    <td style={tdStyle}><Badge label={iscriStatoBadge[i.stato].label} color={iscriStatoBadge[i.stato].color} /></td>
                    <td style={tdStyle}>
                      <button onClick={() => deleteIscrizione(i.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 4, display: 'flex' }} title="Elimina">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── SPESE ────────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={sectionTitle}>Spese ({spese.length})</h3>
        </div>

        {spese.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: 32 }}>
            <span style={{ fontSize: 13, color: '#9CA3AF' }}>Nessuna spesa registrata per questo cliente</span>
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#F9FAFB' }}>
                  <th style={thStyle}>Data</th>
                  <th style={thStyle}>Descrizione</th>
                  <th style={thStyle}>Categoria</th>
                  <th style={thStyle}>Importo</th>
                </tr>
              </thead>
              <tbody>
                {spese.map(s => (
                  <tr key={s.id}>
                    <td style={tdStyle}>{fmtDate(s.data)}</td>
                    <td style={{ ...tdStyle, fontWeight: 500, color: '#1A2332' }}>{s.descrizione}</td>
                    <td style={tdStyle}>{catLabels[s.categoria]}</td>
                    <td style={tdStyle}>{fmtCurrency(s.importo)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#F9FAFB', borderTop: '1px solid #E5E7EB' }}>
                  <td style={{ ...tdStyle, fontWeight: 700, color: '#1A2332' }}>Totale</td>
                  <td style={tdStyle} colSpan={2} />
                  <td style={{ ...tdStyle, fontWeight: 700, color: '#1A2332' }}>{fmtCurrency(spese.reduce((s, e) => s + Number(e.importo), 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── PROGETTI ─────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={sectionTitle}>Progetti ({progetti.length})</h3>
        </div>

        {progetti.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: 32 }}>
            <span style={{ fontSize: 13, color: '#9CA3AF' }}>Nessun progetto associato a questo cliente</span>
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#F9FAFB' }}>
                  <th style={thStyle}>Nome Progetto</th>
                  <th style={thStyle}>Stato</th>
                  <th style={thStyle}>Budget</th>
                  <th style={thStyle}>Data Inizio</th>
                  <th style={thStyle}>Data Fine</th>
                </tr>
              </thead>
              <tbody>
                {progetti.map(p => {
                  const b = statoBadge[p.stato]
                  return (
                    <tr key={p.id}>
                      <td style={{ ...tdStyle, fontWeight: 600, color: '#1A2332' }}>
                        {p.nome}
                        {p.descrizione && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{p.descrizione}</div>}
                      </td>
                      <td style={tdStyle}><Badge label={b.label} color={b.color} /></td>
                      <td style={tdStyle}>{p.budget != null ? fmtCurrency(p.budget) : '—'}</td>
                      <td style={tdStyle}>{p.data_inizio ? fmtDate(p.data_inizio) : '—'}</td>
                      <td style={tdStyle}>{p.data_fine ? fmtDate(p.data_fine) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#F9FAFB', borderTop: '1px solid #E5E7EB' }}>
                  <td style={{ ...tdStyle, fontWeight: 700, color: '#1A2332' }}>Totale: {progetti.length} progett{progetti.length === 1 ? 'o' : 'i'}</td>
                  <td style={tdStyle} />
                  <td style={{ ...tdStyle, fontWeight: 700, color: '#1A2332' }}>{fmtCurrency(progetti.reduce((s, p) => s + (p.budget ?? 0), 0))}</td>
                  <td style={tdStyle} colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div style={{ display: 'flex', gap: 24, padding: '12px 0', borderTop: '1px solid #E5E7EB' }}>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>Creato il {fmtDate(cliente.created_at)}</span>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>Ultimo aggiornamento: {fmtDate(cliente.updated_at)}</span>
      </div>

      {/* ── MODALS ───────────────────────────────────────── */}

      {/* Edit cliente */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Modifica cliente" width="640px">
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {errors._form && <p style={{ fontSize: 12, color: '#DC2626' }}>{errors._form}</p>}
          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <legend style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94', marginBottom: 4 }}>Dati aziendali</legend>
            <FormField label="Ragione Sociale" required error={errors.nome}>
              <Input value={form.nome} onChange={f('nome')} placeholder="Ragione sociale" maxLength={200} required />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FormField label="Partita IVA" error={errors.partita_iva}><Input value={form.partita_iva ?? ''} onChange={f('partita_iva')} maxLength={20} /></FormField>
              <FormField label="Codice Fiscale" error={errors.codice_fiscale}><Input value={form.codice_fiscale ?? ''} onChange={f('codice_fiscale')} maxLength={20} /></FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FormField label="Codice SDI" error={errors.codice_sdi}><Input value={form.codice_sdi ?? ''} onChange={f('codice_sdi')} maxLength={7} /></FormField>
              <FormField label="Settore" error={errors.settore}><Input value={form.settore ?? ''} onChange={f('settore')} maxLength={500} /></FormField>
            </div>
          </fieldset>
          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <legend style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94', marginBottom: 4 }}>Sede legale</legend>
            <FormField label="Indirizzo" error={errors.indirizzo_sede}><Input value={form.indirizzo_sede ?? ''} onChange={f('indirizzo_sede')} maxLength={500} /></FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
              <FormField label="CAP" error={errors.cap}><Input value={form.cap ?? ''} onChange={f('cap')} maxLength={10} /></FormField>
              <FormField label="Città" error={errors.citta}><Input value={form.citta ?? ''} onChange={f('citta')} maxLength={500} /></FormField>
              <FormField label="Provincia" error={errors.provincia}><Input value={form.provincia ?? ''} onChange={f('provincia')} maxLength={5} /></FormField>
              <FormField label="Nazione" error={errors.nazione}><Input value={form.nazione ?? ''} onChange={f('nazione')} maxLength={500} /></FormField>
            </div>
          </fieldset>
          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <legend style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94', marginBottom: 4 }}>Contatti</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FormField label="Email" error={errors.email}><Input type="email" value={form.email ?? ''} onChange={f('email')} maxLength={500} /></FormField>
              <FormField label="PEC" error={errors.pec}><Input type="email" value={form.pec ?? ''} onChange={f('pec')} maxLength={500} /></FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FormField label="Telefono" error={errors.telefono}><Input value={form.telefono ?? ''} onChange={f('telefono')} maxLength={30} /></FormField>
              <FormField label="Sito Web" error={errors.sito_web}><Input value={form.sito_web ?? ''} onChange={f('sito_web')} maxLength={500} /></FormField>
            </div>
          </fieldset>
          <FormField label="Note" error={errors.note}>
            <TextArea value={form.note ?? ''} onChange={f('note')} maxLength={2000} />
          </FormField>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setEditModal(false)}>Annulla</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete cliente */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Elimina cliente" width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>
          Sei sicuro di voler eliminare <strong>{cliente.nome}</strong>? L'operazione non è reversibile.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteModal(false)}>Annulla</Button>
          <Button variant="danger" onClick={remove}>Elimina</Button>
        </div>
      </Modal>

      {/* Nuovo abbonamento */}
      <Modal open={abboModal} onClose={() => setAbboModal(false)} title="Nuovo abbonamento" width="480px">
        <form onSubmit={saveAbbonamento} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormField label="Nome" required>
            <Input value={abboForm.nome} onChange={e => setAbboForm(p => ({ ...p, nome: e.target.value }))} placeholder="Es. Hosting, CRM, ecc." maxLength={200} required />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <FormField label="Tipo">
              <select
                value={abboForm.tipo}
                onChange={e => setAbboForm(p => ({ ...p, tipo: e.target.value as TipoAbbonamento }))}
                style={{ width: '100%', height: 36, fontSize: 13, border: '1px solid #E5E7EB', padding: '0 10px', outline: 'none', backgroundColor: '#fff', color: '#1A2332' }}
              >
                {Object.entries(tipoLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </FormField>
            <FormField label="Importo" required>
              <Input type="number" step="0.01" min="0" value={abboForm.importo} onChange={e => setAbboForm(p => ({ ...p, importo: e.target.value }))} placeholder="0.00" required />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <FormField label="Data Inizio" required>
              <Input type="date" value={abboForm.data_inizio} onChange={e => setAbboForm(p => ({ ...p, data_inizio: e.target.value }))} required />
            </FormField>
            <FormField label="Data Scadenza">
              <Input type="date" value={abboForm.data_scadenza} onChange={e => setAbboForm(p => ({ ...p, data_scadenza: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Stato">
            <select
              value={abboForm.stato}
              onChange={e => setAbboForm(p => ({ ...p, stato: e.target.value as StatoAbbonamento }))}
              style={{ width: '100%', height: 36, fontSize: 13, border: '1px solid #E5E7EB', padding: '0 10px', outline: 'none', backgroundColor: '#fff', color: '#1A2332' }}
            >
              {Object.entries(abboStatoBadge).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </FormField>
          <FormField label="Note">
            <TextArea value={abboForm.note} onChange={e => setAbboForm(p => ({ ...p, note: e.target.value }))} maxLength={2000} />
          </FormField>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setAbboModal(false)}>Annulla</Button>
            <Button type="submit" disabled={abboSaving}>{abboSaving ? 'Salvataggio...' : 'Salva'}</Button>
          </div>
        </form>
      </Modal>

      {/* Nuova iscrizione */}
      <Modal open={iscrModal} onClose={() => setIscrModal(false)} title="Nuova iscrizione" width="480px">
        <form onSubmit={saveIscrizione} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormField label="Nome" required>
            <Input value={iscrForm.nome} onChange={e => setIscrForm(p => ({ ...p, nome: e.target.value }))} placeholder="Es. Corso, Evento, ecc." maxLength={200} required />
          </FormField>
          <FormField label="Descrizione">
            <TextArea value={iscrForm.descrizione} onChange={e => setIscrForm(p => ({ ...p, descrizione: e.target.value }))} maxLength={2000} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <FormField label="Importo">
              <Input type="number" step="0.01" min="0" value={iscrForm.importo} onChange={e => setIscrForm(p => ({ ...p, importo: e.target.value }))} placeholder="0.00" />
            </FormField>
            <FormField label="Stato">
              <select
                value={iscrForm.stato}
                onChange={e => setIscrForm(p => ({ ...p, stato: e.target.value as StatoIscrizione }))}
                style={{ width: '100%', height: 36, fontSize: 13, border: '1px solid #E5E7EB', padding: '0 10px', outline: 'none', backgroundColor: '#fff', color: '#1A2332' }}
              >
                {Object.entries(iscriStatoBadge).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <FormField label="Data Iscrizione" required>
              <Input type="date" value={iscrForm.data_iscrizione} onChange={e => setIscrForm(p => ({ ...p, data_iscrizione: e.target.value }))} required />
            </FormField>
            <FormField label="Data Scadenza">
              <Input type="date" value={iscrForm.data_scadenza} onChange={e => setIscrForm(p => ({ ...p, data_scadenza: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Note">
            <TextArea value={iscrForm.note} onChange={e => setIscrForm(p => ({ ...p, note: e.target.value }))} maxLength={2000} />
          </FormField>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setIscrModal(false)}>Annulla</Button>
            <Button type="submit" disabled={iscrSaving}>{iscrSaving ? 'Salvataggio...' : 'Salva'}</Button>
          </div>
        </form>
      </Modal>

    </div>
  )
}

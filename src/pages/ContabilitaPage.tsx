import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'
import { supabase } from '../lib/supabase'
import { spesaSchema, validate, type ValidationErrors } from '../lib/validation'
import { safeErrorMessage } from '../lib/errors'
import type { Spesa, Progetto, CategoriaSpesa, SpesaRicorrente, FrequenzaSpesa } from '../types'
import { Button }     from '../components/ui/Button'
import { Badge }      from '../components/ui/Badge'
import { Modal }      from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { FormField, Input, Select, TextArea } from '../components/ui/FormField'

const BRAND = '#005DEF'

type Filter = 'tutte' | 'progetto' | 'interne' | 'ricorrenti'

const fmtEur = (v: number) => `€ ${Number(v).toLocaleString('it-IT', { minimumFractionDigits: 2 })}`
const today = () => new Date().toISOString().split('T')[0]

const catLabel: Record<CategoriaSpesa, string> = {
  software: 'Software', hardware: 'Hardware', servizi: 'Servizi', trasferta: 'Trasferta', altro: 'Altro',
}
const catBadge: Record<CategoriaSpesa, { label: string; color: 'blue' | 'purple' | 'orange' | 'green' | 'gray' }> = {
  software:  { label: 'Software',  color: 'blue' },
  hardware:  { label: 'Hardware',  color: 'purple' },
  servizi:   { label: 'Servizi',   color: 'orange' },
  trasferta: { label: 'Trasferta', color: 'green' },
  altro:     { label: 'Altro',     color: 'gray' },
}

const freqLabel: Record<FrequenzaSpesa, string> = {
  mensile: 'Mensile', trimestrale: 'Trimestrale', semestrale: 'Semestrale', annuale: 'Annuale',
}
const freqDiv: Record<string, number> = { mensile: 1, trimestrale: 3, semestrale: 6, annuale: 12 }
const ricToMensile = (r: SpesaRicorrente) => r.importo / (freqDiv[r.frequenza ?? 'mensile'] ?? 1)

interface ProgettoConRicorrenti {
  id: string
  nome: string
  spese_ricorrenti: { items?: SpesaRicorrente[] } | null
}

type SpForm = Omit<Spesa, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'progetti'>
const emptySp: SpForm = { progetto_id: null, data: today(), categoria: 'altro', importo: 0, descrizione: '' }

const StatCell = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
  <div style={{ padding: '18px 24px' }}>
    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94', marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 700, color: accent ?? '#1A2332', lineHeight: 1 }}>{value}</div>
  </div>
)

export const ContabilitaPage = () => {
  const isMobile = useIsMobile()
  const [filter, setFilter] = useState<Filter>('tutte')
  const [spese, setSpese]         = useState<Spesa[]>([])
  const [progetti, setProgetti]   = useState<Pick<Progetto, 'id' | 'nome'>[]>([])
  const [progettiRic, setProgettiRic] = useState<ProgettoConRicorrenti[]>([])
  const [loading, setLoading]     = useState(true)

  const [modal, setModal]         = useState(false)
  const [editing, setEditing]     = useState<Spesa | null>(null)
  const [form, setForm]           = useState<SpForm>({ ...emptySp })
  const [saving, setSaving]       = useState(false)
  const [deleteId, setDeleteId]   = useState<string | null>(null)
  const [errors, setErrors]       = useState<ValidationErrors>({})

  const [progettiCommerciali, setProgettiCommerciali] = useState<{ commerciale: string; pagamento_mensile: number | null; percentuale_commissione: number | null }[]>([])

  const load = async () => {
    const [{ data: sp }, { data: pr }, { data: prRic }, { data: prComm }] = await Promise.all([
      supabase.from('spese').select('*, progetti(nome)').order('data', { ascending: false }),
      supabase.from('progetti').select('id, nome').order('nome'),
      supabase.from('progetti').select('id, nome, spese_ricorrenti'),
      supabase.from('progetti').select('commerciale, pagamento_mensile, percentuale_commissione').not('commerciale', 'is', null),
    ])
    setSpese(sp ?? [])
    setProgetti(pr ?? [])
    setProgettiRic(prRic ?? [])
    setProgettiCommerciali(prComm ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const f = (k: keyof SpForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const openNew = () => { setEditing(null); setForm({ ...emptySp, data: today() }); setErrors({}); setModal(true) }
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
    const { error } = editing
      ? await supabase.from('spese').update(result.data).eq('id', editing.id)
      : await supabase.from('spese').insert(result.data)
    if (error) { setErrors({ _form: safeErrorMessage(error) }); setSaving(false); return }
    setSaving(false); setModal(false); load()
  }

  const remove = async () => {
    if (!deleteId) return
    await supabase.from('spese').delete().eq('id', deleteId)
    setDeleteId(null); load()
  }

  /* Aggregate recurring from all projects */
  const allRicorrenti: (SpesaRicorrente & { progettoNome: string })[] = []
  let totRicMensile = 0
  for (const p of progettiRic) {
    const stored = p.spese_ricorrenti as { items?: SpesaRicorrente[] } | null
    for (const r of stored?.items ?? []) {
      if (r.attiva === false) continue
      const mensile = ricToMensile(r)
      totRicMensile += mensile
      allRicorrenti.push({ ...r, frequenza: r.frequenza ?? 'mensile', attiva: r.attiva ?? true, data_inizio: r.data_inizio ?? '', progettoNome: p.nome })
    }
  }

  const filtered = spese.filter(s => {
    if (filter === 'progetto') return s.progetto_id !== null
    if (filter === 'interne') return s.progetto_id === null
    return true
  })

  const totTutte    = spese.reduce((a, s) => a + Number(s.importo), 0)
  const totProgetto = spese.filter(s => s.progetto_id !== null).reduce((a, s) => a + Number(s.importo), 0)
  const totInterne  = spese.filter(s => s.progetto_id === null).reduce((a, s) => a + Number(s.importo), 0)

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const totMeseCorrente = spese.filter(s => s.data.startsWith(currentMonth)).reduce((a, s) => a + Number(s.importo), 0)

  const byCategory = spese.reduce<Record<string, number>>((acc, s) => {
    acc[s.categoria] = (acc[s.categoria] || 0) + Number(s.importo)
    return acc
  }, {})

  if (loading) return <div style={{ color: '#6C7F94', fontSize: 13 }}>Caricamento...</div>

  const filterStyle = (t: Filter): React.CSSProperties => ({
    padding: '8px 16px', fontSize: 13, fontWeight: filter === t ? 700 : 400,
    color: filter === t ? BRAND : '#6C7F94', background: 'none', border: 'none',
    borderBottom: filter === t ? `2px solid ${BRAND}` : '2px solid transparent',
    cursor: 'pointer', transition: 'all 0.15s',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* KPI strip */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)' }}>
        <StatCell label="Totale spese" value={fmtEur(totTutte)} accent="#1A2332" />
        <div style={{ borderLeft: '1px solid #E5E7EB' }}>
          <StatCell label="Spese progetto" value={fmtEur(totProgetto)} />
        </div>
        <div style={{ borderLeft: '1px solid #E5E7EB' }}>
          <StatCell label="Spese interne" value={fmtEur(totInterne)} />
        </div>
        <div style={{ borderLeft: '1px solid #E5E7EB' }}>
          <StatCell label="Ricorrenti / mese" value={fmtEur(totRicMensile)} accent={BRAND} />
        </div>
        <div style={{ borderLeft: '1px solid #E5E7EB' }}>
          <StatCell label="Mese corrente" value={fmtEur(totMeseCorrente + totRicMensile)} />
        </div>
      </div>

      {/* Detail panels */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
        <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB' }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1A2332' }}>Per categoria</span>
          </div>
          <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(catBadge).map(([key, { label }]) => {
              const amount = byCategory[key] || 0
              return (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                  <span style={{ color: '#4B5563' }}>{label}</span>
                  <span style={{ fontWeight: 600, color: amount > 0 ? '#1A2332' : '#9CA3AF' }}>{fmtEur(amount)}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB' }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1A2332' }}>Per tipo</span>
          </div>
          <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#4B5563' }}>Spese su progetti</span>
              <span style={{ fontWeight: 600, color: '#1A2332' }}>{fmtEur(totProgetto)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#4B5563' }}>Spese interne società</span>
              <span style={{ fontWeight: 600, color: '#1A2332' }}>{fmtEur(totInterne)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#4B5563' }}>Costi ricorrenti / mese</span>
              <span style={{ fontWeight: 600, color: BRAND }}>{fmtEur(totRicMensile)}</span>
            </div>
            <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: '#1A2332' }}>Totale + ricorrenti/mese</span>
              <span style={{ fontWeight: 700, color: '#1A2332' }}>{fmtEur(totTutte + totRicMensile)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pannello commerciali */}
      {(() => {
        // Aggrega per commerciale
        const byComm: Record<string, { progetti: number; ricavoMensile: number; commissione: number }> = {}
        for (const p of progettiCommerciali) {
          if (!p.commerciale) continue
          const ricavo = p.pagamento_mensile ?? 0
          const comm = p.percentuale_commissione != null ? (ricavo * p.percentuale_commissione) / 100 : 0
          if (!byComm[p.commerciale]) byComm[p.commerciale] = { progetti: 0, ricavoMensile: 0, commissione: 0 }
          byComm[p.commerciale].progetti += 1
          byComm[p.commerciale].ricavoMensile += ricavo
          byComm[p.commerciale].commissione += comm
        }
        const entries = Object.entries(byComm)
        if (entries.length === 0) return null
        return (
          <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB' }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1A2332' }}>Per commerciale</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 480 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '8px 20px', backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  {['Commerciale', 'Progetti', 'Ricavo / mese', 'Commissione / mese'].map(h => (
                    <span key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
                  ))}
                </div>
                {entries.map(([nome, data]) => (
                  <div key={nome} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '12px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1A2332' }}>{nome}</span>
                    <span style={{ fontSize: 13, color: '#4B5563' }}>{data.progetti}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1A2332' }}>{fmtEur(data.ricavoMensile)}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: BRAND }}>{fmtEur(data.commissione)}</span>
                  </div>
                ))}
                {entries.length > 1 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '10px 20px', borderTop: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1A2332' }}>Totale</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#4B5563' }}>{entries.reduce((s, [, d]) => s + d.progetti, 0)}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1A2332' }}>{fmtEur(entries.reduce((s, [, d]) => s + d.ricavoMensile, 0))}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: BRAND }}>{fmtEur(entries.reduce((s, [, d]) => s + d.commissione, 0))}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Filter tabs + button */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'flex-end', gap: isMobile ? 8 : 0 }}>
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E5E7EB', overflowX: 'auto', WebkitOverflowScrolling: 'touch', flexShrink: 0 }}>
          <button style={filterStyle('tutte')} onClick={() => setFilter('tutte')}>Tutte ({spese.length})</button>
          <button style={filterStyle('progetto')} onClick={() => setFilter('progetto')}>{isMobile ? 'Progetto' : `Progetto (${spese.filter(s => s.progetto_id).length})`}</button>
          <button style={filterStyle('interne')} onClick={() => setFilter('interne')}>{isMobile ? 'Interne' : `Interne (${spese.filter(s => !s.progetto_id).length})`}</button>
          <button style={filterStyle('ricorrenti')} onClick={() => setFilter('ricorrenti')}>{isMobile ? 'Ricorr.' : `Ricorrenti (${allRicorrenti.length})`}</button>
        </div>
        {filter !== 'ricorrenti' && (
          <Button onClick={openNew} style={isMobile ? { alignSelf: 'flex-end' } : {}}><Plus className="w-3.5 h-3.5" />Nuova spesa</Button>
        )}
      </div>

      {/* Recurring expenses view */}
      {filter === 'ricorrenti' ? (
        allRicorrenti.length === 0 ? (
          <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#9CA3AF' }}>Nessuna spesa ricorrente attiva nei progetti.</div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>Le spese ricorrenti si gestiscono dal tab Spese di ogni progetto.</div>
          </div>
        ) : isMobile ? (
          <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}>
            {allRicorrenti.map(r => (
              <div key={r.id} style={{ padding: '14px 16px', borderBottom: '1px solid #F3F4F6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1A2332', flex: 1, minWidth: 0 }}>{r.nome}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1A2332', flexShrink: 0 }}>{fmtEur(ricToMensile(r))}<span style={{ fontSize: 10, fontWeight: 400, color: '#6C7F94' }}>/m</span></span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 12px' }}>
                  <span style={{ fontSize: 11, color: '#6C7F94' }}>{r.progettoNome}</span>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>{catLabel[r.categoria]} · {freqLabel[r.frequenza]} · {fmtEur(r.importo)}</span>
                </div>
              </div>
            ))}
            <div style={{ padding: '12px 16px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1A2332' }}>Totale mensile</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1A2332' }}>{fmtEur(totRicMensile)}</span>
            </div>
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.2fr 0.8fr 0.8fr 0.8fr 0.8fr', padding: '10px 20px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
              {['Descrizione', 'Progetto', 'Categoria', 'Frequenza', 'Importo', 'Equiv. / mese'].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
              ))}
            </div>
            {allRicorrenti.map(r => (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.2fr 0.8fr 0.8fr 0.8fr 0.8fr', padding: '12px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1A2332' }}>{r.nome}</span>
                  {r.note && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{r.note}</div>}
                </div>
                <span style={{ fontSize: 13, color: '#4B5563' }}>{r.progettoNome}</span>
                <span style={{ fontSize: 12, color: '#6C7F94' }}>{catLabel[r.categoria]}</span>
                <span style={{ fontSize: 12, color: '#6C7F94' }}>{freqLabel[r.frequenza]}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1A2332' }}>{fmtEur(r.importo)}</span>
                <span style={{ fontSize: 12, color: '#6C7F94' }}>{fmtEur(ricToMensile(r))}/m</span>
              </div>
            ))}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1A2332' }}>Totale mensile</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1A2332' }}>{fmtEur(totRicMensile)}</span>
            </div>
            <div style={{ padding: '0 20px 12px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#6C7F94' }}>Proiezione annua</span>
              <span style={{ fontSize: 11, color: '#6C7F94' }}>{fmtEur(totRicMensile * 12)}</span>
            </div>
          </div>
        )
      ) : (
        /* Standard expenses table */
        filtered.length === 0
          ? <EmptyState icon={Pencil} title="Nessuna spesa" description={filter === 'tutte' ? 'Registra la prima spesa per iniziare.' : `Nessuna spesa ${filter === 'interne' ? 'interna' : 'su progetto'} registrata.`} action={{ label: 'Nuova spesa', onClick: openNew }} />
          : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #E5E7EB', backgroundColor: '#fff' }}>
              {filtered.map(s => {
                const cb = catBadge[s.categoria]
                const isInterna = s.progetto_id === null
                return (
                  <div key={s.id} style={{ padding: '14px 16px', borderBottom: '1px solid #F3F4F6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1A2332' }}>{fmtEur(s.importo)}</div>
                        <div style={{ fontSize: 12, color: '#4B5563', marginTop: 2, wordBreak: 'break-word' }}>{s.descrizione}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 0, flexShrink: 0 }}>
                        <button onClick={() => openEdit(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: '8px', display: 'flex', borderRadius: 6 }} title="Modifica"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteId(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: '8px', display: 'flex', borderRadius: 6 }} title="Elimina"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <Badge label={cb.label} color={cb.color} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: isInterna ? '#7C3AED' : BRAND }}>{isInterna ? 'Interna' : 'Progetto'}</span>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>{new Date(s.data).toLocaleDateString('it-IT')}</span>
                      {s.progetti?.nome && <span style={{ fontSize: 11, color: '#6C7F94' }}>{s.progetti.nome}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ minWidth: 640 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 0.7fr 1.2fr 0.8fr 0.8fr 2fr 80px', padding: '10px 20px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
                {['Data', 'Tipo', 'Progetto', 'Categoria', 'Importo', 'Descrizione', ''].map(h => (
                  <span key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
                ))}
              </div>
              {filtered.map(s => {
                const cb = catBadge[s.categoria]
                const isInterna = s.progetto_id === null
                return (
                  <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '0.7fr 0.7fr 1.2fr 0.8fr 0.8fr 2fr 80px', padding: '14px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#4B5563' }}>{new Date(s.data).toLocaleDateString('it-IT')}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: isInterna ? '#7C3AED' : BRAND }}>{isInterna ? 'Interna' : 'Progetto'}</span>
                    <span style={{ fontSize: 13, color: '#4B5563' }}>{s.progetti?.nome ?? '—'}</span>
                    <Badge label={cb.label} color={cb.color} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1A2332' }}>{fmtEur(s.importo)}</span>
                    <span style={{ fontSize: 13, color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.descrizione}</span>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button onClick={() => openEdit(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 6, display: 'flex', borderRadius: 4 }} title="Modifica"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDeleteId(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 6, display: 'flex', borderRadius: 4 }} title="Elimina"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                )
              })}
              </div>
            </div>
          )
      )}

      {/* Modal form */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifica spesa' : 'Nuova spesa'}>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {errors._form && <p style={{ fontSize: 12, color: '#DC2626' }}>{errors._form}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <FormField label="Data" required error={errors.data}>
              <Input type="date" value={form.data} onChange={f('data')} required />
            </FormField>
            <FormField label="Importo (€)" required error={errors.importo}>
              <Input type="number" step="0.01" value={form.importo} onChange={f('importo')} placeholder="0.00" required />
            </FormField>
          </div>
          <FormField label="Progetto" hint="Lascia vuoto per spese interne della società" error={errors.progetto_id}>
            <Select value={form.progetto_id ?? ''} onChange={f('progetto_id')}>
              <option value="">— Spesa interna (nessun progetto) —</option>
              {progetti.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </Select>
          </FormField>
          <FormField label="Categoria" error={errors.categoria}>
            <Select value={form.categoria} onChange={f('categoria')}>
              <option value="software">Software</option>
              <option value="hardware">Hardware</option>
              <option value="servizi">Servizi</option>
              <option value="trasferta">Trasferta</option>
              <option value="altro">Altro</option>
            </Select>
          </FormField>
          <FormField label="Descrizione" required error={errors.descrizione}>
            <TextArea value={form.descrizione} onChange={f('descrizione')} placeholder="Descrizione della spesa..." required />
          </FormField>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>Annulla</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</Button>
          </div>
        </form>
      </Modal>

      {/* Modal conferma eliminazione */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Elimina spesa" width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>Sei sicuro di voler eliminare questa spesa? L'operazione non è reversibile.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Annulla</Button>
          <Button variant="danger" onClick={remove}>Elimina</Button>
        </div>
      </Modal>
    </div>
  )
}

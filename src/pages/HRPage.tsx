import { useState, useEffect, useRef } from 'react'
import { Plus, Search, Pencil, Trash2, Star, ChevronDown, X, UserPlus, Phone, Mail, Tag } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useT } from '../hooks/useCurrentRole'
import { contattoHRSchema, validate, type ValidationErrors } from '../lib/validation'
import type { ContattoHR, StatoContattoHR, TipoContattoHR } from '../types'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'

// ─── Colori per stato ────────────────────────────────────────────────────────

const STATO_COLOR: Record<StatoContattoHR, { bg: string; text: string; dot: string }> = {
  nuovo:      { bg: '#EFF6FF', text: '#1D4ED8', dot: '#3B82F6' },
  contattato: { bg: '#F0FDF4', text: '#15803D', dot: '#22C55E' },
  colloquio:  { bg: '#FFF7ED', text: '#C2410C', dot: '#F97316' },
  offerta:    { bg: '#FAF5FF', text: '#7E22CE', dot: '#A855F7' },
  assunto:    { bg: '#ECFDF5', text: '#065F46', dot: '#10B981' },
  non_idoneo: { bg: '#FEF2F2', text: '#991B1B', dot: '#EF4444' },
  archiviato: { bg: '#F9FAFB', text: '#6B7280', dot: '#9CA3AF' },
}

const TIPO_COLOR: Record<TipoContattoHR, string> = {
  candidato:  '#3B82F6',
  segnalato:  '#F59E0B',
  freelance:  '#8B5CF6',
  consulente: '#06B6D4',
  stagista:   '#EC4899',
  altro:      '#6B7280',
}

const STATI: StatoContattoHR[] = ['nuovo', 'contattato', 'colloquio', 'offerta', 'assunto', 'non_idoneo', 'archiviato']
const TIPI: TipoContattoHR[]   = ['candidato', 'segnalato', 'freelance', 'consulente', 'stagista', 'altro']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initForm(): Omit<ContattoHR, 'id' | 'user_id' | 'created_at' | 'updated_at'> {
  return {
    nome: '', cognome: '', email: null, telefono: null,
    ruolo_cercato: null, tipo: 'candidato', stato: 'nuovo',
    segnalato_da: null, linkedin: null, competenze: [],
    disponibilita: null, tariffa_richiesta: null,
    data_primo_contatto: null, prossimo_followup: null,
    valutazione: null, note: null,
  }
}

function StarRating({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
        >
          <Star
            style={{
              width: 20, height: 20,
              fill: value != null && n <= value ? '#F59E0B' : 'none',
              stroke: value != null && n <= value ? '#F59E0B' : '#D1D5DB',
              transition: 'all 0.1s',
            }}
          />
        </button>
      ))}
    </div>
  )
}

function StatoBadge({ stato, label }: { stato: StatoContattoHR; label: string }) {
  const c = STATO_COLOR[stato]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: c.bg, color: c.text,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {label}
    </span>
  )
}

// ─── Componente principale ───────────────────────────────────────────────────

export const HRPage = () => {
  const t = useT()
  const [contatti, setContatti] = useState<ContattoHR[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStato, setFilterStato] = useState<StatoContattoHR | ''>('')
  const [filterTipo, setFilterTipo] = useState<TipoContattoHR | ''>('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<ContattoHR | null>(null)
  const [form, setForm] = useState(initForm())
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [competenzaInput, setCompetenzaInput] = useState('')
  const competenzaRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('contatti_hr')
      .select('*')
      .order('created_at', { ascending: false })
    setContatti(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    setEditing(null)
    setForm(initForm())
    setErrors({})
    setCompetenzaInput('')
    setModal(true)
  }

  const openEdit = (c: ContattoHR) => {
    setEditing(c)
    setForm({
      nome: c.nome, cognome: c.cognome ?? '',
      email: c.email, telefono: c.telefono,
      ruolo_cercato: c.ruolo_cercato, tipo: c.tipo, stato: c.stato,
      segnalato_da: c.segnalato_da, linkedin: c.linkedin,
      competenze: [...c.competenze], disponibilita: c.disponibilita,
      tariffa_richiesta: c.tariffa_richiesta,
      data_primo_contatto: c.data_primo_contatto,
      prossimo_followup: c.prossimo_followup,
      valutazione: c.valutazione, note: c.note,
    })
    setErrors({})
    setCompetenzaInput('')
    setModal(true)
  }

  const set = (k: keyof typeof form, v: unknown) =>
    setForm(f => ({ ...f, [k]: v }))

  const addCompetenza = () => {
    const val = competenzaInput.trim()
    if (!val || form.competenze.includes(val)) return
    set('competenze', [...form.competenze, val])
    setCompetenzaInput('')
    competenzaRef.current?.focus()
  }

  const removeCompetenza = (c: string) =>
    set('competenze', form.competenze.filter(x => x !== c))

  const save = async () => {
    const payload = {
      ...form,
      tariffa_richiesta: form.tariffa_richiesta != null && form.tariffa_richiesta !== ('' as unknown) ? Number(form.tariffa_richiesta) : null,
      valutazione: form.valutazione != null ? Number(form.valutazione) : null,
      data_primo_contatto: form.data_primo_contatto || null,
      prossimo_followup: form.prossimo_followup || null,
    }
    const result = validate(contattoHRSchema, payload)
    if (!result.success) { setErrors(result.errors); return }
    setSaving(true)
    if (editing) {
      await supabase.from('contatti_hr').update(result.data).eq('id', editing.id)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('contatti_hr').insert({ ...result.data, user_id: user!.id })
    }
    setSaving(false)
    setModal(false)
    load()
  }

  const remove = async () => {
    if (!deleteId) return
    await supabase.from('contatti_hr').delete().eq('id', deleteId)
    setDeleteId(null)
    load()
  }

  // ─── Filtro locale ─────────────────────────────────────────
  const filtered = contatti.filter(c => {
    if (filterStato && c.stato !== filterStato) return false
    if (filterTipo  && c.tipo  !== filterTipo)  return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [c.nome, c.cognome, c.ruolo_cercato, c.segnalato_da, ...c.competenze]
        .filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  // ─── Stats per stato ───────────────────────────────────────
  const statsPerStato = STATI.map(s => ({
    stato: s,
    count: contatti.filter(c => c.stato === s).length,
  })).filter(x => x.count > 0)

  // ─── Render ────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Stats bar ── */}
      {contatti.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24,
        }}>
          {statsPerStato.map(({ stato, count }) => {
            const c = STATO_COLOR[stato]
            return (
              <button
                key={stato}
                onClick={() => setFilterStato(filterStato === stato ? '' : stato)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 20, border: `1px solid ${c.dot}33`,
                  background: filterStato === stato ? c.bg : '#fff',
                  color: c.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot }} />
                {t(`hr.stato.${stato}`)}
                <span style={{
                  background: c.dot + '22', color: c.text,
                  borderRadius: 10, padding: '0 7px', fontSize: 12,
                }}>{count}</span>
              </button>
            )
          })}
          {filterStato && (
            <button
              onClick={() => setFilterStato('')}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 20, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#6B7280', fontSize: 13, cursor: 'pointer' }}
            >
              <X style={{ width: 12, height: 12 }} /> Tutti
            </button>
          )}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Ricerca */}
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 200 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#9CA3AF', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('hr.search_ph')}
            style={{
              width: '100%', paddingLeft: 36, paddingRight: 12, height: 38,
              border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 14,
              outline: 'none', background: '#fff', color: '#1A2332', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Filtro tipo */}
        <div style={{ position: 'relative' }}>
          <select
            value={filterTipo}
            onChange={e => setFilterTipo(e.target.value as TipoContattoHR | '')}
            style={{ height: 38, paddingLeft: 12, paddingRight: 32, border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 14, background: '#fff', color: '#1A2332', cursor: 'pointer', appearance: 'none', outline: 'none' }}
          >
            <option value=''>Tutti i tipi</option>
            {TIPI.map(tp => <option key={tp} value={tp}>{t(`hr.tipo.${tp}`)}</option>)}
          </select>
          <ChevronDown style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#6B7280', pointerEvents: 'none' }} />
        </div>

        {/* Nuovo */}
        <Button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <Plus style={{ width: 16, height: 16 }} />
          {t('hr.new')}
        </Button>
      </div>

      {/* ── Lista / empty ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6B7280' }}>Caricamento...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={t('hr.empty')}
          description={search || filterStato || filterTipo ? 'Nessun risultato per i filtri selezionati.' : t('hr.empty_desc')}
          action={!search && !filterStato && !filterTipo ? { label: t('hr.new'), onClick: openNew } : undefined}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filtered.map(c => <ContactCard key={c.id} c={c} t={t} onEdit={openEdit} onDelete={setDeleteId} />)}
        </div>
      )}

      {/* ── Modal aggiunta/modifica ── */}
      {modal && (
        <Modal
          open={modal}
          title={editing ? t('hr.edit') : t('hr.new')}
          onClose={() => setModal(false)}
          width="600px"
        >
          <FormContent
            form={form} set={set} errors={errors}
            competenzaInput={competenzaInput}
            setCompetenzaInput={setCompetenzaInput}
            competenzaRef={competenzaRef}
            addCompetenza={addCompetenza}
            removeCompetenza={removeCompetenza}
            t={t}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
            <Button variant="secondary" onClick={() => setModal(false)}>{t('common.cancel')}</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? t('common.saving') : (editing ? t('common.save') : t('hr.new'))}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Modal eliminazione ── */}
      {deleteId && (
        <Modal open={!!deleteId} title={t('hr.delete')} onClose={() => setDeleteId(null)}>
          <p style={{ color: '#4B5563', marginBottom: 24 }}>{t('hr.delete_confirm')}</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={remove}>{t('common.delete')}</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Card contatto ───────────────────────────────────────────────────────────

function ContactCard({
  c, t, onEdit, onDelete,
}: {
  c: ContattoHR
  t: (k: string) => string
  onEdit: (c: ContattoHR) => void
  onDelete: (id: string) => void
}) {
  const tipoColor = TIPO_COLOR[c.tipo]

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #E5E7EB',
      borderRadius: 12,
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      transition: 'box-shadow 0.15s',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,93,239,0.1)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)')}
    >
      {/* Intestazione */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {/* Avatar */}
          <div style={{
            width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
            background: `linear-gradient(135deg, ${tipoColor}33, ${tipoColor}66)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, color: tipoColor,
          }}>
            {c.nome.charAt(0).toUpperCase()}{c.cognome?.charAt(0)?.toUpperCase() ?? ''}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1A2332', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {c.nome} {c.cognome}
            </div>
            {c.ruolo_cercato && (
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>{c.ruolo_cercato}</div>
            )}
          </div>
        </div>
        {/* Azioni */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <ActionBtn onClick={() => onEdit(c)} title={t('common.edit')}>
            <Pencil style={{ width: 14, height: 14 }} />
          </ActionBtn>
          <ActionBtn onClick={() => onDelete(c.id)} title={t('common.delete')} danger>
            <Trash2 style={{ width: 14, height: 14 }} />
          </ActionBtn>
        </div>
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <StatoBadge stato={c.stato} label={t(`hr.stato.${c.stato}`)} />
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
          background: tipoColor + '15', color: tipoColor,
        }}>
          <UserPlus style={{ width: 10, height: 10 }} />
          {t(`hr.tipo.${c.tipo}`)}
        </span>
      </div>

      {/* Contatti */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {c.email && (
          <a href={`mailto:${c.email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#005DEF', textDecoration: 'none' }}>
            <Mail style={{ width: 13, height: 13 }} /> {c.email}
          </a>
        )}
        {c.telefono && (
          <a href={`tel:${c.telefono}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#4B5563', textDecoration: 'none' }}>
            <Phone style={{ width: 13, height: 13 }} /> {c.telefono}
          </a>
        )}
        {c.linkedin && (
          <a href={c.linkedin} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#0A66C2', textDecoration: 'none' }}>
            in LinkedIn
          </a>
        )}
      </div>

      {/* Competenze */}
      {c.competenze.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {c.competenze.slice(0, 5).map(sk => (
            <span key={sk} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
              background: '#F3F4F6', color: '#374151',
            }}>
              <Tag style={{ width: 9, height: 9 }} /> {sk}
            </span>
          ))}
          {c.competenze.length > 5 && (
            <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, background: '#F3F4F6', color: '#9CA3AF' }}>
              +{c.competenze.length - 5}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid #F3F4F6' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {c.segnalato_da && (
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>
              Segnalato da: <span style={{ color: '#6B7280', fontWeight: 600 }}>{c.segnalato_da}</span>
            </span>
          )}
        </div>
        {c.valutazione != null && (
          <div style={{ display: 'flex', gap: 2 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <Star key={n} style={{
                width: 12, height: 12,
                fill: n <= c.valutazione! ? '#F59E0B' : 'none',
                stroke: n <= c.valutazione! ? '#F59E0B' : '#D1D5DB',
              }} />
            ))}
          </div>
        )}
        {c.prossimo_followup && (
          <span style={{ fontSize: 11, color: new Date(c.prossimo_followup) < new Date() ? '#DC2626' : '#6B7280' }}>
            Follow-up: {new Date(c.prossimo_followup).toLocaleDateString('it-IT')}
          </span>
        )}
      </div>
    </div>
  )
}

function ActionBtn({ onClick, title, danger, children }: { onClick: () => void; title: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'none', border: '1px solid transparent', borderRadius: 6,
        padding: 5, cursor: 'pointer', display: 'flex', alignItems: 'center',
        color: danger ? '#EF4444' : '#6B7280', transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = danger ? '#FEF2F2' : '#F3F4F6'
        e.currentTarget.style.borderColor = danger ? '#FCA5A5' : '#E5E7EB'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'none'
        e.currentTarget.style.borderColor = 'transparent'
      }}
    >
      {children}
    </button>
  )
}

// ─── Form interno ─────────────────────────────────────────────────────────────

function FormContent({
  form, set, errors, competenzaInput, setCompetenzaInput, competenzaRef, addCompetenza, removeCompetenza, t,
}: {
  form: ReturnType<typeof initForm>
  set: (k: keyof ReturnType<typeof initForm>, v: unknown) => void
  errors: ValidationErrors
  competenzaInput: string
  setCompetenzaInput: (v: string) => void
  competenzaRef: React.RefObject<HTMLInputElement | null>
  addCompetenza: () => void
  removeCompetenza: (c: string) => void
  t: (k: string) => string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Riga nome/cognome */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label={t('hr.field.nome')} error={errors.nome} required>
          <input value={form.nome} onChange={e => set('nome', e.target.value)}
            style={inputStyle(!!errors.nome)} placeholder="Mario" />
        </Field>
        <Field label={t('hr.field.cognome')} error={errors.cognome}>
          <input value={form.cognome ?? ''} onChange={e => set('cognome', e.target.value)}
            style={inputStyle(!!errors.cognome)} placeholder="Rossi" />
        </Field>
      </div>

      {/* Email / telefono */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label={t('hr.field.email')} error={errors.email}>
          <input type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)}
            style={inputStyle(!!errors.email)} placeholder="mario@esempio.it" />
        </Field>
        <Field label={t('hr.field.telefono')} error={errors.telefono}>
          <input value={form.telefono ?? ''} onChange={e => set('telefono', e.target.value)}
            style={inputStyle(!!errors.telefono)} placeholder="+39 333 123 4567" />
        </Field>
      </div>

      {/* Tipo / stato */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label={t('hr.field.tipo')} error={errors.tipo}>
          <select value={form.tipo} onChange={e => set('tipo', e.target.value)} style={selectStyle()}>
            {TIPI.map(tp => <option key={tp} value={tp}>{t(`hr.tipo.${tp}`)}</option>)}
          </select>
        </Field>
        <Field label={t('hr.field.stato')} error={errors.stato}>
          <select value={form.stato} onChange={e => set('stato', e.target.value)} style={selectStyle()}>
            {STATI.map(s => <option key={s} value={s}>{t(`hr.stato.${s}`)}</option>)}
          </select>
        </Field>
      </div>

      {/* Ruolo cercato */}
      <Field label={t('hr.field.ruolo_cercato')} error={errors.ruolo_cercato}>
        <input value={form.ruolo_cercato ?? ''} onChange={e => set('ruolo_cercato', e.target.value)}
          style={inputStyle(!!errors.ruolo_cercato)} placeholder="es. Frontend Developer, Designer..." />
      </Field>

      {/* Segnalato da / LinkedIn */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label={t('hr.field.segnalato_da')} error={errors.segnalato_da}>
          <input value={form.segnalato_da ?? ''} onChange={e => set('segnalato_da', e.target.value)}
            style={inputStyle(!!errors.segnalato_da)} placeholder="Nome di chi ha segnalato" />
        </Field>
        <Field label={t('hr.field.linkedin')} error={errors.linkedin}>
          <input value={form.linkedin ?? ''} onChange={e => set('linkedin', e.target.value)}
            style={inputStyle(!!errors.linkedin)} placeholder="https://linkedin.com/in/..." />
        </Field>
      </div>

      {/* Competenze */}
      <Field label={t('hr.field.competenze')} error={errors.competenze}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            ref={competenzaRef}
            value={competenzaInput}
            onChange={e => setCompetenzaInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCompetenza() } }}
            style={{ ...inputStyle(false), flex: 1 }}
            placeholder={t('hr.field.competenze_ph')}
          />
          <button type="button" onClick={addCompetenza} style={{ ...btnStyle, background: '#005DEF', color: '#fff', borderColor: '#005DEF' }}>
            <Plus style={{ width: 14, height: 14 }} />
          </button>
        </div>
        {form.competenze.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {form.competenze.map(sk => (
              <span key={sk} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 20, fontSize: 12,
                background: '#EFF6FF', color: '#1D4ED8', fontWeight: 500,
              }}>
                {sk}
                <button type="button" onClick={() => removeCompetenza(sk)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0, color: '#93C5FD' }}>
                  <X style={{ width: 12, height: 12 }} />
                </button>
              </span>
            ))}
          </div>
        )}
      </Field>

      {/* Disponibilità / tariffa */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label={t('hr.field.disponibilita')} error={errors.disponibilita}>
          <input value={form.disponibilita ?? ''} onChange={e => set('disponibilita', e.target.value)}
            style={inputStyle(!!errors.disponibilita)} placeholder="es. Immediata, da Settembre..." />
        </Field>
        <Field label={t('hr.field.tariffa')} error={errors.tariffa_richiesta}>
          <input type="number" min={0} value={form.tariffa_richiesta ?? ''} onChange={e => set('tariffa_richiesta', e.target.value === '' ? null : Number(e.target.value))}
            style={inputStyle(!!errors.tariffa_richiesta)} placeholder="0" />
        </Field>
      </div>

      {/* Date */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label={t('hr.field.primo_contatto')} error={errors.data_primo_contatto}>
          <input type="date" value={form.data_primo_contatto ?? ''} onChange={e => set('data_primo_contatto', e.target.value || null)}
            style={inputStyle(!!errors.data_primo_contatto)} />
        </Field>
        <Field label={t('hr.field.followup')} error={errors.prossimo_followup}>
          <input type="date" value={form.prossimo_followup ?? ''} onChange={e => set('prossimo_followup', e.target.value || null)}
            style={inputStyle(!!errors.prossimo_followup)} />
        </Field>
      </div>

      {/* Valutazione */}
      <Field label={t('hr.field.valutazione')} error={errors.valutazione}>
        <StarRating value={form.valutazione} onChange={v => set('valutazione', v)} />
      </Field>

      {/* Note */}
      <Field label={t('hr.field.note')} error={errors.note}>
        <textarea
          value={form.note ?? ''}
          onChange={e => set('note', e.target.value)}
          rows={3}
          style={{ ...inputStyle(!!errors.note), resize: 'vertical', paddingTop: 8 }}
          placeholder="Impressioni, dettagli colloquio, osservazioni..."
        />
      </Field>
    </div>
  )
}

// ─── Utility UI ──────────────────────────────────────────────────────────────

function Field({ label, error, required, children }: { label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
        {label}{required && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {error && <span style={{ fontSize: 12, color: '#EF4444' }}>{error}</span>}
    </div>
  )
}

const inputStyle = (hasError: boolean): React.CSSProperties => ({
  height: 38, paddingLeft: 12, paddingRight: 12,
  border: `1px solid ${hasError ? '#EF4444' : '#E5E7EB'}`,
  borderRadius: 8, fontSize: 14, outline: 'none',
  background: '#fff', color: '#1A2332', width: '100%', boxSizing: 'border-box',
})

const selectStyle = (): React.CSSProperties => ({
  height: 38, paddingLeft: 10, paddingRight: 10,
  border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 14,
  background: '#fff', color: '#1A2332', cursor: 'pointer', outline: 'none',
  width: '100%',
})

const btnStyle: React.CSSProperties = {
  height: 38, paddingLeft: 12, paddingRight: 12,
  border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 14,
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.15s',
}

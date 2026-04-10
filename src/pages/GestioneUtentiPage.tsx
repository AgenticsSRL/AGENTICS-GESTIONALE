import { useEffect, useState, useCallback } from 'react'
import { Plus, X, Save, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { UserProfile } from '../types'

const BRAND = '#005DEF'

interface ProfileRow extends UserProfile {}

interface FormState {
  user_id: string
  nome: string
  cognome: string
  telefono: string
  ruolo: string
  azienda: string
  partita_iva: string
}

const emptyForm = (): FormState => ({
  user_id: '',
  nome: '',
  cognome: '',
  telefono: '',
  ruolo: '',
  azienda: '',
  partita_iva: '',
})

const FIELDS: { key: keyof Omit<FormState, 'user_id'>; label: string }[] = [
  { key: 'nome', label: 'Nome' },
  { key: 'cognome', label: 'Cognome' },
  { key: 'telefono', label: 'Telefono' },
  { key: 'ruolo', label: 'Ruolo / Posizione' },
  { key: 'azienda', label: 'Azienda' },
  { key: 'partita_iva', label: 'Partita IVA' },
]

const SectionHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div style={{ marginBottom: 20 }}>
    <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: BRAND }}>
      {title}
    </h3>
    {subtitle && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6C7F94' }}>{subtitle}</p>}
  </div>
)

const inputStyle = (focused: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '9px 12px',
  fontSize: 13,
  border: `1px solid ${focused ? BRAND : '#E5E7EB'}`,
  borderRadius: 4,
  outline: 'none',
  color: '#1A2332',
  backgroundColor: '#fff',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
})

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#6C7F94',
  marginBottom: 6,
}

function FormField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={label}
        style={inputStyle(focused)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  )
}

function UserIdField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <label style={labelStyle}>User ID (UUID da Supabase Dashboard)</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        disabled={disabled}
        style={{
          ...inputStyle(focused),
          backgroundColor: disabled ? '#F9FAFB' : '#fff',
          color: disabled ? '#6C7F94' : '#1A2332',
          fontFamily: 'monospace',
          fontSize: 12,
          cursor: disabled ? 'not-allowed' : 'text',
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {!disabled && (
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9CA3AF' }}>
          Copia l'UUID dell'utente dal Dashboard Supabase → Authentication → Users
        </p>
      )}
    </div>
  )
}

export const GestioneUtentiPage = () => {
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [panelOpen, setPanelOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null) // user_profile.id
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadProfiles = useCallback(async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false })
    setProfiles(data ?? [])
  }, [])

  useEffect(() => {
    loadProfiles().finally(() => setLoading(false))
  }, [loadProfiles])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm())
    setError(null)
    setSaved(false)
    setPanelOpen(true)
  }

  const openEdit = (p: ProfileRow) => {
    setEditingId(p.id)
    setForm({
      user_id: p.user_id,
      nome: p.nome ?? '',
      cognome: p.cognome ?? '',
      telefono: p.telefono ?? '',
      ruolo: p.ruolo ?? '',
      azienda: p.azienda ?? '',
      partita_iva: p.partita_iva ?? '',
    })
    setError(null)
    setSaved(false)
    setPanelOpen(true)
  }

  const closePanel = () => {
    setPanelOpen(false)
    setEditingId(null)
    setForm(emptyForm())
    setError(null)
    setSaved(false)
  }

  const patch = (key: keyof FormState, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setError(null)
    if (!form.user_id.trim()) {
      setError('User ID obbligatorio.')
      return
    }

    setSaving(true)
    setSaved(false)

    const payload = {
      user_id: form.user_id.trim(),
      nome: form.nome.trim() || null,
      cognome: form.cognome.trim() || null,
      telefono: form.telefono.trim() || null,
      ruolo: form.ruolo.trim() || null,
      azienda: form.azienda.trim() || null,
      partita_iva: form.partita_iva.trim() || null,
      updated_at: new Date().toISOString(),
    }

    let err = null

    if (editingId) {
      const { error: e } = await supabase
        .from('user_profiles')
        .update(payload)
        .eq('id', editingId)
      err = e
    } else {
      const { error: e } = await supabase
        .from('user_profiles')
        .insert(payload)
      err = e
    }

    setSaving(false)

    if (err) {
      setError(err.message)
      return
    }

    setSaved(true)
    await loadProfiles()
    setTimeout(() => {
      setSaved(false)
      closePanel()
    }, 1200)
  }

  const displayName = (p: ProfileRow) => {
    const full = [p.nome, p.cognome].filter(Boolean).join(' ')
    return full || `— (${p.user_id.slice(0, 8)}…)`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 900 }}>
      <section>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <SectionHeader
            title="Gestione Utenti"
            subtitle="Crea e modifica i profili degli utenti dell'organizzazione."
          />
          <button
            onClick={openCreate}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              color: '#fff',
              backgroundColor: BRAND,
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              flexShrink: 0,
            }}
          >
            <Plus style={{ width: 13, height: 13 }} />
            Nuovo Profilo
          </button>
        </div>

        <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB' }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr 80px',
            padding: '10px 20px',
            borderBottom: '1px solid #E5E7EB',
            backgroundColor: '#F9FAFB',
          }}>
            {['Nome', 'Ruolo', 'Azienda', 'Telefono', ''].map((h, i) => (
              <span key={i} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: '24px 20px', fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
              Caricamento...
            </div>
          ) : profiles.length === 0 ? (
            <div style={{ padding: '24px 20px', fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
              Nessun profilo trovato. Crea il primo profilo utente.
            </div>
          ) : (
            profiles.map((p, i) => (
              <div
                key={p.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr 1fr 80px',
                  padding: '12px 20px',
                  borderBottom: i < profiles.length - 1 ? '1px solid #F3F4F6' : 'none',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1A2332' }}>{displayName(p)}</span>
                <span style={{ fontSize: 13, color: '#6C7F94' }}>{p.ruolo ?? '—'}</span>
                <span style={{ fontSize: 13, color: '#6C7F94' }}>{p.azienda ?? '—'}</span>
                <span style={{ fontSize: 13, color: '#6C7F94' }}>{p.telefono ?? '—'}</span>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => openEdit(p)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '5px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: BRAND,
                      backgroundColor: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      borderRadius: 4,
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    <Pencil style={{ width: 11, height: 11 }} />
                    Modifica
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ── Slide-over panel ── */}
      {panelOpen && (
        <>
          {/* Overlay */}
          <div
            onClick={closePanel}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.35)',
              zIndex: 100,
            }}
          />

          {/* Panel */}
          <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 420,
            backgroundColor: '#fff',
            zIndex: 101,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          }}>
            {/* Panel header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #E5E7EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1A2332', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {editingId ? 'Modifica Profilo' : 'Nuovo Profilo'}
              </span>
              <button
                onClick={closePanel}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', display: 'flex', alignItems: 'center', padding: 4 }}
              >
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {/* Panel body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <UserIdField
                  value={form.user_id}
                  onChange={v => patch('user_id', v)}
                  disabled={!!editingId}
                />
                {FIELDS.map(({ key, label }) => (
                  <FormField
                    key={key}
                    label={label}
                    value={form[key]}
                    onChange={v => patch(key, v)}
                  />
                ))}
              </div>

              {error && (
                <div style={{ marginTop: 16, padding: '10px 14px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 4, fontSize: 13, color: '#DC2626' }}>
                  {error}
                </div>
              )}
            </div>

            {/* Panel footer */}
            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid #E5E7EB',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexShrink: 0,
            }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 20px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#fff',
                  backgroundColor: BRAND,
                  border: 'none',
                  borderRadius: 4,
                  cursor: saving ? 'wait' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                <Save style={{ width: 13, height: 13 }} />
                {saving ? 'Salvataggio...' : 'Salva'}
              </button>
              {saved && (
                <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>Salvato</span>
              )}
              <button
                onClick={closePanel}
                style={{
                  marginLeft: 'auto',
                  padding: '8px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#6C7F94',
                  backgroundColor: 'transparent',
                  border: '1px solid #E5E7EB',
                  borderRadius: 4,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Annulla
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Check, Lightbulb } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { safeErrorMessage } from '../lib/errors'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'

interface Spunto {
  id: string
  user_id: string
  autore: string
  testo: string
  completato: boolean
  created_at: string
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const BRAND = '#005DEF'

export const SpuntiPage = () => {
  const [rows, setRows] = useState<Spunto[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('spunti')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) { console.error(safeErrorMessage(error)); return }
    setRows(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const addSpunto = async () => {
    if (!input.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('spunti').insert({
      autore: user?.email ?? 'Utente',
      testo: input.trim(),
    })
    if (error) { console.error(safeErrorMessage(error)); setSaving(false); return }
    setInput('')
    setSaving(false)
    load()
  }

  const toggleCompletato = async (id: string, current: boolean) => {
    await supabase.from('spunti').update({ completato: !current }).eq('id', id)
    load()
  }

  const remove = async () => {
    if (!deleteId) return
    await supabase.from('spunti').delete().eq('id', deleteId)
    setDeleteId(null)
    load()
  }

  const pending = rows.filter(r => !r.completato)
  const completed = rows.filter(r => r.completato)
  const visible = showCompleted ? rows : pending

  return (
    <div>
      {/* Input bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Scrivi un nuovo spunto, idea o cosa da sistemare..."
          style={{
            flex: 1, fontSize: 14, border: '1px solid #E5E7EB', padding: '12px 16px',
            outline: 'none', borderRadius: 6, backgroundColor: '#fff',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = BRAND)}
          onBlur={e => (e.currentTarget.style.borderColor = '#E5E7EB')}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSpunto() } }}
        />
        <Button onClick={addSpunto} disabled={saving || !input.trim()}>
          <Plus className="w-4 h-4" />
          {saving ? 'Salvo...' : 'Aggiungi'}
        </Button>
      </div>

      {/* Filter toggle */}
      {completed.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button
            onClick={() => setShowCompleted(v => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, color: BRAND,
              textDecoration: 'underline',
            }}
          >
            {showCompleted ? `Nascondi completati (${completed.length})` : `Mostra completati (${completed.length})`}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ color: '#6C7F94', fontSize: 13 }}>Caricamento...</div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="Nessuno spunto"
          description="Scrivi il primo spunto, idea o cosa da sistemare."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map(s => (
            <div
              key={s.id}
              style={{
                backgroundColor: '#fff',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                opacity: s.completato ? 0.6 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              {/* Checkbox */}
              <button
                onClick={() => toggleCompletato(s.id, s.completato)}
                style={{
                  width: 22, height: 22, flexShrink: 0, marginTop: 1,
                  border: s.completato ? 'none' : '2px solid #D1D5DB',
                  borderRadius: 6, cursor: 'pointer',
                  background: s.completato ? BRAND : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
              >
                {s.completato && <Check style={{ width: 14, height: 14, color: '#fff' }} />}
              </button>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  margin: 0, fontSize: 14, color: '#1A2332', lineHeight: 1.5,
                  textDecoration: s.completato ? 'line-through' : 'none',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {s.testo}
                </p>
                <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>{s.autore}</span>
                  <span style={{ fontSize: 11, color: '#D1D5DB' }}>•</span>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtDateTime(s.created_at)}</span>
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => setDeleteId(s.id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#D1D5DB', padding: 4, display: 'flex', flexShrink: 0,
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#DC2626')}
                onMouseLeave={e => (e.currentTarget.style.color = '#D1D5DB')}
                title="Elimina"
              >
                <Trash2 style={{ width: 14, height: 14 }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Contatore */}
      {!loading && rows.length > 0 && (
        <div style={{ marginTop: 20, fontSize: 12, color: '#9CA3AF', textAlign: 'center' }}>
          {pending.length} da fare · {completed.length} completati
        </div>
      )}

      {/* Delete modal */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Elimina spunto" width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>Sei sicuro di voler eliminare questo spunto?</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Annulla</Button>
          <Button variant="danger" onClick={remove}>Elimina</Button>
        </div>
      </Modal>
    </div>
  )
}

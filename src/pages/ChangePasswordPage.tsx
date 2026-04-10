import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { clearRoleCache } from '../hooks/useCurrentRole'
import { Button } from '../components/ui/Button'
import logoWordmark from '../assets/logo-agentics-wordmark.svg'

const BRAND = '#005DEF'

interface Props {
  onDone: () => void
}

export const ChangePasswordPage = ({ onDone }: Props) => {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('La password deve essere di almeno 8 caratteri.')
      return
    }
    if (password !== confirm) {
      setError('Le password non coincidono.')
      return
    }

    setSaving(true)

    const { error: updateErr } = await supabase.auth.updateUser({ password })
    if (updateErr) {
      setError(updateErr.message)
      setSaving(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('developer_profiles')
        .update({ must_change_password: false, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
    }

    clearRoleCache()
    setSaving(false)
    onDone()
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F3F4F6',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: 12,
        border: '1px solid #E5E7EB',
        padding: '40px 36px',
        width: '100%',
        maxWidth: 420,
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <img src={logoWordmark} alt="Agentics" style={{ height: 28 }} />
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1A2332', marginBottom: 8, textAlign: 'center' }}>
          Imposta la tua password
        </h1>
        <p style={{ fontSize: 13, color: '#6C7F94', marginBottom: 28, textAlign: 'center' }}>
          È il tuo primo accesso. Scegli una nuova password sicura.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
              Nuova password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimo 8 caratteri"
              required
              style={{
                fontSize: 14, border: '1px solid #E5E7EB', padding: '11px 14px',
                outline: 'none', borderRadius: 8, backgroundColor: '#fff',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = BRAND)}
              onBlur={e => (e.currentTarget.style.borderColor = '#E5E7EB')}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
              Conferma password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Ripeti la password"
              required
              style={{
                fontSize: 14, border: '1px solid #E5E7EB', padding: '11px 14px',
                outline: 'none', borderRadius: 8, backgroundColor: '#fff',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = BRAND)}
              onBlur={e => (e.currentTarget.style.borderColor = '#E5E7EB')}
            />
          </div>

          {error && (
            <div style={{
              fontSize: 13, color: '#DC2626', backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px',
            }}>
              {error}
            </div>
          )}

          <Button type="submit" disabled={saving} style={{ marginTop: 4 }}>
            {saving ? 'Salvataggio...' : 'Salva e continua'}
          </Button>
        </form>
      </div>
    </div>
  )
}

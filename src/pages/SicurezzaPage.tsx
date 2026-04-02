import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BRAND = '#005DEF'

export const SicurezzaPage = () => {
  const [loading, setLoading] = useState(true)
  const [factorName, setFactorName] = useState('')
  const [enrolledAt, setEnrolledAt] = useState('')
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    init()
  }, [])

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) setUserEmail(user.email)

    const { data } = await supabase.auth.mfa.listFactors()
    const verifiedTotp = data?.totp?.find(f => f.status === 'verified')
    if (verifiedTotp) {
      setFactorName(verifiedTotp.friendly_name ?? 'Google Authenticator')
      setEnrolledAt(
        new Date(verifiedTotp.created_at).toLocaleDateString('it-IT', {
          day: 'numeric', month: 'long', year: 'numeric',
        })
      )
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 400 }}>
        <p className="text-sm" style={{ color: '#6C7F94' }}>Caricamento...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="mb-8">
        <h2
          className="text-lg font-bold mb-1"
          style={{ color: BRAND, textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          Sicurezza Account
        </h2>
        <p className="text-sm" style={{ color: '#6C7F94' }}>
          Riepilogo delle impostazioni di sicurezza del tuo account.
        </p>
      </div>

      <div style={{ border: '1px solid #E5E7EB' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB' }}>
          <p className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: '#6C7F94' }}>
            Autenticazione a due fattori
          </p>
          <p className="text-sm font-semibold" style={{ color: '#16A34A' }}>
            Attiva — Obbligatoria
          </p>
        </div>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB' }}>
          <p className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: '#6C7F94' }}>
            App configurata
          </p>
          <p className="text-sm" style={{ color: '#1A2332' }}>
            {factorName}
          </p>
        </div>

        {enrolledAt && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB' }}>
            <p className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: '#6C7F94' }}>
              Attivata il
            </p>
            <p className="text-sm" style={{ color: '#1A2332' }}>
              {enrolledAt}
            </p>
          </div>
        )}

        <div style={{ padding: '16px 20px' }}>
          <p className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: '#6C7F94' }}>
            Account
          </p>
          <p className="text-sm" style={{ color: '#1A2332' }}>
            {userEmail}
          </p>
        </div>
      </div>

      <div className="mt-6" style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', padding: '14px 20px' }}>
        <p className="text-xs" style={{ color: '#6C7F94' }}>
          La 2FA è obbligatoria per tutti gli account e non può essere disattivata.
          Ad ogni accesso ti verrà richiesto il codice generato dalla tua app Authenticator.
        </p>
      </div>
    </div>
  )
}

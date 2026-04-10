import { useState, useEffect, useRef, useCallback } from 'react'
import { ShieldAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { authenticateBiometric, generateTotp } from '../lib/webauthn'
import { isLocked, recordFailedAttempt, resetAttempts, formatLockoutTime, TOTP_LIMITER } from '../lib/rateLimiter'
import logoSrc from '../assets/logo-agentics.svg'

const BRAND = '#005DEF'
const BIO_LIMITER_KEY = 'biometric'

export const BiometricVerifyPage = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockRemaining, setLockRemaining] = useState(0)
  const [showFallback, setShowFallback] = useState(false)
  const lockTimer = useRef<ReturnType<typeof setInterval>>(undefined)

  const checkLock = useCallback(() => {
    // Usa la stessa config del TOTP limiter ma con chiave biometric
    const bioBioLimiter = { ...TOTP_LIMITER, key: BIO_LIMITER_KEY }
    const status = isLocked(bioBioLimiter)
    setLockRemaining(status.locked ? status.remainingMs : 0)
  }, [])

  useEffect(() => {
    checkLock()
    lockTimer.current = setInterval(checkLock, 1000)
    return () => clearInterval(lockTimer.current)
  }, [checkLock])

  const verifyBiometric = useCallback(async () => {
    if (lockRemaining > 0) return
    setLoading(true)
    setError(null)

    const bioLimiter = { ...TOTP_LIMITER, key: BIO_LIMITER_KEY }

    try {
      // 1. Carica le credenziali biometriche dell'utente da Supabase
      const { data: credentials, error: dbErr } = await supabase
        .from('webauthn_credentials')
        .select('credential_id, totp_secret')
      if (dbErr) throw dbErr
      if (!credentials || credentials.length === 0) {
        throw new Error('Nessuna credenziale biometrica trovata. Accedi con il codice.')
      }

      const credentialIds = credentials.map((c: { credential_id: string }) => c.credential_id)

      // 2. Autenticazione WebAuthn (Face ID / Touch ID) — il browser chiede la biometria
      const { credentialId } = await authenticateBiometric(credentialIds)

      // 3. Trova il segreto TOTP associato a questa credenziale
      const matched = credentials.find(
        (c: { credential_id: string; totp_secret: string }) => c.credential_id === credentialId
      )
      if (!matched) throw new Error('Credenziale non riconosciuta.')

      // 4. Genera codice TOTP corrente
      const code = await generateTotp(matched.totp_secret)

      // 5. Verifica con Supabase MFA → sessione sale a aal2 (preferisci il fattore biometrico)
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.find(f => f.status === 'verified' && f.friendly_name === 'Accesso biometrico')
        ?? factors?.totp?.find(f => f.status === 'verified')
      if (!totp) throw new Error('Nessun fattore TOTP attivo.')

      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id })
      if (chErr) throw chErr

      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: challenge.id,
        code,
      })
      if (verErr) throw verErr

      // 6. Aggiorna last_used_at
      await supabase
        .from('webauthn_credentials')
        .update({ last_used_at: new Date().toISOString() })
        .eq('credential_id', credentialId)

      resetAttempts(BIO_LIMITER_KEY)
      // onAuthStateChange in App.tsx porterà a 'authenticated'

    } catch (err: unknown) {
      const result = recordFailedAttempt(bioLimiter)
      if (result.locked) {
        setLockRemaining(result.remainingMs)
        setError(null)
      } else {
        const msg = err instanceof Error ? err.message : 'Verifica biometrica fallita.'
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }, [lockRemaining])

  // Avvia automaticamente Face ID al caricamento della pagina
  useEffect(() => {
    if (!showFallback && lockRemaining === 0) {
      verifyBiometric()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-8">
      <div className="w-full max-w-sm">

        <div className="flex justify-center mb-10">
          <img src={logoSrc} alt="Agentics" style={{ height: '40px' }} />
        </div>

        <div className="mb-8">
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: BRAND, textTransform: 'uppercase', letterSpacing: '0.06em' }}
          >
            Verifica Identità
          </h1>
          <p className="text-sm" style={{ color: '#6C7F94' }}>
            Usa la biometria del dispositivo per accedere.
          </p>
        </div>

        {/* Blocco */}
        {lockRemaining > 0 && (
          <div
            className="mb-6"
            style={{ borderLeft: '3px solid #DC2626', backgroundColor: '#FEF2F2', padding: '16px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <ShieldAlert style={{ width: 16, height: 16, color: '#DC2626', flexShrink: 0 }} />
              <p className="text-sm font-semibold" style={{ color: '#991B1B' }}>Verifica temporaneamente bloccata</p>
            </div>
            <p className="text-xs" style={{ color: '#991B1B' }}>
              Troppi tentativi falliti. Riprova tra <strong>{formatLockoutTime(lockRemaining)}</strong>.
            </p>
          </div>
        )}

        {/* Errore */}
        {lockRemaining === 0 && error && (
          <div
            className="mb-6"
            style={{ borderLeft: '3px solid #D0021B', backgroundColor: '#FEF2F2', padding: '12px 16px' }}
          >
            <p className="text-sm" style={{ color: '#991B1B' }}>{error}</p>
          </div>
        )}

        {/* Pulsante Face ID */}
        {!showFallback && (
          <div className="text-center">
            <button
              onClick={verifyBiometric}
              disabled={loading || lockRemaining > 0}
              style={{
                width: 88, height: 88, borderRadius: '50%',
                backgroundColor: lockRemaining > 0 ? '#F3F4F6' : '#EFF6FF',
                border: `2px solid ${lockRemaining > 0 ? '#E5E7EB' : BRAND}`,
                cursor: loading || lockRemaining > 0 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
                transition: 'all 0.15s',
                opacity: loading ? 0.6 : 1,
              }}
              aria-label="Accedi con biometria"
            >
              {loading ? (
                <div style={{ width: 28, height: 28, border: '3px solid #E5E7EB', borderTopColor: BRAND, borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
              ) : (
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                  stroke={lockRemaining > 0 ? '#9CA3AF' : BRAND} strokeWidth="1.5" strokeLinecap="round">
                  <path d="M12 2a5 5 0 0 1 5 5v4a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5Z" />
                  <path d="M8 11a4 4 0 0 0 8 0" />
                  <line x1="12" y1="18" x2="12" y2="22" />
                  <line x1="8" y1="22" x2="16" y2="22" />
                </svg>
              )}
            </button>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

            <p className="text-sm font-semibold mb-1" style={{ color: '#1A2332' }}>
              {loading ? 'Verifica in corso...' : 'Tocca per usare Face ID'}
            </p>
            <p className="text-xs" style={{ color: '#9CA3AF' }}>
              Face ID · Touch ID · Impronta digitale
            </p>

            <div className="mt-6">
              <button
                onClick={() => setShowFallback(true)}
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: '#6C7F94', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Usa codice Authenticator
              </button>
            </div>
          </div>
        )}

        {/* Fallback TOTP */}
        {showFallback && (
          <FallbackTotp onBack={() => setShowFallback(false)} />
        )}

        <div className="flex justify-center mt-6">
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: BRAND, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Torna al login
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Fallback: input manuale codice TOTP ──────────────────────────────────────────
const CODE_LENGTH = 6

function FallbackTotp({ onBack }: { onBack: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => { inputRefs.current[0]?.focus() }, [])

  const verify = async (code: string) => {
    setLoading(true)
    setError(null)
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.find(f => f.status === 'verified')
      if (!totp) throw new Error('Nessun fattore TOTP attivo.')
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id })
      if (chErr) throw chErr
      const { error: verErr } = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: challenge.id, code })
      if (verErr) throw verErr
      resetAttempts(TOTP_LIMITER.key)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Codice non valido.')
      setDigits(Array(CODE_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const next = [...digits]
    next[index] = value.slice(-1)
    setDigits(next)
    if (value && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus()
    if (next.every(d => d !== '')) verify(next.join(''))
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH)
    if (!text) return
    const next = Array(CODE_LENGTH).fill('')
    text.split('').forEach((ch, i) => { next[i] = ch })
    setDigits(next)
    inputRefs.current[Math.min(text.length, CODE_LENGTH - 1)]?.focus()
    if (text.length === CODE_LENGTH) verify(text)
  }

  return (
    <div>
      <p className="text-sm mb-6" style={{ color: '#6C7F94' }}>
        Inserisci il codice a 6 cifre dall'app Authenticator.
      </p>

      {error && (
        <div className="mb-4" style={{ borderLeft: '3px solid #D0021B', backgroundColor: '#FEF2F2', padding: '10px 14px' }}>
          <p className="text-sm" style={{ color: '#991B1B' }}>{error}</p>
        </div>
      )}

      <div className="flex justify-center gap-3 mb-6" onPaste={handlePaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={el => { inputRefs.current[i] = el }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            disabled={loading}
            style={{
              width: 44, height: 52, textAlign: 'center',
              fontSize: '20px', fontWeight: 700,
              border: '1px solid #E5E7EB', borderBottom: `2px solid ${d ? BRAND : '#E5E7EB'}`,
              outline: 'none', color: '#1A2332', transition: 'border-color 0.15s',
            }}
            onFocus={e => { e.currentTarget.style.borderBottomColor = BRAND }}
            onBlur={e => { if (!d) e.currentTarget.style.borderBottomColor = '#E5E7EB' }}
          />
        ))}
      </div>

      <div className="flex justify-center">
        <button
          onClick={onBack}
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: BRAND, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Torna a Face ID
        </button>
      </div>
    </div>
  )
}

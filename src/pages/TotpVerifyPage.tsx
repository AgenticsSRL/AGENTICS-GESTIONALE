import { useState, useRef, useEffect, useCallback } from 'react'
import { ShieldAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { isLocked, recordFailedAttempt, resetAttempts, formatLockoutTime, TOTP_LIMITER } from '../lib/rateLimiter'
import logoSrc from '../assets/logo-agentics.svg'

const BRAND = '#005DEF'
const CODE_LENGTH = 6

export const TotpVerifyPage = () => {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockRemaining, setLockRemaining] = useState(0)
  const [attemptsLeft, setAttemptsLeft] = useState(TOTP_LIMITER.maxAttempts)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const lockTimer = useRef<ReturnType<typeof setInterval>>(undefined)

  const checkLock = useCallback(() => {
    const status = isLocked(TOTP_LIMITER)
    if (status.locked) {
      setLockRemaining(status.remainingMs)
      setAttemptsLeft(0)
    } else {
      setLockRemaining(0)
      setAttemptsLeft(TOTP_LIMITER.maxAttempts - status.attempts)
    }
  }, [])

  useEffect(() => {
    checkLock()
    lockTimer.current = setInterval(checkLock, 1000)
    return () => clearInterval(lockTimer.current)
  }, [checkLock])

  useEffect(() => {
    if (!lockRemaining) inputRefs.current[0]?.focus()
  }, [lockRemaining])

  const verify = async (code: string) => {
    if (lockRemaining > 0) return
    setLoading(true)
    setError(null)
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      // Preferisce Google Authenticator (esclude il fattore biometrico usato solo su mobile)
      const totp = factors?.totp?.find(f => f.status === 'verified' && f.friendly_name !== 'Accesso biometrico')
        ?? factors?.totp?.find(f => f.status === 'verified')
      if (!totp) throw new Error('Nessun fattore TOTP trovato.')

      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: totp.id })
      if (challengeErr) throw challengeErr

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: challenge.id,
        code,
      })
      if (verifyErr) throw verifyErr
      resetAttempts(TOTP_LIMITER.key)
    } catch (err: unknown) {
      const result = recordFailedAttempt(TOTP_LIMITER)
      if (result.locked) {
        setLockRemaining(result.remainingMs)
        setAttemptsLeft(0)
        setError(null)
      } else {
        setAttemptsLeft(TOTP_LIMITER.maxAttempts - result.attempts)
        const msg = err instanceof Error ? err.message : 'Codice non valido.'
        setError(msg)
      }
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

    if (value && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }

    if (next.every(d => d !== '')) {
      verify(next.join(''))
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH)
    if (!text) return
    const next = Array(CODE_LENGTH).fill('')
    text.split('').forEach((ch, i) => { next[i] = ch })
    setDigits(next)
    const focusIdx = Math.min(text.length, CODE_LENGTH - 1)
    inputRefs.current[focusIdx]?.focus()
    if (text.length === CODE_LENGTH) {
      verify(text)
    }
  }

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
            Verifica 2FA
          </h1>
          <p className="text-sm" style={{ color: '#6C7F94' }}>
            Inserisci il codice a 6 cifre dalla tua app Authenticator
          </p>
        </div>

        {lockRemaining > 0 && (
          <div
            className="mb-6"
            style={{
              borderLeft: '3px solid #DC2626',
              backgroundColor: '#FEF2F2',
              padding: '16px',
            }}
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

        {!lockRemaining && error && (
          <div
            className="mb-6"
            style={{ borderLeft: '3px solid #D0021B', backgroundColor: '#FEF2F2', padding: '12px 16px' }}
          >
            <p className="text-sm" style={{ color: '#991B1B' }}>{error}</p>
            {attemptsLeft > 0 && attemptsLeft < TOTP_LIMITER.maxAttempts && (
              <p className="text-xs mt-1" style={{ color: '#B91C1C' }}>
                {attemptsLeft === 1
                  ? 'Ultimo tentativo prima del blocco temporaneo.'
                  : `${attemptsLeft} tentativi rimasti.`}
              </p>
            )}
          </div>
        )}

        <div className="flex justify-center gap-3 mb-8" onPaste={handlePaste}>
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
              disabled={loading || lockRemaining > 0}
              style={{
                width: 48, height: 56, textAlign: 'center',
                fontSize: '22px', fontWeight: 700,
                border: '1px solid #E5E7EB', borderBottom: `2px solid ${d ? BRAND : '#E5E7EB'}`,
                outline: 'none', color: lockRemaining > 0 ? '#9CA3AF' : '#1A2332',
                transition: 'border-color 0.15s',
                backgroundColor: lockRemaining > 0 ? '#F9FAFB' : 'transparent',
              }}
              onFocus={e => { e.currentTarget.style.borderBottomColor = BRAND }}
              onBlur={e => { if (!d) e.currentTarget.style.borderBottomColor = '#E5E7EB' }}
            />
          ))}
        </div>

        <div className="flex justify-center">
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: BRAND, background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            Torna al login
          </button>
        </div>

      </div>
    </div>
  )
}

import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { registerBiometric, generateTotp } from '../lib/webauthn'
import logoSrc from '../assets/logo-agentics.svg'

const BRAND = '#005DEF'
const CODE_LENGTH = 6

type Step = 'intro' | 'totp-bridge' | 'registering' | 'success' | 'error'

export const BiometricEnrollPage = () => {
  const [step, setStep] = useState<Step>('intro')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [needsTotpBridge, setNeedsTotpBridge] = useState(false)

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const hasVerified = data?.totp?.some(f => f.status === 'verified') ?? false
      setNeedsTotpBridge(hasVerified)
    })
  }, [])

  const startEnroll = () => {
    if (needsTotpBridge) {
      setStep('totp-bridge')
    } else {
      enrollBiometric()
    }
  }

  const onTotpVerified = () => {
    enrollBiometric()
  }

  const enrollBiometric = async () => {
    setLoading(true)
    setErrorMsg(null)
    setStep('registering')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione non valida.')

      // Rimuovi solo fattori biometrici precedenti o non verificati (NON toccare Google Authenticator)
      const { data: factors } = await supabase.auth.mfa.listFactors()
      for (const f of factors?.totp ?? []) {
        if (f.friendly_name === 'Accesso biometrico' || (f.status as string) !== 'verified') {
          await supabase.auth.mfa.unenroll({ factorId: f.id })
        }
      }

      // Rimuovi credenziali biometriche precedenti per questo dispositivo
      await supabase.from('webauthn_credentials').delete().eq('user_id', user.id)

      const { data: enrollData, error: enrollErr } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Accesso biometrico',
      })
      if (enrollErr) throw enrollErr

      const { id: factorId, totp: { secret } } = enrollData

      const { credentialId } = await registerBiometric(user.id, user.email ?? user.id)

      const { error: dbErr } = await supabase.from('webauthn_credentials').insert({
        user_id: user.id,
        credential_id: credentialId,
        totp_secret: secret,
        device_name: getDeviceName(),
      })
      if (dbErr) throw dbErr

      const code = await generateTotp(secret)
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
      if (chErr) throw chErr

      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      })
      if (verErr) throw verErr

      setStep('success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore durante la configurazione.'
      setErrorMsg(msg)
      setStep('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-8">
      <div className="w-full max-w-sm">

        <div className="flex justify-center mb-10">
          <img src={logoSrc} alt="Agentics" style={{ height: '40px' }} />
        </div>

        {step === 'intro' && (
          <div>
            <div className="mb-10">
              <h1
                className="text-2xl font-bold mb-1"
                style={{ color: BRAND, textTransform: 'uppercase', letterSpacing: '0.06em' }}
              >
                Configura Face ID
              </h1>
              <p className="text-sm" style={{ color: '#6C7F94' }}>
                Accedi in modo sicuro con il riconoscimento biometrico del tuo dispositivo.
              </p>
            </div>

            <div className="mb-8 space-y-4">
              <div className="border-b border-gray-200 pb-4">
                <p className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: '#6C7F94' }}>
                  Come funziona
                </p>
                <p className="text-sm" style={{ color: '#1A2332' }}>
                  Dopo la configurazione, accederai con email, password e una verifica biometrica (Face ID, impronta digitale) al posto del codice 6 cifre.
                </p>
              </div>

              <div className="border-b border-gray-200 pb-4">
                <p className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: '#6C7F94' }}>
                  Sicurezza
                </p>
                <p className="text-sm" style={{ color: '#1A2332' }}>
                  La biometria non lascia mai il tuo dispositivo. Solo tu puoi sbloccare l'accesso.
                </p>
              </div>
            </div>

            <div className="flex justify-center mb-8">
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                border: `2px solid ${BRAND}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="1.5">
                  <path d="M12 2C9.243 2 7 4.243 7 7v2a5 5 0 0 0 10 0V7c0-2.757-2.243-5-5-5Z" />
                  <path d="M12 14v4M9 18h6" />
                  <path d="M5 11.5A7 7 0 0 0 19 11.5" />
                </svg>
              </div>
            </div>

            <button
              onClick={startEnroll}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold"
              style={{
                backgroundColor: BRAND, color: '#fff',
                padding: '12px 16px', border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                textTransform: 'uppercase', letterSpacing: '0.08em',
                opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.opacity = '1' }}
            >
              Abilita biometria
            </button>

            <div className="flex justify-center mt-4">
              <button
                onClick={() => supabase.auth.signOut()}
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: '#6C7F94', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Esci
              </button>
            </div>
          </div>
        )}

        {step === 'totp-bridge' && (
          <TotpBridge onVerified={onTotpVerified} onBack={() => setStep('intro')} />
        )}

        {step === 'registering' && (
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div style={{ width: 28, height: 28, border: '3px solid #E5E7EB', borderTopColor: BRAND, borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
            <p className="text-sm font-semibold" style={{ color: '#1A2332' }}>Configurazione in corso...</p>
            <p className="text-xs mt-2" style={{ color: '#6C7F94' }}>Segui le istruzioni del tuo dispositivo.</p>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                backgroundColor: '#ECFDF5',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>
            <h2 className="text-lg font-bold mb-2" style={{ color: '#1A2332' }}>Biometria attivata</h2>
            <p className="text-sm" style={{ color: '#6C7F94' }}>D'ora in poi accederai con Face ID o impronta digitale.</p>
            <p className="text-xs mt-4" style={{ color: '#9CA3AF' }}>Reindirizzamento in corso...</p>
          </div>
        )}

        {step === 'error' && (
          <div>
            <div
              className="mb-6"
              style={{ borderLeft: '3px solid #D0021B', backgroundColor: '#FEF2F2', padding: '12px 16px' }}
            >
              <p className="text-sm font-semibold" style={{ color: '#991B1B' }}>Configurazione fallita</p>
              {errorMsg && <p className="text-xs mt-1" style={{ color: '#991B1B' }}>{errorMsg}</p>}
            </div>

            <button
              onClick={() => setStep('intro')}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold"
              style={{
                backgroundColor: BRAND, color: '#fff',
                padding: '12px 16px', border: 'none',
                cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
            >
              Riprova
            </button>

            <div className="flex justify-center mt-4">
              <button
                onClick={() => supabase.auth.signOut()}
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: '#6C7F94', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Esci
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

function TotpBridge({ onVerified, onBack }: { onVerified: () => void; onBack: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => { inputRefs.current[0]?.focus() }, [])

  const verify = useCallback(async (code: string) => {
    setLoading(true)
    setError(null)
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.find(f => f.status === 'verified')
      if (!totp) throw new Error('Nessun fattore TOTP attivo.')

      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id })
      if (chErr) throw chErr

      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: challenge.id,
        code,
      })
      if (verErr) throw verErr

      onVerified()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Codice non valido.')
      setDigits(Array(CODE_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }, [onVerified])

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
      <div className="mb-8">
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: BRAND, textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          Verifica Identità
        </h1>
        <p className="text-sm" style={{ color: '#6C7F94' }}>
          Inserisci il codice Google Authenticator per l'ultima volta. Dopo non ti servirà più su questo dispositivo.
        </p>
      </div>

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
              borderRadius: 0,
            }}
            onFocus={e => { e.currentTarget.style.borderBottomColor = BRAND }}
            onBlur={e => { if (!d) e.currentTarget.style.borderBottomColor = '#E5E7EB' }}
          />
        ))}
      </div>

      {loading && (
        <div className="flex justify-center mb-4">
          <div style={{ width: 20, height: 20, border: '2px solid #E5E7EB', borderTopColor: BRAND, borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={onBack}
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: '#6C7F94', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Indietro
        </button>
      </div>
    </div>
  )
}

function getDeviceName(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  return 'Mobile'
}

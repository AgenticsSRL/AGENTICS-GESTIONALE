import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import logoSrc from '../assets/logo-agentics.svg'

const BRAND = '#005DEF'
const CODE_LENGTH = 6

type Step = 'intro' | 'qr' | 'verify'

export const TotpEnrollPage = () => {
  const [step, setStep] = useState<Step>('intro')
  const [qrUri, setQrUri] = useState('')
  const [secret, setSecret] = useState('')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const startEnroll = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const unverified = factors?.totp?.filter(f => f.status === 'unverified') ?? []
      for (const f of unverified) {
        await supabase.auth.mfa.unenroll({ factorId: f.id })
      }

      const { data, error: err } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Google Authenticator',
      })
      if (err) throw err
      setFactorId(data.id)
      setQrUri(data.totp.qr_code)
      setSecret(data.totp.secret)
      setStep('qr')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Errore durante la configurazione. Riprova.')
    } finally {
      setLoading(false)
    }
  }

  const goToVerify = () => {
    setDigits(Array(CODE_LENGTH).fill(''))
    setError(null)
    setStep('verify')
    setTimeout(() => inputRefs.current[0]?.focus(), 50)
  }

  const confirmEnroll = async (code: string) => {
    if (!factorId) return
    setLoading(true)
    setError(null)
    try {
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
      if (chErr) throw chErr

      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      })
      if (vErr) throw vErr
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Codice non valido. Riprova.')
      setDigits(Array(CODE_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  const handleDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const next = [...digits]
    next[index] = value.slice(-1)
    setDigits(next)
    if (value && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus()
    if (next.every(d => d !== '')) confirmEnroll(next.join(''))
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
    inputRefs.current[Math.min(text.length, CODE_LENGTH - 1)]?.focus()
    if (text.length === CODE_LENGTH) confirmEnroll(text)
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-8">
      <div className="w-full max-w-sm">

        <div className="flex justify-center mb-10">
          <img src={logoSrc} alt="Agentics" style={{ height: '40px' }} />
        </div>

        {error && (
          <div
            className="mb-6"
            style={{ borderLeft: '3px solid #D0021B', backgroundColor: '#FEF2F2', padding: '12px 16px' }}
          >
            <p className="text-sm" style={{ color: '#991B1B' }}>{error}</p>
          </div>
        )}

        {/* ── STEP 1: Intro ──────────────────────── */}
        {step === 'intro' && (
          <div>
            <div className="mb-10">
              <h1
                className="text-2xl font-bold mb-1"
                style={{ color: BRAND, textTransform: 'uppercase', letterSpacing: '0.06em' }}
              >
                Configura 2FA
              </h1>
              <p className="text-sm" style={{ color: '#6C7F94' }}>
                L'autenticazione a due fattori è obbligatoria per accedere.
              </p>
            </div>

            <div className="mb-8 space-y-4">
              <div className="border-b border-gray-200 pb-4">
                <p className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: '#6C7F94' }}>
                  Cosa serve
                </p>
                <p className="text-sm" style={{ color: '#1A2332' }}>
                  Google Authenticator o un'altra app TOTP installata sul tuo telefono.
                </p>
              </div>

              <div className="border-b border-gray-200 pb-4">
                <p className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: '#6C7F94' }}>
                  Come funziona
                </p>
                <p className="text-sm" style={{ color: '#1A2332' }}>
                  Scansioni un QR code con l'app e inserisci il codice a 6 cifre generato per confermare.
                </p>
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
              {loading ? 'Attendere...' : 'Inizia configurazione'}
            </button>

            <div className="flex justify-center mt-4">
              <button
                onClick={() => supabase.auth.signOut()}
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: '#6C7F94', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#1A2332' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#6C7F94' }}
              >
                Esci
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: QR Code ────────────────────── */}
        {step === 'qr' && (
          <div>
            <div className="mb-8">
              <h1
                className="text-2xl font-bold mb-1"
                style={{ color: BRAND, textTransform: 'uppercase', letterSpacing: '0.06em' }}
              >
                Scansiona
              </h1>
              <p className="text-sm" style={{ color: '#6C7F94' }}>
                Apri l'app Authenticator e scansiona il QR code qui sotto.
              </p>
            </div>

            <div className="flex justify-center mb-6">
              <img
                src={qrUri}
                alt="QR Code TOTP"
                style={{ width: 200, height: 200, border: '1px solid #E5E7EB', padding: 8 }}
              />
            </div>

            <div className="mb-8">
              <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: '#6C7F94' }}>
                Codice manuale
              </p>
              <div
                style={{
                  fontFamily: 'monospace', fontSize: '13px', color: '#1A2332',
                  backgroundColor: '#F9FAFB', padding: '10px 14px',
                  wordBreak: 'break-all', letterSpacing: '0.04em',
                  border: '1px solid #E5E7EB',
                }}
              >
                {secret}
              </div>
            </div>

            <button
              onClick={goToVerify}
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
              Continua
            </button>
          </div>
        )}

        {/* ── STEP 3: Verifica codice ────────────── */}
        {step === 'verify' && (
          <div>
            <div className="mb-8">
              <h1
                className="text-2xl font-bold mb-1"
                style={{ color: BRAND, textTransform: 'uppercase', letterSpacing: '0.06em' }}
              >
                Verifica
              </h1>
              <p className="text-sm" style={{ color: '#6C7F94' }}>
                Inserisci il codice a 6 cifre generato dall'app.
              </p>
            </div>

            <div className="flex justify-center gap-3 mb-8" onPaste={handlePaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { inputRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleDigitChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  disabled={loading}
                  style={{
                    width: 48, height: 56, textAlign: 'center',
                    fontSize: '22px', fontWeight: 700,
                    border: '1px solid #E5E7EB', borderBottom: `2px solid ${d ? BRAND : '#E5E7EB'}`,
                    outline: 'none', color: '#1A2332',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderBottomColor = BRAND }}
                  onBlur={e => { if (!d) e.currentTarget.style.borderBottomColor = '#E5E7EB' }}
                />
              ))}
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => setStep('qr')}
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: BRAND, background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                Torna al QR Code
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

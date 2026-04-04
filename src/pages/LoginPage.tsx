import { useState, useEffect, useRef, useCallback } from 'react'
import { Eye, EyeOff, ArrowRight, ShieldAlert } from 'lucide-react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { supabase } from '../lib/supabase'
import { safeErrorMessage } from '../lib/errors'
import { isLocked, recordFailedAttempt, resetAttempts, formatLockoutTime, LOGIN_LIMITER } from '../lib/rateLimiter'
import { SplineScene } from '../components/SplineScene'
import logoSrc from '../assets/logo-agentics.svg'

const BRAND = '#005DEF'
const CF_SITE_KEY = '0x4AAAAAAC0OGk7RAkvlk_kn'

export const LoginPage = () => {
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]           = useState(false)
  const [loginError, setLoginError]     = useState<string | null>(null)
  const [lockRemaining, setLockRemaining] = useState(0)
  const [attemptsLeft, setAttemptsLeft]   = useState(LOGIN_LIMITER.maxAttempts)
  const lockTimer = useRef<ReturnType<typeof setInterval>>(undefined)
  const [cfToken, setCfToken] = useState<string | null>(null)
  const [cfStatus, setCfStatus] = useState<'loading' | 'solved' | 'error'>('loading')
  const turnstileRef = useRef<TurnstileInstance>(undefined)
  const cfTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    cfTimeout.current = setTimeout(() => {
      if (cfStatus === 'loading') setCfStatus('error')
    }, 8000)
    return () => clearTimeout(cfTimeout.current)
  }, [cfStatus])

  const checkLock = useCallback(() => {
    const status = isLocked(LOGIN_LIMITER)
    if (status.locked) {
      setLockRemaining(status.remainingMs)
      setAttemptsLeft(0)
    } else {
      setLockRemaining(0)
      setAttemptsLeft(LOGIN_LIMITER.maxAttempts - status.attempts)
    }
  }, [])

  useEffect(() => {
    checkLock()
    lockTimer.current = setInterval(checkLock, 1000)
    return () => clearInterval(lockTimer.current)
  }, [checkLock])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail || !password) return
    if (lockRemaining > 0) return

    if (!cfToken) {
      setLoginError('Completa la verifica di sicurezza Turnstile.')
      return
    }

    setLoading(true)
    setLoginError(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
        options: { captchaToken: cfToken },
      })
      if (error) throw error
      resetAttempts(LOGIN_LIMITER.key)
    } catch (err: unknown) {
      turnstileRef.current?.reset()
      setCfToken(null)
      const result = recordFailedAttempt(LOGIN_LIMITER)
      if (result.locked) {
        setLockRemaining(result.remainingMs)
        setAttemptsLeft(0)
        setLoginError(null)
      } else {
        setAttemptsLeft(LOGIN_LIMITER.maxAttempts - result.attempts)
        setLoginError(safeErrorMessage(err, 'Credenziali non valide.'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex">

      {/* ── Pannello sinistro — Logo + Robot 3D ─────────────── */}
      <div
        className="hidden lg:flex flex-col flex-shrink-0 relative"
        style={{ width: '50%', backgroundColor: BRAND }}
      >
        {/* Logo centrato in alto */}
        <div className="flex justify-center pt-16 pb-4">
          <img
            src={logoSrc}
            alt="Agentics"
            style={{ height: '80px', filter: 'brightness(0) invert(1)' }}
          />
        </div>

        {/* Scena 3D robot — occupa il resto del pannello */}
        <div className="flex-1 relative">
          <SplineScene
            scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
            className="absolute inset-0 w-full h-full"
          />
        </div>
      </div>

      {/* ── Pannello destro — FORM ──────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-16">
        <div className="w-full max-w-sm">

          {/* Logo visibile solo su mobile */}
          <div className="flex justify-center mb-8 lg:hidden">
            <img
              src={logoSrc}
              alt="Agentics"
              style={{ height: '50px' }}
            />
          </div>

          <div className="mb-10">
            <h1
              className="text-2xl font-bold mb-1"
              style={{
                color: BRAND,
                textTransform: 'uppercase',
                letterSpacing: '0.06em'
              }}
            >
              Accedi
            </h1>
            <p className="text-sm" style={{ color: '#6C7F94' }}>
              Inserisci le tue credenziali per continuare
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
                <p className="text-sm font-semibold" style={{ color: '#991B1B' }}>Account temporaneamente bloccato</p>
              </div>
              <p className="text-xs" style={{ color: '#991B1B' }}>
                Troppi tentativi falliti. Riprova tra <strong>{formatLockoutTime(lockRemaining)}</strong>.
              </p>
            </div>
          )}

          {!lockRemaining && loginError && (
            <div
              className="mb-6"
              style={{
                borderLeft: '3px solid #D0021B',
                backgroundColor: '#FEF2F2',
                padding: '12px 16px'
              }}
            >
              <p className="text-sm" style={{ color: '#991B1B' }}>{loginError}</p>
              {attemptsLeft > 0 && attemptsLeft < LOGIN_LIMITER.maxAttempts && (
                <p className="text-xs mt-1" style={{ color: '#B91C1C' }}>
                  {attemptsLeft === 1
                    ? 'Ultimo tentativo prima del blocco temporaneo.'
                    : `${attemptsLeft} tentativi rimasti prima del blocco.`}
                </p>
              )}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-7">

            <div className="space-y-1">
              <label
                className="block text-xs font-semibold tracking-widest uppercase"
                style={{ color: '#6C7F94' }}
              >
                Indirizzo Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nome@azienda.com"
                autoComplete="email"
                required
                className="w-full h-11 text-sm border-0 border-b border-gray-200 outline-none bg-transparent"
                onFocus={e => (e.currentTarget.style.borderColor = BRAND)}
                onBlur={e => (e.currentTarget.style.borderColor = '#E5E7EB')}
              />
            </div>

            <div className="space-y-1">
              <label
                className="block text-xs font-semibold tracking-widest uppercase"
                style={{ color: '#6C7F94' }}
              >
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full h-11 text-sm border-0 border-b border-gray-200 outline-none bg-transparent pr-8"
                  onFocus={e => (e.currentTarget.style.borderColor = BRAND)}
                  onBlur={e => (e.currentTarget.style.borderColor = '#E5E7EB')}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#8E9FB0',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#3E4A57')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#8E9FB0')}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex justify-end pt-1">
                <a
                  href="#"
                  className="text-xs font-semibold transition-colors duration-200"
                  style={{
                    color: BRAND,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  Password dimenticata?
                </a>
              </div>
            </div>

            <div className="flex justify-center" style={{ minHeight: 65 }}>
              {cfStatus === 'error' ? (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 11, color: '#DC2626', marginBottom: 6 }}>Verifica di sicurezza non disponibile.</p>
                  <button
                    type="button"
                    onClick={() => { setCfStatus('loading'); turnstileRef.current?.reset() }}
                    style={{ fontSize: 11, color: BRAND, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Riprova
                  </button>
                </div>
              ) : cfStatus === 'loading' && !cfToken ? (
                <p style={{ fontSize: 11, color: '#6C7F94', alignSelf: 'center' }}>Caricamento verifica di sicurezza...</p>
              ) : null}
              <div style={{ display: cfStatus === 'error' ? 'none' : 'block' }}>
                <Turnstile
                  ref={turnstileRef}
                  siteKey={CF_SITE_KEY}
                  onSuccess={(token) => { setCfToken(token); setCfStatus('solved'); clearTimeout(cfTimeout.current) }}
                  onError={() => { setCfToken(null); setCfStatus('error') }}
                  onExpire={() => { setCfToken(null); setCfStatus('loading') }}
                  onUnsupported={() => setCfStatus('error')}
                  options={{ theme: 'light', size: 'normal' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || lockRemaining > 0 || !cfToken}
              className="w-full flex items-center justify-center gap-2 mt-2 text-sm font-semibold transition-opacity duration-200"
              style={{
                backgroundColor: (lockRemaining > 0 || !cfToken) ? '#9CA3AF' : BRAND,
                color: '#ffffff',
                padding: '12px 16px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                opacity: loading ? 0.5 : 1,
                cursor: (loading || lockRemaining > 0 || !cfToken) ? 'not-allowed' : 'pointer',
                border: 'none'
              }}
              onMouseEnter={e => { if (!loading && !lockRemaining && cfToken) e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { if (!loading && !lockRemaining && cfToken) e.currentTarget.style.opacity = '1' }}
            >
              {lockRemaining > 0
                ? `Bloccato — ${formatLockoutTime(lockRemaining)}`
                : loading
                  ? 'Attendere...'
                  : <>Accedi <ArrowRight className="w-4 h-4" /></>
              }
            </button>
          </form>

        </div>
      </div>

    </div>
  )
}

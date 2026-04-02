import { useState } from 'react'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { safeErrorMessage } from '../lib/errors'
import { SplineScene } from '../components/SplineScene'
import logoSrc from '../assets/logo-agentics.svg'

const BRAND = '#005DEF'

export const LoginPage = () => {
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]           = useState(false)
  const [loginError, setLoginError]     = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail || !password) return
    setLoading(true)
    setLoginError(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password })
      if (error) throw error
    } catch (err: unknown) {
      setLoginError(safeErrorMessage(err, 'Credenziali non valide.'))
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

          {loginError && (
            <div
              className="flex gap-2 mb-6"
              style={{
                borderLeft: '3px solid #D0021B',
                backgroundColor: '#FEF2F2',
                padding: '12px 16px'
              }}
            >
              <p className="text-sm" style={{ color: '#991B1B' }}>{loginError}</p>
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

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 mt-2 text-sm font-semibold transition-opacity duration-200"
              style={{
                backgroundColor: BRAND,
                color: '#ffffff',
                padding: '12px 16px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                opacity: loading ? 0.5 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
                border: 'none'
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.opacity = '1' }}
            >
              {loading ? 'Attendere...' : (
                <>
                  Accedi
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

        </div>
      </div>

    </div>
  )
}

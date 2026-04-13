import { useEffect, useState, useCallback, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { isMobilePlatform, isBiometricAvailable } from './lib/webauthn'
import { LoginPage } from './pages/LoginPage'
import { TotpEnrollPage } from './pages/TotpEnrollPage'
import { TotpVerifyPage } from './pages/TotpVerifyPage'
import { BiometricEnrollPage } from './pages/BiometricEnrollPage'
import { BiometricVerifyPage } from './pages/BiometricVerifyPage'
import { Shell } from './components/layout/Shell'

type AuthState =
  | 'loading'
  | 'unauthenticated'
  | 'needs-mfa-enroll'
  | 'needs-mfa-verify'
  | 'needs-biometric-enroll'
  | 'needs-biometric-verify'
  | 'authenticated'

const ACCESS_LOG_KEY = 'access_logged'

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [, setSession] = useState<Session | null>(null)
  const accessLogged = useRef(false)

  const logAccess = useCallback(async () => {
    if (accessLogged.current || sessionStorage.getItem(ACCESS_LOG_KEY)) return
    accessLogged.current = true
    sessionStorage.setItem(ACCESS_LOG_KEY, '1')

    await supabase.from('access_log').insert({
      user_agent: navigator.userAgent,
    })
  }, [])

  const resolveAuthState = useCallback(async (session: Session | null) => {
    setSession(session)
    if (!session) {
      accessLogged.current = false
      sessionStorage.removeItem(ACCESS_LOG_KEY)
      setAuthState('unauthenticated')
      return
    }

    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error) {
      setAuthState('authenticated')
      return
    }

    const { currentLevel, nextLevel } = data

    if (nextLevel === 'aal2' && currentLevel !== 'aal2') {
      const mobile = isMobilePlatform()
      if (mobile && await isBiometricAvailable()) {
        const { data: creds } = await supabase.from('webauthn_credentials').select('id').limit(1)
        setAuthState(creds && creds.length > 0 ? 'needs-biometric-verify' : 'needs-biometric-enroll')
      } else {
        setAuthState('needs-mfa-verify')
      }
      return
    }

    if (currentLevel === 'aal2') {
      setAuthState('authenticated')
      return
    }

    const { data: factors } = await supabase.auth.mfa.listFactors()
    const hasVerifiedTotp = factors?.totp?.some(f => f.status === 'verified') ?? false

    if (!hasVerifiedTotp) {
      const mobile = isMobilePlatform()
      if (mobile && await isBiometricAvailable()) {
        setAuthState('needs-biometric-enroll')
      } else {
        setAuthState('needs-mfa-enroll')
      }
    } else {
      setAuthState('authenticated')
    }
  }, [])

  useEffect(() => {
    if (authState === 'authenticated') {
      logAccess()
    }
  }, [authState, logAccess])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      resolveAuthState(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      resolveAuthState(session)
    })

    return () => subscription.unsubscribe()
  }, [resolveAuthState])

  if (authState === 'loading') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 24, height: 24, border: '3px solid #E5E7EB', borderTopColor: '#005DEF', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
  if (authState === 'unauthenticated') return <LoginPage />
  if (authState === 'needs-mfa-enroll') return <TotpEnrollPage />
  if (authState === 'needs-mfa-verify') return <TotpVerifyPage />
  if (authState === 'needs-biometric-enroll') return <BiometricEnrollPage />
  if (authState === 'needs-biometric-verify') return <BiometricVerifyPage />
  return <Shell />
}

export default App

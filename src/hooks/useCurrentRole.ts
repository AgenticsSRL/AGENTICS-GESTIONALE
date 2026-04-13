import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { t as translate, type Locale } from '../lib/i18n'

export type UserRole = 'admin' | 'developer' | null

export interface CurrentRole {
  role: UserRole
  mustChangePassword: boolean
  locale: Locale
  loading: boolean
}

let cachedRole: CurrentRole | null = null
let cachedUserId: string | null = null

export const clearRoleCache = () => { cachedRole = null; cachedUserId = null }

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    cachedRole = null
    cachedUserId = null
  }
})

export const useCurrentRole = (): CurrentRole => {
  const [state, setState] = useState<CurrentRole>(
    cachedRole ?? { role: null, mustChangePassword: false, locale: 'it', loading: true }
  )

  useEffect(() => {
    const fetchRole = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        const s: CurrentRole = { role: null, mustChangePassword: false, locale: 'it', loading: false }
        cachedRole = s; cachedUserId = null; setState(s); return
      }

      if (cachedRole && cachedUserId === user.id) { setState(cachedRole); return }

      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()

      const role = (roleRow?.role as UserRole) ?? null
      let mustChangePassword = false
      let locale: Locale = 'it'

      if (role === 'developer') {
        const { data: devProfile } = await supabase
          .from('developer_profiles')
          .select('must_change_password, lingua')
          .eq('user_id', user.id)
          .maybeSingle()
        mustChangePassword = devProfile?.must_change_password ?? false
        locale = (devProfile?.lingua as Locale) ?? 'it'
      }

      const s: CurrentRole = { role, mustChangePassword, locale, loading: false }
      cachedRole = s; cachedUserId = user.id; setState(s)
    }

    fetchRole()
  }, [])

  return state
}

export const useT = () => {
  const { locale } = useCurrentRole()
  return useCallback((key: string) => translate(key, locale), [locale])
}

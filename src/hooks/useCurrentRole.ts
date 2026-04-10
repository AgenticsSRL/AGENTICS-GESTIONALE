import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type UserRole = 'admin' | 'developer' | null

export interface CurrentRole {
  role: UserRole
  mustChangePassword: boolean
  loading: boolean
}

// Module-level cache to avoid re-fetching across re-renders
let cachedRole: CurrentRole | null = null

export const clearRoleCache = () => { cachedRole = null }

export const useCurrentRole = (): CurrentRole => {
  const [state, setState] = useState<CurrentRole>(
    cachedRole ?? { role: null, mustChangePassword: false, loading: true }
  )

  useEffect(() => {
    if (cachedRole) { setState(cachedRole); return }

    const fetchRole = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        const s: CurrentRole = { role: null, mustChangePassword: false, loading: false }
        cachedRole = s; setState(s); return
      }

      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()

      const role = (roleRow?.role as UserRole) ?? null
      let mustChangePassword = false

      if (role === 'developer') {
        const { data: devProfile } = await supabase
          .from('developer_profiles')
          .select('must_change_password')
          .eq('user_id', user.id)
          .maybeSingle()
        mustChangePassword = devProfile?.must_change_password ?? false
      }

      const s: CurrentRole = { role, mustChangePassword, loading: false }
      cachedRole = s; setState(s)
    }

    fetchRole()
  }, [])

  return state
}

import { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import logoWordmark from '../../assets/logo-agentics-wordmark.svg'

export type Page = 'dashboard' | 'clienti' | 'cliente_detail' | 'progetti' | 'progetto_detail' | 'task' | 'contabilita' | 'sicurezza' | 'security_events' | 'calendario' | 'profilo'

const BRAND = '#005DEF'
const ADMIN_EMAIL = 'lorenzo@agentics.eu.com'

const navItems: { id: Page; label: string; adminOnly?: boolean }[] = [
  { id: 'dashboard',    label: 'Dashboard' },
  { id: 'clienti',      label: 'Clienti' },
  { id: 'progetti',     label: 'Progetti' },
  { id: 'task',         label: 'Task' },
  { id: 'contabilita', label: 'Contabilità' },
  { id: 'sicurezza',       label: 'Sicurezza' },
  { id: 'security_events', label: 'Security Events', adminOnly: true },
  { id: 'calendario',      label: 'Calendario', adminOnly: true },
  { id: 'profilo',      label: 'Area Privata' },
]

interface SidebarProps {
  current: Page
  onChange: (p: Page) => void
}

export const Sidebar = ({ current, onChange }: SidebarProps) => {
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setIsAdmin(user?.email === ADMIN_EMAIL))
  }, [])

  const visibleItems = navItems.filter(n => !n.adminOnly || isAdmin)

  return (
  <aside style={{
    width: 220,
    flexShrink: 0,
    backgroundColor: BRAND,
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    position: 'sticky',
    top: 0,
  }}>
    {/* Logo */}
    <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
      <img src={logoWordmark} alt="Agentics" style={{ height: 22, display: 'block' }} />
    </div>

    {/* Nav */}
    <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {visibleItems.map(({ id, label }) => {
        const active = current === id || (id === 'clienti' && current === 'cliente_detail') || (id === 'progetti' && current === 'progetto_detail')
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '9px 12px',
              width: '100%',
              textAlign: 'left',
              background: active ? 'rgba(255,255,255,0.2)' : 'transparent',
              color: active ? '#fff' : 'rgba(255,255,255,0.6)',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: active ? 600 : 400,
              letterSpacing: '0.02em',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' } }}
          >
            {label}
          </button>
        )
      })}
    </nav>

    {/* Logout */}
    <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
      <button
        onClick={() => supabase.auth.signOut()}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 12px', width: '100%',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.5)', fontSize: '13px',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
      >
        <LogOut style={{ width: 15, height: 15 }} />
        Esci
      </button>
    </div>
  </aside>
  )
}

import { LogOut, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCurrentRole } from '../../hooks/useCurrentRole'
import logoWordmark from '../../assets/logo-agentics-wordmark.svg'

export type Page =
  | 'dashboard'
  | 'clienti'
  | 'cliente_detail'
  | 'progetti'
  | 'progetto_detail'
  | 'task'
  | 'task_detail'
  | 'contabilita'
  | 'spunti'
  | 'sicurezza'
  | 'security_events'
  | 'calendario'
  | 'profilo'
  | 'gestione_sviluppatori'

const BRAND = '#005DEF'

const navItems: { id: Page; label: string; adminOnly?: boolean; developerHidden?: boolean }[] = [
  { id: 'dashboard',             label: 'Dashboard' },
  { id: 'clienti',               label: 'Clienti',             developerHidden: true },
  { id: 'progetti',              label: 'Progetti' },
  { id: 'task',                  label: 'Task' },
  { id: 'contabilita',           label: 'Contabilità',         developerHidden: true },
  { id: 'spunti',                label: 'Spunti' },
  { id: 'sicurezza',             label: 'Sicurezza',           developerHidden: true },
  { id: 'security_events',       label: 'Security Events',     adminOnly: true },
  { id: 'calendario',            label: 'Calendario' },
  { id: 'gestione_sviluppatori', label: 'Sviluppatori',        adminOnly: true },
  { id: 'profilo',               label: 'Area Privata' },
]

interface SidebarProps {
  current: Page
  onChange: (p: Page) => void
  onClose?: () => void
}

export const Sidebar = ({ current, onChange, onClose }: SidebarProps) => {
  const { role, loading: roleLoading } = useCurrentRole()
  const isAdmin = role === 'admin'
  const isDeveloper = role === 'developer'

  const visibleItems = navItems.filter(n => {
    if (n.adminOnly && !isAdmin) return false
    if (n.developerHidden && isDeveloper) return false
    return true
  })

  // While role is loading, show all non-adminOnly items to avoid flicker
  const displayItems = roleLoading
    ? navItems.filter(n => !n.adminOnly)
    : visibleItems

  const isMobileDrawer = !!onClose

  return (
    <aside style={{
      width: isMobileDrawer ? 'min(240px, 85vw)' : 240,
      flexShrink: 0,
      backgroundColor: BRAND,
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
    }}>
      {/* Logo + close button */}
      <div style={{
        padding: '0 16px',
        borderBottom: '1px solid rgba(255,255,255,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 56,
        flexShrink: 0,
      }}>
        <img src={logoWordmark} alt="Agentics" style={{ height: 22, display: 'block' }} />
        {isMobileDrawer && (
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.7)', padding: '6px',
              display: 'flex', alignItems: 'center', borderRadius: 6,
            }}
          >
            <X style={{ width: 18, height: 18 }} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{
        flex: 1,
        padding: '12px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        overflowY: 'auto',
      }}>
        {displayItems.map(({ id, label }) => {
          const active =
            current === id ||
            (id === 'clienti'   && current === 'cliente_detail') ||
            (id === 'progetti'  && current === 'progetto_detail') ||
            (id === 'task'      && current === 'task_detail')
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '11px 14px',
                width: '100%',
                textAlign: 'left',
                background: active ? 'rgba(255,255,255,0.2)' : 'transparent',
                color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                border: active ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: active ? 600 : 400,
                letterSpacing: '0.02em',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                if (!active) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.color = '#fff'
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.65)'
                }
              }}
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
            padding: '11px 14px', width: '100%',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.5)', fontSize: '14px',
            transition: 'color 0.15s', borderRadius: 8,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
        >
          <LogOut style={{ width: 16, height: 16 }} />
          Esci
        </button>
      </div>
    </aside>
  )
}

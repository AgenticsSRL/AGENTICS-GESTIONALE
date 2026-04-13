import { LogOut, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCurrentRole, useT } from '../../hooks/useCurrentRole'
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
  | 'hr'
  | 'calendario'
  | 'profilo'
  | 'gestione_sviluppatori'
  | 'gestione_utenti'

const BRAND = '#005DEF'

const navItemI18nKey: Record<string, string> = {
  dashboard: 'nav.dashboard',
  clienti: 'nav.clienti',
  progetti: 'nav.progetti',
  task: 'nav.task',
  contabilita: 'nav.contabilita',
  spunti: 'nav.spunti',
  sicurezza: 'nav.sicurezza',
  security_events: 'nav.security_events',
  hr: 'nav.hr',
  calendario: 'nav.calendario',
  profilo: 'nav.profilo',
  gestione_sviluppatori: 'nav.sviluppatori',
  gestione_utenti: 'nav.gestione_utenti',
}

const navItems: { id: Page; adminOnly?: boolean; developerHidden?: boolean }[] = [
  { id: 'dashboard' },
  { id: 'clienti',               developerHidden: true },
  { id: 'progetti' },
  { id: 'task' },
  { id: 'contabilita',           developerHidden: true },
  { id: 'spunti' },
  { id: 'sicurezza',             developerHidden: true },
  { id: 'security_events',       adminOnly: true },
  { id: 'hr',                    developerHidden: true },
  { id: 'calendario' },
  { id: 'gestione_sviluppatori', adminOnly: true },
  { id: 'gestione_utenti',       adminOnly: true },
  { id: 'profilo' },
]

interface SidebarProps {
  current: Page
  onChange: (p: Page) => void
  onClose?: () => void
}

export const Sidebar = ({ current, onChange, onClose }: SidebarProps) => {
  const { role, loading: roleLoading } = useCurrentRole()
  const t = useT()
  const isAdmin = role === 'admin'
  const isDeveloper = role === 'developer'

  const visibleItems = navItems.filter(n => {
    if (n.adminOnly && !isAdmin) return false
    if (n.developerHidden && isDeveloper) return false
    return true
  })

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

      <nav style={{
        flex: 1,
        padding: '12px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        overflowY: 'auto',
      }}>
        {displayItems.map(({ id }) => {
          const label = t(navItemI18nKey[id] ?? id)
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
          {t('nav.logout')}
        </button>
      </div>
    </aside>
  )
}

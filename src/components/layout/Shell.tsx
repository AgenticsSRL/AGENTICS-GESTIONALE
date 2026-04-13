import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Sidebar, type Page } from './Sidebar'
import { Dashboard }                 from '../../pages/Dashboard'
import { ClientiPage }               from '../../pages/ClientiPage'
import { ClienteDetailPage }         from '../../pages/ClienteDetailPage'
import { ProgettiPage }              from '../../pages/ProgettiPage'
import { ProgettoDetailPage }        from '../../pages/ProgettoDetailPage'
import { TaskPage }                  from '../../pages/TaskPage'
import { TaskDetailPage }            from '../../pages/TaskDetailPage'
import { ContabilitaPage }           from '../../pages/ContabilitaPage'
import { SpuntiPage }                from '../../pages/SpuntiPage'
import { SicurezzaPage }             from '../../pages/SicurezzaPage'
import { SecurityEventsPage }        from '../../pages/SecurityEventsPage'
import { CalendarioPage }            from '../../pages/CalendarioPage'
import { ProfiloPage }               from '../../pages/ProfiloPage'
import { GestioneSviluppatoriPage }  from '../../pages/GestioneSviluppatoriPage'
import { GestioneUtentiPage }        from '../../pages/GestioneUtentiPage'
import { HRPage }                    from '../../pages/HRPage'
import { ChangePasswordPage }        from '../../pages/ChangePasswordPage'
import { useIdleTimeout }            from '../../hooks/useIdleTimeout'
import { useIsMobile }               from '../../hooks/useIsMobile'
import { useCurrentRole, useT, clearRoleCache } from '../../hooks/useCurrentRole'

const BRAND = '#005DEF'

export const Shell = () => {
  useIdleTimeout()
  const isMobile = useIsMobile()
  const { role, mustChangePassword, loading: roleLoading } = useCurrentRole()
  const t = useT()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [page, setPage] = useState<Page>('dashboard')
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null)
  const [selectedProgettoId, setSelectedProgettoId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  // Developer first-login: show password change screen
  if (!roleLoading && role === 'developer' && mustChangePassword) {
    return (
      <ChangePasswordPage
        onDone={() => {
          clearRoleCache()
          window.location.reload()
        }}
      />
    )
  }

  const navigateToCliente = (id: string) => {
    setSelectedClienteId(id)
    setPage('cliente_detail')
  }

  const navigateToProgetto = (id: string) => {
    setSelectedProgettoId(id)
    setPage('progetto_detail')
  }

  const navigateToTask = (id: string) => {
    setSelectedTaskId(id)
    setPage('task_detail')
  }

  const handlePageChange = (p: Page) => {
    setPage(p)
    setSidebarOpen(false)
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard':              return <Dashboard onNavigate={setPage} />
      case 'clienti':                return <ClientiPage onViewCliente={navigateToCliente} />
      case 'cliente_detail':         return selectedClienteId
        ? <ClienteDetailPage clienteId={selectedClienteId} onBack={() => setPage('clienti')} />
        : null
      case 'progetti':               return <ProgettiPage onViewProgetto={navigateToProgetto} />
      case 'progetto_detail':        return selectedProgettoId
        ? <ProgettoDetailPage progettoId={selectedProgettoId} onBack={() => setPage('progetti')} />
        : null
      case 'task':                   return <TaskPage onViewTask={navigateToTask} />
      case 'task_detail':            return selectedTaskId
        ? <TaskDetailPage taskId={selectedTaskId} onBack={() => setPage('task')} onNavigateToProgetto={navigateToProgetto} />
        : null
      case 'contabilita':            return <ContabilitaPage />
      case 'spunti':                 return <SpuntiPage />
      case 'sicurezza':              return <SicurezzaPage />
      case 'security_events':        return <SecurityEventsPage />
      case 'calendario':             return <CalendarioPage />
      case 'profilo':                return <ProfiloPage />
      case 'gestione_sviluppatori':  return <GestioneSviluppatoriPage />
      case 'gestione_utenti':        return <GestioneUtentiPage />
      case 'hr':                     return <HRPage />
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F4F6F9' }}>

      {/* Overlay mobile */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 40,
            backgroundColor: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* Sidebar */}
      <div style={isMobile ? {
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        willChange: 'transform',
      } : {}}>
        <Sidebar current={page} onChange={handlePageChange} onClose={isMobile ? () => setSidebarOpen(false) : undefined} />
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        marginLeft: isMobile ? 0 : undefined,
      }}>
        {/* Header */}
        <header style={{
          backgroundColor: '#fff',
          borderBottom: '1px solid #E5E7EB',
          padding: isMobile ? '0 16px' : '0 32px',
          height: 56,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: 30,
        }}>
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(true)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px', margin: '-8px',
                color: BRAND, display: 'flex', alignItems: 'center',
                borderRadius: 6,
              }}
            >
              <Menu style={{ width: 22, height: 22 }} />
            </button>
          )}
          <h1 style={{
            margin: 0,
            fontSize: isMobile ? '13px' : '14px',
            fontWeight: 700,
            color: '#1A2332',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            {t(`page.${page}`)}
          </h1>
        </header>

        {/* Main */}
        <main style={{
          flex: 1,
          padding: isMobile ? '16px' : '32px',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}>
          {renderPage()}
        </main>
      </div>
    </div>
  )
}

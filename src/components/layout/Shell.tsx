import { useState } from 'react'
import { Sidebar, type Page } from './Sidebar'
import { Dashboard }           from '../../pages/Dashboard'
import { ClientiPage }         from '../../pages/ClientiPage'
import { ClienteDetailPage }   from '../../pages/ClienteDetailPage'
import { ProgettiPage }        from '../../pages/ProgettiPage'
import { ProgettoDetailPage }  from '../../pages/ProgettoDetailPage'
import { TaskPage }            from '../../pages/TaskPage'
import { ContabilitaPage }     from '../../pages/ContabilitaPage'
import { SicurezzaPage }       from '../../pages/SicurezzaPage'
import { SecurityEventsPage }  from '../../pages/SecurityEventsPage'
import { CalendarioPage }     from '../../pages/CalendarioPage'
import { ProfiloPage }         from '../../pages/ProfiloPage'
import { useIdleTimeout }      from '../../hooks/useIdleTimeout'

const pageTitle: Record<Page, string> = {
  dashboard:        'Dashboard',
  clienti:          'Clienti',
  cliente_detail:   'Dettaglio Cliente',
  progetti:         'Progetti',
  progetto_detail:  'Dettaglio Progetto',
  task:             'Task',
  contabilita:      'Contabilità',
  sicurezza:        'Sicurezza',
  security_events:  'Security Events',
  calendario:       'Calendario',
  profilo:          'Area Privata',
}

export const Shell = () => {
  useIdleTimeout()
  const [page, setPage] = useState<Page>('dashboard')
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null)
  const [selectedProgettoId, setSelectedProgettoId] = useState<string | null>(null)

  const navigateToCliente = (id: string) => {
    setSelectedClienteId(id)
    setPage('cliente_detail')
  }

  const navigateToProgetto = (id: string) => {
    setSelectedProgettoId(id)
    setPage('progetto_detail')
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard':       return <Dashboard onNavigate={setPage} />
      case 'clienti':         return <ClientiPage onViewCliente={navigateToCliente} />
      case 'cliente_detail':  return selectedClienteId
        ? <ClienteDetailPage clienteId={selectedClienteId} onBack={() => setPage('clienti')} />
        : null
      case 'progetti':        return <ProgettiPage onViewProgetto={navigateToProgetto} />
      case 'progetto_detail': return selectedProgettoId
        ? <ProgettoDetailPage progettoId={selectedProgettoId} onBack={() => setPage('progetti')} />
        : null
      case 'task':            return <TaskPage />
      case 'contabilita':     return <ContabilitaPage />
      case 'sicurezza':       return <SicurezzaPage />
      case 'security_events': return <SecurityEventsPage />
      case 'calendario':      return <CalendarioPage />
      case 'profilo':         return <ProfiloPage />
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F4F6F9' }}>
      <Sidebar current={page} onChange={setPage} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <header style={{
          backgroundColor: '#fff',
          borderBottom: '1px solid #E5E7EB',
          padding: '0 32px',
          height: 56,
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          {page !== 'dashboard' && (
            <h1 style={{
              margin: 0,
              fontSize: '14px',
              fontWeight: 700,
              color: '#1A2332',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              {pageTitle[page]}
            </h1>
          )}
        </header>

        {/* Content */}
        <main style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          {renderPage()}
        </main>
      </div>
    </div>
  )
}

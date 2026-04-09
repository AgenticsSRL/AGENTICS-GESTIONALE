import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useIsMobile } from '../../hooks/useIsMobile'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: string
}

export const Modal = ({ open, onClose, title, children, width = '480px' }: ModalProps) => {
  const isMobile = useIsMobile()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  if (isMobile) {
    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'flex-end',
        }}
        onClick={onClose}
      >
        <div
          style={{
            backgroundColor: '#fff',
            width: '100%',
            maxHeight: '92vh',
            overflowY: 'auto',
            borderRadius: '16px 16px 0 0',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
            animation: 'slideUp 0.25s cubic-bezier(0.4,0,0.2,1)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Handle */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB' }} />
          </div>

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px 14px',
            borderBottom: '1px solid #E5E7EB',
          }}>
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1A2332', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {title}
            </h2>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: '4px', display: 'flex', borderRadius: 6 }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '20px 20px 40px' }}>
            {children}
          </div>
        </div>

        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to   { transform: translateY(0); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        backgroundColor: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#fff',
          width: '100%',
          maxWidth: width,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          borderRadius: 4,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid #E5E7EB',
        }}>
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1A2332', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: '2px', display: 'flex' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { X, ChevronDown, Search } from 'lucide-react'
import type { OrgMember } from '../../types'

const BRAND = '#005DEF'

interface UserPickerProps {
  value: string[]
  onChange: (emails: string[]) => void
  members: OrgMember[]
  placeholder?: string
  single?: boolean  // se true: picker a selezione singola (come assegnatario)
}

function displayName(m: OrgMember): string {
  const full = [m.nome, m.cognome].filter(Boolean).join(' ')
  return full || m.email
}

export const UserPicker = ({ value, onChange, members, placeholder = 'Cerca utente...', single = false }: UserPickerProps) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = members.filter(m => {
    const q = search.toLowerCase()
    return (
      m.email.toLowerCase().includes(q) ||
      (m.nome ?? '').toLowerCase().includes(q) ||
      (m.cognome ?? '').toLowerCase().includes(q)
    )
  })

  const toggle = (email: string) => {
    if (single) {
      onChange(value[0] === email ? [] : [email])
      setOpen(false)
      setSearch('')
    } else {
      if (value.includes(email)) {
        onChange(value.filter(e => e !== email))
      } else {
        onChange([...value, email])
      }
    }
  }

  const remove = (email: string, ev: React.MouseEvent) => {
    ev.stopPropagation()
    onChange(value.filter(e => e !== email))
  }

  const memberByEmail = (email: string) => members.find(m => m.email === email)

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Selected chips + trigger */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          minHeight: 40,
          borderBottom: `1.5px solid ${open ? BRAND : '#E5E7EB'}`,
          cursor: 'pointer',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 4,
          paddingBottom: 4,
          paddingTop: 2,
        }}
      >
        {value.length === 0 && (
          <span style={{ fontSize: 13, color: '#9CA3AF', flex: 1 }}>{placeholder}</span>
        )}
        {value.map(email => {
          const m = memberByEmail(email)
          return (
            <span
              key={email}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: '#EFF6FF', border: '1px solid #BFDBFE',
                borderRadius: 3, padding: '2px 8px',
                fontSize: 11, fontWeight: 600, color: BRAND,
              }}
            >
              {m ? displayName(m) : email}
              <X
                style={{ width: 10, height: 10, cursor: 'pointer', color: '#94A3B8' }}
                onClick={e => remove(email, e)}
              />
            </span>
          )
        })}
        <ChevronDown
          style={{
            width: 14, height: 14, color: '#9CA3AF', marginLeft: 'auto',
            transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s',
          }}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
            background: '#fff', border: '1px solid #E5E7EB',
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            maxHeight: 220, overflowY: 'auto',
          }}
        >
          {/* Search */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Search style={{ width: 12, height: 12, color: '#9CA3AF', flexShrink: 0 }} />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca..."
              onClick={e => e.stopPropagation()}
              style={{
                flex: 1, border: 'none', outline: 'none',
                fontSize: 12, color: '#1A2332', background: 'transparent',
              }}
            />
          </div>

          {filtered.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: 12, color: '#9CA3AF' }}>Nessun utente trovato</div>
          )}

          {filtered.map(m => {
            const selected = value.includes(m.email)
            return (
              <div
                key={m.id}
                onClick={() => toggle(m.email)}
                style={{
                  padding: '9px 14px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: selected ? '#EFF6FF' : '#fff',
                  borderBottom: '1px solid #F9FAFB',
                }}
                onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#F9FAFB' }}
                onMouseLeave={e => { e.currentTarget.style.background = selected ? '#EFF6FF' : '#fff' }}
              >
                {/* Avatar placeholder */}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: selected ? BRAND : '#E5E7EB',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: selected ? '#fff' : '#6C7F94',
                  flexShrink: 0,
                }}>
                  {(m.nome?.[0] ?? m.email[0]).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2332' }}>{displayName(m)}</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF' }}>{m.email}</div>
                </div>
                {selected && (
                  <div style={{ marginLeft: 'auto', width: 16, height: 16, background: BRAND, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                      <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

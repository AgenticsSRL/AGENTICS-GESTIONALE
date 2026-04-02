import type { LucideIcon } from 'lucide-react'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}

export const EmptyState = ({ title, description, action }: EmptyStateProps) => (
  <div style={{ textAlign: 'center', padding: '64px 24px', color: '#6C7F94' }}>
    <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: '15px', color: '#1A2332' }}>{title}</p>
    <p style={{ margin: '0 0 24px', fontSize: '13px' }}>{description}</p>
    {action && <Button onClick={action.onClick}>{action.label}</Button>}
  </div>
)

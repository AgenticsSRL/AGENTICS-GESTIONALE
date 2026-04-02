type Color = 'blue' | 'green' | 'yellow' | 'red' | 'gray' | 'orange' | 'purple'

interface BadgeProps {
  label: string
  color: Color
}

const colorMap: Record<Color, { bg: string; text: string; border: string }> = {
  blue:   { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  green:  { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
  yellow: { bg: '#FEFCE8', text: '#A16207', border: '#FEF08A' },
  red:    { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
  gray:   { bg: '#F9FAFB', text: '#4B5563', border: '#E5E7EB' },
  orange: { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
  purple: { bg: '#FAF5FF', text: '#7C3AED', border: '#DDD6FE' },
}

export const Badge = ({ label, color }: BadgeProps) => {
  const c = colorMap[color]
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        backgroundColor: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        borderRadius: 4,
        whiteSpace: 'nowrap',
        width: 'fit-content',
      }}
    >
      {label}
    </span>
  )
}

import type { ButtonHTMLAttributes } from 'react'

const BRAND = '#005DEF'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size    = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  as?: 'button' | 'span'
}

const styles: Record<Variant, React.CSSProperties> = {
  primary: {
    backgroundColor: BRAND,
    color: '#fff',
    border: `1.5px solid ${BRAND}`,
  },
  secondary: {
    backgroundColor: '#fff',
    color: BRAND,
    border: `1.5px solid ${BRAND}`,
  },
  ghost: {
    backgroundColor: 'transparent',
    color: '#6C7F94',
    border: '1.5px solid #E5E7EB',
  },
  danger: {
    backgroundColor: '#fff',
    color: '#DC2626',
    border: '1.5px solid #DC2626',
  },
}

const sizes: Record<Size, React.CSSProperties> = {
  sm: { padding: '5px 12px', fontSize: '12px' },
  md: { padding: '8px 18px', fontSize: '13px' },
}

export const Button = ({ variant = 'primary', size = 'md', style, disabled, children, as: Tag = 'button', ...props }: ButtonProps) => {
  const combined: React.CSSProperties = {
    ...styles[variant],
    ...sizes[size],
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'opacity 0.15s',
    whiteSpace: 'nowrap',
    ...style,
  }

  if (Tag === 'span') {
    return <span style={combined}>{children}</span>
  }

  return (
    <button disabled={disabled} style={combined} {...props}>
      {children}
    </button>
  )
}

const BRAND = '#005DEF'

interface FormFieldProps {
  label: string
  required?: boolean
  children: React.ReactNode
  hint?: string
  error?: string
}

export const FormField = ({ label, required, children, hint, error }: FormFieldProps) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
    <label style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>
      {label}{required && <span style={{ color: '#DC2626', marginLeft: 2 }}>*</span>}
    </label>
    {children}
    {error && <span style={{ fontSize: '11px', color: '#DC2626' }}>{error}</span>}
    {hint && !error && <span style={{ fontSize: '11px', color: '#9CA3AF' }}>{hint}</span>}
  </div>
)

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode
}
interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const baseInput: React.CSSProperties = {
  width: '100%',
  height: '40px',
  fontSize: '13px',
  border: 'none',
  borderBottom: '1.5px solid #E5E7EB',
  outline: 'none',
  backgroundColor: 'transparent',
  color: '#1A2332',
  padding: '0 0 4px 0',
}

export const Input = ({ style, onFocus, onBlur, ...props }: InputProps) => (
  <input
    style={{ ...baseInput, ...style }}
    onFocus={e => { e.currentTarget.style.borderColor = BRAND; onFocus?.(e) }}
    onBlur={e => { e.currentTarget.style.borderColor = '#E5E7EB'; onBlur?.(e) }}
    {...props}
  />
)

export const Select = ({ children, style, onFocus, onBlur, ...props }: SelectProps) => (
  <select
    style={{ ...baseInput, cursor: 'pointer', ...style }}
    onFocus={e => { e.currentTarget.style.borderColor = BRAND; onFocus?.(e) }}
    onBlur={e => { e.currentTarget.style.borderColor = '#E5E7EB'; onBlur?.(e) }}
    {...props}
  >
    {children}
  </select>
)

export const TextArea = ({ style, onFocus, onBlur, ...props }: TextAreaProps) => (
  <textarea
    style={{
      width: '100%',
      minHeight: '80px',
      fontSize: '13px',
      border: '1.5px solid #E5E7EB',
      outline: 'none',
      backgroundColor: 'transparent',
      color: '#1A2332',
      padding: '8px',
      resize: 'vertical',
      fontFamily: 'inherit',
      ...style,
    }}
    onFocus={e => { e.currentTarget.style.borderColor = BRAND; onFocus?.(e) }}
    onBlur={e => { e.currentTarget.style.borderColor = '#E5E7EB'; onBlur?.(e) }}
    {...props}
  />
)

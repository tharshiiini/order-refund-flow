import type { ButtonHTMLAttributes } from 'react'


type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const styles: Record<Variant, string> = {
  primary:
    'bg-brand text-white hover:bg-brand/90 disabled:bg-brand/40 disabled:text-white/80',
  secondary:
    'bg-white text-ink border border-line hover:bg-soft disabled:opacity-50',
  ghost: 'bg-transparent text-ink hover:bg-soft disabled:opacity-40',
  danger: 'bg-slate-700 text-white hover:bg-slate-800 disabled:bg-slate-700/40',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
}

export function Button({ className, variant = 'primary', type = 'button', ...props }: Props) {
  return (
    <button
      type={type}
      className={`
        inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none
        ${styles[variant]}
        ${className}
      `}
      {...props}
    />
  )
}

import { cn } from '@/lib/utils'

type Variant = 'idle' | 'ok' | 'warn' | 'err'

export function StatusChip({
  children,
  variant = 'idle',
  pulse = false,
  className,
}: {
  children: React.ReactNode
  variant?: Variant
  pulse?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap',
        variant === 'idle' && 'border-border bg-secondary text-muted-foreground',
        variant === 'ok' && 'border-success/40 bg-success/10 text-success',
        variant === 'warn' && 'border-warning/40 bg-warning/10 text-warning',
        variant === 'err' && 'border-destructive/50 bg-destructive/10 text-destructive',
        pulse && 'animate-pulse',
        className
      )}
    >
      {children}
    </span>
  )
}

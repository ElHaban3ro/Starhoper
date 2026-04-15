import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function CardSection({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <Card className={cn('bg-card/80 backdrop-blur-sm', className)}>
      <CardHeader className="flex-row items-baseline justify-between gap-2 py-3 px-4 border-b border-border">
        <div>
          <CardTitle className="text-sm font-semibold leading-none">{title}</CardTitle>
          {subtitle && <p className="mt-1 text-[11px] text-muted-foreground leading-none">{subtitle}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent className={cn('p-4', bodyClassName)}>{children}</CardContent>
    </Card>
  )
}

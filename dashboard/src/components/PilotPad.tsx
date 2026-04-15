import { usePilotInput, type Axis, type Dir } from '@/hooks/usePilotInput'
import { cn } from '@/lib/utils'

interface PKeyProps {
  axis: Axis
  dir: Dir
  children: React.ReactNode
  active: Set<string>
  onDown: (axis: Axis, dir: Dir) => void
  onUp: (axis: Axis, dir: Dir) => void
  className?: string
}

function PKey({ axis, dir, children, active, onDown, onUp, className }: PKeyProps) {
  const key = `${axis}:${dir}`
  const on = active.has(key)
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center min-w-[42px] h-10 px-3 rounded-md border text-sm font-semibold cursor-pointer transition-all select-none',
        on
          ? 'bg-primary text-primary-foreground border-primary translate-y-[1px]'
          : 'bg-secondary text-foreground border-border hover:bg-accent',
        className
      )}
      onMouseDown={(e) => {
        e.preventDefault()
        onDown(axis, dir)
      }}
      onMouseUp={() => onUp(axis, dir)}
      onMouseLeave={() => on && onUp(axis, dir)}
      onTouchStart={(e) => {
        e.preventDefault()
        onDown(axis, dir)
      }}
      onTouchEnd={() => onUp(axis, dir)}
    >
      {children}
    </button>
  )
}

export function PilotPad() {
  const { active, onMouseDown, onMouseUp } = usePilotInput()
  const p = { active, onDown: onMouseDown, onUp: onMouseUp }

  return (
    <div>
      <div className="grid grid-cols-[auto_1fr_auto] gap-4 items-center select-none">
        <div className="flex flex-col gap-1.5 items-center">
          <PKey axis="throttle" dir={1} {...p}>↑ Climb</PKey>
          <PKey axis="throttle" dir={-1} {...p}>↓ Descend</PKey>
        </div>
        <div className="flex flex-col gap-1.5 items-center">
          <PKey axis="pitch" dir={1} {...p}>W</PKey>
          <div className="flex gap-1.5">
            <PKey axis="roll" dir={-1} {...p}>A</PKey>
            <PKey axis="pitch" dir={-1} {...p}>S</PKey>
            <PKey axis="roll" dir={1} {...p}>D</PKey>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 items-center">
          <PKey axis="yaw" dir={-1} {...p}>⟲ Q</PKey>
          <PKey axis="yaw" dir={1} {...p}>⟳ E</PKey>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Click &amp; hold, or use keyboard (WASD, QE, ↑↓).
      </p>
    </div>
  )
}

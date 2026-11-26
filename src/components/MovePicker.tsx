import type { LucideIcon } from 'lucide-react'
import { Gem, Hand, Scissors } from 'lucide-react'
import { MOVE_LABEL, Move } from '@/lib/rps'

export const MOVE_ICON: Record<number, LucideIcon> = {
  [Move.Rock]: Gem,
  [Move.Paper]: Hand,
  [Move.Scissors]: Scissors,
}

const CHOICES = [Move.Rock, Move.Paper, Move.Scissors] as const

export function MoveBadge({ move, size = 'md' }: { move: number; size?: 'md' | 'lg' }) {
  const Icon = MOVE_ICON[move]
  const box = size === 'lg' ? 'size-16' : 'size-12'
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`glass-inner flex ${box} items-center justify-center rounded-2xl`}>
        {Icon ? <Icon className={size === 'lg' ? 'size-7' : 'size-5'} /> : <span className="text-lg">?</span>}
      </span>
      <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
        {MOVE_LABEL[move] ?? 'Hidden'}
      </span>
    </div>
  )
}

interface PickerProps {
  value: number | null
  onChange: (move: number) => void
  disabled?: boolean
}

export function MovePicker({ value, onChange, disabled }: PickerProps) {
  return (
    <div role="radiogroup" aria-label="Choose your move" className="grid grid-cols-3 gap-2">
      {CHOICES.map((move) => {
        const Icon = MOVE_ICON[move]
        const active = value === move
        return (
          <button
            key={move}
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(move)}
            className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl transition-all disabled:opacity-50"
            style={{
              background: active ? 'var(--accent)' : 'rgba(255,255,255,0.58)',
              color: active ? '#fff' : 'var(--ink)',
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              transform: active ? 'translateY(-2px)' : undefined,
            }}
          >
            <Icon className="size-7" />
            <span className="text-sm font-semibold">{MOVE_LABEL[move]}</span>
          </button>
        )
      })}
    </div>
  )
}

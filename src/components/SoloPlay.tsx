import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { MoveBadge, MovePicker } from '@/components/MovePicker'
import { Move, formatFormat, roundOutcome } from '@/lib/rps'

type Format = 1 | 3
interface Record3 {
  w: number
  l: number
  d: number
}
interface RoundResult {
  mine: number
  cpu: number
  outcome: 'win' | 'lose' | 'tie'
}

const RECORD_KEY = 'rps:solo:record'

function loadRecord(): Record3 {
  try {
    const raw = localStorage.getItem(RECORD_KEY)
    if (raw) return JSON.parse(raw) as Record3
  } catch {
    // ignore corrupt storage
  }
  return { w: 0, l: 0, d: 0 }
}

function randomCpuMove(): number {
  const [n] = crypto.getRandomValues(new Uint32Array(1))
  return Move.Rock + (n % 3)
}

const OUTCOME_COPY = { win: 'You win the round', lose: 'Computer wins the round', tie: 'Tie. Throw again' } as const

/** Free practice against the computer. No wallet, no USDC, nothing onchain. */
export function SoloPlay() {
  const [format, setFormat] = useState<Format>(1)
  const [pick, setPick] = useState<number | null>(null)
  const [mine, setMine] = useState(0)
  const [cpu, setCpu] = useState(0)
  const [last, setLast] = useState<RoundResult | null>(null)
  const [record, setRecord] = useState<Record3>(loadRecord)

  const needed = (format + 1) / 2
  const over = mine >= needed || cpu >= needed

  const reset = (next?: Format) => {
    if (next) setFormat(next)
    setMine(0)
    setCpu(0)
    setLast(null)
    setPick(null)
  }

  const throwMove = () => {
    if (pick === null || over) return
    const cpuMove = randomCpuMove()
    const outcome = roundOutcome(pick, cpuMove)
    const nextMine = mine + (outcome === 'win' ? 1 : 0)
    const nextCpu = cpu + (outcome === 'lose' ? 1 : 0)
    setMine(nextMine)
    setCpu(nextCpu)
    setLast({ mine: pick, cpu: cpuMove, outcome })
    setPick(null)
    if (nextMine >= needed || nextCpu >= needed) {
      const next = { ...record, w: record.w + (nextMine >= needed ? 1 : 0), l: record.l + (nextCpu >= needed ? 1 : 0) }
      setRecord(next)
      localStorage.setItem(RECORD_KEY, JSON.stringify(next))
    }
  }

  return (
    <section className="glass-card overflow-hidden rounded-3xl">
      <div className="h-1" style={{ background: 'var(--spectral)' }} />
      <div className="space-y-5 p-5">
        <div>
          <h1 className="display text-balance text-2xl font-bold">Practice against the computer</h1>
          <p className="mt-1 text-pretty text-sm" style={{ color: 'var(--muted)' }}>
            Play alone, any time. No wallet and no USDC needed. Nothing here is onchain.
          </p>
        </div>

        <div role="radiogroup" aria-label="Match format" className="grid grid-cols-2 gap-2">
          {([1, 3] as const).map((value) => {
            const active = format === value
            return (
              <button
                key={value}
                role="radio"
                aria-checked={active}
                onClick={() => reset(value)}
                className="min-h-12 rounded-2xl px-3 text-sm font-semibold transition-colors"
                style={{
                  background: active ? 'var(--accent)' : 'rgba(255,255,255,0.58)',
                  color: active ? '#fff' : 'var(--ink)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {formatFormat(value)}
              </button>
            )
          })}
        </div>

        <div className="glass-inner flex items-center gap-2 rounded-2xl px-3 py-4">
          <div className="flex-1 text-center">
            <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>You</div>
            <div className="display text-4xl font-bold tabular-nums">{mine}</div>
          </div>
          <span className="text-xs font-bold" style={{ color: 'var(--subtle)' }}>VS</span>
          <div className="flex-1 text-center">
            <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Computer</div>
            <div className="display text-4xl font-bold tabular-nums">{cpu}</div>
          </div>
        </div>

        {last && (
          <div className="space-y-3">
            <div className="flex justify-center gap-8">
              <MoveBadge move={last.mine} size="lg" />
              <MoveBadge move={last.cpu} size="lg" />
            </div>
            <p
              className="text-center text-sm font-semibold"
              style={{ color: last.outcome === 'win' ? 'var(--success)' : last.outcome === 'lose' ? 'var(--danger)' : 'var(--muted)' }}
            >
              {OUTCOME_COPY[last.outcome]}
            </p>
          </div>
        )}

        {over ? (
          <div className="space-y-3">
            <div className="rounded-2xl p-4 text-center" style={{ background: mine > cpu ? 'rgba(26,128,71,0.12)' : 'rgba(186,43,76,0.08)' }}>
              <div className="display text-2xl font-bold" style={{ color: mine > cpu ? 'var(--success)' : 'var(--danger)' }}>
                {mine > cpu ? 'You won the match' : 'The computer won the match'}
              </div>
            </div>
            <button onClick={() => reset()} className="btn-primary flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold">
              <RotateCcw className="size-4" /> Play again
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <MovePicker value={pick} onChange={setPick} />
            <button onClick={throwMove} disabled={pick === null} className="btn-primary min-h-12 w-full rounded-2xl text-sm font-semibold">
              {pick === null ? 'Pick a move' : 'Throw'}
            </button>
          </div>
        )}

        <p className="text-center text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
          Your record on this device: {record.w} won · {record.l} lost
        </p>
      </div>
    </section>
  )
}

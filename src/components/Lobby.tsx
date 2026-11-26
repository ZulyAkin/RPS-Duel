import { useMemo } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useRecentGames } from '@/hooks/useGames'
import { GameState, formatFormat, sameAddress, type Game } from '@/lib/rps'
import { fmtUsdc, shortAddress } from '@/lib/usdc'

function statusLabel(game: Game): { text: string; tone: 'open' | 'live' | 'done' } {
  switch (game.state) {
    case GameState.Open:
      return { text: 'Open', tone: 'open' }
    case GameState.Committing:
    case GameState.Revealing:
      return { text: 'In play', tone: 'live' }
    case GameState.Settled:
      return { text: 'Finished', tone: 'done' }
    default:
      return { text: 'Cancelled', tone: 'done' }
  }
}

function GameRow({ game, me, onOpen }: { game: Game; me?: string; onOpen: (id: bigint) => void }) {
  const status = statusLabel(game)
  const mine = sameAddress(me, game.playerA) || sameAddress(me, game.playerB)
  const canJoin = game.state === GameState.Open && !sameAddress(me, game.playerA)
  return (
    <button
      onClick={() => onOpen(game.id)}
      className="glass-inner flex min-h-16 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-white/70"
    >
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="display text-lg font-bold tabular-nums">{fmtUsdc(game.stake)} USDC</span>
          {mine && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest" style={{ background: 'rgba(18,45,69,0.08)' }}>
              You
            </span>
          )}
        </div>
        <div className="text-xs" style={{ color: 'var(--muted)' }}>
          #{game.id.toString()} · {formatFormat(game.bestOf)} · by <span className="mono">{shortAddress(game.playerA)}</span>
        </div>
      </div>
      <span
        className="rounded-full px-3 py-1 text-xs font-semibold"
        style={{
          background: status.tone === 'open' ? 'rgba(26,128,71,0.12)' : status.tone === 'live' ? 'rgba(16,97,166,0.12)' : 'rgba(18,45,69,0.06)',
          color: status.tone === 'open' ? 'var(--success)' : status.tone === 'live' ? 'var(--accent-hover)' : 'var(--muted)',
        }}
      >
        {canJoin ? 'Join' : status.text}
      </span>
      <ChevronRight className="size-4" style={{ color: 'var(--subtle)' }} />
    </button>
  )
}

export function Lobby({ onOpen }: { onOpen: (id: bigint) => void }) {
  const { address } = useAccount()
  const { games, total, isLoading } = useRecentGames(15)

  const { challenges, mine, recent } = useMemo(() => {
    const open = games.filter((g) => g.state === GameState.Open && !sameAddress(address, g.playerA))
    const own = games.filter(
      (g) => (sameAddress(address, g.playerA) || sameAddress(address, g.playerB)) && g.state !== GameState.Cancelled,
    )
    const ids = new Set([...open, ...own].map((g) => g.id))
    return { challenges: open, mine: own, recent: games.filter((g) => !ids.has(g.id) && g.state !== GameState.Open).slice(0, 5) }
  }, [games, address])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm" style={{ color: 'var(--muted)' }}>
        <Loader2 className="size-4 animate-spin" /> Loading games
      </div>
    )
  }

  if (total === 0) {
    return (
      <p className="py-6 text-center text-sm text-pretty" style={{ color: 'var(--muted)' }}>
        No games yet. Create the first one and share the link with a friend.
      </p>
    )
  }

  const section = (title: string, list: Game[]) =>
    list.length > 0 && (
      <section className="space-y-2">
        <h2 className="px-1 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>
          {title}
        </h2>
        {list.map((game) => (
          <GameRow key={game.id.toString()} game={game} me={address} onOpen={onOpen} />
        ))}
      </section>
    )

  return (
    <div className="space-y-5">
      {section('Open challenges', challenges)}
      {section('Your games', mine)}
      {section('Recent games', recent)}
    </div>
  )
}

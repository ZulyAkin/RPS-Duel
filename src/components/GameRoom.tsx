import { useEffect, useMemo, useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi } from 'viem'
import { useAccount, useWriteContract } from 'wagmi'
import { ArrowLeft, Check, Copy, Loader2, Lock, Timer } from 'lucide-react'
import { useGame, useUsdcAllowance } from '@/hooks/useGames'
import { useTxRunner } from '@/hooks/useTxRunner'
import {
  GameState, Move, RPS_ADDRESS, RPS_CHAIN_ID, ZERO_HASH, formatFormat, hashMove, isZeroAddress,
  loadMove, randomSalt, rpsAbi, saveMove, sameAddress,
} from '@/lib/rps'
import { USDC_ADDRESS, fmtUsdc, shortAddress } from '@/lib/usdc'
import { buildShareLink } from '@/lib/share'
import { MoveBadge, MovePicker } from '@/components/MovePicker'
import { TxNotice } from '@/components/TxNotice'

function useNowSeconds() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}

function formatCountdown(seconds: number): string {
  const s = Math.max(0, seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function GameRoom({ id, onBack }: { id: bigint; onBack: () => void }) {
  const { address, isConnected } = useAccount()
  const { game, isLoading, isError } = useGame(id)
  const allowance = useUsdcAllowance()
  const { writeContractAsync } = useWriteContract()
  const tx = useTxRunner()
  const now = useNowSeconds()
  const [pick, setPick] = useState<number | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string>()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    void buildShareLink(`/?game=${id.toString()}`).then((url) => {
      if (live) setInviteUrl(url)
    })
    return () => {
      live = false
    }
  }, [id])

  const view = useMemo(() => {
    if (!game) return null
    const isA = sameAddress(address, game.playerA)
    const isB = sameAddress(address, game.playerB)
    return {
      isA,
      isB,
      isPlayer: isA || isB,
      myCommit: isA ? game.commitA : game.commitB,
      myMove: isA ? game.moveA : game.moveB,
      oppMove: isA ? game.moveB : game.moveA,
      expired: game.deadline > 0n && now > Number(game.deadline),
      secondsLeft: Number(game.deadline) - now,
    }
  }, [game, address, now])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: 'var(--muted)' }}>
        <Loader2 className="size-4 animate-spin" /> Loading game #{id.toString()}
      </div>
    )
  }
  if (isError || !game || !view || !RPS_ADDRESS) {
    return (
      <div className="glass-card rounded-3xl p-6 text-center">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Game #{id.toString()} was not found.</p>
        <button onClick={onBack} className="btn-primary mt-4 min-h-11 rounded-2xl px-5 text-sm font-semibold">Back to lobby</button>
      </div>
    )
  }

  const contract = RPS_ADDRESS
  const joinTx = () =>
    writeContractAsync({ address: contract, abi: rpsAbi, functionName: 'joinGame', args: [id], chainId: RPS_CHAIN_ID })
  const cancelTx = () =>
    writeContractAsync({ address: contract, abi: rpsAbi, functionName: 'cancelOpenGame', args: [id], chainId: RPS_CHAIN_ID })
  const timeoutTx = () =>
    writeContractAsync({ address: contract, abi: rpsAbi, functionName: 'claimTimeout', args: [id], chainId: RPS_CHAIN_ID })

  const join = async () => {
    if ((allowance.data ?? 0n) < game.stake) {
      const ok = await tx.run('Allowing USDC', () =>
        writeContractAsync({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [contract, game.stake], chainId: RPS_CHAIN_ID }),
      )
      if (!ok) return
    }
    await tx.run('Joining game', joinTx)
  }

  const lockIn = async () => {
    if (pick === null || !address) return
    const salt = randomSalt()
    saveMove(address, id, game.round, { move: pick, salt })
    const hash = hashMove(id, game.round, pick, salt, address)
    const receipt = await tx.run('Locking in your move', () =>
      writeContractAsync({ address: contract, abi: rpsAbi, functionName: 'commit', args: [id, hash], chainId: RPS_CHAIN_ID }),
    )
    if (receipt) setPick(null)
  }

  const reveal = async () => {
    if (!address) return
    const saved = loadMove(address, id, game.round)
    if (!saved) return
    await tx.run('Revealing your move', () =>
      writeContractAsync({ address: contract, abi: rpsAbi, functionName: 'reveal', args: [id, saved.move as 1 | 2 | 3, saved.salt], chainId: RPS_CHAIN_ID }),
    )
  }

  const savedMove = address ? loadMove(address, id, game.round) : null
  const inPlay = game.state === GameState.Committing || game.state === GameState.Revealing
  const iCommitted = view.myCommit !== ZERO_HASH
  const iRevealed = view.myMove !== Move.None
  const pot = game.stake * 2n
  const draw = game.state === GameState.Settled && isZeroAddress(game.winner)
  const iWon = game.state === GameState.Settled && sameAddress(game.winner, address)

  const copyInvite = async () => {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const playerCell = (who: 'A' | 'B') => {
    const player = who === 'A' ? game.playerA : game.playerB
    const wins = who === 'A' ? game.winsA : game.winsB
    const mine = who === 'A' ? view.isA : view.isB
    const empty = isZeroAddress(player)
    return (
      <div className="flex-1 text-center">
        <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
          {empty ? 'Waiting' : mine ? 'You' : 'Opponent'}
        </div>
        <div className="display text-4xl font-bold tabular-nums">{empty ? '-' : wins}</div>
        <div className="mono text-[11px]" style={{ color: 'var(--subtle)' }}>{empty ? 'open seat' : shortAddress(player)}</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="size-4" /> Lobby
      </button>

      <section className="glass-card overflow-hidden rounded-3xl">
        <div className="h-1" style={{ background: 'var(--spectral)' }} />
        <div className="space-y-5 p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                Game #{id.toString()} · {formatFormat(game.bestOf)}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="display text-4xl font-bold tabular-nums">{fmtUsdc(pot)}</span>
                <span className="text-lg font-medium" style={{ color: 'var(--subtle)' }}>USDC pot</span>
              </div>
            </div>
            {inPlay && !view.expired && (
              <span className="glass-pill inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold tabular-nums">
                <Timer className="size-3" /> {formatCountdown(view.secondsLeft)}
              </span>
            )}
          </div>

          <div className="glass-inner flex items-center gap-2 rounded-2xl px-3 py-4">
            {playerCell('A')}
            <span className="text-xs font-bold" style={{ color: 'var(--subtle)' }}>VS</span>
            {playerCell('B')}
          </div>

          {inPlay && (
            <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
              Round {game.roundsPlayed + 1}
              {game.bestOf === 3 ? '. First to 2 wins. Tied rounds replay.' : '. A tie refunds both stakes.'}
            </p>
          )}

          {(game.state === GameState.Revealing || game.state === GameState.Settled) && (
            <div className="flex justify-center gap-8">
              <MoveBadge move={view.isB ? game.moveB : game.moveA} size="lg" />
              <MoveBadge move={view.isB ? game.moveA : game.moveB} size="lg" />
            </div>
          )}

          {game.state === GameState.Settled && (
            <div className="rounded-2xl p-4 text-center" style={{ background: draw ? 'rgba(18,45,69,0.06)' : iWon ? 'rgba(26,128,71,0.12)' : 'rgba(186,43,76,0.08)' }}>
              <div className="display text-2xl font-bold" style={{ color: draw ? 'var(--ink)' : iWon ? 'var(--success)' : 'var(--danger)' }}>
                {draw ? 'Draw. Stakes refunded.' : !view.isPlayer ? `${shortAddress(game.winner)} won` : iWon ? `You won ${fmtUsdc(pot)} USDC` : 'You lost this one'}
              </div>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                {view.isPlayer ? 'Winnings and refunds appear under "Ready to cash out" in the lobby.' : 'Finished game.'}
              </p>
            </div>
          )}
          {game.state === GameState.Cancelled && (
            <p className="text-center text-sm" style={{ color: 'var(--muted)' }}>This game was cancelled and the stake refunded.</p>
          )}

          {/* Actions */}
          {!isConnected && game.state !== GameState.Settled && game.state !== GameState.Cancelled && (
            <ConnectKitButton.Custom>
              {({ show }) => (
                <button onClick={show} className="btn-primary min-h-12 w-full rounded-2xl text-sm font-semibold">Connect wallet</button>
              )}
            </ConnectKitButton.Custom>
          )}

          {isConnected && game.state === GameState.Open && !view.isA && (
            <button onClick={() => void join()} disabled={tx.busy} className="btn-primary min-h-12 w-full rounded-2xl text-sm font-semibold">
              Join for {fmtUsdc(game.stake)} USDC
            </button>
          )}
          {game.state === GameState.Open && view.isA && (
            <div className="space-y-2">
              <p className="text-center text-sm" style={{ color: 'var(--muted)' }}>Waiting for an opponent. Share the link to invite someone.</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => void copyInvite()} disabled={!inviteUrl} className="btn-primary flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold">
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy invite'}
                </button>
                <button onClick={() => void tx.run('Cancelling game', cancelTx)} disabled={tx.busy} className="btn-ghost min-h-12 rounded-2xl text-sm font-semibold">
                  Cancel game
                </button>
              </div>
            </div>
          )}

          {game.state === GameState.Committing && view.isPlayer && !view.expired && (
            iCommitted ? (
              <p className="flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
                <Lock className="size-4" /> Move locked in. Waiting for your opponent.
              </p>
            ) : (
              <div className="space-y-3">
                <MovePicker value={pick} onChange={setPick} disabled={tx.busy} />
                <button onClick={() => void lockIn()} disabled={pick === null || tx.busy} className="btn-primary min-h-12 w-full rounded-2xl text-sm font-semibold">
                  {pick === null ? 'Pick a move' : 'Lock in move'}
                </button>
                <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>Your move stays hidden until both players have locked in.</p>
              </div>
            )
          )}

          {game.state === GameState.Revealing && view.isPlayer && !view.expired && (
            iRevealed ? (
              <p className="text-center text-sm" style={{ color: 'var(--muted)' }}>Revealed. Waiting for your opponent to reveal.</p>
            ) : savedMove ? (
              <button onClick={() => void reveal()} disabled={tx.busy} className="btn-primary min-h-12 w-full rounded-2xl text-sm font-semibold">
                Reveal my move
              </button>
            ) : (
              <p className="text-center text-sm" style={{ color: 'var(--danger)' }}>
                This browser has no saved move for this round. Reveal from the device that locked it in, or wait for the timer.
              </p>
            )
          )}

          {inPlay && !view.isPlayer && (
            <p className="text-center text-sm" style={{ color: 'var(--muted)' }}>You are watching this game.</p>
          )}

          {inPlay && view.isPlayer && view.expired && (
            <div className="space-y-2">
              <p className="text-center text-sm" style={{ color: 'var(--muted)' }}>Time is up for this phase. Settle it to move the funds.</p>
              <button onClick={() => void tx.run('Settling timeout', timeoutTx)} disabled={tx.busy} className="btn-primary min-h-12 w-full rounded-2xl text-sm font-semibold">
                Settle timeout
              </button>
            </div>
          )}

          <TxNotice status={tx.status} onDismiss={tx.reset} />
        </div>
      </section>
    </div>
  )
}

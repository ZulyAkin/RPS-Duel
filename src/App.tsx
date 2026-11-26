import { useCallback, useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import { ClaimBar } from '@/components/ClaimBar'
import { CreateGameCard } from '@/components/CreateGameCard'
import { Lobby } from '@/components/Lobby'
import { GameRoom } from '@/components/GameRoom'
import { SoloPlay } from '@/components/SoloPlay'
import { RPS_ADDRESS } from '@/lib/rps'

function readGameId(): bigint | undefined {
  const raw = new URLSearchParams(window.location.search).get('game')
  return raw && /^\d+$/.test(raw) ? BigInt(raw) : undefined
}

export default function App() {
  const [gameId, setGameId] = useState<bigint | undefined>(readGameId)
  const [mode, setMode] = useState<'friend' | 'solo'>('friend')

  useEffect(() => {
    const onPop = () => setGameId(readGameId())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const openGame = useCallback((id?: bigint) => {
    const url = id === undefined ? window.location.pathname : `${window.location.pathname}?game=${id.toString()}`
    window.history.pushState({}, '', url)
    setGameId(id)
  }, [])

  return (
    <div className="relative min-h-dvh overflow-hidden" style={{ background: 'var(--bg-gradient)' }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div style={{ position: 'absolute', top: '8%', left: '5%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(133,177,237,0.22) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', bottom: '8%', right: '8%', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,205,131,0.20) 0%, transparent 70%)', filter: 'blur(58px)' }} />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-4 pb-24 pt-6">
        <Header onHome={() => openGame(undefined)} />

        {gameId !== undefined && RPS_ADDRESS ? (
          <GameRoom id={gameId} onBack={() => openGame(undefined)} />
        ) : (
          <main className="space-y-5">
            <div role="tablist" aria-label="Game mode" className="glass-pill grid grid-cols-2 gap-1 rounded-full p-1">
              {(
                [
                  ['friend', 'Play for USDC'],
                  ['solo', 'Practice solo'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => setMode(value)}
                  className="min-h-11 rounded-full text-sm font-semibold transition-colors"
                  style={{
                    background: mode === value ? 'var(--accent)' : 'transparent',
                    color: mode === value ? '#fff' : 'var(--ink)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === 'solo' ? (
              <SoloPlay />
            ) : !RPS_ADDRESS ? (
              <p className="glass-card rounded-3xl p-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
                The game contract address is not configured. Set VITE_RPS_ADDRESS and restart the dev server.
              </p>
            ) : (
              <>
                <ClaimBar />
                <CreateGameCard onCreated={(id) => openGame(id)} />
                <Lobby onOpen={(id) => openGame(id)} />
              </>
            )}
          </main>
        )}
      </div>
    </div>
  )
}

import { ConnectKitButton } from 'connectkit'
import { Swords } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { useUsdcBalance } from '@/hooks/useGames'
import { fmtUsdc, shortAddress } from '@/lib/usdc'

export function Header({ onHome }: { onHome: () => void }) {
  const balance = useUsdcBalance()

  return (
    <header className="mb-6 flex items-center justify-between gap-3">
      <button onClick={onHome} className="flex min-h-11 items-center gap-2 text-left" aria-label="Back to lobby">
        <span className="flex size-9 items-center justify-center rounded-xl" style={{ background: 'var(--accent)' }}>
          <Swords className="size-5 text-white" />
        </span>
        <span className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
          RPS Duels
        </span>
      </button>

      <ConnectKitButton.Custom>
        {({ isConnected, show, address }) =>
          isConnected && address ? (
            <button
              onClick={show}
              className="glass-pill flex min-h-11 items-center gap-2 rounded-full px-3 text-xs font-semibold"
              style={{ color: 'var(--ink)' }}
            >
              <TokenUSDC variant="branded" size={16} />
              <span className="tabular-nums">{balance.data !== undefined ? fmtUsdc(balance.data) : '...'}</span>
              <span className="mono" style={{ color: 'var(--subtle)' }}>
                {shortAddress(address)}
              </span>
            </button>
          ) : (
            <button onClick={show} className="btn-primary min-h-11 rounded-full px-5 text-sm font-semibold">
              Connect wallet
            </button>
          )
        }
      </ConnectKitButton.Custom>
    </header>
  )
}

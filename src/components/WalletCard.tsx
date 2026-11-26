import { useEffect, useRef, useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { TokenUSDC } from '@web3icons/react'
import { useAccount, useDisconnect, useSwitchChain } from 'wagmi'
import { Check, Copy, Droplets, LogOut, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useUsdcBalance } from '@/hooks/useGames'
import { RPS_CHAIN_ID } from '@/lib/rps'
import { FAUCET_URL, fmtUsdc, shortAddress } from '@/lib/usdc'

/** Wallet dashboard: address, network check, live USDC balance and the test USDC faucet. */
export function WalletCard() {
  const { address, chainId, isConnected, isConnecting, isReconnecting } = useAccount()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: switching, error: switchError } = useSwitchChain()
  const balance = useUsdcBalance()
  const [copied, setCopied] = useState(false)
  const lastBalance = useRef<bigint | undefined>(undefined)

  // Tell the player when faucet USDC (or a payout) lands in their wallet.
  useEffect(() => {
    const current = balance.data
    if (current === undefined) return
    const previous = lastBalance.current
    lastBalance.current = current
    if (previous !== undefined && current > previous) {
      toast.success(`${fmtUsdc(current - previous)} USDC received`)
    }
  }, [balance.data])

  if (!isConnected || !address) {
    return (
      <section className="glass-card space-y-3 rounded-3xl p-5">
        <div>
          <h2 className="display text-lg font-bold">Your wallet</h2>
          <p className="mt-1 text-pretty text-sm" style={{ color: 'var(--muted)' }}>
            Connect a wallet to play, see your USDC balance and get free test USDC.
          </p>
        </div>
        <ConnectKitButton.Custom>
          {({ show }) => (
            <button
              onClick={show}
              disabled={isConnecting || isReconnecting}
              className="btn-primary min-h-12 w-full rounded-2xl text-sm font-semibold"
            >
              {isConnecting || isReconnecting ? 'Connecting...' : 'Connect wallet'}
            </button>
          )}
        </ConnectKitButton.Custom>
      </section>
    )
  }

  const wrongNetwork = chainId !== RPS_CHAIN_ID
  const empty = balance.data === 0n

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked: the address is still shown on screen
    }
  }

  return (
    <section className="glass-card space-y-4 rounded-3xl p-5">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => void copyAddress()}
          className="glass-pill mono flex min-h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold"
          aria-label="Copy wallet address"
        >
          {shortAddress(address)}
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
        <button
          onClick={() => disconnect()}
          className="flex min-h-9 items-center gap-1 px-2 text-xs font-semibold"
          style={{ color: 'var(--muted)' }}
        >
          <LogOut className="size-3" /> Disconnect
        </button>
      </div>

      <div>
        <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
          USDC balance
        </div>
        <div className="flex items-baseline gap-2">
          <TokenUSDC variant="branded" size={24} />
          <span className="display text-4xl font-bold tabular-nums">
            {balance.data !== undefined ? fmtUsdc(balance.data) : '...'}
          </span>
          <span className="text-lg font-medium" style={{ color: 'var(--subtle)' }}>
            USDC
          </span>
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
          Arc Testnet. USDC also pays for gas.
        </p>
      </div>

      {wrongNetwork && (
        <div className="space-y-2 rounded-2xl p-3" style={{ background: 'rgba(186,43,76,0.08)' }}>
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--danger)' }}>
            <TriangleAlert className="size-4 shrink-0" /> Wrong network
          </div>
          <button
            onClick={() => switchChain({ chainId: RPS_CHAIN_ID })}
            disabled={switching}
            className="btn-primary min-h-11 w-full rounded-2xl text-sm font-semibold"
          >
            {switching ? 'Check your wallet...' : 'Switch to Arc Testnet'}
          </button>
          {switchError && (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>
              Your wallet did not switch networks. Add Arc Testnet in your wallet settings and try again.
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <a
          href={FAUCET_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => void copyAddress()}
          className={`${empty ? 'btn-primary' : 'btn-ghost'} flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold`}
        >
          <Droplets className="size-4" /> Get test USDC
        </a>
        <p className="text-center text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
          Opens the Circle faucet in a new tab and copies your address. Choose Arc Testnet and USDC, paste your address,
          then come back. Your balance updates by itself.
        </p>
      </div>
    </section>
  )
}

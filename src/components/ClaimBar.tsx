import { useWriteContract } from 'wagmi'
import { Trophy } from 'lucide-react'
import { RPS_ADDRESS, RPS_CHAIN_ID, rpsAbi } from '@/lib/rps'
import { fmtUsdc } from '@/lib/usdc'
import { useClaimable } from '@/hooks/useGames'
import { useTxRunner } from '@/hooks/useTxRunner'
import { TxNotice } from '@/components/TxNotice'

/** Winnings and refunds are credited in the contract; this cashes them out to the wallet. */
export function ClaimBar() {
  const claimable = useClaimable()
  const { writeContractAsync } = useWriteContract()
  const tx = useTxRunner()
  const amount = claimable.data ?? 0n

  if (amount === 0n || !RPS_ADDRESS) return null

  const contract = RPS_ADDRESS
  const cashOut = () =>
    tx.run('Cashing out', () =>
      writeContractAsync({ address: contract, abi: rpsAbi, functionName: 'claim', chainId: RPS_CHAIN_ID }),
    )

  return (
    <section className="glass-card mb-4 space-y-3 rounded-3xl p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl" style={{ background: 'rgba(26,128,71,0.12)' }}>
          <Trophy className="size-5" style={{ color: 'var(--success)' }} />
        </span>
        <div className="flex-1">
          <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            Ready to cash out
          </div>
          <div className="display text-2xl font-bold tabular-nums">{fmtUsdc(amount)} USDC</div>
        </div>
        <button onClick={() => void cashOut()} disabled={tx.busy} className="btn-primary min-h-11 rounded-2xl px-5 text-sm font-semibold">
          Cash out
        </button>
      </div>
      <TxNotice status={tx.status} onDismiss={tx.reset} />
    </section>
  )
}

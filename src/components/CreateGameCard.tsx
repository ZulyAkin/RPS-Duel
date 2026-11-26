import { useMemo, useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi, parseEventLogs } from 'viem'
import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { RPS_ADDRESS, RPS_CHAIN_ID, rpsAbi } from '@/lib/rps'
import { FAUCET_URL, USDC_ADDRESS, fmtUsdc, parseUsdc } from '@/lib/usdc'
import { useUsdcAllowance, useUsdcBalance } from '@/hooks/useGames'
import { useTxRunner } from '@/hooks/useTxRunner'
import { TxNotice } from '@/components/TxNotice'

const QUICK_STAKES = ['1', '5', '10']
const FORMATS: { value: 1 | 3; label: string; hint: string }[] = [
  { value: 1, label: 'Single round', hint: 'One throw decides it' },
  { value: 3, label: 'Best of 3', hint: 'First to two wins' },
]

export function CreateGameCard({ onCreated }: { onCreated: (id: bigint) => void }) {
  const { isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const tx = useTxRunner()
  const balance = useUsdcBalance()
  const allowance = useUsdcAllowance()
  const minStake = useReadContract({
    address: RPS_ADDRESS,
    abi: rpsAbi,
    functionName: 'MIN_STAKE',
    chainId: RPS_CHAIN_ID,
    query: { enabled: !!RPS_ADDRESS },
  })

  const [amount, setAmount] = useState('1')
  const [bestOf, setBestOf] = useState<1 | 3>(1)

  const stake = useMemo(() => {
    try {
      return parseUsdc(amount)
    } catch {
      return null
    }
  }, [amount])

  const belowMin = stake !== null && minStake.data !== undefined && stake < minStake.data
  const insufficient = stake !== null && balance.data !== undefined && stake > balance.data
  const invalid = stake === null || stake === 0n || belowMin
  const needsAllowance = stake !== null && (allowance.data ?? 0n) < stake

  const handleCreate = async () => {
    if (stake === null || !RPS_ADDRESS) return
    const contract = RPS_ADDRESS
    if (needsAllowance) {
      const approved = await tx.run('Allowing USDC', () =>
        writeContractAsync({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [contract, stake],
          chainId: RPS_CHAIN_ID,
        }),
      )
      if (!approved) return
    }
    const receipt = await tx.run('Creating game', () =>
      writeContractAsync({
        address: contract,
        abi: rpsAbi,
        functionName: 'createGame',
        args: [stake, bestOf],
        chainId: RPS_CHAIN_ID,
      }),
    )
    if (!receipt) return
    const created = parseEventLogs({ abi: rpsAbi, eventName: 'GameCreated', logs: receipt.logs })[0]
    if (created) onCreated(created.args.id)
  }

  const label = invalid
    ? belowMin && minStake.data !== undefined
      ? `Minimum stake is ${fmtUsdc(minStake.data)} USDC`
      : 'Enter a stake'
    : insufficient
      ? 'Not enough USDC'
      : needsAllowance
        ? 'Allow USDC and create game'
        : 'Create game'

  return (
    <section className="glass-card overflow-hidden rounded-3xl">
      <div className="h-1" style={{ background: 'var(--spectral)' }} />
      <div className="space-y-4 p-5">
        <div>
          <h1 className="display text-balance text-2xl font-bold">Stake USDC. Win the pot.</h1>
          <p className="mt-1 text-pretty text-sm" style={{ color: 'var(--muted)' }}>
            Both players put in the same stake. Moves stay hidden until both have locked in.
          </p>
        </div>

        <div className="glass-inner rounded-2xl p-4">
          <label htmlFor="stake" className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            Stake per player
          </label>
          <div className="mt-1 flex items-baseline gap-2">
            <input
              id="stake"
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                const value = event.target.value.replace(/[^0-9.]/g, '')
                if (/^\d*\.?\d{0,6}$/.test(value)) setAmount(value)
              }}
              placeholder="0.00"
              className="display w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-300"
            />
            <span className="text-lg font-medium" style={{ color: 'var(--subtle)' }}>
              USDC
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {QUICK_STAKES.map((value) => (
              <button
                key={value}
                onClick={() => setAmount(value)}
                className="glass-pill min-h-9 rounded-full px-3 text-xs font-semibold"
              >
                {value} USDC
              </button>
            ))}
            {balance.data !== undefined && (
              <button
                onClick={() => setAmount(fmtUsdc(balance.data ?? 0n).replace(/,/g, ''))}
                className="ml-auto text-xs font-semibold"
                style={{ color: 'var(--accent-hover)' }}
              >
                Balance {fmtUsdc(balance.data)} · Max
              </button>
            )}
          </div>
        </div>

        <div role="radiogroup" aria-label="Match format" className="grid grid-cols-2 gap-2">
          {FORMATS.map((format) => {
            const active = bestOf === format.value
            return (
              <button
                key={format.value}
                role="radio"
                aria-checked={active}
                onClick={() => setBestOf(format.value)}
                className="min-h-14 rounded-2xl px-3 py-2 text-left transition-colors"
                style={{
                  background: active ? 'var(--accent)' : 'rgba(255,255,255,0.58)',
                  color: active ? '#fff' : 'var(--ink)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                <div className="text-sm font-semibold">{format.label}</div>
                <div className="text-xs opacity-75">{format.hint}</div>
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'var(--muted)' }}>Winner takes</span>
          <span className="display font-bold tabular-nums">{stake !== null ? fmtUsdc(stake * 2n) : '0.00'} USDC</span>
        </div>

        {isConnected ? (
          <button
            onClick={() => void handleCreate()}
            disabled={invalid || insufficient || tx.busy}
            className="btn-primary min-h-12 w-full rounded-2xl text-sm font-semibold"
          >
            {label}
          </button>
        ) : (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button onClick={show} className="btn-primary min-h-12 w-full rounded-2xl text-sm font-semibold">
                Connect wallet to play
              </button>
            )}
          </ConnectKitButton.Custom>
        )}

        {isConnected && insufficient && (
          <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
            You need more USDC for this stake.{' '}
            <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: 'var(--accent-hover)' }}>
              Get test USDC
            </a>
          </p>
        )}

        <TxNotice status={tx.status} onDismiss={tx.reset} />
        <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>
          A draw refunds both stakes. Gas is paid in USDC on Arc Testnet.
        </p>
      </div>
    </section>
  )
}

import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useSwitchChain } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import type { Hash, TransactionReceipt } from 'viem'
import { RPS_CHAIN_ID, parseOnchainError } from '@/lib/rps'

export type TxStatus =
  | { phase: 'idle'; lastHash?: Hash }
  | { phase: 'wallet'; label: string }
  | { phase: 'confirming'; label: string; hash: Hash }
  | { phase: 'error'; label: string; error: string; detail?: string }

/**
 * Runs one wallet transaction end to end: switches to Arc Testnet, asks the wallet to sign,
 * waits for the real receipt, then refreshes every live read. Only reports states it can verify.
 */
export function useTxRunner() {
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: RPS_CHAIN_ID })
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<TxStatus>({ phase: 'idle' })

  const run = useCallback(
    async (label: string, send: () => Promise<Hash>): Promise<TransactionReceipt | null> => {
      try {
        if (!publicClient) throw new Error('network unavailable')
        if (chainId !== RPS_CHAIN_ID) {
          try {
            await switchChainAsync({ chainId: RPS_CHAIN_ID })
          } catch (switchError) {
            // Some wallets cannot switch programmatically. If they are already on Arc Testnet the
            // transaction still works; otherwise the wallet rejects it with a clear message below.
            if (chainId !== undefined) throw switchError
          }
        }
        setStatus({ phase: 'wallet', label })
        const hash = await send()
        setStatus({ phase: 'confirming', label, hash })
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error('Transaction reverted')
        await queryClient.invalidateQueries()
        setStatus({ phase: 'idle', lastHash: hash })
        return receipt
      } catch (error) {
        const message = parseOnchainError(error)
        setStatus(message ? { phase: 'error', label, error: message.message, detail: message.detail } : { phase: 'idle' })
        return null
      }
    },
    [chainId, publicClient, queryClient, switchChainAsync],
  )

  const reset = useCallback(() => setStatus({ phase: 'idle' }), [])

  return { status, run, reset, busy: status.phase === 'wallet' || status.phase === 'confirming' }
}

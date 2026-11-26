import { useMemo } from 'react'
import { erc20Abi, type Address } from 'viem'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { RPS_ADDRESS, RPS_CHAIN_ID, rpsAbi, type Game } from '@/lib/rps'
import { USDC_ADDRESS } from '@/lib/usdc'

type RawGame = Omit<Game, 'id'>

const toGame = (id: bigint, raw: RawGame): Game => ({ ...raw, id })

export function useGameCount() {
  return useReadContract({
    address: RPS_ADDRESS,
    abi: rpsAbi,
    functionName: 'gameCount',
    chainId: RPS_CHAIN_ID,
    query: { enabled: !!RPS_ADDRESS, refetchInterval: 5000 },
  })
}

export function useGame(id: bigint | undefined) {
  const query = useReadContract({
    address: RPS_ADDRESS,
    abi: rpsAbi,
    functionName: 'getGame',
    args: id === undefined ? undefined : [id],
    chainId: RPS_CHAIN_ID,
    query: { enabled: !!RPS_ADDRESS && id !== undefined, refetchInterval: 3000 },
  })
  const game = useMemo(
    () => (query.data && id !== undefined ? toGame(id, query.data) : undefined),
    [query.data, id],
  )
  return { game, isLoading: query.isLoading, isError: query.isError }
}

/** The most recent games, newest first, read straight from the contract. */
export function useRecentGames(limit = 12) {
  const count = useGameCount()
  const ids = useMemo(() => {
    const total = Number(count.data ?? 0n)
    const out: bigint[] = []
    for (let i = total; i >= 1 && out.length < limit; i--) out.push(BigInt(i))
    return out
  }, [count.data, limit])

  const reads = useReadContracts({
    contracts: ids.map((id) => ({
      address: RPS_ADDRESS as Address,
      abi: rpsAbi,
      functionName: 'getGame' as const,
      args: [id] as const,
      chainId: RPS_CHAIN_ID,
    })),
    query: { enabled: !!RPS_ADDRESS && ids.length > 0, refetchInterval: 5000 },
  })

  const games = useMemo(() => {
    const out: Game[] = []
    reads.data?.forEach((entry, index) => {
      if (entry.status === 'success') out.push(toGame(ids[index], entry.result))
    })
    return out
  }, [reads.data, ids])

  return { games, total: Number(count.data ?? 0n), isLoading: count.isLoading || (ids.length > 0 && reads.isLoading) }
}

export function useClaimable() {
  const { address } = useAccount()
  return useReadContract({
    address: RPS_ADDRESS,
    abi: rpsAbi,
    functionName: 'claimableOf',
    args: address ? [address] : undefined,
    chainId: RPS_CHAIN_ID,
    query: { enabled: !!RPS_ADDRESS && !!address, refetchInterval: 5000 },
  })
}

export function useUsdcBalance() {
  const { address } = useAccount()
  return useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: RPS_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 5000 },
  })
}

export function useUsdcAllowance() {
  const { address } = useAccount()
  return useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && RPS_ADDRESS ? [address, RPS_ADDRESS] : undefined,
    chainId: RPS_CHAIN_ID,
    query: { enabled: !!address && !!RPS_ADDRESS, refetchInterval: 5000 },
  })
}

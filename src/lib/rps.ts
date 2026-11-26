import { bytesToHex, encodePacked, keccak256, type Address, type Hex } from 'viem'
import { arcTestnet } from 'viem/chains'

export const RPS_CHAIN_ID = arcTestnet.id
export const RPS_ADDRESS = import.meta.env.VITE_RPS_ADDRESS as Address | undefined

export const GameState = { Open: 0, Committing: 1, Revealing: 2, Settled: 3, Cancelled: 4 } as const
export const Move = { None: 0, Rock: 1, Paper: 2, Scissors: 3 } as const
export type MoveValue = (typeof Move)[keyof typeof Move]

const gameComponents = [
  { name: 'playerA', type: 'address' },
  { name: 'playerB', type: 'address' },
  { name: 'stake', type: 'uint128' },
  { name: 'bestOf', type: 'uint8' },
  { name: 'state', type: 'uint8' },
  { name: 'round', type: 'uint8' },
  { name: 'winsA', type: 'uint8' },
  { name: 'winsB', type: 'uint8' },
  { name: 'commitA', type: 'bytes32' },
  { name: 'commitB', type: 'bytes32' },
  { name: 'moveA', type: 'uint8' },
  { name: 'moveB', type: 'uint8' },
  { name: 'deadline', type: 'uint64' },
  { name: 'winner', type: 'address' },
  { name: 'roundsPlayed', type: 'uint8' },
] as const

export const rpsAbi = [
  { type: 'function', name: 'createGame', stateMutability: 'nonpayable', inputs: [{ name: 'stake', type: 'uint256' }, { name: 'bestOf', type: 'uint8' }], outputs: [{ name: 'id', type: 'uint256' }] },
  { type: 'function', name: 'joinGame', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'cancelOpenGame', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'commit', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }, { name: 'hash', type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'reveal', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }, { name: 'move', type: 'uint8' }, { name: 'salt', type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'claimTimeout', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'gameCount', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'claimableOf', stateMutability: 'view', inputs: [{ name: 'player', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'MIN_STAKE', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'getGame', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: gameComponents }] },
  { type: 'event', name: 'GameCreated', inputs: [{ name: 'id', type: 'uint256', indexed: true }, { name: 'playerA', type: 'address', indexed: true }, { name: 'stake', type: 'uint256', indexed: false }, { name: 'bestOf', type: 'uint8', indexed: false }] },
] as const

export interface Game {
  id: bigint
  playerA: Address
  playerB: Address
  stake: bigint
  bestOf: number
  state: number
  round: number
  winsA: number
  winsB: number
  commitA: Hex
  commitB: Hex
  moveA: number
  moveB: number
  deadline: bigint
  winner: Address
  roundsPlayed: number
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
export const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000'

export function isZeroAddress(a: string): boolean {
  return a.toLowerCase() === ZERO_ADDRESS
}

export function sameAddress(a?: string, b?: string): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

/** Same formula as RockPaperScissors.hashMove (abi.encodePacked, enum packed as uint8). */
export function hashMove(gameId: bigint, round: number, move: number, salt: Hex, player: Address): Hex {
  return keccak256(
    encodePacked(['uint256', 'uint8', 'uint8', 'bytes32', 'address'], [gameId, round, move, salt, player]),
  )
}

export function randomSalt(): Hex {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
}

interface StoredMove {
  move: number
  salt: Hex
}

const saltKey = (player: Address, gameId: bigint, round: number) =>
  `rps:move:${RPS_ADDRESS ?? 'none'}:${player.toLowerCase()}:${gameId.toString()}:${round}`

export function saveMove(player: Address, gameId: bigint, round: number, value: StoredMove): void {
  localStorage.setItem(saltKey(player, gameId, round), JSON.stringify(value))
}

export function loadMove(player: Address, gameId: bigint, round: number): StoredMove | null {
  const raw = localStorage.getItem(saltKey(player, gameId, round))
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredMove
  } catch {
    return null
  }
}

/** Rock beats scissors, scissors beats paper, paper beats rock. */
export function roundOutcome(mine: number, theirs: number): 'win' | 'lose' | 'tie' {
  if (mine === theirs) return 'tie'
  const wins =
    (mine === Move.Rock && theirs === Move.Scissors) ||
    (mine === Move.Paper && theirs === Move.Rock) ||
    (mine === Move.Scissors && theirs === Move.Paper)
  return wins ? 'win' : 'lose'
}

export const MOVE_LABEL: Record<number, string> = { 1: 'Rock', 2: 'Paper', 3: 'Scissors' }

export function formatFormat(bestOf: number): string {
  return bestOf === 3 ? 'Best of 3' : 'Single round'
}

const ERROR_COPY: Record<string, string> = {
  PhaseExpired: 'This phase has expired. Claim the timeout instead.',
  DeadlineNotPassed: 'The deadline has not passed yet.',
  InvalidState: 'This game is not in the right state for that action.',
  CommitmentMismatch: 'Your saved move does not match your commitment.',
  AlreadyCommitted: 'You already locked in a move this round.',
  AlreadyRevealed: 'You already revealed this round.',
  CannotJoinOwnGame: 'You cannot join your own game.',
  NotPlayer: 'Only the two players can do that.',
  NotCreator: 'Only the creator can cancel an open game.',
  InvalidStake: 'That stake is below the minimum.',
  NothingToClaim: 'Nothing to cash out.',
}

export function parseOnchainError(error: unknown): string | null {
  const err = error as { code?: number; shortMessage?: string; message?: string; cause?: { code?: number } } | undefined
  const message = `${err?.shortMessage ?? ''} ${err?.message ?? ''}`
  const lower = message.toLowerCase()
  if (err?.code === 4001 || err?.cause?.code === 4001 || lower.includes('user rejected') || lower.includes('user denied')) {
    return null
  }
  for (const [name, copy] of Object.entries(ERROR_COPY)) {
    if (message.includes(name)) return copy
  }
  if (lower.includes('insufficient funds') || lower.includes('exceeds balance') || lower.includes('transfer amount exceeds')) {
    return 'Insufficient USDC balance.'
  }
  if (lower.includes('network') || lower.includes('timeout')) return 'Network issue. Check your connection and retry.'
  if (lower.includes('reverted')) return 'Transaction failed. Please try again.'
  return 'Something went wrong. Please try again.'
}

import { formatUnits, parseUnits, type Address } from 'viem'
import { arcTestnet } from 'viem/chains'

/** USDC ERC-20 predeploy on Arc Testnet (6 decimals). Source: Arc docs, "Token addresses". */
export const USDC_ADDRESS: Address = '0x3600000000000000000000000000000000000000'
export const USDC_DECIMALS = 6

/** Parse a user-typed USDC amount into raw 6-decimal units. Throws on invalid input. */
export function parseUsdc(value: string): bigint {
  if (!/^\d*\.?\d*$/.test(value) || value === '' || value === '.') throw new Error('Invalid amount')
  return parseUnits(value, USDC_DECIMALS)
}

/** Format a raw USDC (ERC-20 view) amount for display with at least 2 decimals. */
export function fmtUsdc(raw: bigint): string {
  const [whole, frac = ''] = formatUnits(raw, USDC_DECIMALS).split('.')
  const trimmed = frac.replace(/0+$/, '')
  return `${Number(whole).toLocaleString('en-US')}.${trimmed.padEnd(2, '0')}`
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function txExplorerUrl(hash: string): string {
  return `${arcTestnet.blockExplorers.default.url}/tx/${hash}`
}

export const FAUCET_URL = 'https://faucet.circle.com'

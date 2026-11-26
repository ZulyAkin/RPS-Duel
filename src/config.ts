/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { getDefaultConfig } from 'connectkit'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

/**
 * Optional free project ID from https://dashboard.reown.com. Turns on WalletConnect (QR code and
 * mobile deep links for MetaMask mobile, Rainbow, Trust and more). Without it, browser wallets and
 * Coinbase Wallet still work.
 */
const walletConnectProjectId = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? ''

// ConnectKit's own connector set: MetaMask, any wallet announcing itself in the browser (Rabby, Brave,
// Phantom...), Coinbase Wallet, and WalletConnect wired for ConnectKit's QR screen.
export const config = createConfig(
  getDefaultConfig({
    chains: [arcTestnet, mainnet], // mainnet needed for ENS resolution
    transports: {
      [arcTestnet.id]: http(),
      [mainnet.id]: http(), // ENS resolution uses mainnet
    },
    walletConnectProjectId,
    appName: 'RPS Duels',
    appDescription: 'Stake USDC in rock-paper-scissors duels on Arc Testnet',
    appUrl: typeof window === 'undefined' ? 'https://studio.arc.io' : window.location.origin,
    enableAaveAccount: false,
  }),
)

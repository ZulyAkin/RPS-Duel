/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined

export const config = createConfig({
  chains: [arcTestnet, mainnet], // mainnet needed for ENS resolution
  connectors: [
    // Browser extensions and in-app wallet browsers (MetaMask, Rabby, Brave, Phantom, ...), found automatically
    injected(),
    // Coinbase Wallet, including its mobile app
    coinbaseWallet({ appName: 'RPS Duels' }),
    // 300+ mobile and desktop wallets via QR code or deep link (MetaMask mobile, Rainbow, Trust, ...)
    ...(walletConnectProjectId ? [walletConnect({ projectId: walletConnectProjectId })] : []),
  ],
  transports: {
    [arcTestnet.id]: http(),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})

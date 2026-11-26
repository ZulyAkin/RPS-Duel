# RPS Duels

A two-player rock-paper-scissors game where both players stake the same amount of USDC on Arc Testnet and the winner takes the pot. Players choose any stake and play a single round or best of three. Moves stay hidden until both players have locked in, and a draw refunds both stakes. A free solo practice mode lets you play the computer without a wallet.

Built with [Arc Studio](https://studio.arc.io)

## Tech stack

- React, TypeScript, Vite, Tailwind CSS
- wagmi, viem and ConnectKit for wallet connection
- Solidity smart contract (Foundry) on Arc Testnet, with USDC as the stake token

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://book.getfoundry.sh).

```bash
bun install
cp .env.example .env
bun run dev
```

### Environment variables

- `VITE_RPS_ADDRESS`: address of the deployed game contract on Arc Testnet (see `.env.example`).
- `VITE_WALLETCONNECT_PROJECT_ID` (optional): free project ID from [Reown](https://dashboard.reown.com). Adds WalletConnect so players can connect MetaMask mobile, Rainbow, Trust and 300+ more wallets. Without it, players can still use browser extension wallets (MetaMask, Rabby, Brave) and Coinbase Wallet.

### Scripts

- `bun run dev`: start the app locally.
- `bun run lint` and `bun run typecheck`: check the code.
- `bun run contracts:build`: compile the contract.

### Contract

The contract lives in `contracts/RockPaperScissors.sol`.

## Playing

1. Connect a wallet on Arc Testnet and get test USDC.
2. Create a game with your stake and format, then share the invite link, or join an open challenge from the lobby.
3. Lock in a move, then reveal it. Winnings and refunds are cashed out from the lobby.

No opponent yet? Open the **Practice solo** tab to play single-round or best-of-three matches against the computer. It is free and needs no wallet.

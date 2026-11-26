# Rock-Paper-Scissors: Architecture

A two-player USDC wager game on Arc Testnet. Both players stake the same amount, pick a move in secret, then reveal. The winner takes the pot. A tie refunds both players.

## 1. System overview

```
Browser (React + wagmi + ConnectKit)
   |  read/write via viem
   v
RockPaperScissors.sol  <---->  USDC (ERC-20 view, 6 decimals)
   |
   v
Events (GameCreated, Joined, Committed, Revealed, Settled, Cancelled)
   |
   v
Frontend reads state with getLogs/readContract; no backend needed
```

No backend or database. The contract is the source of truth, and the UI reads live game state from it.

## 2. Game lifecycle (state machine)

| State | Meaning | Next |
|---|---|---|
| Open | Creator staked, waiting for an opponent | Joined, Cancelled |
| Committing | Both staked, each submits a hashed move | Revealing, Cancelled (timeout) |
| Revealing | Both committed, each reveals move + salt | Settled, Forfeited (timeout) |
| Settled | Winner paid, or both refunded on a tie | final |
| Cancelled | Stakes returned | final |

Flow:
1. Player A creates a game with a stake. USDC is pulled in with approve then transferFrom.
2. Player B joins by matching the stake.
3. Each player submits `hash(move, salt, address)`. Moves stay hidden.
4. Once both have committed, each reveals `move + salt`. The contract checks it against the hash.
5. When both have revealed, the contract settles and pays out.

## 3. Smart contract design

State per game: players, stake, commit hashes, revealed moves, state, deadline.

Main functions:
- `createGame(stake)`: stake USDC and open a game.
- `joinGame(id)`: match the stake and start commit phase.
- `commit(id, hash)`: submit a hidden move.
- `reveal(id, move, salt)`: prove the move and settle when both are in.
- `cancelOpenGame(id)`: creator withdraws an unjoined game.
- `claimTimeout(id)`: if the opponent stalls, claim the pot (or refund when nobody acted).

Security choices:
- Commit-reveal with the player's address in the hash, so commitments cannot be copied or replayed.
- Per-phase deadlines so a player who refuses to reveal cannot lock funds.
- Checks-effects-interactions and a reentrancy guard on every payout.
- Pull or single-shot payouts, with the state finalized before any transfer.
- Safe ERC-20 transfers, exact stake match, minimum stake, and no owner control over player funds.
- Salt generated in the browser and kept in local storage, so a refresh does not lose a reveal.

## 4. USDC on Arc

- Stakes and payouts use the USDC ERC-20 interface (6 decimals), never the native balance view.
- The USDC address and decimals come from `@/onchain-facts`; amounts use `@/onchain-money`.
- Gas is also paid in USDC on Arc, so players need only one asset.

## 5. Frontend structure

```
src/
  App.tsx                   thin composition root
  components/
    WalletBar.tsx           connect, USDC balance, faucet hint
    Lobby.tsx               open games list + create game
    CreateGameCard.tsx      stake input, approve + create
    GameRoom.tsx            live game view by state
    MovePicker.tsx          rock / paper / scissors choice
    RevealPanel.tsx         reveal step and timeout countdown
    ResultBanner.tsx        win / lose / tie + payout
  hooks/
    useGames.ts             read games and events
    useGame.ts              single game state + polling
    useRpsActions.ts        approve, create, join, commit, reveal, claim
    useSaltStore.ts         local salt + move persistence
  lib/
    rps.ts                  hash helper, move enum, outcome logic
```

UX notes: every step shows a transaction status, the UI always displays whose turn it is, and a countdown shows the deadline for the current phase.

## 6. Build and delivery plan

1. Write the contract, unit tests (win/lose/tie, timeouts, cheating attempts, reentrancy).
2. Security review, then deploy to Arc Testnet.
3. Build the UI against the deployed contract and wire the ABI and address.
4. Verify with two wallets end to end, and check transactions in the Tracing panel.

## 7. Open choices

- Fixed stake tiers (for example 1, 5, 10 USDC) versus any custom stake.
- Best-of-one versus best-of-three rounds.
- A small protocol fee (default: none).

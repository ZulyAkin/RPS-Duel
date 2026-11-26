// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title RockPaperScissors
/// @notice Two-player, fee-free USDC wagers with commit/reveal rounds and player-claimed timeouts.
/// @dev Intended for the standard, non-fee-on-transfer, six-decimal USDC ERC-20 interface on Arc.
contract RockPaperScissors is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State { Open, Committing, Revealing, Settled, Cancelled }
    enum Move { None, Rock, Paper, Scissors }

    struct Game {
        address playerA;
        address playerB;
        uint128 stake;
        uint8 bestOf;
        State state;
        uint8 round;
        uint8 winsA;
        uint8 winsB;
        bytes32 commitA;
        bytes32 commitB;
        Move moveA;
        Move moveB;
        uint64 deadline;
        address winner;
        // Number of completed rounds, including ties. The active round is roundsPlayed + 1.
        uint8 roundsPlayed;
    }

    uint256 public constant MIN_STAKE = 10_000;
    uint256 public constant PHASE_TIMEOUT = 10 minutes;
    uint8 public constant MAX_TOTAL_ROUNDS = 9;

    address public immutable usdc;
    uint256 public gameCount;
    mapping(uint256 => Game) private games;
    mapping(address => uint256) public claimable;

    error InvalidToken();
    error InvalidStake();
    error InvalidBestOf();
    error GameNotFound();
    error InvalidState();
    error NotPlayer();
    error NotCreator();
    error CannotJoinOwnGame();
    error InvalidCommitment();
    error AlreadyCommitted();
    error AlreadyRevealed();
    error InvalidMove();
    error CommitmentMismatch();
    error PhaseExpired();
    error DeadlineNotPassed();
    error NothingToClaim();

    event GameCreated(uint256 indexed id, address indexed playerA, uint256 stake, uint8 bestOf);
    event GameJoined(uint256 indexed id, address indexed playerB);
    event MoveCommitted(uint256 indexed id, address indexed player, uint8 round);
    event MoveRevealed(uint256 indexed id, address indexed player, uint8 round, Move move);
    event RoundResolved(uint256 indexed id, uint8 round, address roundWinner, uint8 winsA, uint8 winsB);
    /// @dev payout is the pot credited to a winner, or the amount credited to EACH player on a draw.
    event GameSettled(uint256 indexed id, address indexed winner, uint256 payout);
    event GameCancelled(uint256 indexed id);
    event Claimed(address indexed player, uint256 amount);

    /// @param usdc_ Six-decimal USDC ERC-20 address; use 0x3600000000000000000000000000000000000000 on Arc Testnet.
    constructor(address usdc_) {
        if (usdc_ == address(0)) revert InvalidToken();
        usdc = usdc_;
    }

    /// @notice Open a wager after approving this contract to spend the raw six-decimal stake.
    /// @param stake Amount per player, at least MIN_STAKE and at most uint128's maximum.
    /// @param bestOf Either 1 (one round; a tie refunds both) or 3 (two wins needed; ties replay).
    /// @dev Best-of-three is capped at MAX_TOTAL_ROUNDS; more wins takes the pot, equal wins refunds both.
    /// @return id Newly created game identifier, starting at 1.
    function createGame(uint256 stake, uint8 bestOf) external nonReentrant returns (uint256 id) {
        if (stake < MIN_STAKE || stake > type(uint128).max) revert InvalidStake();
        if (bestOf != 1 && bestOf != 3) revert InvalidBestOf();

        id = ++gameCount;
        Game storage game = games[id];
        game.playerA = msg.sender;
        game.stake = uint128(stake);
        game.bestOf = bestOf;
        game.state = State.Open;
        game.round = 1;
        emit GameCreated(id, msg.sender, stake, bestOf);

        IERC20(usdc).safeTransferFrom(msg.sender, address(this), stake);
    }

    /// @notice Match an open game's stake and begin the first commit phase.
    function joinGame(uint256 id) external nonReentrant {
        Game storage game = _getGame(id);
        if (game.state != State.Open) revert InvalidState();
        if (msg.sender == game.playerA) revert CannotJoinOwnGame();

        game.playerB = msg.sender;
        game.state = State.Committing;
        game.deadline = uint64(block.timestamp + PHASE_TIMEOUT);
        emit GameJoined(id, msg.sender);

        IERC20(usdc).safeTransferFrom(msg.sender, address(this), uint256(game.stake));
    }

    /// @notice Cancel your unjoined game and credit your entire stake for withdrawal with claim().
    function cancelOpenGame(uint256 id) external nonReentrant {
        Game storage game = _getGame(id);
        if (msg.sender != game.playerA) revert NotCreator();
        if (game.state != State.Open) revert InvalidState();

        game.state = State.Cancelled;
        emit GameCancelled(id);
        claimable[game.playerA] += uint256(game.stake);
    }

    /// @notice Withdraw all your credited payouts and refunds; a failed transfer preserves your credit.
    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        IERC20(usdc).safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    /// @notice Return a player's total credited payouts and refunds available for withdrawal.
    function claimableOf(address player) external view returns (uint256) {
        return claimable[player];
    }

    /// @notice Commit once to the active round, no later than its deadline.
    /// @dev Generate the nonzero commitment with hashMove using the game's current round.
    function commit(uint256 id, bytes32 hash) external nonReentrant {
        Game storage game = _getGame(id);
        _requirePlayer(game);
        if (game.state != State.Committing) revert InvalidState();
        if (block.timestamp > game.deadline) revert PhaseExpired();
        if (hash == bytes32(0)) revert InvalidCommitment();

        if (msg.sender == game.playerA) {
            if (game.commitA != bytes32(0)) revert AlreadyCommitted();
            game.commitA = hash;
        } else {
            if (game.commitB != bytes32(0)) revert AlreadyCommitted();
            game.commitB = hash;
        }
        emit MoveCommitted(id, msg.sender, game.round);

        if (game.commitA != bytes32(0) && game.commitB != bytes32(0)) {
            game.state = State.Revealing;
            game.deadline = uint64(block.timestamp + PHASE_TIMEOUT);
        }
    }

    /// @notice Reveal a committed move and salt before expiry; the second reveal resolves the round.
    function reveal(uint256 id, Move move, bytes32 salt) external nonReentrant {
        Game storage game = _getGame(id);
        _requirePlayer(game);
        if (game.state != State.Revealing) revert InvalidState();
        if (block.timestamp > game.deadline) revert PhaseExpired();
        if (move == Move.None) revert InvalidMove();

        bytes32 expected = hashMove(id, game.round, move, salt, msg.sender);
        if (msg.sender == game.playerA) {
            if (game.moveA != Move.None) revert AlreadyRevealed();
            if (expected != game.commitA) revert CommitmentMismatch();
            game.moveA = move;
        } else {
            if (game.moveB != Move.None) revert AlreadyRevealed();
            if (expected != game.commitB) revert CommitmentMismatch();
            game.moveB = move;
        }
        emit MoveRevealed(id, msg.sender, game.round, move);

        if (game.moveA != Move.None && game.moveB != Move.None) {
            _resolveRound(id, game);
        }
    }

    /// @notice After phase expiry, either player can settle a forfeit or credit mutual refunds.
    /// @dev Exactly one action credits the pot to that player; no actions credits both stakes. Withdraw with claim().
    function claimTimeout(uint256 id) external nonReentrant {
        Game storage game = _getGame(id);
        _requirePlayer(game);
        if (game.state != State.Committing && game.state != State.Revealing) revert InvalidState();
        if (block.timestamp <= game.deadline) revert DeadlineNotPassed();

        bool actedA;
        bool actedB;
        if (game.state == State.Committing) {
            actedA = game.commitA != bytes32(0);
            actedB = game.commitB != bytes32(0);
        } else {
            actedA = game.moveA != Move.None;
            actedB = game.moveB != Move.None;
        }
        address winner;
        if (actedA != actedB) winner = actedA ? game.playerA : game.playerB;
        _settle(id, game, winner);
    }

    /// @notice Compute the exact commitment, binding it to the game, active round and player.
    /// @dev Use a fresh cryptographically random salt each round. Move is packed as its uint8 enum value.
    function hashMove(uint256 gameId, uint8 round, Move move, bytes32 salt, address player)
        public pure returns (bytes32)
    {
        return keccak256(abi.encodePacked(gameId, round, move, salt, player));
    }

    /// @notice Return the complete game state; reverts for an identifier that has not been created.
    function getGame(uint256 id) external view returns (Game memory) {
        return _getGame(id);
    }

    function _getGame(uint256 id) private view returns (Game storage game) {
        if (id == 0 || id > gameCount) revert GameNotFound();
        return games[id];
    }

    function _requirePlayer(Game storage game) private view {
        if (msg.sender != game.playerA && msg.sender != game.playerB) revert NotPlayer();
    }

    function _resolveRound(uint256 id, Game storage game) private {
        address roundWinner;
        if (game.moveA != game.moveB) {
            bool aWins = (game.moveA == Move.Rock && game.moveB == Move.Scissors)
                || (game.moveA == Move.Paper && game.moveB == Move.Rock)
                || (game.moveA == Move.Scissors && game.moveB == Move.Paper);
            if (aWins) {
                ++game.winsA;
                roundWinner = game.playerA;
            } else {
                ++game.winsB;
                roundWinner = game.playerB;
            }
        }
        ++game.roundsPlayed;
        emit RoundResolved(id, game.round, roundWinner, game.winsA, game.winsB);

        uint8 winsNeeded = (game.bestOf + 1) / 2;
        if (game.bestOf == 1 || game.winsA >= winsNeeded || game.winsB >= winsNeeded
            || game.roundsPlayed >= MAX_TOTAL_ROUNDS) {
            address winner;
            if (game.winsA > game.winsB) winner = game.playerA;
            else if (game.winsB > game.winsA) winner = game.playerB;
            _settle(id, game, winner);
        } else {
            game.round = game.roundsPlayed + 1;
            game.commitA = bytes32(0);
            game.commitB = bytes32(0);
            game.moveA = Move.None;
            game.moveB = Move.None;
            game.state = State.Committing;
            game.deadline = uint64(block.timestamp + PHASE_TIMEOUT);
        }
    }

    function _settle(uint256 id, Game storage game, address winner) private {
        game.state = State.Settled;
        game.winner = winner;
        game.deadline = 0;
        uint256 stake = uint256(game.stake);
        uint256 payout = winner == address(0) ? stake : 2 * stake;
        emit GameSettled(id, winner, payout);

        if (winner == address(0)) {
            claimable[game.playerA] += stake;
            claimable[game.playerB] += stake;
        } else {
            claimable[winner] += payout;
        }
    }
}

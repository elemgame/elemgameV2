pragma tvm-solidity >= 0.72.0;

/// @title MatchEscrow
/// @notice Manages the full lifecycle of a match: creation, joining, settlement,
///         timeout expiry, and dispute filing.
///
/// Token flows use TIP-3 internal messages (async). Actual transfers are marked
/// TODO below and require the ELMTokenWallet interface to be wired up.
///
/// Access model:
///   - External calls (createMatch, joinMatch, settleMatch) require the deployer
///     key (tvm.pubkey()) — i.e. the privileged server key.
///   - claimTimeout and disputeMatch are open to any caller (no key check) so
///     players can invoke them directly.
contract MatchEscrow {

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    enum MatchStatus { Created, Active, Settled, Disputed, Expired }

    struct Match {
        uint256 id;
        address player1;
        address player2;
        uint128 stake;       // ELM tokens staked per player
        uint128 boost1;      // extra ELM committed by player1 (burn-on-loss)
        uint128 boost2;      // extra ELM committed by player2 (burn-on-loss)
        uint32  createdAt;
        MatchStatus status;
        bytes32 replayHash;  // keccak256 of the canonical replay, set on settlement
        address winner;
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    uint256 public nextMatchId;
    mapping(uint256 => Match) public matches;

    address public treasury;
    address public gameRegistry;
    address public tokenRoot;

    uint8   constant RAKE_PERCENT    = 5;    // 5 % of prize pool goes to treasury
    uint128 constant BOOST_PERCENT   = 10;   // boost = 10 % of stake
    uint32  constant SETTLE_TIMEOUT  = 600;  // seconds before a match can be timed-out

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _treasury, address _gameRegistry, address _tokenRoot) public {
        require(tvm.pubkey() != 0, 101);
        require(msg.pubkey() == tvm.pubkey(), 102);
        tvm.accept();
        treasury    = _treasury;
        gameRegistry = _gameRegistry;
        tokenRoot   = _tokenRoot;
    }

    // -------------------------------------------------------------------------
    // Server-privileged functions
    // -------------------------------------------------------------------------

    /// @notice Create a new match slot for player1.
    /// @param player1  Wallet address of player 1.
    /// @param stake    ELM amount each player must commit.
    /// @param boost    Whether player1 activates the boost mechanic.
    /// @return matchId Assigned match identifier.
    function createMatch(
        address player1,
        uint128 stake,
        bool    boost
    ) external returns (uint256 matchId) {
        require(msg.pubkey() == tvm.pubkey(), 102);
        tvm.accept();
        ensureGas();

        matchId = nextMatchId++;
        Match m;
        m.id        = matchId;
        m.player1   = player1;
        m.stake     = stake;
        m.boost1    = boost ? stake * BOOST_PERCENT / 100 : 0;
        m.createdAt = uint32(now);
        m.status    = MatchStatus.Created;
        matches[matchId] = m;
    }

    /// @notice Record player2 joining an existing match.
    /// @param matchId  Match to join.
    /// @param player2  Wallet address of player 2.
    /// @param boost    Whether player2 activates the boost mechanic.
    function joinMatch(uint256 matchId, address player2, bool boost) external {
        require(msg.pubkey() == tvm.pubkey(), 102);
        tvm.accept();
        ensureGas();

        Match m = matches[matchId];
        require(m.status == MatchStatus.Created, 201);
        m.player2 = player2;
        m.boost2  = boost ? m.stake * BOOST_PERCENT / 100 : 0;
        m.status  = MatchStatus.Active;
        matches[matchId] = m;
    }

    /// @notice Settle a match. Called by the server after the game engine
    ///         determines the winner.
    /// @param matchId     Match to settle.
    /// @param winner      Address of the winning player.
    /// @param replayHash  Canonical hash of the match replay for dispute reference.
    function settleMatch(
        uint256 matchId,
        address winner,
        bytes32 replayHash
    ) external {
        require(msg.pubkey() == tvm.pubkey(), 102);
        tvm.accept();
        ensureGas();

        Match m = matches[matchId];
        require(m.status == MatchStatus.Active, 202);
        require(winner == m.player1 || winner == m.player2, 203);

        m.status     = MatchStatus.Settled;
        m.replayHash = replayHash;
        m.winner     = winner;
        matches[matchId] = m;

        // --- Token distribution (all via TIP-3 internal messages) ---
        uint128 pool    = m.stake * 2;
        uint128 rake    = pool * RAKE_PERCENT / 100;
        uint128 payout  = pool - rake;

        address loser       = (winner == m.player1) ? m.player2  : m.player1;
        uint128 winnerBoost = (winner == m.player1) ? m.boost1   : m.boost2;
        uint128 loserBoost  = (winner == m.player1) ? m.boost2   : m.boost1;

        // TODO: Send ELM to winner via TIP-3 wallet transfer:
        //   ITokenWallet(winnerWallet).transfer{value: 0.1 ton, flag: 1}(
        //       payout + winnerBoost, winner, 0, winner, false, empty
        //   );
        //
        // TODO: Send rake to treasury:
        //   ITokenWallet(escrowWallet).transfer{value: 0.1 ton, flag: 1}(
        //       rake, treasury, 0, treasury, false, empty
        //   );
        //
        // TODO: Burn loser boost if applicable:
        //   if (loserBoost > 0) {
        //       ITokenWallet(escrowWallet).burn{value: 0.1 ton, flag: 1}(
        //           loserBoost, loser, address(0), empty
        //       );
        //   }
        //
        // TODO: Notify GameRegistry of the result:
        //   IGameRegistry(gameRegistry).recordResult{value: 0.1 ton, flag: 1}(
        //       winner, loser, winnerRounds, loserRounds, payout + winnerBoost, loserBoost
        //   );

        // Suppress unused-variable warnings until TODOs are implemented.
        loser;
        winnerBoost;
        loserBoost;
    }

    // -------------------------------------------------------------------------
    // Player-accessible functions
    // -------------------------------------------------------------------------

    /// @notice Claim a timeout refund when the server has not settled within
    ///         SETTLE_TIMEOUT seconds of match start.
    /// @param matchId  Match that has timed out.
    function claimTimeout(uint256 matchId) external {
        tvm.accept();
        ensureGas();

        Match m = matches[matchId];
        require(m.status == MatchStatus.Active, 202);
        require(now > m.createdAt + SETTLE_TIMEOUT, 204);

        m.status = MatchStatus.Expired;
        matches[matchId] = m;

        // TODO: Refund player1 (stake + boost1) via TIP-3 wallet transfer.
        // TODO: Refund player2 (stake + boost2) via TIP-3 wallet transfer.
    }

    /// @notice Dispute a settled match by supplying the player's own replay hash.
    ///         If it differs from the server's stored hash the match is flagged
    ///         for manual review.
    /// @param matchId          The match to dispute.
    /// @param playerReplayHash The replay hash computed by the disputing player.
    function disputeMatch(uint256 matchId, bytes32 playerReplayHash) external {
        tvm.accept();
        ensureGas();

        Match m = matches[matchId];
        require(m.status == MatchStatus.Settled, 205);
        require(msg.sender == m.player1 || msg.sender == m.player2, 206);

        if (playerReplayHash != m.replayHash) {
            m.status = MatchStatus.Disputed;
            matches[matchId] = m;
        }
    }

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    function getMatch(uint256 matchId) external view returns (Match) {
        return matches[matchId];
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    function ensureGas() private {
        if (address(this).balance > 1 ton) return;
        gosh.mintshell(1 ton);
    }
}

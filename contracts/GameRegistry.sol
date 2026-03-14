pragma tvm-solidity >= 0.72.0;

/// @title GameRegistry
/// @notice Records per-player statistics and maintains ELO ratings.
///         Only the MatchEscrow contract may write results (internal message check).
contract GameRegistry {

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    struct PlayerStats {
        uint32  wins;
        uint32  losses;
        uint32  rating;       // ELO rating; 0 means "not yet initialised"
        uint32  roundsWon;
        uint32  roundsLost;
        uint32  roundsDrawn;
        uint128 totalEarned;  // cumulative ELM received as prize
        uint128 totalBurned;  // cumulative ELM burned via loser boost
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    mapping(address => PlayerStats) public stats;
    address public escrow;  // Only MatchEscrow may call recordResult

    uint32 constant INITIAL_RATING = 1200;
    /// @dev Full ELO requires floating-point expected score computation which is
    ///      not available in TVM Solidity.  We use a simplified variant:
    ///      winner gains K/2, loser loses K/2, regardless of rating difference.
    ///      A more accurate version can be approximated with fixed-point maths.
    uint32 constant K_FACTOR = 32;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _escrow) public {
        require(tvm.pubkey() != 0, 101);
        require(msg.pubkey() == tvm.pubkey(), 102);
        tvm.accept();
        escrow = _escrow;
    }

    // -------------------------------------------------------------------------
    // Write — callable only by MatchEscrow (internal message)
    // -------------------------------------------------------------------------

    /// @notice Record the outcome of a settled match.
    /// @param winner        Winning player address.
    /// @param loser         Losing player address.
    /// @param winnerRounds  Number of rounds won by the winner.
    /// @param loserRounds   Number of rounds won by the loser.
    /// @param earned        ELM prize sent to the winner (for cumulative tracking).
    /// @param burned        ELM boost burned from the loser (for cumulative tracking).
    function recordResult(
        address winner,
        address loser,
        uint8   winnerRounds,
        uint8   loserRounds,
        uint128 earned,
        uint128 burned
    ) external {
        require(msg.sender == escrow, 301);
        ensureGas();

        // Initialise ratings for first-time players.
        if (stats[winner].rating == 0) stats[winner].rating = INITIAL_RATING;
        if (stats[loser].rating  == 0) stats[loser].rating  = INITIAL_RATING;

        // Match-level outcomes.
        stats[winner].wins++;
        stats[loser].losses++;

        // Round-level outcomes.
        stats[winner].roundsWon  += winnerRounds;
        stats[winner].roundsLost += loserRounds;
        stats[loser].roundsWon   += loserRounds;
        stats[loser].roundsLost  += winnerRounds;

        // Simplified ELO update.
        uint32 change = K_FACTOR / 2;
        stats[winner].rating = stats[winner].rating + change;
        stats[loser].rating  = stats[loser].rating > change
            ? stats[loser].rating - change
            : 1;

        // Economic tracking.
        stats[winner].totalEarned += earned;
        stats[loser].totalBurned  += burned;
    }

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    function getPlayerStats(address player) external view returns (PlayerStats) {
        return stats[player];
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    function ensureGas() private {
        if (address(this).balance > 1 ton) return;
        gosh.mintshell(1 ton);
    }
}

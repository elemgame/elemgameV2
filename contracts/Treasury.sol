pragma tvm-solidity >= 0.72.0;

/// @title Treasury
/// @notice Collects protocol rake fees sent by MatchEscrow and allows the
///         owner to withdraw accumulated funds.
///
/// In the TIP-3 world, "fees" arrive as ELM token transfers routed here by
/// MatchEscrow.  The receive() fallback below also accepts native SHELL/VMSHELL
/// sent directly to the contract (e.g. during testing).
contract Treasury {

    address public owner;
    uint128 public totalCollected;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor() public {
        require(tvm.pubkey() != 0, 101);
        require(msg.pubkey() == tvm.pubkey(), 102);
        tvm.accept();
    }

    // -------------------------------------------------------------------------
    // Receive native value (SHELL / VMSHELL)
    // -------------------------------------------------------------------------

    /// @notice Accept native currency sent directly to this contract (e.g. VMSHELL
    ///         from tests or manual top-ups).  For ELM token fees the contract
    ///         should implement onAcceptTokensTransfer() from the TIP-3 standard.
    receive() external {
        totalCollected += msg.value;
        ensureGas();
    }

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    function getBalance() external view returns (uint128) {
        return address(this).balance;
    }

    function getTotalCollected() external view returns (uint128) {
        return totalCollected;
    }

    // -------------------------------------------------------------------------
    // Owner-only withdrawal
    // -------------------------------------------------------------------------

    /// @notice Withdraw native currency to an arbitrary destination.
    /// @param dest    Recipient address.
    /// @param amount  Amount in nanotokens to send.
    function withdraw(address dest, uint128 amount) external {
        require(msg.pubkey() == tvm.pubkey(), 102);
        tvm.accept();
        require(address(this).balance > amount, 401);
        // flag = 1 — pay transfer fees from the contract's balance.
        dest.transfer(amount, true, 1);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    function ensureGas() private {
        if (address(this).balance > 1 ton) return;
        gosh.mintshell(1 ton);
    }
}

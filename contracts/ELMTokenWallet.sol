pragma tvm-solidity >= 0.72.0;

// =============================================================================
// ELMTokenWallet — TIP-3 Fungible Token Wallet (PLACEHOLDER)
// =============================================================================
//
// IMPORTANT: This file is a stub.  A production deployment MUST extend the
// TIP-3 reference TokenWallet contract from Broxus:
//
//   https://github.com/broxus/tip3
//
// One wallet is deployed per (root, owner) pair.  The MatchEscrow contract
// holds its own wallet (the "escrow wallet") and routes tokens in/out via
// TIP-3 internal messages.
//
// =============================================================================

/// @dev Minimal interface used by MatchEscrow and Treasury when interacting
///      with ELM token wallets.  Matches the Broxus TIP-3 TokenWallet surface.
interface IELMTokenWallet {

    // -------------------------------------------------------------------------
    // Balance / metadata
    // -------------------------------------------------------------------------

    /// @notice Current token balance of this wallet.
    function balance() external view responsible returns (uint128);

    /// @notice Address of the TIP-3 root that deployed this wallet.
    function root() external view responsible returns (address);

    /// @notice Owner of this wallet (the account that controls it).
    function owner() external view responsible returns (address);

    // -------------------------------------------------------------------------
    // Transfer
    // -------------------------------------------------------------------------

    /// @notice Transfer `amount` tokens to a wallet identified by `recipient`'s
    ///         owner address.  The root resolves the wallet address on-chain.
    /// @param amount            Tokens to send.
    /// @param recipient         Owner address of the destination wallet.
    /// @param deployWalletValue Value to attach if the recipient wallet does not
    ///                          yet exist (0 if it is already deployed).
    /// @param remainingGasTo    Address that receives leftover gas after the call.
    /// @param notify            Whether to call onAcceptTokensTransfer on the
    ///                          recipient wallet's owner contract.
    /// @param payload           Arbitrary TvmCell passed through to the notify
    ///                          callback (use tvm.emptyCell() if not needed).
    function transfer(
        uint128 amount,
        address recipient,
        uint128 deployWalletValue,
        address remainingGasTo,
        bool    notify,
        TvmCell payload
    ) external;

    /// @notice Transfer tokens directly to a known wallet address (bypasses
    ///         root resolution — cheaper when wallet address is already known).
    function transferToWallet(
        uint128 amount,
        address recipientTokenWallet,
        address remainingGasTo,
        bool    notify,
        TvmCell payload
    ) external;

    // -------------------------------------------------------------------------
    // Burn
    // -------------------------------------------------------------------------

    /// @notice Burn `amount` tokens from this wallet.
    ///         Used for the loser-boost destruction mechanic.
    /// @param amount        Tokens to destroy.
    /// @param remainingGasTo Gas refund target.
    /// @param callbackTo    Contract that receives the IBurnCallback.onAcceptTokensBurn
    ///                      notification (use address(0) to skip).
    /// @param payload       Forwarded to the burn callback.
    function burn(
        uint128 amount,
        address remainingGasTo,
        address callbackTo,
        TvmCell payload
    ) external;

    // -------------------------------------------------------------------------
    // Receive callback (implement on the owner contract, not on the wallet)
    // -------------------------------------------------------------------------

    /// @notice Called by the wallet when tokens arrive (if notify = true).
    ///         MatchEscrow must implement this to accept incoming ELM stakes.
    ///
    ///   function onAcceptTokensTransfer(
    ///       address tokenRoot,
    ///       uint128 amount,
    ///       address sender,
    ///       address senderWallet,
    ///       address remainingGasTo,
    ///       TvmCell payload
    ///   ) external;
    ///
    /// The escrow wallet address is derived as:
    ///   IELMTokenRoot(tokenRoot).walletOf{value: 0.1 ton}(address(this))
}

// =============================================================================
// Integration notes for MatchEscrow
// =============================================================================
//
// 1. On deployment, call tokenRoot.deployWallet() to create the escrow wallet.
// 2. Players call tokenRoot.walletOf(playerAddress) to get their wallet address,
//    then call wallet.transfer() with notify=true and the matchId encoded in
//    payload to fund the escrow.
// 3. On settlement, the escrow calls its own wallet's transfer() to send prizes,
//    and burn() to destroy loser boosts.
// 4. All value parameters in internal messages should be at least 0.1 ton to
//    cover forwarding fees; use flag=1 to pay fees from the attached value.
//
// =============================================================================

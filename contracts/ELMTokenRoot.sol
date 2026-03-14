pragma tvm-solidity >= 0.72.0;

// =============================================================================
// ELMTokenRoot — TIP-3 Fungible Token Root (PLACEHOLDER)
// =============================================================================
//
// IMPORTANT: This file is a stub that defines the interface and key design
// decisions for the ELM token root.  A production deployment MUST extend the
// battle-tested TIP-3 reference implementation maintained by Broxus:
//
//   https://github.com/broxus/tip3
//
// Clone that repository, inherit from TokenRoot, and wire in the custom
// minting / burning logic shown below.
//
// TIP-3 Root/Wallet Pattern
// ─────────────────────────
// Unlike ERC-20 (one mapping contract), TIP-3 deploys one TokenWallet per
// (root, owner) pair.  The Root contract:
//   • Stores totalSupply and token metadata.
//   • Deploys new wallets deterministically (StateInit hash).
//   • Issues mint/burn instructions routed through individual wallets.
//
// =============================================================================

/// @dev Minimal interface used by other Elmental contracts to interact with
///      the ELM token root.  Matches the public surface of the Broxus TIP-3
///      TokenRoot contract.
interface IELMTokenRoot {

    /// @notice Deploy a TokenWallet for `owner` and return its address.
    ///         Caller must attach enough value to cover wallet deployment.
    /// @param owner            Owner of the new wallet.
    /// @param deployWalletValue Value forwarded to the new wallet (in nanotokens).
    /// @return tokenWallet     Address of the newly deployed (or already existing) wallet.
    function deployWallet(
        address owner,
        uint128 deployWalletValue
    ) external responsible returns (address tokenWallet);

    /// @notice Compute (without deploying) the wallet address for `owner`.
    function walletOf(address owner) external view responsible returns (address tokenWallet);

    /// @notice Mint `amount` ELM tokens into `recipient`'s wallet.
    ///         Only callable by the token root owner.
    function mint(
        uint128 amount,
        address recipient,
        uint128 deployWalletValue,
        address remainingGasTo,
        bool    notify,
        TvmCell payload
    ) external;

    /// @notice Total supply of ELM tokens across all wallets.
    function totalSupply() external view responsible returns (uint128);

    /// @notice Token decimals (ELM uses 9 — matching SHELL/VMSHELL precision).
    function decimals() external view responsible returns (uint8);

    /// @notice Human-readable token name.
    function name() external view responsible returns (string);

    /// @notice Human-readable token symbol.
    function symbol() external view responsible returns (string);
}

// =============================================================================
// Deployment parameters (used by the deployment script)
// =============================================================================
//
// name:     "Elmental"
// symbol:   "ELM"
// decimals: 9
// owner:    <ElmentalRoot address>
// initialSupply: 0          — tokens are minted on demand (match rewards, etc.)
// initialSupplyTo: address(0)
// disableMint: false        — minting is controlled by the game server
// disableBurnByRoot: false  — root can burn (e.g., loser boost destruction)
// pauseBurn: false
// pauseMint: false
//
// =============================================================================

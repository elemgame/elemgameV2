pragma tvm-solidity >= 0.72.0;

/// @title ElmentalRoot
/// @notice Root contract for the Elmental game. Its address serves as the DApp ID
///         for gas sponsoring via gosh.mintshell().
contract ElmentalRoot {
    address public tokenRoot;
    address public matchEscrow;
    address public gameRegistry;
    address public treasury;
    address public owner;

    constructor() public {
        require(tvm.pubkey() != 0, 101);
        require(msg.pubkey() == tvm.pubkey(), 102);
        tvm.accept();
        owner = msg.sender;
    }

    modifier onlyOwner {
        require(msg.pubkey() == tvm.pubkey(), 102);
        tvm.accept();
        _;
    }

    function setTokenRoot(address addr) external onlyOwner {
        tokenRoot = addr;
    }

    function setMatchEscrow(address addr) external onlyOwner {
        matchEscrow = addr;
    }

    function setGameRegistry(address addr) external onlyOwner {
        gameRegistry = addr;
    }

    function setTreasury(address addr) external onlyOwner {
        treasury = addr;
    }

    function getAddresses() external view returns (
        address _tokenRoot,
        address _matchEscrow,
        address _gameRegistry,
        address _treasury
    ) {
        return (tokenRoot, matchEscrow, gameRegistry, treasury);
    }

    /// @dev Ensure the contract has enough SHELL to cover gas.
    ///      gosh.mintshell() mints SHELL into this contract's balance using
    ///      the DApp ID sponsoring mechanism.
    function ensureGas() private pure {
        if (address(this).balance > 1 ton) return;
        gosh.mintshell(1 ton);
    }
}

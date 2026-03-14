// TODO: Full blockchain integration with Acki Nacki / TVM network
// All functions are stubs until on-chain contracts are deployed.

// ---------------------------------------------------------------------------
// TonClient initialization
// ---------------------------------------------------------------------------

// TODO: Uncomment when @eversdk integration is ready
// import { TonClient } from '@eversdk/core';
// import { libNode } from '@eversdk/lib-node';
// TonClient.useBinaryLibrary(libNode);

export interface KeyPair {
  public: string;
  secret: string;
}

export interface BlockchainConfig {
  endpoint: string;
}

let _config: BlockchainConfig | null = null;

export function initBlockchain(config: BlockchainConfig): void {
  _config = config;
  console.log('[blockchain] Initialized with endpoint:', config.endpoint);
  // TODO: TonClient.useBinaryLibrary(libNode)
  // _client = new TonClient({ network: { endpoints: [config.endpoint] } });
}

// ---------------------------------------------------------------------------
// Wallet / Keypair
// ---------------------------------------------------------------------------

/**
 * Generate a new keypair for a player wallet.
 * TODO: Use TonClient.crypto.generate_random_sign_keys()
 */
export async function generateKeypair(): Promise<KeyPair> {
  // TODO: replace with actual TVM keypair generation
  const { webcrypto } = await import('crypto');
  const randomBytes = webcrypto.getRandomValues(new Uint8Array(32));
  const toHex = (bytes: Uint8Array): string =>
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  return {
    public: toHex(randomBytes.slice(0, 16)),
    secret: toHex(randomBytes),
  };
}

/**
 * Get the native token balance for a wallet address.
 * TODO: Query on-chain via TonClient
 */
export async function getPlayerBalance(
  _walletAddr: string,
): Promise<bigint> {
  // TODO: implement via TonClient.net.query_collection or account query
  console.warn('[blockchain] getPlayerBalance is a stub');
  return 0n;
}

// ---------------------------------------------------------------------------
// Match lifecycle
// ---------------------------------------------------------------------------

/**
 * Create a new match on-chain.
 * TODO: Call ElmentalFactory.createMatch(stake, boost)
 */
export async function createMatchOnChain(
  _stake: number,
  _boost: boolean,
): Promise<{ txHash: string; matchId: string }> {
  // TODO: encode & send TVM transaction
  console.warn('[blockchain] createMatchOnChain is a stub');
  return {
    txHash: '0x' + '0'.repeat(64),
    matchId: '0x' + '0'.repeat(64),
  };
}

/**
 * Join an existing match on-chain.
 * TODO: Call ElmentalMatch.join(matchId, boost)
 */
export async function joinMatchOnChain(
  _matchId: string,
  _boost: boolean,
): Promise<{ txHash: string }> {
  // TODO: encode & send TVM transaction
  console.warn('[blockchain] joinMatchOnChain is a stub');
  return { txHash: '0x' + '0'.repeat(64) };
}

/**
 * Settle a completed match on-chain.
 * TODO: Call ElmentalMatch.settle(winner, replayHash)
 */
export async function settleMatchOnChain(
  _matchId: string,
  _winnerAddress: string,
  _replayHash: string,
): Promise<{ txHash: string }> {
  // TODO: encode & send TVM transaction
  console.warn('[blockchain] settleMatchOnChain is a stub');
  return { txHash: '0x' + '0'.repeat(64) };
}

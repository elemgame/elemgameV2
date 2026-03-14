# Elmental Smart Contracts

TVM Solidity smart contracts for the Elmental game on Acki Nacki blockchain.

## Contract Overview

| Contract | File | Purpose |
|---|---|---|
| ElmentalRoot | `ElmentalRoot.sol` | Root entry point; address becomes the DApp ID for gas sponsoring |
| MatchEscrow | `MatchEscrow.sol` | Match lifecycle: creation, joining, settlement, timeout, dispute |
| GameRegistry | `GameRegistry.sol` | Per-player stats and simplified ELO ratings |
| Treasury | `Treasury.sol` | Collects protocol rake fees; owner can withdraw |
| ELMTokenRoot | `ELMTokenRoot.sol` | TIP-3 token root interface (placeholder — extend Broxus TIP-3) |
| ELMTokenWallet | `ELMTokenWallet.sol` | TIP-3 wallet interface (placeholder — extend Broxus TIP-3) |

## Toolchain

- Compiler: `sold` (TVM Solidity compiler, >= 0.72.0)
- SDK: `@eversdk/core` + `@eversdk/lib-node`
- Network: Acki Nacki (endpoint: `https://shellnet.ackinacki.org/graphql`)

---

## Prerequisites

### 1. Install the TVM Solidity compiler (`sold`)

```bash
# macOS / Linux — download the latest release binary
curl -Lo sold https://github.com/ever-blockchain/TVM-Solidity-Compiler/releases/latest/download/sold-linux-amd64
chmod +x sold
sudo mv sold /usr/local/bin/

# Verify
sold --version
```

On Windows use WSL or the Docker image:

```bash
docker pull tonlabs/sold
alias sold='docker run --rm -v "$(pwd)":/src tonlabs/sold'
```

### 2. Install EverSDK node bindings

```bash
npm install --save-dev @eversdk/core @eversdk/lib-node
```

### 3. Install TIP-3 reference contracts (for ELMToken*)

```bash
git clone https://github.com/broxus/tip3 vendor/tip3
```

---

## Compiling

Each contract must be compiled to a `.tvc` (bag-of-cells) + `.abi.json` pair.

```bash
# Compile all contracts
for sol in *.sol; do
  sold --output-dir artifacts/ "$sol"
done
```

Or individually:

```bash
sold --output-dir artifacts/ ElmentalRoot.sol
sold --output-dir artifacts/ MatchEscrow.sol
sold --output-dir artifacts/ GameRegistry.sol
sold --output-dir artifacts/ Treasury.sol
```

The compiler produces:
- `artifacts/<ContractName>.tvc`  — compiled code cell
- `artifacts/<ContractName>.abi.json` — ABI for SDK interaction

> ELMTokenRoot.sol and ELMTokenWallet.sol are interface/placeholder files and
> should not be compiled directly. Use the Broxus TIP-3 source files instead.

---

## Key generation

Every contract is deployed with a keypair. The public key is embedded in the
`tvm.pubkey()` slot; external messages must be signed with the matching private
key.

```bash
# Generate a keypair (EverSDK CLI)
npx ever-cli genphrase         # generate 12-word seed
npx ever-cli getkeypair \
    --output keys/deployer.keys.json \
    "word1 word2 ... word12"
```

Keep `keys/deployer.keys.json` secret and out of source control.

---

## Deployment Order

Deploy in this order because later contracts reference earlier ones:

### Step 1 — Treasury

```bash
npx ever-cli deploy \
  --abi artifacts/Treasury.abi.json \
  --tvc artifacts/Treasury.tvc \
  --keys keys/deployer.keys.json \
  --params '{}'
```

Note the deployed address (e.g. `0:aaa...`). Set `TREASURY_ADDR`.

### Step 2 — GameRegistry (needs MatchEscrow address — deploy with a placeholder, update later)

```bash
npx ever-cli deploy \
  --abi artifacts/GameRegistry.abi.json \
  --tvc artifacts/GameRegistry.tvc \
  --keys keys/deployer.keys.json \
  --params '{"_escrow": "0:0000000000000000000000000000000000000000000000000000000000000000"}'
```

Note the address. Set `REGISTRY_ADDR`.

### Step 3 — ELMTokenRoot (use Broxus TIP-3 deployment script)

Follow the Broxus TIP-3 deployment guide in `vendor/tip3/README.md`. Supply:

```json
{
  "name": "Elmental",
  "symbol": "ELM",
  "decimals": 9,
  "owner": "<ElmentalRoot address — deploy it next>",
  "initialSupply": 0,
  "disableMint": false,
  "disableBurnByRoot": false
}
```

Note the address. Set `TOKEN_ROOT_ADDR`.

### Step 4 — MatchEscrow

```bash
npx ever-cli deploy \
  --abi artifacts/MatchEscrow.abi.json \
  --tvc artifacts/MatchEscrow.tvc \
  --keys keys/deployer.keys.json \
  --params "{
    \"_treasury\":     \"$TREASURY_ADDR\",
    \"_gameRegistry\": \"$REGISTRY_ADDR\",
    \"_tokenRoot\":    \"$TOKEN_ROOT_ADDR\"
  }"
```

Note the address. Set `ESCROW_ADDR`.

### Step 5 — Update GameRegistry with real escrow address

```bash
# GameRegistry.escrow is set in the constructor and is immutable.
# Re-deploy GameRegistry with the correct MatchEscrow address:
npx ever-cli deploy \
  --abi artifacts/GameRegistry.abi.json \
  --tvc artifacts/GameRegistry.tvc \
  --keys keys/deployer.keys.json \
  --params "{\"_escrow\": \"$ESCROW_ADDR\"}"
```

### Step 6 — ElmentalRoot

```bash
npx ever-cli deploy \
  --abi artifacts/ElmentalRoot.abi.json \
  --tvc artifacts/ElmentalRoot.tvc \
  --keys keys/deployer.keys.json \
  --params '{}'

# Wire up all addresses
npx ever-cli call $ROOT_ADDR setTokenRoot   \
  --abi artifacts/ElmentalRoot.abi.json \
  --keys keys/deployer.keys.json \
  --params "{\"addr\": \"$TOKEN_ROOT_ADDR\"}"

npx ever-cli call $ROOT_ADDR setMatchEscrow \
  --abi artifacts/ElmentalRoot.abi.json \
  --keys keys/deployer.keys.json \
  --params "{\"addr\": \"$ESCROW_ADDR\"}"

npx ever-cli call $ROOT_ADDR setGameRegistry \
  --abi artifacts/ElmentalRoot.abi.json \
  --keys keys/deployer.keys.json \
  --params "{\"addr\": \"$REGISTRY_ADDR\"}"

npx ever-cli call $ROOT_ADDR setTreasury \
  --abi artifacts/ElmentalRoot.abi.json \
  --keys keys/deployer.keys.json \
  --params "{\"addr\": \"$TREASURY_ADDR\"}"
```

---

## Gas Sponsoring

Acki Nacki uses a dual-currency model:

| Token | Role |
|---|---|
| SHELL | Native gas currency |
| VMSHELL | Execution gas (converted from SHELL via `gosh.cnvrtshellq()`) |

Every contract calls `gosh.mintshell(1 ton)` when its balance drops below 1 ton.
This mints SHELL from the DApp ID account (ElmentalRoot address) into the contract.

To top up the DApp ID, send SHELL to the ElmentalRoot address via the faucet or
a SHELL transfer from another account.

---

## Error Codes

| Code | Contract | Meaning |
|---|---|---|
| 101 | All | Contract deployed without a public key |
| 102 | All | External message not signed by the deployer key |
| 201 | MatchEscrow | Match is not in Created state (joinMatch) |
| 202 | MatchEscrow | Match is not in Active state |
| 203 | MatchEscrow | Winner address is not a participant |
| 204 | MatchEscrow | Timeout period has not elapsed yet |
| 205 | MatchEscrow | Match is not in Settled state (disputeMatch) |
| 206 | MatchEscrow | Caller is not a participant in this match |
| 301 | GameRegistry | Caller is not the MatchEscrow contract |
| 401 | Treasury | Insufficient balance for withdrawal |

---

## TIP-3 Integration Notes

The ELM token follows the TIP-3 standard. Key points:

- Each player has one **TokenWallet** deployed from the ELMTokenRoot.
- MatchEscrow has its own wallet (the "escrow wallet") deployed on first use.
- Players fund a match by calling `wallet.transfer(amount, escrowAddress, ...)` with `notify=true` and the match ID encoded in `payload`.
- MatchEscrow implements `onAcceptTokensTransfer()` to receive and validate incoming stakes.
- On settlement, MatchEscrow calls `transfer()` on its escrow wallet to pay the winner and `burn()` to destroy the loser's boost tokens.

See `ELMTokenRoot.sol` and `ELMTokenWallet.sol` for the interface definitions and full integration notes.

---

## Repository Layout

```
contracts/
  ElmentalRoot.sol      — Root contract / DApp ID
  MatchEscrow.sol       — Match lifecycle and token escrow
  GameRegistry.sol      — Stats and ELO ratings
  Treasury.sol          — Fee collection and withdrawal
  ELMTokenRoot.sol      — TIP-3 root interface (placeholder)
  ELMTokenWallet.sol    — TIP-3 wallet interface (placeholder)
  README.md             — This file
  artifacts/            — Compiler output (.tvc + .abi.json) — git-ignored
  keys/                 — Deployment keypairs — git-ignored, never commit
  vendor/tip3/          — Broxus TIP-3 reference implementation (git submodule)
```

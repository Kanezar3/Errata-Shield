# Errata Shield — Milestone v1: Citation Firewall

**Cross-Contract Retraction Contagion & Citation Immunity Engine on GenLayer StudioNet (`Chain ID 61999`).**

- **New Intelligent Contract (`CitationFirewall`):** [`0xBef0cD5F8cAc78b8883eca116A04138b3f1780C8`](https://explorer-studio.genlayer.com/address/0xBef0cD5F8cAc78b8883eca116A04138b3f1780C8)
- **Live Upstream Contract (`ErrataShield` v0):** [`0x789cC30C52eb51B16B7092B1eaB73d73B15dCA3c`](https://explorer-studio.genlayer.com/address/0x789cC30C52eb51B16B7092B1eaB73d73B15dCA3c)
- **Live Web App (Upgraded):** https://errata-shield.vercel.app (new **`Citation Firewall v1`** tab)
- **Milestone Proof Manifest:** [`deploy/proof_v1.json`](../deploy/proof_v1.json) · Independent verifier: `npm run verify:proof:v1`

---

## What Changed in Milestone v1

### 1. New Intelligent Contract: `contracts/citation_firewall.py` (`CitationFirewall`)
- **Live Cross-Contract State Verification (`gl.get_contract_at`):** Every downstream citation bond links directly to an upstream `bond_id` on live `ErrataShield` (`0x789c...dCA3c`). Before any contagion audit can run, `CitationFirewall` synchronously reads `ErrataShield.view().get_bond(upstream_bond_id)` on-chain and deterministically blocks contagion (`REJECTED_INVALID: UPSTREAM_NOT_INVALIDATED`, full stake refund, zero LLM call) unless the upstream paper is `INVALIDATED_SLASHED`.
- **Stronger Causal Citation-Role Judgment:** Instead of flagging every citation of a retracted paper blindly, validators independently fetch the pinned archive excerpt, verify identical `snippet_sha256` and `>= 12`-char verbatim quotes inside the snippet, and classify the causal role:
  - `LOAD_BEARING_DEPENDENCY` (`DIRECT_PREMISE_RELIANCE` / `METHOD_OR_DATA_INHERITED`) → downstream bond **`CONTAGION_SLASHED`** (bond + stake to challenger).
  - `INCIDENTAL_OR_CRITICAL_CITATION` (`CRITICAL_OR_REFUTING_CITATION` / `BACKGROUND_MENTION_ONLY` / `INDEPENDENT_METHODOLOGY`) → downstream bond **`IMMUNE_UPHELD`** (bond + stake to downstream author).
  - `INSUFFICIENT_CONTEXT` / `UNVERIFIABLE_FETCH` → downstream bond remains **`MONITORED`** (retriable without false slashing).
- **Hardened Protocol Economics & Security:**
  - Anti-self-griefing: blocks `challenger == author` (`AUTHOR_CANNOT_SELF_CHALLENGE`) with zero-revert stake refund and untouched attempt counter.
  - Per-challenger attempt caps (`MAX_ATTEMPTS_PER_CHALLENGER = 3`, `MAX_TOTAL_AUDITS_PER_BOND = 15`) prevent single-actor DOS.
  - Quote-centered `1600`-char `snippet_excerpt` guarantees every winning verbatim quote is present inside the stored preview.
  - Chain-layer EOA payouts via `@gl.evm.contract_interface` `emit_transfer` executed strictly upon GenLayer finalization, plus fail-closed `settle_expired_citation_bond`.

### 2. Fresh Live StudioNet Proof (`14/14` Finalized Transactions)
All 14 Milestone v1 transactions finalized as `FINALIZED / MAJORITY_AGREE / SUCCESS` under StudioNet's `FeesDistribution` policy (`genlayer-py==0.19.0`):

| Case / Step | Outcome | StudioNet Transaction |
| :--- | :--- | :--- |
| Deploy `CitationFirewall` | `0xBef0cD...80C8` (linked to `0x789c...dCA3c`) | [`0x3830c5cc...`](https://explorer-studio.genlayer.com/tx/0x3830c5cc9abcdb325cd8d40bd4adc012cf6d87e4df3ae34674f7bb38b3ddbd34) |
| **`cite-1`** + **`fw-audit-1`** (STAP `bond-1` → Acid-Bath Protocol) | `LOAD_BEARING_DEPENDENCY` → **`CONTAGION_SLASHED`** (+120 wei) | [`0x91c49385...`](https://explorer-studio.genlayer.com/tx/0x91c4938512c91efb60441a434ff66eca37a324b5343b639fe4a1a22b58bc0139) |
| **`cite-2`** + **`fw-audit-2`** (STAP `bond-1` → RIKEN Non-Replication) | `INCIDENTAL_OR_CRITICAL_CITATION` → **`IMMUNE_UPHELD`** (+120 wei) | [`0xee8174f4...`](https://explorer-studio.genlayer.com/tx/0xee8174f42a41c6825b4e2bd1ff4b04444ebf1c91acc941cfff786b1441766c76) |
| **`cite-3`** + **`fw-audit-3`** (Fermat `bond-3` `UPHELD_BENIGN`) | Cross-contract gate: **`UPSTREAM_NOT_INVALIDATED`** (stake refunded) | [`0xb57735f1...`](https://explorer-studio.genlayer.com/tx/0xb57735f12f2338a35fa9b129dbf7de90a3c7b6310a198ad322327f1769bb8ede) |
| **`cite-4`** + **`fw-audit-4`** (Unrelated Photosynthesis excerpt) | **`INSUFFICIENT_CONTEXT`** (`cite-4` stays `MONITORED`) | [`0xd9b07c6f...`](https://explorer-studio.genlayer.com/tx/0xd9b07c6ff5c9025e3ee830956ee70111c9c2e6e001d2d2abcf65bb1057c3f006) |
| **`fw-audit-5`** (Author self-challenge on `cite-4`) | Anti-griefing: **`AUTHOR_CANNOT_SELF_CHALLENGE`** (stake refunded) | [`0x948d509d...`](https://explorer-studio.genlayer.com/tx/0x948d509deb0fe79ebb50137338a430b885223057ccaaf0de68e9ca635c699c1c) |
| **`cite-5`** + **`settle_expired_citation_bond`** (`15s` timeout) | **`EXPIRED_RETURNED`** (100 wei refunded to Author) | [`0x32b7ca52...`](https://explorer-studio.genlayer.com/tx/0x32b7ca52bc68b2f8863fa8d4acf6ad20c2252b679738a99c77d4dd611d4e3d7f) |
| Author & Challenger `withdraw_refundable()` | `260 wei` + `140 wei` withdrawn (post-withdraw `0 / 0`) | [`0x68f96e10...`](https://explorer-studio.genlayer.com/tx/0x68f96e10e35f46e8a4261b936db33149a720830fb370eb571cb530d15bc47383) · [`0x40941cd2...`](https://explorer-studio.genlayer.com/tx/0x40941cd273e0785c162ddc949eabf93948e20d64a4feba9ccd7f85713658cfaf) |

### 3. Upgraded Frontend & Wallet Reliability
- Added **`Citation Firewall (v1)`** tab ([`CitationFirewallPanel.tsx`](../frontend/src/components/CitationFirewallPanel.tsx)) featuring an **Interactive Cross-Contract Citation Dependency Graph** (Upstream `ErrataShield` root bonds → Downstream `CitationFirewall` nodes), live `Verify Live Firewall RPC` parity reads, inline highlighted verbatim quotes inside `snippet_excerpt`, browser WebCrypto SHA-256 verification, per-tx StudioNet Explorer links, and finalized EOA withdrawal ledger.
- Fixed cold-load wallet initialization in [`frontend/src/lib/genlayer.ts`](../frontend/src/lib/genlayer.ts) by awaiting `client.initializeConsensusSmartContract()` prior to writes.

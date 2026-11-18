# Portal Submission Guide — Errata Shield

## `01` Identity
- **Logo:** Upload `logo.png` (`1024x1024` PNG) from repository root.
- **Project Name:** `Errata Shield`
- **One-Liner (<= 100 chars):**
  `Retraction-aware scientific errata materiality escrow on GenLayer StudioNet.`

## `02` Description (<= 1,000 chars)
```text
Errata Shield is a two-gate Intelligent Contract protocol on GenLayer StudioNet (0x789cC30C52eb51B16B7092B1eaB73d73B15dCA3c) that distinguishes material scientific retractions from benign typographical corrigenda over immutable public archives.

1. Gate 1 (create_finding_bond) validates empirical falsifiability (VERIFIABLE_FINDING vs TOO_VAGUE) and freezes the finding SHA-256 and allowed_source_prefix, immediately crediting refundable_balances on any rejection so zero wei is stranded.
2. Gate 2 (submit_errata_audit) fetches immutable Wikipedia oldid or commit-pinned GitHub slices, verifies SHA-256 parity and verbatim quotes in gl.vm.run_nondet_unsafe, and enforces a strict VERDICT_COMPATIBLE_REASONS matrix (MATERIAL_INVALIDATION, BENIGN_CORRIGENDUM, INSUFFICIENT_EVIDENCE, UNVERIFIABLE_FETCH).
3. Non-conclusive outcomes preserve OPEN bond retries; expiry fallback (settle_expired_bond) and real EOA emit_transfer withdrawals (withdraw_refundable) are proven live across 16 finalized StudioNet transactions.
```

## `03` How-To Steps (Matches Exact UI Labels)
1. **Inspect Recorded & Live Proof:** Open the default **Proof Dossiers** tab (no wallet required), select Cases 1–7, expand **Inspect Normalized Line-Slice Excerpt**, and click **Refresh Live RPC** to compare recorded `deploy/proof.json` against live StudioNet `list_bonds` and `list_audits` state.
2. **Submit or Audit via Wallet:** Open **Filing Desk**, click **Connect MetaMask (Chain 61999)**, click **LOAD EXAMPLE FILING**, and submit `create_finding_bond` or `submit_errata_audit` (with `start_line`/`end_line`).
3. **Settle Expiry & Withdraw Escrow:** On **Filing Desk**, use **Escrow Withdrawals & Bond Expiry Settlement** (`settle_expired_bond` / **Withdraw Refundable Balance**) and monitor GenLayer consensus stages in the live transaction tracker.

## `04` Links
- **Contract Explorer:** `https://explorer-studio.genlayer.com/address/0x789cC30C52eb51B16B7092B1eaB73d73B15dCA3c`
- **EvidenceProbe Explorer:** `https://explorer-studio.genlayer.com/address/0xfCb0Ee3eDcEFDE1f979310602067083bC55Be1Ee`

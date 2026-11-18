# Tutorial: Building a Two-Gate Errata Materiality Escrow on GenLayer (`Errata Shield`)

This tutorial walks through how **Errata Shield** uses GenLayer Intelligent Contracts (`contracts/errata_shield.py`), deterministic pre-LLM evidence slicing, and a React + `genlayer-js` frontend to adjudicate whether a published erratum or retraction notice **materially invalidates** a scientific claim or is merely a **cosmetic corrigendum**.

---

## 1. Why Errata Materiality Requires LLM Validator Consensus

Consider two real-world publication updates:
1. **STAP Cells (Nature, 2014):** Follow-up replication attempts failed and the paper was retracted due to error and misconduct.
2. **Cosmetic Corrigendum:** An author fixes *"proof this"* to *"proof of this"* or notes a repaired historical step while the theorem stands.

Both notices contain words like *"error"*, *"correction"*, or *"revised"*. A deterministic string matcher or price-feed oracle cannot distinguish a fatal invalidation from a harmless typographical cleanup. GenLayer solves this by letting decentralized validators fetch the same immutable snapshot, verify its SHA-256 digest, and reach consensus on a strict semantic classification while deterministic Python code custodies and settles all funds.

---

## 2. Step 1 — Probe Network Reachability First (`contracts/evidence_probe.py`)

Before deploying a full escrow contract, deploy a minimal probe contract (`contracts/evidence_probe.py`) to confirm:
- Your pinned GenVM runner hash (`# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }`) resolves on StudioNet.
- StudioNet validators can fetch your target host (`en.wikipedia.org/w/api.php` or `raw.githubusercontent.com`) and agree on the exact `snippet_sha256` after line slicing and smart-quote normalization.
- `leader_result.calldata` inside `gl.vm.run_nondet_unsafe` is decoded safely whether the runtime passes a Python `str` or `bytes` (`_decode_leader_calldata`).

---

## 3. Step 2 — Prevent Stranded Funds and Ambiguous Verdicts (`contracts/errata_shield.py`)

When writing payable GenLayer contracts, follow five non-negotiable patterns implemented in `contracts/errata_shield.py`:

### A. Capture Deposits on Line 1
On StudioNet, if a payable method returns early without reverting, `gl.message.value` still enters the contract balance. In `create_finding_bond` and `submit_errata_audit`, capture `sender = _sender_hex()` and `deposit = int(gl.message.value)` immediately, and call `self._credit_refundable(sender, deposit)` on **every** validation rejection or `TOO_VAGUE` outcome.

### B. Enforce a Verdict ↔ Reason Compatibility Matrix
Define `VERDICT_COMPATIBLE_REASONS` in Python so every LLM verdict can only pair with its valid reason codes:
- `MATERIAL_INVALIDATION` $\leftrightarrow$ `CLAIM_OR_PROOF_INVALIDATED`, `MISSING_HYPOTHESIS_OR_COUNTEREXAMPLE`, `RETRACTION_CONFIRMED`
- `BENIGN_CORRIGENDUM` $\leftrightarrow$ `COSMETIC_TYPO_ONLY`, `NOTATION_OR_CITATION_CLEANUP`, `FINDING_EXPRESSLY_UPHELD`
- `INSUFFICIENT_EVIDENCE` $\leftrightarrow$ `UNRELATED_EXCERPT`, `NO_ERRATUM_IN_WINDOW`, `ADVERSARIAL_INJECTION_IGNORED`
- `UNVERIFIABLE_FETCH` $\leftrightarrow$ `HTTP_FETCH_FAILURE`, `EMPTY_LINE_SLICE`

Both `leader_fn` and `validator_fn` call `_assert_verdict_reason_pair(...)`, and conclusive verdicts (`MATERIAL_INVALIDATION`, `BENIGN_CORRIGENDUM`) additionally require a verbatim substring `quote` (`len >= 12`) present in the validator's own fetched `snippet`.

### C. Preserve Retries on Non-Conclusive Outcomes
If an HTTP fetch returns non-200 or an empty line slice (`UNVERIFIABLE_FETCH`), refund the challenger's stake without slashing the bond and keep `bond["status"] == "OPEN"` (incrementing `audit_attempts` up to `MAX_AUDIT_ATTEMPTS = 5`).

### D. Use Fail-Closed Runtime Time & Native EOA Transfers
Parse `gl.message_raw["datetime"]` in `_now_ts()` and raise `gl.vm.UserError("TRUSTED_TIME_UNAVAILABLE")` if missing—never expose a `time_offset` setter. Execute withdrawals with `_EoaRecipient(gl.message.sender_address).emit_transfer(value=u256(amount))`.

---

## 4. Step 3 — Verify Locally, Deploy, and Inspect in the Browser

Run the local contract test suite and StudioNet proof verifier:

```bash
python -m pytest tests/test_errata_shield.py -v
python deploy/verify_proof.py
```

Then run the frontend locally (`npm --prefix frontend run dev`) to inspect all 7 finalized proof cases in **Proof Dossiers** without connecting a wallet, test in-browser SHA-256 verification, and submit new bonds or withdrawals via **Filing Desk** (`Chain ID 61999`).

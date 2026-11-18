# Errata Shield — 2-Minute Demo Script

**0:00 – 0:25 | The Problem & Why GenLayer**
- Open **Errata Shield** on the **Proof Dossiers** tab (zero wallet required).
- Explain the core insight: both a fatal scientific retraction and a harmless spelling corrigendum modify the publication record and use words like *"error"* or *"correction"*. Ordinary smart contracts and regexes cannot tell them apart; GenLayer validators read immutable archival slices and agree on materiality.

**0:25 – 1:05 | Walkthrough of Real On-Chain Cases**
- Select **Case 1 (`MATERIAL_INVALIDATION`)**: *STAP Cells (Nature, 2014)*. Show the fetched Wikipedia `oldid=1375988571` excerpt, highlighted verbatim quote (*"all scientists who tried to duplicate her results failed..."*), SHA-256 digest, and payout (`120 wei` credited to challenger; bond slashed).
- Select **Case 2 (`BENIGN_CORRIGENDUM`)**: *Fermat's Last Theorem (1995)*. Show how validators distinguish a repaired historical step / benign notice (`FINDING_EXPRESSLY_UPHELD`) and award `120 wei` to the bond creator.
- Select **Case 3 (`TOO_VAGUE`)** and **Cases 4–6 (`INSUFFICIENT_EVIDENCE`, `UNVERIFIABLE_FETCH`, `REJECTED_INVALID`)**: Show that vague claims, empty line slices, and forbidden/mutable URLs never strand user deposits or falsely slash bonds.
- Select **Case 7 (`EXPIRED_RETURNED`)**: Point to the finalized `settle_expired_bond` transaction and both real EOA `withdraw_refundable()` native transfers (`340 wei` creator, `160 wei` challenger).

**1:05 – 1:40 | Live StudioNet RPC & Excerpt Inspection**
- Expand **Inspect Normalized Line-Slice Excerpt** on Case 1 to show the exact line-sliced text and `Snippet Digest (SHA-256)` verified by validators.
- Click **Refresh Live RPC** on the **Live StudioNet RPC** panel (`0x789cC30C52eb51B16B7092B1eaB73d73B15dCA3c`) to confirm live `list_bonds()` and `list_audits()` parity with `deploy/proof.json`.

**1:40 – 2:00 | Interactive Filing Desk**
- Switch to **Filing Desk**, click **LOAD EXAMPLE FILING**, and show how MetaMask (`Chain ID 61999`) submits `create_finding_bond`, `submit_errata_audit`, `settle_expired_bond`, and `withdraw_refundable` with live 7-second consensus tracking.

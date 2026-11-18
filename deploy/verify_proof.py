"""Verify all finalized StudioNet transactions in errata-shield/deploy/proof.json."""

from __future__ import annotations

import json
import pathlib
import sys
import time
from typing import Any

import requests

BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)
TRANSIENT_HTTP = {429, 502, 503, 504}
DEPLOY_DIR = pathlib.Path(__file__).resolve().parent
PROJECT_ROOT = DEPLOY_DIR.parent
PROOF_PATH = DEPLOY_DIR / "proof.json"
FRONTEND_PUBLIC_PROOF = PROJECT_ROOT / "frontend" / "public" / "proof.json"
FRONTEND_DATA_PROOF = PROJECT_ROOT / "frontend" / "src" / "data" / "proof.json"


def rpc_call(rpc_url: str, method: str, params: list[Any]) -> Any:
    """Call StudioNet JSON-RPC with browser UA and transient retry."""
    last_exc: Exception | None = None
    for attempt in range(1, 5):
        try:
            resp = requests.post(
                rpc_url,
                json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": BROWSER_USER_AGENT,
                    "Connection": "close",
                },
                timeout=30,
            )
            if resp.status_code in TRANSIENT_HTTP and attempt < 4:
                time.sleep(5.0 * attempt)
                continue
            resp.raise_for_status()
            payload = resp.json()
            if payload.get("error"):
                raise RuntimeError(f"RPC error on {method}: {payload['error']}")
            return payload.get("result")
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt < 4:
                time.sleep(5.0 * attempt)
    raise RuntimeError(f"RPC {method} failed: {last_exc}")


def collect_tx_entries(proof: dict[str, Any]) -> list[tuple[str, str]]:
    """Collect unique (label, tx_hash) pairs from proof.json."""
    entries: list[tuple[str, str]] = []
    seen: set[str] = set()

    def add(label: str, tx_hash: Any) -> None:
        if not isinstance(tx_hash, str) or not tx_hash.strip():
            return
        norm = tx_hash.strip()
        if norm not in seen:
            seen.add(norm)
            entries.append((label, norm))

    probe = proof.get("evidence_probe") or {}
    add("evidence_probe:deploy", probe.get("deploy_tx_hash"))
    add("evidence_probe:probe", probe.get("probe_tx_hash"))
    add("errata_shield:deploy", proof.get("deploy_tx_hash"))

    for case in proof.get("cases") or []:
        cid = str(case.get("case_id") or "case")
        add(f"{cid}:create", case.get("create_tx_hash"))
        add(f"{cid}:audit", case.get("audit_tx_hash"))
        add(f"{cid}:settle", case.get("settle_tx_hash"))
        add(f"{cid}:withdraw", case.get("withdraw_tx_hash"))

    for role, w in (proof.get("withdrawals") or {}).items():
        if isinstance(w, dict):
            add(f"withdraw:{role}", w.get("tx_id"))

    return entries


def main() -> int:
    if not PROOF_PATH.exists():
        raise FileNotFoundError(f"Missing {PROOF_PATH}")
    proof_text = PROOF_PATH.read_text(encoding="utf-8")
    proof = json.loads(proof_text)

    if proof.get("is_placeholder"):
        raise RuntimeError("deploy/proof.json still has is_placeholder=true")

    rpc_url = (proof.get("network") or {}).get("rpc_url") or "https://studio.genlayer.com/api"
    chain_id = int(rpc_call(rpc_url, "eth_chainId", []), 16)
    if chain_id != 61999:
        raise RuntimeError(f"Unexpected chain_id={chain_id}, expected 61999")

    contract_address = str(proof.get("contract_address") or "")
    if not contract_address:
        raise RuntimeError("Missing contract_address in proof.json")

    entries = collect_tx_entries(proof)
    if not entries:
        raise RuntimeError("No transaction hashes found in proof.json")

    for label, tx_hash in entries:
        tx = rpc_call(rpc_url, "eth_getTransactionByHash", [tx_hash])
        if not isinstance(tx, dict):
            raise RuntimeError(f"Transaction not found: {label} ({tx_hash})")
        status = str(tx.get("status_name") or tx.get("status") or "")
        result_name = str(tx.get("result_name") or "")
        lr = ((tx.get("consensus_data") or {}).get("leader_receipt") or [{}])[0]
        leader_exec = str(lr.get("execution_result") or "")

        if status != "FINALIZED":
            raise RuntimeError(f"{label} ({tx_hash}) status={status}, expected FINALIZED")
        if result_name != "MAJORITY_AGREE":
            raise RuntimeError(f"{label} ({tx_hash}) result_name={result_name}, expected MAJORITY_AGREE")
        if leader_exec != "SUCCESS":
            raise RuntimeError(f"{label} ({tx_hash}) leader_exec={leader_exec}, expected SUCCESS")

        if label == "errata_shield:deploy":
            deployed = (tx.get("data") or {}).get("contract_address") or tx.get("to_address") or ""
            if deployed.lower() != contract_address.lower():
                raise RuntimeError(
                    f"Deployed address mismatch: {deployed} != {contract_address}"
                )

        print(f"[OK] {label} -> {tx_hash} ({status} / {result_name} / {leader_exec})")
        time.sleep(0.3)

    for label_name, mirror_path in (
        ("frontend/public/proof.json", FRONTEND_PUBLIC_PROOF),
        ("frontend/src/data/proof.json", FRONTEND_DATA_PROOF),
    ):
        if mirror_path.exists():
            mirror = mirror_path.read_text(encoding="utf-8")
            if mirror.strip() != proof_text.strip():
                raise RuntimeError(f"{label_name} is out of sync with deploy/proof.json")
            print(f"[OK] Mirror synced: {label_name}")

    print(
        f"Verified {len(entries)} finalized StudioNet transactions for ErrataShield {contract_address} on chain {chain_id}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

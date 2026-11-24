"""Independent read-only verifier for Errata Shield Milestone v1 (deploy/proof_v1.json)."""

from __future__ import annotations

import json
import pathlib
import sys
from typing import Any

import requests
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet

ROOT = pathlib.Path(__file__).resolve().parent.parent
PROOF_PATH = ROOT / "deploy" / "proof_v1.json"
RPC_URL = "https://studio.genlayer.com/api"
HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
}


def rpc(method: str, params: list[Any]) -> Any:
    r = requests.post(
        RPC_URL,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        headers=HEADERS,
        timeout=60,
    )
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise RuntimeError(f"RPC {method} error: {data['error']}")
    return data["result"]


def main() -> int:
    proof = json.loads(PROOF_PATH.read_text(encoding="utf-8"))
    fw_addr = proof["citation_firewall"]["address"]

    tx_hashes: list[tuple[str, str]] = [
        ("deploy_citation_firewall", proof["citation_firewall"]["deploy_tx"]["tx_hash"])
    ]
    for name, info in proof["transactions"].items():
        tx_hashes.append((name, info["tx_hash"]))

    print(f"Verifying {len(tx_hashes)} Milestone v1 transactions on GenLayer StudioNet...")
    failures = 0
    for name, h in tx_hashes:
        tx = rpc("eth_getTransactionByHash", [h])
        if not tx:
            print(f"  [FAIL] {name}: {h} not found")
            failures += 1
            continue
        status = tx.get("status_name") or tx.get("status")
        result_name = tx.get("result_name") or ""
        leaders = (tx.get("consensus_data") or {}).get("leader_receipt") or []
        exec_res = leaders[0].get("execution_result") if leaders else ""
        ok = status == "FINALIZED" and (not exec_res or exec_res == "SUCCESS")
        print(
            f"  [{'OK  ' if ok else 'FAIL'}] {name:38s} {h[:14]}... "
            f"status={status} result={result_name} exec={exec_res}"
        )
        if not ok:
            failures += 1

    print("\nVerifying live CitationFirewall contract state parity...")
    client = create_client(chain=studionet, account=create_account())
    cites = json.loads(client.read_contract(address=fw_addr, function_name="list_citation_bonds", args=[]))
    audits = json.loads(client.read_contract(address=fw_addr, function_name="list_audits", args=[]))
    c_by_id = {c["citation_id"]: c for c in cites}
    a_by_id = {a["audit_id"]: a for a in audits}

    a1 = a_by_id.get("fw-audit-1", {})
    a2 = a_by_id.get("fw-audit-2", {})

    checks = [
        ("cite-1 CONTAGION_SLASHED", c_by_id.get("cite-1", {}).get("status") == "CONTAGION_SLASHED"),
        ("cite-2 IMMUNE_UPHELD", c_by_id.get("cite-2", {}).get("status") == "IMMUNE_UPHELD"),
        ("cite-3 MONITORED (upstream Fermat UPHELD)", c_by_id.get("cite-3", {}).get("status") == "MONITORED"),
        ("cite-4 MONITORED (retriable after unrelated)", c_by_id.get("cite-4", {}).get("status") == "MONITORED"),
        ("cite-5 EXPIRED_RETURNED", c_by_id.get("cite-5", {}).get("status") == "EXPIRED_RETURNED"),
        (
            "fw-audit-1 LOAD_BEARING_DEPENDENCY + quote in excerpt",
            a1.get("verdict") == "LOAD_BEARING_DEPENDENCY"
            and a1.get("quote", "") in a1.get("snippet_excerpt", ""),
        ),
        (
            "fw-audit-2 INCIDENTAL_OR_CRITICAL_CITATION + quote in excerpt",
            a2.get("verdict") == "INCIDENTAL_OR_CRITICAL_CITATION"
            and a2.get("quote", "") in a2.get("snippet_excerpt", ""),
        ),
        ("fw-audit-3 UPSTREAM_NOT_INVALIDATED", a_by_id.get("fw-audit-3", {}).get("reason") == "UPSTREAM_NOT_INVALIDATED"),
        ("fw-audit-4 INSUFFICIENT_CONTEXT", a_by_id.get("fw-audit-4", {}).get("verdict") == "INSUFFICIENT_CONTEXT"),
        ("fw-audit-5 AUTHOR_CANNOT_SELF_CHALLENGE", a_by_id.get("fw-audit-5", {}).get("reason") == "AUTHOR_CANNOT_SELF_CHALLENGE"),
    ]
    for label, passed in checks:
        print(f"  [{'OK  ' if passed else 'FAIL'}] {label}")
        if not passed:
            failures += 1

    print(f"\nSummary: {len(tx_hashes)} txs checked, {len(checks)} state invariants checked, {failures} failures.")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

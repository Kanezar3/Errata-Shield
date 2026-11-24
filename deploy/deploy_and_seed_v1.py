"""Resumable GenLayer StudioNet deployment & live proof seeder for Errata Shield Milestone v1 (CitationFirewall).

Deploys CitationFirewall linked to live ErrataShield (0x789cC30C52eb51B16B7092B1eaB73d73B15dCA3c),
executes cross-contract reads, LOAD_BEARING_DEPENDENCY slashing, INCIDENTAL_OR_CRITICAL_CITATION
immunization, UPSTREAM_NOT_INVALIDATED gating, INSUFFICIENT_CONTEXT retry preservation,
AUTHOR_CANNOT_SELF_CHALLENGE anti-griefing, expiry settlement, and real EOA withdrawals.
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import time
from datetime import datetime, timezone
from typing import Any

import requests
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet

ROOT = pathlib.Path(__file__).resolve().parent.parent
SECRETS_PATH = ROOT / ".secrets.v1.local.json"
STATE_PATH = ROOT / "deploy" / "seed_state_v1.json"
PROOF_PATH = ROOT / "deploy" / "proof_v1.json"

RPC_URL = "https://studio.genlayer.com/api"
EXPLORER_BASE = "https://explorer-studio.genlayer.com"
CHAIN_ID = 61999

ERRATA_SHIELD_ADDR = "0x789cC30C52eb51B16B7092B1eaB73d73B15dCA3c"

STAP_PREFIX = "https://en.wikipedia.org/w/api.php?action=parse&oldid=1375988571"
STAP_SEC1_URL = (
    "https://en.wikipedia.org/w/api.php?action=parse&oldid=1375988571"
    "&prop=wikitext&section=1&format=json"
)
STAP_SEC3_URL = (
    "https://en.wikipedia.org/w/api.php?action=parse&oldid=1375988571"
    "&prop=wikitext&section=3&format=json"
)
FERMAT_PREFIX = "https://en.wikipedia.org/w/api.php?action=parse&oldid=1382142422"
FERMAT_SEC0_URL = (
    "https://en.wikipedia.org/w/api.php?action=parse&oldid=1382142422"
    "&prop=wikitext&section=0&format=json"
)
WIKI_OLDID_PREFIX = "https://en.wikipedia.org/w/api.php?action=parse&oldid="
PHOTOSYNTH_URL = (
    "https://en.wikipedia.org/w/api.php?action=parse&oldid=1385696147"
    "&prop=wikitext&section=0&format=json"
)

BROWSER_HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
}


def rpc_call(method: str, params: list[Any]) -> Any:
    resp = requests.post(
        RPC_URL,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        headers=BROWSER_HEADERS,
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"RPC {method} error: {data['error']}")
    return data["result"]


def get_eth_balance(address: str) -> int:
    raw = rpc_call("eth_getBalance", [address, "latest"])
    return int(raw, 16) if isinstance(raw, str) else int(raw)


def get_git_head() -> str:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=str(ROOT), stderr=subprocess.DEVNULL
        )
        return out.decode("utf-8").strip()
    except Exception:
        return ""


def load_or_create_accounts() -> tuple[Any, Any]:
    if SECRETS_PATH.exists():
        data = json.loads(SECRETS_PATH.read_text(encoding="utf-8"))
        return create_account(data["author_private_key"]), create_account(
            data["challenger_private_key"]
        )

    author = create_account()
    challenger = create_account()
    SECRETS_PATH.write_text(
        json.dumps(
            {
                "author_address": author.address,
                "author_private_key": author.key.hex(),
                "challenger_address": challenger.address,
                "challenger_private_key": challenger.key.hex(),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return author, challenger


def load_state() -> dict[str, Any]:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {"steps": {}, "contracts": {}}


def save_state(state: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


def get_fees(client: Any) -> dict[str, Any]:
    est = client.estimate_transaction_fees()
    return {
        "distribution": est["distribution"],
        "feeValue": est["feeValue"],
    }


def extract_tx_meta(receipt: dict[str, Any], tx_hash: str) -> dict[str, Any]:
    consensus = receipt.get("consensus_data") or {}
    leader_list = consensus.get("leader_receipt") or []
    leader = leader_list[0] if leader_list else {}
    lifecycle = receipt.get("lifecycle") or {}
    raw_status = (
        receipt.get("status_name")
        or receipt.get("status")
        or lifecycle.get("kind")
        or ""
    )
    status = str(raw_status).upper()
    if status == "7":
        status = "FINALIZED"
    result_name = str(receipt.get("result_name") or receipt.get("result") or "")
    exec_res = str(leader.get("execution_result") or "")
    return {
        "tx_hash": tx_hash,
        "explorer_url": f"{EXPLORER_BASE}/tx/{tx_hash}",
        "status": status,
        "result_name": result_name,
        "execution_result": exec_res,
    }


def wait_finalized(client: Any, tx_hash: str, label: str) -> dict[str, Any]:
    print(f"  [wait] {label} -> {tx_hash}")
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx_hash,
        wait_until="finalized",
        retries=80,
        interval=8000,
    )
    raw_tx = rpc_call("eth_getTransactionByHash", [tx_hash]) or receipt
    meta = extract_tx_meta(raw_tx, tx_hash)
    print(
        f"  [done] {label}: status={meta['status']} "
        f"result={meta['result_name']} exec={meta['execution_result']}"
    )
    if meta["status"] != "FINALIZED":
        raise RuntimeError(f"{label} did not finalize: {meta}")
    if meta["execution_result"] and meta["execution_result"] not in ("SUCCESS", "FINISHED_WITH_RETURN"):
        raise RuntimeError(f"{label} execution failed: {meta}")
    return raw_tx


def run_step(state: dict[str, Any], key: str, label: str, fn) -> dict[str, Any]:
    if key in state["steps"]:
        print(f"[skip] {key} already finalized: {state['steps'][key]['tx_hash']}")
        return state["steps"][key]
    print(f"\n[run] {key}: {label}")
    result = fn()
    state["steps"][key] = result
    save_state(state)
    return result


def main() -> None:
    author, challenger = load_or_create_accounts()
    print(f"Author EOA:     {author.address}")
    print(f"Challenger EOA: {challenger.address}")

    for label, acct in (("Author", author), ("Challenger", challenger)):
        bal = get_eth_balance(acct.address)
        if bal < 2 * 10**18:
            try:
                rpc_call("sim_fundAccount", [acct.address, 10 * 10**18])
                time.sleep(2.0)
                bal = get_eth_balance(acct.address)
            except Exception as exc:
                print(f"  [warn] sim_fundAccount({label}) skipped: {exc}")
        print(f"  [{label}] balance={bal} wei")

    author_client = create_client(chain=studionet, account=author)
    challenger_client = create_client(chain=studionet, account=challenger)
    state = load_state()

    # Deploy CitationFirewall linked to live ErrataShield v0
    if "citation_firewall" not in state["contracts"]:
        print("\n[deploy] CitationFirewall ...")
        code = (ROOT / "contracts" / "citation_firewall.py").read_text(encoding="utf-8")
        tx_hash = None
        for attempt in range(1, 5):
            try:
                tx_hash = author_client.deploy_contract(
                    code=code,
                    args=[ERRATA_SHIELD_ADDR, 100, 20, 900],
                    fees=get_fees(author_client),
                )
                break
            except Exception as exc:
                print(f"  [retry {attempt}/4] deploy_contract failed: {exc}")
                if attempt == 4:
                    raise
                time.sleep(10 * attempt)
        receipt = wait_finalized(author_client, tx_hash, "deploy CitationFirewall")
        addr = receipt.get("data", {}).get("contract_address") or receipt.get("to_address")
        state["contracts"]["citation_firewall"] = {
            "address": addr,
            "deploy_tx": extract_tx_meta(receipt, tx_hash),
        }
        save_state(state)
    fw_addr = state["contracts"]["citation_firewall"]["address"]
    print(f"CitationFirewall: {fw_addr}")

    # Cite 1: Load-bearing downstream protocol citing retracted STAP bond-1
    run_step(
        state,
        "register_cite_1_load_bearing",
        "register_citation_bond(cite-1 -> bond-1 STAP load-bearing protocol, 100 wei)",
        lambda: _write_tx(
            author_client,
            fw_addr,
            "register_citation_bond",
            [
                "bond-1",
                "Acid-Bath Placental Reprogramming Protocol (2014)",
                "Applying Obokata's weak-acid STAP stress to CD45+ murine spleen cells produces totipotent cells able to differentiate into placental cells.",
                STAP_PREFIX,
                900,
            ],
            value=100,
            label="register_cite_1_load_bearing",
            entity_id="cite-1",
        ),
    )

    run_step(
        state,
        "audit_1_load_bearing_slashed",
        "submit_contagion_audit(cite-1, STAP sec=1 -> LOAD_BEARING_DEPENDENCY / CONTAGION_SLASHED)",
        lambda: _write_tx(
            challenger_client,
            fw_addr,
            "submit_contagion_audit",
            ["cite-1", STAP_SEC1_URL, 1, 10],
            value=20,
            label="audit_1_load_bearing_slashed",
            entity_id="fw-audit-1",
        ),
    )

    # Cite 2: Critical / non-replication study citing retracted STAP bond-1 -> IMMUNE_UPHELD
    run_step(
        state,
        "register_cite_2_critical_immune",
        "register_citation_bond(cite-2 -> bond-1 RIKEN non-replication report, 100 wei)",
        lambda: _write_tx(
            author_client,
            fw_addr,
            "register_citation_bond",
            [
                "bond-1",
                "RIKEN Multi-Lab Independent Non-Replication Report (2014)",
                "Independent verification attempts failed to duplicate Obokata's STAP results, critically refuting acid-bath pluripotency.",
                STAP_PREFIX,
                900,
            ],
            value=100,
            label="register_cite_2_critical_immune",
            entity_id="cite-2",
        ),
    )

    run_step(
        state,
        "audit_2_critical_immunized",
        "submit_contagion_audit(cite-2, STAP sec=3 -> INCIDENTAL_OR_CRITICAL_CITATION / IMMUNE_UPHELD)",
        lambda: _write_tx(
            challenger_client,
            fw_addr,
            "submit_contagion_audit",
            ["cite-2", STAP_SEC3_URL, 1, 15],
            value=20,
            label="audit_2_critical_immunized",
            entity_id="fw-audit-2",
        ),
    )

    # Cite 3: Downstream paper citing UPHELD Fermat's Last Theorem (bond-3) -> Cross-contract gate
    run_step(
        state,
        "register_cite_3_upheld_upstream",
        "register_citation_bond(cite-3 -> bond-3 Fermat UPHELD_BENIGN, 100 wei)",
        lambda: _write_tx(
            author_client,
            fw_addr,
            "register_citation_bond",
            [
                "bond-3",
                "Generalized Fermat Equations via Modularity (1996)",
                "Extends Andrew Wiles's 1995 proof of Fermat's Last Theorem to generalized Diophantine curves.",
                FERMAT_PREFIX,
                900,
            ],
            value=100,
            label="register_cite_3_upheld_upstream",
            entity_id="cite-3",
        ),
    )

    run_step(
        state,
        "audit_3_upstream_not_invalidated",
        "submit_contagion_audit(cite-3 -> cross-contract UPSTREAM_NOT_INVALIDATED)",
        lambda: _write_tx(
            challenger_client,
            fw_addr,
            "submit_contagion_audit",
            ["cite-3", FERMAT_SEC0_URL, 1, 30],
            value=20,
            label="audit_3_upstream_not_invalidated",
            entity_id="fw-audit-3",
        ),
    )

    # Cite 4: Unrelated excerpt (INSUFFICIENT_CONTEXT) + Anti-self-griefing
    run_step(
        state,
        "register_cite_4_retriable_security",
        "register_citation_bond(cite-4 -> bond-1 retriable & anti-griefing, 100 wei)",
        lambda: _write_tx(
            author_client,
            fw_addr,
            "register_citation_bond",
            [
                "bond-1",
                "Comparative Cellular Stress Review (2015)",
                "Evaluates whether weak-acid stress alters murine spleen cell lineage markers.",
                WIKI_OLDID_PREFIX,
                900,
            ],
            value=100,
            label="register_cite_4_retriable_security",
            entity_id="cite-4",
        ),
    )

    run_step(
        state,
        "audit_4_insufficient_context",
        "submit_contagion_audit(cite-4, Photosynthesis -> INSUFFICIENT_CONTEXT, stays MONITORED)",
        lambda: _write_tx(
            challenger_client,
            fw_addr,
            "submit_contagion_audit",
            ["cite-4", PHOTOSYNTH_URL, 1, 40],
            value=20,
            label="audit_4_insufficient_context",
            entity_id="fw-audit-4",
        ),
    )

    run_step(
        state,
        "audit_5_author_self_challenge_blocked",
        "submit_contagion_audit(cite-4, Author self-challenge -> AUTHOR_CANNOT_SELF_CHALLENGE)",
        lambda: _write_tx(
            author_client,
            fw_addr,
            "submit_contagion_audit",
            ["cite-4", STAP_SEC1_URL, 1, 10],
            value=20,
            label="audit_5_author_self_challenge_blocked",
            entity_id="fw-audit-5",
        ),
    )

    # Cite 5: Short-window expiry settlement (timeout_seconds=15)
    run_step(
        state,
        "register_cite_5_expiry",
        "register_citation_bond(cite-5 -> bond-1 timeout_seconds=15, 100 wei)",
        lambda: _write_tx(
            author_client,
            fw_addr,
            "register_citation_bond",
            [
                "bond-1",
                "Short-Window Citation Audit Bond",
                "Evaluates downstream citation dependency on STAP cells within a 15-second window.",
                STAP_PREFIX,
                15,
            ],
            value=100,
            label="register_cite_5_expiry",
            entity_id="cite-5",
        ),
    )

    if "settle_cite_5_expired" not in state["steps"]:
        print("  [wait] Sleeping 22s so cite-5 passes its 15s trusted-clock deadline...")
        time.sleep(22)

    run_step(
        state,
        "settle_cite_5_expired",
        "settle_expired_citation_bond(cite-5 -> EXPIRED_RETURNED)",
        lambda: _write_tx(
            author_client,
            fw_addr,
            "settle_expired_citation_bond",
            ["cite-5"],
            value=0,
            label="settle_cite_5_expired",
            entity_id="cite-5-settle",
        ),
    )

    # Real finalization-gated EOA native withdrawals
    run_step(
        state,
        "withdraw_author",
        "withdraw_refundable() from Author EOA",
        lambda: _do_withdraw(author_client, fw_addr, author.address, "author"),
    )

    run_step(
        state,
        "withdraw_challenger",
        "withdraw_refundable() from Challenger EOA",
        lambda: _do_withdraw(challenger_client, fw_addr, challenger.address, "challenger"),
    )

    # Snapshot canonical on-chain state
    print("\n[snapshot] Reading canonical on-chain state from CitationFirewall...")
    config_raw = author_client.read_contract(address=fw_addr, function_name="get_config", args=[])
    cites_raw = author_client.read_contract(
        address=fw_addr, function_name="list_citation_bonds", args=[]
    )
    audits_raw = author_client.read_contract(
        address=fw_addr, function_name="list_audits", args=[]
    )
    author_rem = int(
        author_client.read_contract(
            address=fw_addr, function_name="get_refundable_balance", args=[author.address]
        )
    )
    challenger_rem = int(
        author_client.read_contract(
            address=fw_addr, function_name="get_refundable_balance", args=[challenger.address]
        )
    )

    proof = {
        "project": "Errata Shield — Milestone v1 (Citation Firewall)",
        "milestone": "v1",
        "source_commit": get_git_head(),
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "network": {
            "name": "GenLayer StudioNet",
            "chain_id": CHAIN_ID,
            "rpc_url": RPC_URL,
            "explorer_base": EXPLORER_BASE,
        },
        "upstream_errata_shield": {
            "address": ERRATA_SHIELD_ADDR,
            "explorer_url": f"{EXPLORER_BASE}/address/{ERRATA_SHIELD_ADDR}",
        },
        "citation_firewall": {
            "address": fw_addr,
            "explorer_url": f"{EXPLORER_BASE}/address/{fw_addr}",
            "deploy_tx": state["contracts"]["citation_firewall"]["deploy_tx"],
        },
        "accounts": {
            "author": author.address,
            "challenger": challenger.address,
        },
        "transactions": state["steps"],
        "on_chain_state": {
            "config": json.loads(config_raw),
            "citations": json.loads(cites_raw),
            "audits": json.loads(audits_raw),
            "post_withdraw_refundable_balances": {
                "author_wei": author_rem,
                "challenger_wei": challenger_rem,
            },
        },
    }

    PROOF_PATH.write_text(json.dumps(proof, indent=2), encoding="utf-8")
    print(f"\n[OK] Wrote Milestone v1 StudioNet proof manifest to {PROOF_PATH}")
    print(
        f"     Citations={len(proof['on_chain_state']['citations'])} "
        f"Audits={len(proof['on_chain_state']['audits'])} "
        f"AuthorRem={author_rem} ChallengerRem={challenger_rem}"
    )


def _write_tx(
    client: Any,
    address: str,
    function_name: str,
    args: list[Any],
    value: int,
    label: str,
    entity_id: str,
) -> dict[str, Any]:
    tx_hash = client.write_contract(
        address=address,
        function_name=function_name,
        args=args,
        value=value,
        fees=get_fees(client),
    )
    receipt = wait_finalized(client, tx_hash, label)
    meta = extract_tx_meta(receipt, tx_hash)
    meta["function"] = function_name
    meta["value_wei"] = value
    meta["entity_id"] = entity_id
    return meta


def _do_withdraw(client: Any, fw_addr: str, account_addr: str, role: str) -> dict[str, Any]:
    pending_before = int(
        client.read_contract(
            address=fw_addr, function_name="get_refundable_balance", args=[account_addr]
        )
    )
    eth_before = get_eth_balance(account_addr)
    tx_hash = client.write_contract(
        address=fw_addr,
        function_name="withdraw_refundable",
        args=[],
        value=0,
        fees=get_fees(client),
    )
    receipt = wait_finalized(client, tx_hash, f"withdraw_{role}")
    pending_after = int(
        client.read_contract(
            address=fw_addr, function_name="get_refundable_balance", args=[account_addr]
        )
    )
    eth_after = get_eth_balance(account_addr)
    meta = extract_tx_meta(receipt, tx_hash)
    meta.update(
        {
            "function": "withdraw_refundable",
            "entity_id": f"withdraw-{role}",
            "account": account_addr,
            "withdrawn_wei": pending_before - pending_after,
            "refundable_before_wei": pending_before,
            "refundable_after_wei": pending_after,
            "eoa_balance_before_wei": str(eth_before),
            "eoa_balance_after_wei": str(eth_after),
        }
    )
    return meta


if __name__ == "__main__":
    main()

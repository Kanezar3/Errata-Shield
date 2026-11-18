"""StudioNet Stage 0-2 Deploy, 7-Case Seeding, and Proof Builder for ErrataShield."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import pathlib
import sys
import time
import types
from typing import Any

import requests

try:
    import ckzg  # noqa: F401
except ImportError:
    _ckzg_stub = types.ModuleType("ckzg")
    for _fn in (
        "blob_to_kzg_commitment",
        "compute_blob_kzg_proof",
        "compute_cells_and_kzg_proofs",
        "load_trusted_setup",
    ):
        setattr(_ckzg_stub, _fn, lambda *args, **kwargs: None)
    sys.modules["ckzg"] = _ckzg_stub

BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)
STUDIONET_RPC_URL = "https://studio.genlayer.com/api"
STUDIONET_EXPLORER_URL = "https://explorer-studio.genlayer.com"
STUDIONET_CHAIN_ID = 61999
DEFAULT_POLL_INTERVAL = 7.0
MIN_POLL_INTERVAL = 6.0
TRANSIENT_HTTP_STATUSES = {429, 502, 503, 504}

DEPLOY_DIR = pathlib.Path(__file__).resolve().parent
PROJECT_ROOT = DEPLOY_DIR.parent
PROBE_CONTRACT_PATH = PROJECT_ROOT / "contracts" / "evidence_probe.py"
SHIELD_CONTRACT_PATH = PROJECT_ROOT / "contracts" / "errata_shield.py"
SEED_STATE_PATH = DEPLOY_DIR / "seed_state.json"
PROOF_PATH = DEPLOY_DIR / "proof.json"
SECRETS_PATH = PROJECT_ROOT / ".secrets.local.json"
FRONTEND_PUBLIC_PROOF = PROJECT_ROOT / "frontend" / "public" / "proof.json"
FRONTEND_DATA_PROOF = PROJECT_ROOT / "frontend" / "src" / "data" / "proof.json"

MIN_BOND_WEI = 100
MIN_STAKE_WEI = 20
DEFAULT_TIMEOUT_SECONDS = 900

URL_STAP = (
    "https://en.wikipedia.org/w/api.php?"
    "action=parse&oldid=1375988571&prop=wikitext&section=0&format=json"
)
URL_FERMAT = (
    "https://en.wikipedia.org/w/api.php?"
    "action=parse&oldid=1382142422&prop=wikitext&section=0&format=json"
)
URL_PHOTOSYNTHESIS = (
    "https://en.wikipedia.org/w/api.php?"
    "action=parse&oldid=1385696147&prop=wikitext&section=0&format=json"
)
URL_SELF_HOSTED_MUTABLE = (
    "https://raw.githubusercontent.com/kanezar3/Public-Muse/main/fixtures/prompt_injection_oz.txt"
)

_ORIG_SESSION_REQUEST = requests.sessions.Session.request


def _extract_rpc_method(kwargs: dict[str, Any]) -> str | None:
    payload = kwargs.get("json")
    if isinstance(payload, dict):
        return payload.get("method")
    raw_data = kwargs.get("data")
    if isinstance(raw_data, (str, bytes)):
        try:
            parsed = json.loads(raw_data)
            if isinstance(parsed, dict):
                return parsed.get("method")
        except Exception:
            return None
    return None


def _install_studionet_patch() -> None:
    """Force browser User-Agent, Connection: close, and transient retries."""

    def _patched_request(
        self: requests.sessions.Session,
        method: str,
        url: str,
        **kwargs: Any,
    ) -> requests.Response:
        is_sn = "studio.genlayer.com" in str(url)
        if is_sn:
            headers = dict(kwargs.get("headers") or {})
            headers["User-Agent"] = BROWSER_USER_AGENT
            headers["Connection"] = "close"
            kwargs["headers"] = headers
        rpc_method = _extract_rpc_method(kwargs) if is_sn else None
        can_retry_http = is_sn and rpc_method != "eth_sendRawTransaction"
        max_attempts = 6 if can_retry_http else (4 if is_sn else 1)
        last_exc: Exception | None = None
        for attempt in range(1, max_attempts + 1):
            try:
                resp = _ORIG_SESSION_REQUEST(self, method, url, **kwargs)
            except requests.RequestException as exc:
                last_exc = exc
                if attempt >= max_attempts:
                    raise
                time.sleep(10.0 * attempt)
                continue
            if can_retry_http and resp.status_code in TRANSIENT_HTTP_STATUSES and attempt < max_attempts:
                time.sleep(10.0 * attempt)
                continue
            return resp
        if last_exc is not None:
            raise last_exc
        raise RuntimeError("Unreachable retry state")

    requests.sessions.Session.request = _patched_request  # type: ignore[method-assign]


_install_studionet_patch()

from eth_account import Account  # noqa: E402
from genlayer_py import create_account, create_client  # noqa: E402
from genlayer_py.chains import studionet  # noqa: E402


def rpc_call(method: str, params: list[Any], timeout: int = 30) -> dict[str, Any]:
    resp = requests.post(
        STUDIONET_RPC_URL,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        headers={"Content-Type": "application/json", "User-Agent": BROWSER_USER_AGENT},
        timeout=timeout,
    )
    resp.raise_for_status()
    return resp.json()


def _load_json(path: pathlib.Path, default: dict[str, Any]) -> dict[str, Any]:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return dict(default)


def _save_json(path: pathlib.Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def ensure_accounts(state: dict[str, Any]) -> tuple[Any, Any]:
    secrets = _load_json(SECRETS_PATH, {})
    changed = False
    for role in ("creator", "challenger"):
        if role not in secrets or "private_key" not in secrets[role]:
            acct = create_account()
            secrets[role] = {"address": acct.address, "private_key": acct.key.hex()}
            changed = True
    if changed:
        _save_json(SECRETS_PATH, secrets)

    creator = Account.from_key(secrets["creator"]["private_key"])
    challenger = Account.from_key(secrets["challenger"]["private_key"])

    acct_state = state.setdefault("accounts", {})
    for role, acct in (("creator", creator), ("challenger", challenger)):
        bal_hex = rpc_call("eth_getBalance", [acct.address, "latest"]).get("result") or "0x0"
        bal_int = int(bal_hex, 16)
        info = acct_state.setdefault(role, {"address": acct.address})
        info["address"] = acct.address
        if bal_int < 10_000:
            fund_tx = rpc_call("sim_fundAccount", [acct.address, 1_000_000]).get("result")
            time.sleep(2.0)
            bal_hex = rpc_call("eth_getBalance", [acct.address, "latest"]).get("result") or "0x0"
            info["fund_tx_hash"] = fund_tx
        info["balance_wei"] = str(int(bal_hex, 16))
    _save_json(SEED_STATE_PATH, state)
    return creator, challenger


def poll_tx_until_final(
    tx_id: str,
    label: str,
    poll_interval: float = DEFAULT_POLL_INTERVAL,
    max_polls: int = 45,
) -> dict[str, Any]:
    interval = max(MIN_POLL_INTERVAL, poll_interval)
    for attempt in range(1, max_polls + 1):
        time.sleep(interval)
        try:
            res = rpc_call("eth_getTransactionByHash", [tx_id])
        except Exception as exc:  # noqa: BLE001
            print(f"  [{label}] poll {attempt}: transient error={exc}", flush=True)
            continue
        tx = res.get("result")
        if isinstance(tx, dict):
            status = str(tx.get("status_name") or tx.get("status") or "")
            print(f"  [{label}] poll {attempt}: tx={tx_id[:12]}... status={status}", flush=True)
            if status in ("FINALIZED", "CANCELED", "UNDETERMINED"):
                return tx
    raise TimeoutError(f"[{label}] {tx_id} timed out")


def summarize_tx(tx: dict[str, Any]) -> dict[str, Any]:
    cd = tx.get("consensus_data") or {}
    lr = (cd.get("leader_receipt") or [{}])[0]
    last_round = tx.get("last_round") or {}
    return {
        "tx_id": tx.get("hash") or tx.get("tx_id"),
        "status": tx.get("status"),
        "result": tx.get("result"),
        "result_name": tx.get("result_name"),
        "leader_execution_result": lr.get("execution_result"),
        "leader_genvm_result": lr.get("genvm_result"),
        "validator_votes_name": last_round.get("validator_votes_name"),
    }


def deploy_resumable(
    state: dict[str, Any],
    key: str,
    contract_path: pathlib.Path,
    args: list[Any],
    client: Any,
    poll_interval: float,
    force: bool,
) -> dict[str, Any]:
    section = state.get(key) or {}
    if section.get("done") and section.get("contract_address") and not force:
        print(f"[{key}] reusing {section['contract_address']}", flush=True)
        return section

    tx_id = section.get("pending_tx_id")
    if not tx_id:
        code = contract_path.read_text(encoding="utf-8")
        print(f"[{key}] deploying {contract_path.name}...", flush=True)
        tx_id = client.deploy_contract(code=code, args=args)
        print(f"[{key}] tx saved: {tx_id}", flush=True)
        state[key] = {"pending_tx_id": tx_id, "done": False}
        _save_json(SEED_STATE_PATH, state)

    tx = poll_tx_until_final(tx_id, key, poll_interval=poll_interval)
    summary = summarize_tx(tx)
    addr = (
        (tx.get("data") or {}).get("contract_address")
        or tx.get("to_address")
        or tx.get("recipient")
    )
    if not addr:
        raise RuntimeError(f"[{key}] missing contract_address")
    summary["contract_address"] = addr
    summary["done"] = True
    state[key] = summary
    _save_json(SEED_STATE_PATH, state)
    if summary["status"] != "FINALIZED" or summary["result_name"] != "MAJORITY_AGREE":
        raise RuntimeError(f"[{key}] failed consensus: {summary}")
    if summary["leader_execution_result"] != "SUCCESS":
        raise RuntimeError(f"[{key}] leader error: {summary['leader_genvm_result']}")
    return summary


def run_resumable_write(
    state: dict[str, Any],
    step_key: str,
    client: Any,
    contract_address: str,
    function_name: str,
    args: list[Any],
    value: int = 0,
    poll_interval: float = DEFAULT_POLL_INTERVAL,
    force: bool = False,
) -> dict[str, Any]:
    steps = state.setdefault("steps", {})
    existing = steps.get(step_key) or {}
    if existing.get("done") and not force:
        print(f"[{step_key}] reusing finalized tx {existing['tx_id']}", flush=True)
        return existing

    tx_id = existing.get("pending_tx_id")
    if not tx_id:
        time.sleep(2.0)
        print(f"[{step_key}] submitting {function_name} (value={value})...", flush=True)
        tx_id = client.write_contract(
            address=contract_address,
            function_name=function_name,
            args=args,
            value=value,
        )
        print(f"[{step_key}] tx_id saved: {tx_id}", flush=True)
        steps[step_key] = {"pending_tx_id": tx_id, "done": False}
        _save_json(SEED_STATE_PATH, state)

    tx = poll_tx_until_final(tx_id, step_key, poll_interval=poll_interval)
    summary = summarize_tx(tx)
    summary["done"] = True
    steps[step_key] = summary
    _save_json(SEED_STATE_PATH, state)

    if summary["status"] != "FINALIZED" or summary["result_name"] != "MAJORITY_AGREE":
        raise RuntimeError(f"[{step_key}] consensus failed: {summary}")
    if summary["leader_execution_result"] != "SUCCESS":
        raise RuntimeError(f"[{step_key}] leader failed: {summary['leader_genvm_result']}")
    return summary


def read_bonds(client: Any, addr: str) -> list[dict[str, Any]]:
    raw = client.read_contract(address=addr, function_name="list_bonds", args=[])
    return json.loads(raw) if raw else []


def read_audits(client: Any, addr: str) -> list[dict[str, Any]]:
    raw = client.read_contract(address=addr, function_name="list_audits", args=[])
    return json.loads(raw) if raw else []


def find_bond(bonds: list[dict[str, Any]], claim: str) -> dict[str, Any]:
    for b in reversed(bonds):
        if b.get("finding_claim") == claim:
            return b
    raise RuntimeError(f"Bond not found for claim: {claim[:60]}")


def find_audit(
    audits: list[dict[str, Any]], bond_id: str, url: str, start_line: int
) -> dict[str, Any]:
    for a in reversed(audits):
        if (
            a.get("bond_id") == bond_id
            and a.get("evidence_url") == url
            and int(a.get("start_line", 0)) == start_line
        ):
            return a
    raise RuntimeError(f"Audit not found for bond={bond_id} url={url} start={start_line}")


def build_proof(state: dict[str, Any], client: Any, addr: str) -> dict[str, Any]:
    bonds = {b["bond_id"]: b for b in read_bonds(client, addr)}
    audits = {a["audit_id"]: a for a in read_audits(client, addr)}
    steps = state.get("steps") or {}
    meta = state.get("case_meta") or {}

    cases: list[dict[str, Any]] = []

    def add_audit_case(
        case_id: str,
        label: str,
        reg_step: str,
        audit_step: str,
        payout_summary: str,
    ) -> None:
        m = meta[case_id]
        b = bonds[m["bond_id"]]
        a = audits[m["audit_id"]]
        cases.append(
            {
                "case_id": case_id,
                "label": label,
                "bond_id": b["bond_id"],
                "audit_id": a["audit_id"],
                "paper_title": b["paper_title"],
                "finding_claim": b["finding_claim"],
                "allowed_source_prefix": b["allowed_source_prefix"],
                "finding_sha256": b["finding_sha256"],
                "bond_status": b["status"],
                "verdict": a["verdict"],
                "reason": a.get("reason", ""),
                "verbatim_quote": a.get("quote", ""),
                "snippet_excerpt": a.get("snippet_excerpt", ""),
                "evidence_url": a["evidence_url"],
                "start_line": a.get("start_line"),
                "end_line": a.get("end_line"),
                "snippet_sha256": a.get("snippet_sha256", ""),
                "create_tx_hash": steps[reg_step]["tx_id"],
                "audit_tx_hash": steps[audit_step]["tx_id"],
                "settle_tx_hash": None,
                "withdraw_tx_hash": None,
                "tx_status": steps[audit_step]["status"],
                "consensus_result": steps[audit_step]["result_name"],
                "appeal_window_status": "Appeal window closed \u2014 Finalized (7)",
                "bond_wei": str(b.get("bond_wei", MIN_BOND_WEI)),
                "stake_wei": str(a.get("stake_wei", MIN_STAKE_WEI)),
                "payout_summary": payout_summary,
            }
        )

    add_audit_case(
        "case-1-material-invalidation",
        "Case 1: Material Invalidation (STAP Cells 2014 Nature Retraction)",
        "case1_register",
        "case1_audit",
        "Challenger credited 120 wei (100 bond + 20 stake); bond slashed.",
    )
    add_audit_case(
        "case-2-benign-corrigendum",
        "Case 2: Benign Corrigendum (Fermat's Last Theorem Repaired Gap)",
        "case2_register",
        "case2_audit",
        "Creator credited 120 wei (100 bond + 20 stake); finding upheld.",
    )

    m3 = meta["case-3-too-vague"]
    b3 = bonds[m3["bond_id"]]
    cases.append(
        {
            "case_id": "case-3-too-vague",
            "label": "Case 3: Too Vague (Gate 1 Subjective Claim Refund)",
            "bond_id": b3["bond_id"],
            "audit_id": None,
            "paper_title": b3["paper_title"],
            "finding_claim": b3["finding_claim"],
            "allowed_source_prefix": b3["allowed_source_prefix"],
            "finding_sha256": b3["finding_sha256"],
            "bond_status": b3["status"],
            "verdict": "TOO_VAGUE",
            "reason": b3.get("reason", ""),
            "verbatim_quote": "",
            "snippet_excerpt": "",
            "evidence_url": "",
            "start_line": None,
            "end_line": None,
            "snippet_sha256": "",
            "create_tx_hash": steps["case3_register"]["tx_id"],
            "audit_tx_hash": None,
            "settle_tx_hash": None,
            "withdraw_tx_hash": None,
            "tx_status": steps["case3_register"]["status"],
            "consensus_result": steps["case3_register"]["result_name"],
            "appeal_window_status": "Appeal window closed \u2014 Finalized (7)",
            "bond_wei": str(b3.get("refunded_wei", MIN_BOND_WEI)),
            "stake_wei": "0",
            "payout_summary": "100 wei deposit immediately credited to creator refundable_balances.",
        }
    )

    add_audit_case(
        "case-4-insufficient-evidence",
        "Case 4: Insufficient Evidence (Unrelated Photosynthesis Excerpt)",
        "case4_register",
        "case4_audit",
        "Creator credited 20 wei stake; bond stays OPEN (audit_attempts=1).",
    )
    add_audit_case(
        "case-5-unverifiable-fetch",
        "Case 5: Unverifiable Fetch (Empty Line Slice Preserves Open Bond)",
        "case4_register",
        "case5_audit",
        "Challenger refunded 20 wei stake; bond stays OPEN (audit_attempts=2).",
    )
    add_audit_case(
        "case-6-invalid-url-refund",
        "Case 6: Disallowed Self-Hosted / Mutable URL Refund",
        "case4_register",
        "case6_audit",
        "20 wei stake immediately refunded to challenger without reverting.",
    )

    m7 = meta["case-7-expiry-withdrawal"]
    b7 = bonds[m7["bond_id"]]
    cases.append(
        {
            "case_id": "case-7-expiry-withdrawal",
            "label": "Case 7: Expiry Fallback & Real EOA Withdrawals",
            "bond_id": b7["bond_id"],
            "audit_id": None,
            "paper_title": b7["paper_title"],
            "finding_claim": b7["finding_claim"],
            "allowed_source_prefix": b7["allowed_source_prefix"],
            "finding_sha256": b7["finding_sha256"],
            "bond_status": b7["status"],
            "verdict": "EXPIRED_RETURNED",
            "reason": "DEADLINE_REACHED",
            "verbatim_quote": "",
            "snippet_excerpt": "",
            "evidence_url": "",
            "start_line": None,
            "end_line": None,
            "snippet_sha256": "",
            "create_tx_hash": steps["case7_register"]["tx_id"],
            "audit_tx_hash": None,
            "settle_tx_hash": steps["case7_expire"]["tx_id"],
            "withdraw_tx_hash": steps["case7_withdraw_creator"]["tx_id"],
            "tx_status": steps["case7_expire"]["status"],
            "consensus_result": steps["case7_expire"]["result_name"],
            "appeal_window_status": "Appeal window closed \u2014 Finalized (7)",
            "bond_wei": str(b7.get("refunded_wei", MIN_BOND_WEI)),
            "stake_wei": "0",
            "payout_summary": (
                f"Creator withdrew {state['withdrawals']['creator']['claimable_before_wei']} wei; "
                f"challenger withdrew {state['withdrawals']['challenger']['claimable_before_wei']} wei."
            ),
        }
    )

    proof = {
        "schema_version": "1.0.0",
        "is_placeholder": False,
        "network": {
            "name": "GenLayer StudioNet",
            "chain_id": STUDIONET_CHAIN_ID,
            "rpc_url": STUDIONET_RPC_URL,
            "explorer_url": STUDIONET_EXPLORER_URL,
        },
        "evidence_probe_address": (state.get("evidence_probe_summary") or {}).get("contract_address", ""),
        "evidence_probe": state.get("evidence_probe_summary"),
        "contract_address": addr,
        "deploy_tx_hash": state["errata_shield_deploy"]["tx_id"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "accounts": state.get("accounts"),
        "withdrawals": state.get("withdrawals"),
        "cases": cases,
    }
    _save_json(PROOF_PATH, proof)
    if FRONTEND_PUBLIC_PROOF.parent.exists():
        _save_json(FRONTEND_PUBLIC_PROOF, proof)
    if FRONTEND_DATA_PROOF.parent.exists():
        _save_json(FRONTEND_DATA_PROOF, proof)
    return proof


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--poll-interval", type=float, default=DEFAULT_POLL_INTERVAL)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    state = _load_json(SEED_STATE_PATH, {"steps": {}, "case_meta": {}, "withdrawals": {}})
    if args.force:
        state = {"steps": {}, "case_meta": {}, "withdrawals": {}}
        _save_json(SEED_STATE_PATH, state)

    creator, challenger = ensure_accounts(state)
    c_client = create_client(chain=studionet, account=creator)
    ch_client = create_client(chain=studionet, account=challenger)

    # Stage 0: EvidenceProbe
    probe_dep = deploy_resumable(
        state, "evidence_probe_deploy", PROBE_CONTRACT_PATH, [], c_client, args.poll_interval, args.force
    )
    probe_addr = probe_dep["contract_address"]
    probe_step = run_resumable_write(
        state,
        "stage0_probe_stap",
        c_client,
        probe_addr,
        "probe_url_slice",
        [URL_STAP, 1, 40],
        poll_interval=args.poll_interval,
        force=args.force,
    )
    last_probe = json.loads(
        c_client.read_contract(address=probe_addr, function_name="get_last_probe", args=[])
    )
    state["evidence_probe_summary"] = {
        "contract_address": probe_addr,
        "deploy_tx_hash": probe_dep["tx_id"],
        "probe_tx_hash": probe_step["tx_id"],
        "url": URL_STAP,
        "snippet_sha256": last_probe.get("snippet_sha256"),
        "snippet_len": last_probe.get("snippet_len"),
    }
    _save_json(SEED_STATE_PATH, state)

    # Stage 1: ErrataShield Deploy
    shield_dep = deploy_resumable(
        state,
        "errata_shield_deploy",
        SHIELD_CONTRACT_PATH,
        [MIN_BOND_WEI, MIN_STAKE_WEI, DEFAULT_TIMEOUT_SECONDS],
        c_client,
        args.poll_interval,
        args.force,
    )
    addr = shield_dep["contract_address"]
    meta = state.setdefault("case_meta", {})

    # Case 1: MATERIAL_INVALIDATION
    claim1 = (
        "STAP cells can be reliably generated by subjecting somatic cells to acid stress "
        "and remain a valid reproducible stem cell method."
    )
    run_resumable_write(
        state, "case1_register", c_client, addr, "create_finding_bond",
        [
            "Stimulus-triggered acquisition of pluripotency (Nature, Jan 2014)",
            claim1,
            "https://en.wikipedia.org/w/api.php?action=parse&oldid=1375988571",
            2592000,
        ],
        value=MIN_BOND_WEI, poll_interval=args.poll_interval, force=args.force,
    )
    b1 = find_bond(read_bonds(c_client, addr), claim1)
    if b1["status"] not in ("OPEN", "INVALIDATED_SLASHED"):
        raise RuntimeError(f"Case 1 unexpected bond status: {b1}")
    run_resumable_write(
        state, "case1_audit", ch_client, addr, "submit_errata_audit",
        [b1["bond_id"], URL_STAP, 1, 80],
        value=MIN_STAKE_WEI, poll_interval=args.poll_interval, force=args.force,
    )
    a1 = find_audit(read_audits(ch_client, addr), b1["bond_id"], URL_STAP, 1)
    if a1["verdict"] != "MATERIAL_INVALIDATION":
        raise RuntimeError(f"Case 1 expected MATERIAL_INVALIDATION, got {a1}")
    meta["case-1-material-invalidation"] = {"bond_id": b1["bond_id"], "audit_id": a1["audit_id"]}
    _save_json(SEED_STATE_PATH, state)

    # Case 2: BENIGN_CORRIGENDUM
    claim2 = (
        "Fermat's Last Theorem was proved by Andrew Wiles (released in 1994 and published in 1995) "
        "and stands as a proven theorem."
    )
    run_resumable_write(
        state, "case2_register", c_client, addr, "create_finding_bond",
        [
            "Modular Elliptic Curves and Fermat's Last Theorem (Annals of Mathematics, 1995)",
            claim2,
            "https://en.wikipedia.org/w/api.php?action=parse&oldid=1382142422",
            2592000,
        ],
        value=MIN_BOND_WEI, poll_interval=args.poll_interval, force=args.force,
    )
    b2 = find_bond(read_bonds(c_client, addr), claim2)
    if b2["status"] not in ("OPEN", "UPHELD_BENIGN"):
        raise RuntimeError(f"Case 2 unexpected bond status: {b2}")
    run_resumable_write(
        state, "case2_audit", ch_client, addr, "submit_errata_audit",
        [b2["bond_id"], URL_FERMAT, 1, 30],
        value=MIN_STAKE_WEI, poll_interval=args.poll_interval, force=args.force,
    )
    a2 = find_audit(read_audits(ch_client, addr), b2["bond_id"], URL_FERMAT, 1)
    if a2["verdict"] != "BENIGN_CORRIGENDUM":
        raise RuntimeError(f"Case 2 expected BENIGN_CORRIGENDUM, got {a2}")
    meta["case-2-benign-corrigendum"] = {"bond_id": b2["bond_id"], "audit_id": a2["audit_id"]}
    _save_json(SEED_STATE_PATH, state)

    # Case 3: TOO_VAGUE
    claim3 = (
        "This inspiring paper has timeless intellectual beauty and deep philosophical resonance for readers."
    )
    run_resumable_write(
        state, "case3_register", c_client, addr, "create_finding_bond",
        [
            "General Literary Reflection on Science",
            claim3,
            "https://en.wikipedia.org/w/api.php?action=parse&oldid=1382142422",
            2592000,
        ],
        value=MIN_BOND_WEI, poll_interval=args.poll_interval, force=args.force,
    )
    b3 = find_bond(read_bonds(c_client, addr), claim3)
    if b3["status"] != "TOO_VAGUE":
        raise RuntimeError(f"Case 3 expected TOO_VAGUE, got {b3}")
    meta["case-3-too-vague"] = {"bond_id": b3["bond_id"]}
    _save_json(SEED_STATE_PATH, state)

    # Case 4, 5, 6: OPEN bond for INSUFFICIENT_EVIDENCE, UNVERIFIABLE_FETCH, and URL rejection
    claim4 = (
        "The ATLAS and CMS collaborations observed a Higgs-like boson near 125 GeV at CERN in 2012."
    )
    run_resumable_write(
        state, "case4_register", c_client, addr, "create_finding_bond",
        [
            "Higgs Boson Discovery (ATLAS / CMS, 2012)",
            claim4,
            "https://en.wikipedia.org/w/api.php?action=parse&oldid=",
            2592000,
        ],
        value=MIN_BOND_WEI, poll_interval=args.poll_interval, force=args.force,
    )
    b4 = find_bond(read_bonds(c_client, addr), claim4)
    if b4["status"] != "OPEN":
        raise RuntimeError(f"Case 4 expected OPEN, got {b4}")

    # Case 4: INSUFFICIENT_EVIDENCE
    run_resumable_write(
        state, "case4_audit", ch_client, addr, "submit_errata_audit",
        [b4["bond_id"], URL_PHOTOSYNTHESIS, 1, 40],
        value=MIN_STAKE_WEI, poll_interval=args.poll_interval, force=args.force,
    )
    a4 = find_audit(read_audits(ch_client, addr), b4["bond_id"], URL_PHOTOSYNTHESIS, 1)
    if a4["verdict"] != "INSUFFICIENT_EVIDENCE":
        raise RuntimeError(f"Case 4 expected INSUFFICIENT_EVIDENCE, got {a4}")
    meta["case-4-insufficient-evidence"] = {"bond_id": b4["bond_id"], "audit_id": a4["audit_id"]}
    _save_json(SEED_STATE_PATH, state)

    # Case 5: UNVERIFIABLE_FETCH (empty line slice 9000..9020)
    run_resumable_write(
        state, "case5_audit", ch_client, addr, "submit_errata_audit",
        [b4["bond_id"], URL_PHOTOSYNTHESIS, 9000, 9020],
        value=MIN_STAKE_WEI, poll_interval=args.poll_interval, force=args.force,
    )
    a5 = find_audit(read_audits(ch_client, addr), b4["bond_id"], URL_PHOTOSYNTHESIS, 9000)
    if a5["verdict"] != "UNVERIFIABLE_FETCH":
        raise RuntimeError(f"Case 5 expected UNVERIFIABLE_FETCH, got {a5}")
    meta["case-5-unverifiable-fetch"] = {"bond_id": b4["bond_id"], "audit_id": a5["audit_id"]}
    _save_json(SEED_STATE_PATH, state)

    # Case 6: INVALID_EVIDENCE_URL (self-hosted/mutable URL rejected cleanly with refund)
    run_resumable_write(
        state, "case6_audit", ch_client, addr, "submit_errata_audit",
        [b4["bond_id"], URL_SELF_HOSTED_MUTABLE, 1, 40],
        value=MIN_STAKE_WEI, poll_interval=args.poll_interval, force=args.force,
    )
    a6 = find_audit(read_audits(ch_client, addr), b4["bond_id"], URL_SELF_HOSTED_MUTABLE, 1)
    if a6["status"] != "REJECTED_INVALID":
        raise RuntimeError(f"Case 6 expected REJECTED_INVALID, got {a6}")
    meta["case-6-invalid-url-refund"] = {"bond_id": b4["bond_id"], "audit_id": a6["audit_id"]}
    _save_json(SEED_STATE_PATH, state)

    # Case 7: Expiry Fallback + Real EOA Withdrawals
    claim7 = (
        "Topological invariants of compact manifolds remain preserved under homeomorphism."
    )
    run_resumable_write(
        state, "case7_register", c_client, addr, "create_finding_bond",
        [
            "Short Timeout Verification Bond",
            claim7,
            "https://en.wikipedia.org/w/api.php?action=parse&oldid=1382142422",
            15,
        ],
        value=MIN_BOND_WEI, poll_interval=args.poll_interval, force=args.force,
    )
    b7 = find_bond(read_bonds(c_client, addr), claim7)
    if b7["status"] == "OPEN":
        print("[case7] waiting 25s for 15s bond timeout...", flush=True)
        time.sleep(25.0)
        run_resumable_write(
            state, "case7_expire", c_client, addr, "settle_expired_bond",
            [b7["bond_id"]], poll_interval=args.poll_interval, force=args.force,
        )
        b7 = find_bond(read_bonds(c_client, addr), claim7)
    if b7["status"] != "EXPIRED_RETURNED":
        raise RuntimeError(f"Case 7 expected EXPIRED_RETURNED, got {b7}")
    meta["case-7-expiry-withdrawal"] = {"bond_id": b7["bond_id"]}

    withdrawals = state.setdefault("withdrawals", {})
    for role, acct, w_client, step_name in (
        ("creator", creator, c_client, "case7_withdraw_creator"),
        ("challenger", challenger, ch_client, "case7_withdraw_challenger"),
    ):
        if not (state["steps"].get(step_name) or {}).get("done") or args.force:
            claimable = w_client.read_contract(
                address=addr, function_name="get_refundable_balance", args=[acct.address]
            )
            eoa_before = int(
                rpc_call("eth_getBalance", [acct.address, "latest"]).get("result") or "0x0", 16
            )
            w_sum = run_resumable_write(
                state, step_name, w_client, addr, "withdraw_refundable",
                [], poll_interval=args.poll_interval, force=args.force,
            )
            eoa_after = int(
                rpc_call("eth_getBalance", [acct.address, "latest"]).get("result") or "0x0", 16
            )
            withdrawals[role] = {
                "address": acct.address,
                "claimable_before_wei": str(claimable),
                "eoa_before_wei": str(eoa_before),
                "eoa_after_wei": str(eoa_after),
                "tx_id": w_sum["tx_id"],
            }
    _save_json(SEED_STATE_PATH, state)

    proof = build_proof(state, c_client, addr)
    print(f"Built {PROOF_PATH} with {len(proof['cases'])} finalized cases.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

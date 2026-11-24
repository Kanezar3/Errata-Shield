"""Unit tests for CitationFirewall (cross-contract ErrataShield integration, contagion vs immunity)."""

from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import types
from dataclasses import dataclass
from typing import Any

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent


class _MockUserError(Exception):
    pass


@dataclass
class _MockReturn:
    calldata: Any


class _MockAddress:
    def __init__(self, hex_val: str):
        self.as_hex = hex_val

    def __str__(self) -> str:
        return self.as_hex


class _MockTreeMap(dict):
    def __class_getitem__(cls, item):
        return cls


class _MockDynArray(list):
    def __class_getitem__(cls, item):
        return cls


class _MockHarness:
    def __init__(self) -> None:
        self.sender = "0x1111111111111111111111111111111111111111"
        self.value = 0
        self.datetime_iso = "2026-11-24T12:00:00Z"
        self.web_responses: dict[str, tuple[int, str]] = {}
        self.prompt_queue: list[str] = []
        self.emitted_transfers: list[tuple[str, int]] = []
        self.upstream_bonds: dict[str, dict] = {
            "bond-1": {
                "bond_id": "bond-1",
                "paper_title": "STAP Cells (Nature 2014)",
                "finding_claim": "STAP cells are reliably produced by acid bath.",
                "status": "INVALIDATED_SLASHED",
            },
            "bond-3": {
                "bond_id": "bond-3",
                "paper_title": "Fermat's Last Theorem (1995)",
                "finding_claim": "Fermat's Last Theorem stands proved.",
                "status": "UPHELD_BENIGN",
            },
        }

    def install(self) -> None:
        gl_mod = types.ModuleType("genlayer")

        class _Message:
            @property
            def sender_address(inner_self):
                return _MockAddress(self.sender)

            @property
            def value(inner_self):
                return self.value

        class _Web:
            def get(inner_self, url: str, headers: dict | None = None):
                status, body = self.web_responses.get(url, (404, ""))
                return types.SimpleNamespace(status=status, body=body.encode("utf-8"))

        class _NonDet:
            web = _Web()

            def exec_prompt(inner_self, prompt: str, response_format: str = "text"):
                if not self.prompt_queue:
                    raise RuntimeError("No mocked LLM response queued")
                return self.prompt_queue.pop(0)

        class _Calldata:
            @staticmethod
            def decode(raw):
                if isinstance(raw, (bytes, bytearray, memoryview)):
                    return bytes(raw).decode("utf-8")
                raise TypeError("expected bytes")

        class _VM:
            UserError = _MockUserError
            Return = _MockReturn
            Result = object

            def run_nondet_unsafe(inner_self, leader_fn, validator_fn):
                res = leader_fn()
                ok = validator_fn(_MockReturn(calldata=res))
                assert ok is True, "Validator disagreed with leader"
                return res

        class _EVM:
            def contract_interface(inner_self, cls):
                harness = self

                class _Proxy:
                    def __init__(proxy_self, addr):
                        proxy_self.addr = str(addr)

                    def emit_transfer(proxy_self, value: int):
                        harness.emitted_transfers.append((proxy_self.addr.lower(), int(value)))

                return _Proxy

        class _UpstreamProxy:
            def view(proxy_self):
                class _View:
                    def get_bond(v_self, bond_id: str) -> str:
                        b = self.upstream_bonds.get(bond_id)
                        return json.dumps(b) if b else ""

                return _View()

        class _Public:
            @staticmethod
            def write(fn):
                return fn

            @staticmethod
            def view(fn):
                return fn

        _Public.write.payable = staticmethod(lambda fn: fn)

        class _Contract:
            def __init_subclass__(cls, **kwargs):
                super().__init_subclass__(**kwargs)

        gl_ns = types.SimpleNamespace(
            Contract=_Contract,
            public=_Public,
            message=_Message(),
            nondet=_NonDet(),
            vm=_VM(),
            calldata=_Calldata(),
            evm=_EVM(),
            get_contract_at=lambda addr: _UpstreamProxy(),
        )

        class _DynamicGL:
            def __getattr__(inner_self, name):
                if name == "message_raw":
                    return {"datetime": self.datetime_iso} if self.datetime_iso is not None else {}
                return getattr(gl_ns, name)

        gl_mod.gl = _DynamicGL()
        gl_mod.Address = _MockAddress
        gl_mod.u256 = int
        gl_mod.TreeMap = _MockTreeMap
        gl_mod.DynArray = _MockDynArray
        sys.modules["genlayer"] = gl_mod


def _make_firewall():
    h = _MockHarness()
    h.install()
    spec = importlib.util.spec_from_file_location(
        "citation_firewall_mod", ROOT / "contracts" / "citation_firewall.py"
    )
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)

    fw = mod.CitationFirewall.__new__(mod.CitationFirewall)
    fw.citations = _MockTreeMap()
    fw.citation_ids = _MockDynArray()
    fw.audits = _MockTreeMap()
    fw.audit_ids = _MockDynArray()
    fw.refundable_balances = _MockTreeMap()
    fw.__init__(
        errata_shield_address="0x789cC30C52eb51B16B7092B1eaB73d73B15dCA3c",
        min_bond_wei=100,
        min_stake_wei=20,
        default_timeout_seconds=900,
    )
    return h, mod, fw


WIKI_SEC1 = "https://en.wikipedia.org/w/api.php?action=parse&oldid=1375988571&prop=wikitext&section=1&format=json"
WIKI_SEC3 = "https://en.wikipedia.org/w/api.php?action=parse&oldid=1375988571&prop=wikitext&section=3&format=json"
WIKI_PREFIX = "https://en.wikipedia.org/w/api.php?action=parse&oldid=1375988571"


def test_1_cross_contract_gate_blocks_non_invalidated_upstream():
    h, _, fw = _make_firewall()
    author = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    challenger = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

    # Register downstream bond citing Fermat's Last Theorem (bond-3: UPHELD_BENIGN)
    h.sender = author
    h.value = 100
    c = json.loads(
        fw.register_citation_bond(
            "bond-3",
            "Follow-up Diophantine Paper",
            "Uses Wiles's modularity theorem.",
            WIKI_PREFIX,
            900,
        )
    )
    assert c["status"] == "MONITORED"
    assert c["upstream_status_at_registration"] == "UPHELD_BENIGN"

    # Contagion audit blocked deterministically with zero LLM call & full stake refund
    h.sender = challenger
    h.value = 20
    a = json.loads(fw.submit_contagion_audit("cite-1", WIKI_SEC1, 1, 10))
    assert a["verdict"] == "REJECTED_INVALID"
    assert a["reason"] == "UPSTREAM_NOT_INVALIDATED"
    assert fw.get_refundable_balance(challenger) == 20


def test_2_load_bearing_slashes_and_critical_citation_immunizes():
    h, _, fw = _make_firewall()
    author = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    challenger = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

    # Cite 1: Load-bearing dependency on retracted STAP bond-1
    h.sender = author
    h.value = 100
    fw.register_citation_bond(
        "bond-1",
        "Acid-Bath Clinical Protocol",
        "Applies Obokata STAP acid-bath cells for placental differentiation.",
        WIKI_PREFIX,
        900,
    )
    h.web_responses[WIKI_SEC1] = (
        200,
        json.dumps({"parse": {"title": "STAP", "wikitext": {"*": "STAP cells were supposedly able to differentiate into placental cells."}}}),
    )
    h.sender = challenger
    h.value = 20
    h.prompt_queue = [
        json.dumps({
            "verdict": "LOAD_BEARING_DEPENDENCY",
            "reason": "DIRECT_PREMISE_RELIANCE",
            "quote": "STAP cells were supposedly able to differentiate into placental cells.",
            "summary": "Relies directly on retracted STAP premise.",
        }),
        json.dumps({
            "verdict": "LOAD_BEARING_DEPENDENCY",
            "reason": "DIRECT_PREMISE_RELIANCE",
            "quote": "STAP cells were supposedly able to differentiate into placental cells.",
            "summary": "Relies directly on retracted STAP premise.",
        }),
    ]
    a1 = json.loads(fw.submit_contagion_audit("cite-1", WIKI_SEC1, 1, 10))
    assert a1["verdict"] == "LOAD_BEARING_DEPENDENCY"
    assert json.loads(fw.get_citation_bond("cite-1"))["status"] == "CONTAGION_SLASHED"
    assert fw.get_refundable_balance(challenger) == 120

    # Cite 2: Critical / non-replication study citing STAP bond-1 -> IMMUNE_UPHELD
    h.sender = author
    h.value = 100
    fw.register_citation_bond(
        "bond-1",
        "RIKEN Multi-Lab Non-Replication Report",
        "Independent labs failed to duplicate Obokata's STAP results.",
        WIKI_PREFIX,
        900,
    )
    h.web_responses[WIKI_SEC3] = (
        200,
        json.dumps({"parse": {"title": "STAP", "wikitext": {"*": "All scientists who tried to duplicate Obokata's results failed."}}}),
    )
    h.sender = challenger
    h.value = 20
    h.prompt_queue = [
        json.dumps({
            "verdict": "INCIDENTAL_OR_CRITICAL_CITATION",
            "reason": "CRITICAL_OR_REFUTING_CITATION",
            "quote": "All scientists who tried to duplicate Obokata's results failed.",
            "summary": "Critically refutes STAP rather than depending on it.",
        }),
        json.dumps({
            "verdict": "INCIDENTAL_OR_CRITICAL_CITATION",
            "reason": "CRITICAL_OR_REFUTING_CITATION",
            "quote": "All scientists who tried to duplicate Obokata's results failed.",
            "summary": "Critically refutes STAP rather than depending on it.",
        }),
    ]
    a2 = json.loads(fw.submit_contagion_audit("cite-2", WIKI_SEC3, 1, 10))
    assert a2["verdict"] == "INCIDENTAL_OR_CRITICAL_CITATION"
    assert json.loads(fw.get_citation_bond("cite-2"))["status"] == "IMMUNE_UPHELD"
    assert fw.get_refundable_balance(author) == 120


def test_3_anti_self_griefing_expiry_and_withdraw_transfer():
    h, _, fw = _make_firewall()
    author = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    h.sender = author
    h.value = 100
    fw.register_citation_bond(
        "bond-1",
        "Short Window Citation",
        "Evaluates STAP protocol.",
        WIKI_PREFIX,
        20,
    )
    # Author cannot self-challenge
    h.value = 20
    self_a = json.loads(fw.submit_contagion_audit("cite-1", WIKI_SEC1, 1, 10))
    assert self_a["reason"] == "AUTHOR_CANNOT_SELF_CHALLENGE"
    assert fw.get_refundable_balance(author) == 20

    # Expire after deadline
    h.datetime_iso = "2026-11-24T12:01:00Z"
    settled = json.loads(fw.settle_expired_citation_bond("cite-1"))
    assert settled["status"] == "EXPIRED_RETURNED"
    assert fw.get_refundable_balance(author) == 120

    w = json.loads(fw.withdraw_refundable())
    assert w["withdrawn_wei"] == 120
    assert w["settlement_stage"] == "ON_FINALIZED"
    assert (author, 120) in h.emitted_transfers

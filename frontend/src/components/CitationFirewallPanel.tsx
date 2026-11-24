import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Hash,
  Radio,
  ShieldAlert,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import type {
  CitationBondRecord,
  FirewallAuditRecord,
  FirewallProofDocument,
  FirewallTxMeta,
} from '../types/firewall';
import { fetchLiveFirewallState, shortHash } from '../lib/genlayer';

interface CitationFirewallPanelProps {
  proof: FirewallProofDocument;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u201c/g, '"')
    .replace(/\u201d/g, '"')
    .replace(/\u2018/g, "'")
    .replace(/\u2019/g, "'")
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '-');
}

function extractWikiText(rawText: string): string {
  try {
    const parsed = JSON.parse(rawText);
    const wt = parsed?.parse?.wikitext?.['*'];
    if (typeof wt === 'string') {
      const title = String(parsed?.parse?.title ?? '').trim();
      return title ? `${title}\n\n${wt}` : wt;
    }
  } catch {
    // Plain text fallback
  }
  return rawText;
}

function sliceSnippet(rawText: string, startLine: number, endLine: number): string {
  const sLine = Math.max(1, Math.floor(startLine));
  let eLine = Math.max(sLine, Math.floor(endLine));
  if (eLine - sLine + 1 > 120) eLine = sLine + 119;
  const text = normalizeText(extractWikiText(rawText));
  const lines = text.split('\n').slice(sLine - 1, eLine);
  return lines
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 3000);
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function badgeClasses(code: string): string {
  switch (code) {
    case 'IMMUNE_UPHELD':
    case 'INCIDENTAL_OR_CRITICAL_CITATION':
    case 'UPHELD_BENIGN':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'CONTAGION_SLASHED':
    case 'LOAD_BEARING_DEPENDENCY':
    case 'INVALIDATED_SLASHED':
      return 'border-red-200 bg-red-50 text-red-800';
    case 'MONITORED':
      return 'border-blue-200 bg-blue-50 text-blue-800';
    default:
      return 'border-amber-200 bg-amber-50 text-amber-800';
  }
}

export function CitationFirewallPanel({ proof }: CitationFirewallPanelProps) {
  const [citations, setCitations] = useState<CitationBondRecord[]>(proof.on_chain_state.citations);
  const [audits, setAudits] = useState<FirewallAuditRecord[]>(proof.on_chain_state.audits);
  const [selectedId, setSelectedId] = useState<string>(
    proof.on_chain_state.citations[0]?.citation_id ?? 'cite-1'
  );
  const [selectedAuditId, setSelectedAuditId] = useState<string>(
    proof.on_chain_state.audits[0]?.audit_id ?? 'fw-audit-1'
  );
  const [rpcStatus, setRpcStatus] = useState<{
    state: 'idle' | 'loading' | 'ok' | 'error';
    message: string;
  }>({ state: 'idle', message: '' });
  const [shaCheck, setShaCheck] = useState<{
    state: 'idle' | 'loading' | 'match' | 'mismatch' | 'error';
    message?: string;
    computed?: string;
  }>({ state: 'idle' });

  const txByEntity = useMemo(() => {
    const map: Record<string, FirewallTxMeta> = {};
    for (const meta of Object.values(proof.transactions)) {
      if (meta.entity_id) map[meta.entity_id] = meta;
    }
    return map;
  }, [proof.transactions]);

  const selectedCite = useMemo(
    () => citations.find((c) => c.citation_id === selectedId) ?? citations[0],
    [citations, selectedId]
  );

  const citeAudits = useMemo(
    () => audits.filter((a) => a.citation_id === selectedCite?.citation_id),
    [audits, selectedCite]
  );

  const selectedAudit = useMemo(
    () => citeAudits.find((a) => a.audit_id === selectedAuditId) ?? citeAudits[0],
    [citeAudits, selectedAuditId]
  );

  useEffect(() => {
    setShaCheck({ state: 'idle' });
  }, [selectedAudit?.audit_id]);

  async function handleVerifyLiveRpc() {
    setRpcStatus({ state: 'loading', message: 'Querying CitationFirewall on StudioNet…' });
    try {
      const snap = await fetchLiveFirewallState(proof.citation_firewall.address);
      setCitations(snap.citations);
      setAudits(snap.audits);
      setRpcStatus({
        state: 'ok',
        message: `Live StudioNet RPC Parity: ${snap.citations.length} citations · ${snap.audits.length} audits`,
      });
    } catch (err) {
      setRpcStatus({
        state: 'error',
        message: err instanceof Error ? err.message : 'StudioNet RPC read failed',
      });
    }
  }

  async function handleVerifySha256() {
    if (!selectedAudit?.evidence_url || !selectedAudit?.snippet_sha256) return;
    setShaCheck({ state: 'loading' });
    try {
      const fetchUrl = selectedAudit.evidence_url.includes('en.wikipedia.org/w/api.php')
        ? `${selectedAudit.evidence_url}&origin=*`
        : selectedAudit.evidence_url;
      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();
      const sliced = sliceSnippet(raw, selectedAudit.start_line, selectedAudit.end_line);
      const computed = await sha256Hex(sliced);
      if (computed === selectedAudit.snippet_sha256) {
        setShaCheck({
          state: 'match',
          computed,
          message: 'Exact WebCrypto SHA-256 parity with on-chain snippet_sha256',
        });
      } else {
        setShaCheck({
          state: 'mismatch',
          computed,
          message: 'Computed hash differs from on-chain snippet_sha256',
        });
      }
    } catch (err) {
      setShaCheck({
        state: 'error',
        message: err instanceof Error ? err.message : 'Browser fetch failed',
      });
    }
  }

  const upstreamGroups = useMemo(() => {
    const groups: Record<
      string,
      { bondId: string; title: string; status: string; children: CitationBondRecord[] }
    > = {};
    for (const c of citations) {
      if (!groups[c.upstream_bond_id]) {
        groups[c.upstream_bond_id] = {
          bondId: c.upstream_bond_id,
          title: c.upstream_paper_title || c.upstream_bond_id,
          status: c.upstream_status_at_registration,
          children: [],
        };
      }
      groups[c.upstream_bond_id].children.push(c);
    }
    return Object.values(groups);
  }, [citations]);

  const highlightedParts = useMemo(() => {
    if (!selectedAudit?.snippet_excerpt || !selectedAudit?.quote) return null;
    const idx = selectedAudit.snippet_excerpt.indexOf(selectedAudit.quote);
    if (idx === -1) return null;
    return {
      before: selectedAudit.snippet_excerpt.slice(0, idx),
      match: selectedAudit.snippet_excerpt.slice(idx, idx + selectedAudit.quote.length),
      after: selectedAudit.snippet_excerpt.slice(idx + selectedAudit.quote.length),
    };
  }, [selectedAudit]);

  const authorWithdraw = proof.transactions.withdraw_author;
  const challengerWithdraw = proof.transactions.withdraw_challenger;

  return (
    <div className="space-y-6">
      {/* Header Banner: Cross-Contract Architecture + Live RPC Button */}
      <section className="rounded-lg border border-[#E2E8F0] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mono rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-blue-800">
                Milestone v1 · Cross-Contract Engine
              </span>
              <a
                href={proof.citation_firewall.explorer_url}
                target="_blank"
                rel="noreferrer"
                className="mono inline-flex items-center gap-1 text-xs text-[#1D4ED8] hover:underline"
              >
                CitationFirewall {shortHash(proof.citation_firewall.address, 6, 4)}
                <ExternalLink size={12} />
              </a>
            </div>
            <h2 className="font-display mt-2 text-xl font-bold text-[#0F172A]">
              Citation Firewall — Retraction Contagion &amp; Immunity Adjudication
            </h2>
            <p className="mt-1 text-sm text-[#475569]">
              Reads live upstream retraction state from{' '}
              <code className="mono text-xs text-[#0F172A]">
                ErrataShield ({shortHash(proof.upstream_errata_shield.address, 6, 4)})
              </code>{' '}
              via <code className="mono text-xs">gl.get_contract_at</code>. Slashes downstream
              papers that rely on retracted premises while immunizing critical or non-replicating
              citations.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={handleVerifyLiveRpc}
              disabled={rpcStatus.state === 'loading'}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#1D4ED8] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1E40AF] disabled:opacity-60"
            >
              <Radio size={14} />
              {rpcStatus.state === 'loading' ? 'Verifying…' : 'Verify Live Firewall RPC'}
            </button>
            {rpcStatus.state !== 'idle' && (
              <span
                className={`mono rounded border px-2.5 py-1 text-[11px] ${
                  rpcStatus.state === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : rpcStatus.state === 'error'
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]'
                }`}
              >
                {rpcStatus.message}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Interactive Citation Contagion Graph */}
      <section className="rounded-lg border border-[#E2E8F0] bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
          <div className="flex items-center gap-2">
            <GitBranch size={16} className="text-[#1D4ED8]" />
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-[#0F172A]">
              Cross-Contract Citation Dependency Graph
            </h3>
          </div>
          <span className="mono text-[11px] text-[#64748B]">
            Click any downstream node to inspect its on-chain audit dossier
          </span>
        </div>

        <div className="space-y-4">
          {upstreamGroups.map((group) => (
            <div
              key={group.bondId}
              className="grid grid-cols-1 items-center gap-4 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 lg:grid-cols-12"
            >
              {/* Upstream ErrataShield Node */}
              <div className="rounded-md border border-[#CBD5E1] bg-white p-3.5 lg:col-span-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="mono text-[11px] font-semibold uppercase text-[#1D4ED8]">
                    ErrataShield · {group.bondId}
                  </span>
                  <span
                    className={`mono rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeClasses(
                      group.status
                    )}`}
                  >
                    {group.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="mt-1.5 text-sm font-semibold text-[#0F172A]">{group.title}</div>
                <div className="mono mt-1 text-[11px] text-[#64748B]">
                  {group.status === 'INVALIDATED_SLASHED'
                    ? 'Contagion gate OPEN — downstream citations auditable'
                    : 'Contagion gate LOCKED — upstream finding upheld'}
                </div>
              </div>

              {/* Connector Arrow */}
              <div className="hidden items-center justify-center lg:col-span-1 lg:flex">
                <ArrowRight size={18} className="text-[#94A3B8]" />
              </div>

              {/* Downstream CitationFirewall Nodes */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:col-span-7">
                {group.children.map((c) => {
                  const active = c.citation_id === selectedCite?.citation_id;
                  return (
                    <button
                      key={c.citation_id}
                      type="button"
                      onClick={() => setSelectedId(c.citation_id)}
                      className={`rounded-md border p-3 text-left transition-all ${
                        active
                          ? 'border-[#1D4ED8] bg-white ring-2 ring-[#1D4ED8]/15'
                          : 'border-[#E2E8F0] bg-white hover:border-[#94A3B8]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="mono text-[11px] font-semibold text-[#0F172A]">
                          {c.citation_id}
                        </span>
                        <span
                          className={`mono rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeClasses(
                            c.status
                          )}`}
                        >
                          {c.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="mt-1.5 line-clamp-2 text-xs font-semibold text-[#0F172A]">
                        {c.downstream_title}
                      </div>
                      <div className="mono mt-1 text-[10px] text-[#64748B]">{c.reason}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Finalized EOA Native Transfers Card */}
      {(authorWithdraw || challengerWithdraw) && (
        <section className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
            <div>
              <h3 className="font-display text-sm font-bold text-[#0F172A]">
                CitationFirewall Finalized EOA Transfers (On Finalization)
              </h3>
              <p className="text-xs text-[#64748B]">
                Real chain-layer <code className="mono">emit_transfer</code> withdrawals verified on
                GenLayer StudioNet.
              </p>
            </div>
            <span className="mono rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
              Post-Withdraw Ledger:{' '}
              {proof.on_chain_state.post_withdraw_refundable_balances.author_wei} /{' '}
              {proof.on_chain_state.post_withdraw_refundable_balances.challenger_wei} wei
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {[
              { role: 'Author EOA', tx: authorWithdraw },
              { role: 'Challenger EOA', tx: challengerWithdraw },
            ].map(
              ({ role, tx }) =>
                tx && (
                  <div
                    key={role}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-[#0F172A]">
                        {role}{' '}
                        <span className="mono font-normal text-[#64748B]">
                          {shortHash(tx.account, 6, 4)}
                        </span>
                      </div>
                      <div className="mono mt-1 text-emerald-800">
                        {tx.eoa_balance_before_wei} wei → <strong>{tx.eoa_balance_after_wei} wei</strong>{' '}
                        (+{tx.withdrawn_wei} wei)
                      </div>
                    </div>
                    <a
                      href={tx.explorer_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mono inline-flex items-center gap-1 rounded border border-[#CBD5E1] bg-white px-2 py-1 text-[11px] text-[#1D4ED8] hover:border-[#1D4ED8]"
                    >
                      {shortHash(tx.tx_hash, 8, 4)}
                      <ExternalLink size={11} />
                    </a>
                  </div>
                )
            )}
          </div>
        </section>
      )}

      {/* Selected Citation Bond & Contagion Audit Inspector */}
      {selectedCite && (
        <section className="rounded-lg border border-[#E2E8F0] bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E2E8F0] pb-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mono text-xs font-semibold uppercase text-[#1D4ED8]">
                  {selectedCite.citation_id} → {selectedCite.upstream_bond_id}
                </span>
                {txByEntity[selectedCite.citation_id] && (
                  <a
                    href={txByEntity[selectedCite.citation_id].explorer_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mono inline-flex items-center gap-1 rounded border border-[#CBD5E1] bg-[#F8FAFC] px-2 py-0.5 text-[10px] text-[#1D4ED8] hover:border-[#1D4ED8]"
                  >
                    Register Tx {shortHash(txByEntity[selectedCite.citation_id].tx_hash, 6, 4)}
                    <ExternalLink size={10} />
                  </a>
                )}
                {txByEntity[`${selectedCite.citation_id}-settle`] && (
                  <a
                    href={txByEntity[`${selectedCite.citation_id}-settle`].explorer_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mono inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800"
                  >
                    Settle Tx{' '}
                    {shortHash(txByEntity[`${selectedCite.citation_id}-settle`].tx_hash, 6, 4)}
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
              <h3 className="font-display mt-1 text-lg font-bold text-[#0F172A]">
                {selectedCite.downstream_title}
              </h3>
              <p className="mt-1 text-sm text-[#334155]">{selectedCite.downstream_claim}</p>
            </div>
            <span
              className={`mono rounded-full border px-3 py-1 text-xs font-semibold ${badgeClasses(
                selectedCite.status
              )}`}
            >
              {selectedCite.status.replace(/_/g, ' ')}
            </span>
          </div>

          {/* Audits for Selected Citation Bond */}
          {citeAudits.length > 0 && selectedAudit && (
            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {citeAudits.map((a) => (
                    <button
                      key={a.audit_id}
                      type="button"
                      onClick={() => setSelectedAuditId(a.audit_id)}
                      className={`mono rounded border px-2.5 py-1 text-xs font-medium ${
                        a.audit_id === selectedAudit.audit_id
                          ? 'border-[#0F172A] bg-[#0F172A] text-white'
                          : 'border-[#CBD5E1] bg-white text-[#475569] hover:border-[#0F172A]'
                      }`}
                    >
                      {a.audit_id}
                    </button>
                  ))}
                  <span
                    className={`mono rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeClasses(
                      selectedAudit.verdict
                    )}`}
                  >
                    {selectedAudit.verdict.replace(/_/g, ' ')}
                  </span>
                  <span className="mono rounded bg-[#F1F5F9] px-2 py-0.5 text-[11px] text-[#475569]">
                    {selectedAudit.reason}
                  </span>
                </div>

                {txByEntity[selectedAudit.audit_id] && (
                  <a
                    href={txByEntity[selectedAudit.audit_id].explorer_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mono inline-flex items-center gap-1 text-xs text-[#1D4ED8] hover:underline"
                  >
                    Audit Tx {shortHash(txByEntity[selectedAudit.audit_id].tx_hash, 8, 4)}
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>

              <div className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 text-xs text-[#334155]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Cross-contract live upstream status:{' '}
                    <strong className="mono text-[#0F172A]">
                      {selectedAudit.upstream_live_status || 'N/A'}
                    </strong>
                  </span>
                  <span className="mono">
                    Payout: <strong>{selectedAudit.payout_wei} wei</strong> →{' '}
                    {shortHash(selectedAudit.payout_recipient, 6, 4)}
                  </span>
                </div>
                {selectedAudit.summary && (
                  <p className="mt-2 text-sm text-[#0F172A]">{selectedAudit.summary}</p>
                )}
              </div>

              {selectedAudit.quote && (
                <div
                  className={`rounded-md border p-3.5 ${
                    selectedAudit.verdict === 'LOAD_BEARING_DEPENDENCY'
                      ? 'border-red-200 bg-red-50/70 text-red-950'
                      : 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
                  }`}
                >
                  <div className="mono flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider">
                    {selectedAudit.verdict === 'LOAD_BEARING_DEPENDENCY' ? (
                      <ShieldAlert size={14} />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    Verbatim On-Chain Citation Proof
                  </div>
                  <blockquote className="mono mt-1.5 text-xs leading-relaxed">
                    “{selectedAudit.quote}”
                  </blockquote>
                </div>
              )}

              {selectedAudit.snippet_sha256 && (
                <div className="space-y-3 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="mono flex items-center gap-1.5 text-xs text-[#334155]">
                      <FileText size={14} />
                      <span>
                        Lines {selectedAudit.start_line}–{selectedAudit.end_line} ·{' '}
                        {selectedAudit.snippet_len} chars
                      </span>
                    </div>
                    <a
                      href={selectedAudit.evidence_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mono inline-flex items-center gap-1 text-xs text-[#1D4ED8] hover:underline"
                    >
                      Pinned Archive Source
                      <ExternalLink size={12} />
                    </a>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] pt-3">
                    <div className="mono flex items-center gap-1.5 text-xs text-[#475569]">
                      <Hash size={13} />
                      <span>
                        snippet_sha256:{' '}
                        <strong className="text-[#0F172A]">
                          {shortHash(selectedAudit.snippet_sha256, 14, 10)}
                        </strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleVerifySha256}
                      disabled={shaCheck.state === 'loading'}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#0F172A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E293B] disabled:opacity-60"
                    >
                      <ShieldCheck size={14} />
                      {shaCheck.state === 'loading'
                        ? 'Hashing Archive…'
                        : 'Verify SHA-256 in Browser'}
                    </button>
                  </div>

                  {shaCheck.state !== 'idle' && shaCheck.state !== 'loading' && (
                    <div
                      className={`mono rounded border px-3 py-2 text-[11px] ${
                        shaCheck.state === 'match'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-red-200 bg-red-50 text-red-800'
                      }`}
                    >
                      {shaCheck.message}
                    </div>
                  )}

                  {selectedAudit.snippet_excerpt && (
                    <pre className="mono max-h-60 overflow-auto whitespace-pre-wrap rounded border border-[#E2E8F0] bg-white p-3 text-[11px] leading-relaxed text-[#334155]">
                      {highlightedParts ? (
                        <>
                          {highlightedParts.before}
                          <mark
                            className={`rounded px-0.5 ${
                              selectedAudit.verdict === 'LOAD_BEARING_DEPENDENCY'
                                ? 'bg-red-100 text-red-950'
                                : 'bg-emerald-100 text-emerald-950'
                            }`}
                          >
                            {highlightedParts.match}
                          </mark>
                          {highlightedParts.after}
                        </>
                      ) : (
                        selectedAudit.snippet_excerpt
                      )}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

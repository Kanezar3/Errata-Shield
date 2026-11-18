import { useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileCheck2,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import { formatWeiDisplay, isHttpUrl } from '../lib/format';
import { shortHash, txExplorerUrl } from '../lib/genlayer';
import type { ErrataProofCase, ErrataProofDocument, LiveChainSnapshot } from '../types/proof';
import { LiveChainPanel } from './LiveChainPanel';
import { VerdictBadge } from './VerdictBadge';

interface ProofInspectorProps {
  proof: ErrataProofDocument;
  contractAddress: string;
  liveSnapshot: LiveChainSnapshot | null;
  liveLoading: boolean;
  connectedAddress: string | null;
  onRefreshLive: () => void;
}

function getDispositionNote(item: ErrataProofCase): { title: string; detail: string } {
  if (item.verdict === 'EXPIRED_RETURNED') {
    return {
      title: 'Bond Timeout Expired Uncontested',
      detail:
        'No conclusive errata audit invalidated the finding before the bond deadline elapsed. The creator bond was returned via the deterministic expiry settlement.',
    };
  }
  if (item.verdict === 'TOO_VAGUE') {
    return {
      title: 'Gate 1 Observability Filter',
      detail:
        'Rejected during Gate 1 deterministic screening as subjective or non-falsifiable prior to line-slice fetching. The creator deposit was credited to refundable escrow.',
    };
  }
  if (item.verdict === 'REJECTED_INVALID') {
    return {
      title: 'Evidence URL Scope Violation',
      detail:
        'The submitted evidence URL did not match the immutable allowed source prefix bound to this finding. The audit was rejected and eligible stake refunded.',
    };
  }
  if (item.verdict === 'UNVERIFIABLE_FETCH') {
    return {
      title: 'Unverifiable Fetch / Empty Line Slice',
      detail:
        'The target URL returned a non-200 HTTP response or empty line window. The challenger stake was refunded to escrow and the bond remained open for retry.',
    };
  }
  return {
    title: 'Insufficient Documentary Basis',
    detail:
      'Validators audited the pinned line window and determined it does not substantiate or refute the finding (including ignoring any embedded prompt-injection text).',
  };
}

function computeVerifiedTxCount(proofDoc: ErrataProofDocument): number {
  const hashes = new Set<string>();
  if (proofDoc.deploy_tx_hash) hashes.add(proofDoc.deploy_tx_hash);
  for (const c of proofDoc.cases) {
    if (c.create_tx_hash) hashes.add(c.create_tx_hash);
    if (c.audit_tx_hash) hashes.add(c.audit_tx_hash);
    if (c.settle_tx_hash) hashes.add(c.settle_tx_hash);
    if (c.withdraw_tx_hash) hashes.add(c.withdraw_tx_hash);
  }
  if (proofDoc.withdrawals?.creator?.tx_id) {
    hashes.add(proofDoc.withdrawals.creator.tx_id);
  }
  if (proofDoc.withdrawals?.challenger?.tx_id) {
    hashes.add(proofDoc.withdrawals.challenger.tx_id);
  }
  return hashes.size;
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  };

  return (
    <button
      type="button"
      className="inline-flex shrink-0 items-center gap-1 rounded border border-[#CBD5E1] bg-white px-2 py-0.5 text-[11px] font-medium text-[#334155] transition-colors hover:border-[#94A3B8] hover:text-[#0F172A]"
      onClick={handleCopy}
      title={`Copy ${label ?? 'value'}`}
    >
      {copied ? <Check size={11} className="text-emerald-700" /> : <Copy size={11} />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

export function ProofInspector({
  proof,
  contractAddress,
  liveSnapshot,
  liveLoading,
  connectedAddress,
  onRefreshLive,
}: ProofInspectorProps) {
  const [selectedCaseId, setSelectedCaseId] = useState<string>(
    proof.cases[0]?.case_id ?? ''
  );

  const activeCase: ErrataProofCase | undefined =
    proof.cases.find((c) => c.case_id === selectedCaseId) ?? proof.cases[0];

  const caseCountFormatted = String(proof.cases.length).padStart(2, '0');
  const finalizedCount = String(
    proof.cases.filter((c) => c.tx_status === 'FINALIZED').length
  ).padStart(2, '0');
  const verifiedTxCount = computeVerifiedTxCount(proof);

  const creatorWithdrawWei = BigInt(
    proof.withdrawals?.creator?.claimable_before_wei ?? '0'
  );
  const challengerWithdrawWei = BigInt(
    proof.withdrawals?.challenger?.claimable_before_wei ?? '0'
  );
  const totalSettledWei = creatorWithdrawWei + challengerWithdrawWei;

  const createUrl = txExplorerUrl(activeCase?.create_tx_hash);
  const auditUrl = txExplorerUrl(activeCase?.audit_tx_hash);
  const settleUrl = txExplorerUrl(activeCase?.settle_tx_hash);
  const withdrawUrl = txExplorerUrl(activeCase?.withdraw_tx_hash);
  const deployUrl = txExplorerUrl(proof.deploy_tx_hash);

  const creatorWithdrawUrl = txExplorerUrl(proof.withdrawals?.creator?.tx_id);
  const challengerWithdrawUrl = txExplorerUrl(proof.withdrawals?.challenger?.tx_id);

  const bondFmt = formatWeiDisplay(activeCase?.bond_wei);
  const stakeFmt = formatWeiDisplay(activeCase?.stake_wei ?? '0');

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      {/* Cohesive 4-Column Protocol Summary Strip */}
      <section
        className="grid min-w-0 max-w-full grid-cols-1 divide-y divide-[#E2E8F0] rounded-md border border-[#E2E8F0] bg-white sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0"
        aria-label="Protocol summary"
      >
        <div className="px-5 py-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
            Finalized Dockets
          </div>
          <div className="font-display tabular-nums mt-1 text-lg font-semibold leading-snug text-[#0F172A]">
            {finalizedCount} / {caseCountFormatted}
          </div>
          <div className="mt-0.5 text-xs text-[#475569]">
            {verifiedTxCount} StudioNet Txs · Majority Consensus
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
            Adjudication Engine
          </div>
          <div className="font-display tabular-nums mt-1 text-lg font-semibold leading-snug text-[#0F172A]">
            Two-Gate Consensus
          </div>
          <div className="mt-0.5 text-xs text-[#475569]">
            Observability Gate → Line-Slice Audit
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
            Slice Pinning
          </div>
          <div className="font-display tabular-nums mt-1 text-lg font-semibold leading-snug text-[#0F172A]">
            SHA-256 + Verbatim
          </div>
          <div className="mt-0.5 text-xs text-[#475569]">
            120-line window · ≥ 12-char quote check
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
            Escrow Settlement
          </div>
          <div className="font-display tabular-nums mt-1 text-lg font-semibold leading-snug text-[#0F172A]">
            {totalSettledWei > 0n
              ? `${totalSettledWei.toString()} wei Settled`
              : 'Escrow Verified'}
          </div>
          <div className="mt-0.5 text-xs text-[#475569]">
            {totalSettledWei > 0n
              ? `Creator ${creatorWithdrawWei.toString()} · Challenger ${challengerWithdrawWei.toString()} wei`
              : 'Direct EOA withdrawals via bridge'}
          </div>
        </div>
      </section>

      {/* Primary Monograph Sheet: Recorded Proof Dossiers */}
      <section className="min-w-0 max-w-full overflow-hidden rounded-md border border-[#E2E8F0] bg-white">
        {/* Sheet Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-[#64748B]">
              <FileCheck2 size={13} className="shrink-0 text-[#1D4ED8]" />
              <span>Recorded Proof Snapshot · No Wallet Required</span>
            </div>
            <h2 className="font-display mt-0.5 text-lg font-semibold tracking-tight text-[#0F172A] sm:text-xl">
              StudioNet Peer-Review Dossiers ({proof.cases.length} Cases)
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {proof.is_placeholder ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 font-medium text-amber-800">
                Placeholder Schema
              </span>
            ) : (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-800">
                Verified · {new Date(proof.generated_at).toLocaleDateString()}
              </span>
            )}
            {deployUrl && (
              <a
                href={deployUrl}
                target="_blank"
                rel="noreferrer"
                className="mono inline-flex items-center gap-1 font-medium text-[#1D4ED8] hover:underline"
              >
                <span>Deploy Tx</span>
                <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>

        {/* Two-Column Monograph Layout: Docket Sidebar + Exhibit Folio */}
        <div className="grid min-w-0 max-w-full grid-cols-1 lg:grid-cols-[296px_minmax(0,1fr)]">
          {/* Docket Index Sidebar */}
          <aside
            className="flex min-w-0 max-w-full flex-col divide-y divide-[#E2E8F0] border-b border-[#E2E8F0] bg-[#F8FAFC]/50 lg:border-b-0 lg:border-r"
            aria-label="Errata proof dockets"
          >
            {proof.cases.map((item, idx) => {
              const isSelected = item.case_id === activeCase?.case_id;
              return (
                <button
                  key={item.case_id}
                  type="button"
                  onClick={() => setSelectedCaseId(item.case_id)}
                  className={`min-w-0 border-l-[3px] px-4 py-3.5 text-left transition-colors ${
                    isSelected
                      ? 'border-l-[#1D4ED8] bg-white'
                      : 'border-l-transparent bg-transparent hover:bg-white/70'
                  }`}
                >
                  <div className="mono mb-1 flex items-center justify-between text-[11px] tracking-wider text-[#64748B]">
                    <span>CASE 0{idx + 1}</span>
                    <span>{item.tx_status}</span>
                  </div>
                  <div className="mb-2 text-sm font-semibold leading-snug text-[#0F172A]">
                    {item.label}
                  </div>
                  <VerdictBadge verdict={item.verdict} reason={item.reason} />
                </button>
              );
            })}
          </aside>

          {/* Exhibit Folio */}
          {activeCase ? (
            <article className="flex min-w-0 max-w-full flex-col gap-6 p-5 sm:p-7">
              {/* Folio Header */}
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mono mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#64748B]">
                    <span>Bond: {activeCase.bond_id}</span>
                    {activeCase.audit_id && (
                      <>
                        <span>·</span>
                        <span>Audit: {activeCase.audit_id}</span>
                      </>
                    )}
                    {activeCase.reason && (
                      <>
                        <span>·</span>
                        <span>Reason: {activeCase.reason}</span>
                      </>
                    )}
                  </div>
                  <h3 className="font-display text-xl font-semibold tracking-tight text-[#0F172A] sm:text-2xl">
                    {activeCase.paper_title}
                  </h3>
                </div>
                <VerdictBadge verdict={activeCase.verdict} reason={activeCase.reason} />
              </header>

              {/* Section 1: Claim & Scope */}
              <section className="flex min-w-0 flex-col gap-3 border-t border-[#E2E8F0] pt-6">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#1D4ED8]">
                  <BookOpen size={14} />
                  <span>Claim &amp; Scope</span>
                </div>
                <p className="text-[15px] font-medium leading-relaxed text-[#0F172A]">
                  {activeCase.finding_claim}
                </p>
                {activeCase.notes && (
                  <p className="text-xs leading-relaxed text-[#475569]">{activeCase.notes}</p>
                )}
                <dl className="mt-1 divide-y divide-[#E2E8F0] border-y border-[#E2E8F0] text-xs">
                  <div className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                    <dt className="min-w-[165px] font-medium text-[#64748B]">
                      Allowed Source Prefix
                    </dt>
                    <dd className="mono break-all text-[#0F172A]">
                      {activeCase.allowed_source_prefix}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                    <dt className="min-w-[165px] font-medium text-[#64748B]">
                      Finding Digest (SHA-256)
                    </dt>
                    <dd className="mono min-w-0 flex-1 break-all text-[#0F172A]">
                      {activeCase.finding_sha256}
                    </dd>
                    <CopyButton value={activeCase.finding_sha256} label="Finding Digest" />
                  </div>
                </dl>
              </section>

              {/* Section 2: Archival Evidence & Verbatim Quote */}
              <section className="flex min-w-0 flex-col gap-3.5 border-t border-[#E2E8F0] pt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#1D4ED8]">
                    <Scale size={14} />
                    <span>Archival Evidence &amp; Verbatim Quote</span>
                  </div>
                  {activeCase.start_line !== undefined && activeCase.end_line !== undefined && (
                    <span className="mono rounded border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-0.5 text-[11px] font-medium text-[#334155]">
                      Lines {activeCase.start_line}–{activeCase.end_line}
                    </span>
                  )}
                </div>

                {activeCase.verbatim_quote && activeCase.verbatim_quote.trim().length > 0 ? (
                  <div className="border-l-[3px] border-[#1D4ED8] bg-[#F8FAFC] py-3.5 pl-4 pr-3.5">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                        Verbatim Quote
                      </span>
                      <CopyButton value={activeCase.verbatim_quote} label="Verbatim Quote" />
                    </div>
                    <blockquote className="text-[15px] italic leading-relaxed text-[#0F172A]">
                      “{activeCase.verbatim_quote}”
                    </blockquote>
                  </div>
                ) : (
                  <div className="border-l-[3px] border-[#CBD5E1] bg-[#F8FAFC] py-3 pl-4 pr-3.5">
                    <strong className="block text-sm font-semibold text-[#0F172A]">
                      {getDispositionNote(activeCase).title}
                    </strong>
                    <p className="mt-1 text-xs leading-relaxed text-[#475569]">
                      {getDispositionNote(activeCase).detail}
                    </p>
                  </div>
                )}

                {activeCase.snippet_excerpt && (
                  <details className="group border-b border-[#E2E8F0] pb-2 text-xs">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1.5 font-medium text-[#334155] hover:text-[#1D4ED8]">
                      <ChevronRight
                        size={14}
                        className="transition-transform group-open:rotate-90"
                      />
                      <span>Inspect Normalized Line-Slice Excerpt</span>
                    </summary>
                    <pre className="mono mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-[#CBD5E1] bg-[#F8FAFC] p-3 text-[11px] leading-relaxed text-[#334155]">
                      {activeCase.snippet_excerpt}
                    </pre>
                  </details>
                )}

                {activeCase.snippet_sha256 || activeCase.evidence_url ? (
                  <dl className="divide-y divide-[#E2E8F0] border-y border-[#E2E8F0] text-xs">
                    {activeCase.snippet_sha256 && (
                      <div className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                        <dt className="min-w-[165px] font-medium text-[#64748B]">
                          Snippet Digest (SHA-256)
                        </dt>
                        <dd className="mono min-w-0 flex-1 break-all text-[#0F172A]">
                          {activeCase.snippet_sha256}
                        </dd>
                        <CopyButton value={activeCase.snippet_sha256} label="Snippet Digest" />
                      </div>
                    )}
                    {activeCase.evidence_url && (
                      <div className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                        <dt className="min-w-[165px] font-medium text-[#64748B]">
                          Immutable Evidence URL
                        </dt>
                        <dd className="min-w-0 flex-1">
                          {isHttpUrl(activeCase.evidence_url) ? (
                            <a
                              href={activeCase.evidence_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mono inline-flex items-center gap-1 break-all text-[#1D4ED8] hover:underline"
                            >
                              <span>{activeCase.evidence_url}</span>
                              <ExternalLink size={12} className="shrink-0" />
                            </a>
                          ) : (
                            <span className="mono break-all text-[#0F172A]">
                              {activeCase.evidence_url}
                            </span>
                          )}
                        </dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <p className="text-xs text-[#64748B]">
                    N/A — Settled prior to Gate 2 line-slice archival audit.
                  </p>
                )}
              </section>

              {/* Section 3: Settlement & On-Chain Proof */}
              <section className="flex min-w-0 flex-col gap-4 border-t border-[#E2E8F0] pt-6">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#1D4ED8]">
                  <ShieldCheck size={14} />
                  <span>Settlement &amp; On-Chain Proof</span>
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                      Bond &amp; Stake Settlement
                    </h4>
                    <dl className="divide-y divide-[#E2E8F0]/70 text-xs">
                      <div className="flex justify-between gap-2 py-1.5">
                        <dt className="text-[#475569]">Creator Bond</dt>
                        <dd className="mono font-medium text-[#0F172A]" title={bondFmt.secondary}>
                          {bondFmt.primary}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2 py-1.5">
                        <dt className="text-[#475569]">Challenger Stake</dt>
                        <dd className="mono font-medium text-[#0F172A]" title={stakeFmt.secondary}>
                          {stakeFmt.primary}
                        </dd>
                      </div>
                      {activeCase.payout_summary && (
                        <div className="flex flex-col gap-0.5 py-2">
                          <dt className="text-[#475569]">Outcome</dt>
                          <dd className="font-medium leading-relaxed text-[#0F172A]">
                            {activeCase.payout_summary}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  <div>
                    <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                      StudioNet Explorer Transactions
                    </h4>
                    <ul className="mono divide-y divide-[#E2E8F0]/70 text-xs">
                      <li className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                        <span className="font-sans text-[#475569]">Create Bond</span>
                        {createUrl ? (
                          <a
                            href={createUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[#1D4ED8] hover:underline"
                          >
                            {shortHash(activeCase.create_tx_hash)} <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span className="text-[#475569]">
                            {shortHash(activeCase.create_tx_hash)}
                          </span>
                        )}
                      </li>
                      {activeCase.audit_tx_hash && (
                        <li className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                          <span className="font-sans text-[#475569]">Submit Audit</span>
                          {auditUrl ? (
                            <a
                              href={auditUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[#1D4ED8] hover:underline"
                            >
                              {shortHash(activeCase.audit_tx_hash)} <ExternalLink size={11} />
                            </a>
                          ) : (
                            <span className="text-[#475569]">
                              {shortHash(activeCase.audit_tx_hash)}
                            </span>
                          )}
                        </li>
                      )}
                      {activeCase.settle_tx_hash && (
                        <li className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                          <span className="font-sans text-[#475569]">Settle Expiry</span>
                          {settleUrl ? (
                            <a
                              href={settleUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[#1D4ED8] hover:underline"
                            >
                              {shortHash(activeCase.settle_tx_hash)} <ExternalLink size={11} />
                            </a>
                          ) : (
                            <span className="text-[#475569]">
                              {shortHash(activeCase.settle_tx_hash)}
                            </span>
                          )}
                        </li>
                      )}
                      {activeCase.withdraw_tx_hash && !proof.withdrawals && (
                        <li className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                          <span className="font-sans text-[#475569]">Withdraw</span>
                          {withdrawUrl ? (
                            <a
                              href={withdrawUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[#1D4ED8] hover:underline"
                            >
                              {shortHash(activeCase.withdraw_tx_hash)} <ExternalLink size={11} />
                            </a>
                          ) : (
                            <span className="text-[#475569]">
                              {shortHash(activeCase.withdraw_tx_hash)}
                            </span>
                          )}
                        </li>
                      )}
                      {activeCase.verdict === 'EXPIRED_RETURNED' &&
                        proof.withdrawals?.creator && (
                          <li className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                            <span className="font-sans text-[#475569]">
                              Creator Withdraw ({proof.withdrawals.creator.claimable_before_wei} wei)
                            </span>
                            {creatorWithdrawUrl ? (
                              <a
                                href={creatorWithdrawUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[#1D4ED8] hover:underline"
                              >
                                {shortHash(proof.withdrawals.creator.tx_id)}{' '}
                                <ExternalLink size={11} />
                              </a>
                            ) : (
                              <span className="text-[#475569]">
                                {shortHash(proof.withdrawals.creator.tx_id)}
                              </span>
                            )}
                          </li>
                        )}
                      {activeCase.verdict === 'EXPIRED_RETURNED' &&
                        proof.withdrawals?.challenger && (
                          <li className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                            <span className="font-sans text-[#475569]">
                              Challenger Withdraw (
                              {proof.withdrawals.challenger.claimable_before_wei} wei)
                            </span>
                            {challengerWithdrawUrl ? (
                              <a
                                href={challengerWithdrawUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[#1D4ED8] hover:underline"
                              >
                                {shortHash(proof.withdrawals.challenger.tx_id)}{' '}
                                <ExternalLink size={11} />
                              </a>
                            ) : (
                              <span className="text-[#475569]">
                                {shortHash(proof.withdrawals.challenger.tx_id)}
                              </span>
                            )}
                          </li>
                        )}
                    </ul>
                  </div>
                </div>

                {/* Consensus & Appeal Lifecycle Strip */}
                <div className="mt-2 border-t border-[#E2E8F0] pt-4">
                  <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#0F172A]">
                      Consensus &amp; Appeal Lifecycle
                    </span>
                    <span className="mono rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                      {activeCase.tx_status}
                      {activeCase.consensus_result ? ` · ${activeCase.consensus_result}` : ''}
                    </span>
                  </div>
                  <div className="mono mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[#475569]">
                    <span>1. Proposed</span>
                    <span className="text-[#CBD5E1]">→</span>
                    <span>2. Validators Agreed</span>
                    <span className="text-[#CBD5E1]">→</span>
                    <span>3. Accepted (5) Appeal Window</span>
                    <span className="text-[#CBD5E1]">→</span>
                    <span className="font-semibold text-emerald-800">4. Finalized (7)</span>
                  </div>
                  <p className="text-xs text-[#64748B]">
                    GenLayer Optimistic Democracy enters <code>Accepted (5)</code> upon validator
                    agreement before locking permanently in <code>Finalized (7)</code>.{' '}
                    <span className="font-medium text-[#0F172A]">
                      {activeCase.appeal_window_status ?? 'Appeal window closed — Finalized (7)'}
                    </span>
                  </p>
                </div>
              </section>
            </article>
          ) : (
            <p className="p-6 text-sm text-[#475569]">No cases found in proof.json.</p>
          )}
        </div>
      </section>

      <LiveChainPanel
        contractAddress={contractAddress}
        snapshot={liveSnapshot}
        loading={liveLoading}
        connectedAddress={connectedAddress}
        onRefresh={onRefreshLive}
      />
    </div>
  );
}

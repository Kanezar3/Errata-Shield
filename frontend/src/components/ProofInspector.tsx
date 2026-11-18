import { useState } from 'react';
import {
  BookOpen,
  Check,
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
      className="inline-flex shrink-0 items-center gap-1 rounded-[2px] border border-[#CBD5E1] bg-white px-2 py-0.5 text-[11px] font-medium text-[#0F172A] hover:bg-[#F4F6F9]"
      onClick={handleCopy}
      title={`Copy ${label ?? 'value'}`}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

export function ProofInspector({
  proof,
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
      {/* Executive Protocol Summary Strip */}
      <section
        className="grid min-w-0 max-w-full grid-cols-1 border border-t-2 border-[#CBD5E1] border-t-[#2563EB] bg-white sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Protocol summary"
      >
        <div className="border-b border-[#CBD5E1] px-4 py-3.5 sm:border-r lg:border-b-0">
          <div className="mono text-[11px] font-semibold tracking-wider text-[#475569]">
            FINALIZED DOCKETS
          </div>
          <div className="font-display text-xl font-semibold text-[#0F172A]">
            {finalizedCount} / {caseCountFormatted}
          </div>
          <div className="text-xs text-[#475569]">
            {verifiedTxCount} StudioNet Txs · Majority Consensus
          </div>
        </div>

        <div className="border-b border-[#CBD5E1] px-4 py-3.5 lg:border-r lg:border-b-0">
          <div className="mono text-[11px] font-semibold tracking-wider text-[#475569]">
            ADJUDICATION ENGINE
          </div>
          <div className="font-display text-xl font-semibold text-[#0F172A]">
            Two-Gate Consensus
          </div>
          <div className="text-xs text-[#475569]">
            Observability Gate → Line-Slice Errata Audit
          </div>
        </div>

        <div className="border-b border-[#CBD5E1] px-4 py-3.5 sm:border-r sm:border-b-0">
          <div className="mono text-[11px] font-semibold tracking-wider text-[#475569]">
            SLICE PINNING
          </div>
          <div className="font-display text-xl font-semibold text-[#0F172A]">
            SHA-256 + Verbatim
          </div>
          <div className="text-xs text-[#475569]">
            Bounded 120-line window + ≥ 12-char quote check
          </div>
        </div>

        <div className="px-4 py-3.5">
          <div className="mono text-[11px] font-semibold tracking-wider text-[#475569]">
            ESCROW SETTLEMENT
          </div>
          <div className="font-display text-xl font-semibold text-[#0F172A]">
            {totalSettledWei > 0n
              ? `${totalSettledWei.toString()} wei Settled`
              : 'Escrow Verified'}
          </div>
          <div className="text-xs text-[#475569]">
            {totalSettledWei > 0n
              ? `Creator ${creatorWithdrawWei.toString()} wei · Challenger ${challengerWithdrawWei.toString()} wei`
              : 'Direct EOA withdrawals via GenLayer bridge'}
          </div>
        </div>
      </section>

      {/* Recorded Proof Snapshot */}
      <section className="min-w-0 max-w-full rounded-[3px] border border-[#CBD5E1] bg-white p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-[#CBD5E1] pb-4">
          <div>
            <p className="mono mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#475569]">
              <FileCheck2 size={12} className="text-[#2563EB]" />
              <span>Recorded Proof Snapshot · No Wallet Required</span>
            </p>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h2 className="font-display text-xl font-semibold text-[#0F172A]">
                StudioNet Peer-Review Dossiers ({proof.cases.length} Cases)
              </h2>
              <span className="mono rounded-[2px] border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-[#2563EB]">
                proof.json
              </span>
            </div>
          </div>

          <div className="mono flex flex-wrap items-center gap-2.5 text-xs">
            {proof.is_placeholder ? (
              <span className="rounded-[2px] border border-amber-700/40 bg-amber-50 px-2.5 py-0.5 font-semibold text-amber-900">
                Placeholder Schema · Awaiting Stage 2 Proof
              </span>
            ) : (
              <span className="rounded-[2px] border border-emerald-700/40 bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-900">
                Verified Snapshot · {new Date(proof.generated_at).toLocaleString()}
              </span>
            )}
            {deployUrl && (
              <a
                href={deployUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-[#2563EB] hover:underline"
              >
                Deploy Tx <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>

        <div className="grid min-w-0 max-w-full grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* Docket Index Sidebar */}
          <aside
            className="flex min-w-0 max-w-full flex-col border border-[#CBD5E1] bg-white"
            aria-label="Errata proof dockets"
          >
            {proof.cases.map((item, idx) => {
              const isSelected = item.case_id === activeCase?.case_id;
              return (
                <button
                  key={item.case_id}
                  type="button"
                  onClick={() => setSelectedCaseId(item.case_id)}
                  className={`min-w-0 border-b border-[#CBD5E1] border-l-[3px] px-3.5 py-3 text-left transition-colors last:border-b-0 ${
                    isSelected
                      ? 'border-l-[#2563EB] bg-[#F4F6F9]'
                      : 'border-l-transparent bg-white hover:bg-[#F4F6F9]/60'
                  }`}
                >
                  <div className="mono mb-1 flex justify-between text-[11px] tracking-wider text-[#475569]">
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
            <article className="flex min-w-0 max-w-full flex-col gap-5">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-[#0F172A] pb-3.5">
                <div className="min-w-0">
                  <div className="mono mb-1 text-xs text-[#475569]">
                    Bond: {activeCase.bond_id}
                    {activeCase.audit_id ? ` · Audit: ${activeCase.audit_id}` : ''}
                    {activeCase.reason ? ` · Reason: ${activeCase.reason}` : ''}
                  </div>
                  <h3 className="font-display text-2xl font-semibold text-[#0F172A]">
                    {activeCase.paper_title}
                  </h3>
                </div>
                <VerdictBadge verdict={activeCase.verdict} reason={activeCase.reason} />
              </header>

              {/* Exhibit I */}
              <div className="flex min-w-0 flex-col gap-2.5 border-b border-[#CBD5E1] pb-5">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#2563EB]">
                  <BookOpen size={14} />
                  <span>Exhibit I · Scientific Finding &amp; Allowed Source Scope</span>
                </div>
                <p className="text-base font-medium text-[#0F172A]">{activeCase.finding_claim}</p>
                {activeCase.notes && (
                  <p className="text-xs text-[#475569]">{activeCase.notes}</p>
                )}
                <div className="flex flex-col border-y border-[#CBD5E1] text-xs">
                  <div className="flex flex-col gap-1 border-b border-[#CBD5E1] py-2 sm:flex-row sm:items-center sm:gap-3">
                    <span className="min-w-[170px] font-semibold text-[#475569]">
                      Allowed Source Prefix
                    </span>
                    <span className="mono break-all text-[#0F172A]">
                      {activeCase.allowed_source_prefix}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:gap-3">
                    <span className="min-w-[170px] font-semibold text-[#475569]">
                      Finding Digest (SHA-256)
                    </span>
                    <code className="mono min-w-0 flex-1 break-all text-[#0F172A]">
                      {activeCase.finding_sha256}
                    </code>
                    <CopyButton value={activeCase.finding_sha256} label="Finding SHA-256" />
                  </div>
                </div>
              </div>

              {/* Exhibit II */}
              <div className="flex min-w-0 flex-col gap-2.5 border-b border-[#CBD5E1] pb-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#2563EB]">
                    <Scale size={14} />
                    <span>Exhibit II · Line-Slice Evidence &amp; Validator Audit</span>
                  </div>
                  {activeCase.start_line !== undefined && activeCase.end_line !== undefined && (
                    <span className="mono rounded-[2px] border border-[#CBD5E1] bg-[#F4F6F9] px-2 py-0.5 text-[11px] font-medium text-[#0F172A]">
                      Lines {activeCase.start_line}–{activeCase.end_line}
                    </span>
                  )}
                </div>

                {activeCase.verbatim_quote && activeCase.verbatim_quote.trim().length > 0 ? (
                  <blockquote className="border-l-[3px] border-[#2563EB] bg-[#F4F6F9] px-4 py-3 text-base italic text-[#0F172A]">
                    “{activeCase.verbatim_quote}”
                  </blockquote>
                ) : (
                  <div className="border-l-[3px] border-[#CBD5E1] bg-[#F4F6F9] px-4 py-3">
                    <strong className="block text-sm text-[#0F172A]">
                      {getDispositionNote(activeCase).title}
                    </strong>
                    <p className="mt-0.5 text-xs text-[#475569]">
                      {getDispositionNote(activeCase).detail}
                    </p>
                  </div>
                )}

                {activeCase.snippet_excerpt && (
                  <details className="rounded-[2px] border border-[#CBD5E1] bg-[#F4F6F9] px-3 py-2 text-xs">
                    <summary className="mono cursor-pointer font-medium text-[#0F172A]">
                      Inspect Normalized Line-Slice Excerpt
                    </summary>
                    <pre className="mono mt-2 whitespace-pre-wrap break-words text-[11px] text-[#475569]">
                      {activeCase.snippet_excerpt}
                    </pre>
                  </details>
                )}

                {activeCase.snippet_sha256 || activeCase.evidence_url ? (
                  <div className="flex flex-col border-y border-[#CBD5E1] text-xs">
                    {activeCase.snippet_sha256 && (
                      <div className="flex flex-col gap-1.5 border-b border-[#CBD5E1] py-2 sm:flex-row sm:items-center sm:gap-3">
                        <span className="min-w-[170px] font-semibold text-[#475569]">
                          Snippet Digest (SHA-256)
                        </span>
                        <code className="mono min-w-0 flex-1 break-all text-[#0F172A]">
                          {activeCase.snippet_sha256}
                        </code>
                        <CopyButton value={activeCase.snippet_sha256} label="Snippet SHA-256" />
                      </div>
                    )}
                    {activeCase.evidence_url && (
                      <div className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-3">
                        <span className="min-w-[170px] font-semibold text-[#475569]">
                          Immutable Evidence URL
                        </span>
                        {isHttpUrl(activeCase.evidence_url) ? (
                          <a
                            href={activeCase.evidence_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mono inline-flex items-center gap-1 break-all text-[#2563EB] hover:underline"
                          >
                            <span>{activeCase.evidence_url}</span>
                            <ExternalLink size={12} className="shrink-0" />
                          </a>
                        ) : (
                          <span className="mono break-all text-[#0F172A]">
                            {activeCase.evidence_url}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="border-l-2 border-[#CBD5E1] bg-[#F4F6F9] px-3 py-2 text-xs text-[#475569]">
                    N/A — Settled prior to Gate 2 line-slice archival audit
                  </div>
                )}
              </div>

              {/* Exhibit III */}
              <div className="flex min-w-0 flex-col gap-3 border-b border-[#CBD5E1] pb-5">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#2563EB]">
                  <ShieldCheck size={14} />
                  <span>Exhibit III · Bond Accounting &amp; Finalized Chain Record</span>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="border-t border-[#94A3B8] pt-3">
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#0F172A]">
                      Bond &amp; Stake Settlement
                    </h4>
                    <dl className="flex flex-col gap-1.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-[#475569]">Creator Bond</dt>
                        <dd className="mono font-medium text-[#0F172A]" title={bondFmt.secondary}>
                          {bondFmt.primary}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-[#475569]">Challenger Stake</dt>
                        <dd className="mono font-medium text-[#0F172A]" title={stakeFmt.secondary}>
                          {stakeFmt.primary}
                        </dd>
                      </div>
                      {activeCase.payout_summary && (
                        <div className="mt-1 flex flex-col gap-0.5">
                          <dt className="text-[#475569]">Outcome</dt>
                          <dd className="font-medium text-[#0F172A]">
                            {activeCase.payout_summary}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  <div className="border-t border-[#94A3B8] pt-3">
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#0F172A]">
                      StudioNet Explorer Transactions
                    </h4>
                    <ul className="mono flex flex-col gap-1.5 text-xs">
                      <li className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[#475569]">Create Bond</span>
                        {createUrl ? (
                          <a
                            href={createUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[#2563EB] hover:underline"
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
                        <li className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[#475569]">Submit Audit</span>
                          {auditUrl ? (
                            <a
                              href={auditUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[#2563EB] hover:underline"
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
                        <li className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[#475569]">Settle Expiry</span>
                          {settleUrl ? (
                            <a
                              href={settleUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[#2563EB] hover:underline"
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
                        <li className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[#475569]">Withdraw</span>
                          {withdrawUrl ? (
                            <a
                              href={withdrawUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[#2563EB] hover:underline"
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
                          <li className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[#475569]">
                              Creator Withdraw ({proof.withdrawals.creator.claimable_before_wei} wei)
                            </span>
                            {creatorWithdrawUrl ? (
                              <a
                                href={creatorWithdrawUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[#2563EB] hover:underline"
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
                          <li className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[#475569]">
                              Challenger Withdraw (
                              {proof.withdrawals.challenger.claimable_before_wei} wei)
                            </span>
                            {challengerWithdrawUrl ? (
                              <a
                                href={challengerWithdrawUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[#2563EB] hover:underline"
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
              </div>

              {/* Consensus & Appeal Lifecycle Strip */}
              <div className="border-l-[3px] border-[#2563EB] bg-[#F4F6F9] px-4 py-3.5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm text-[#0F172A]">
                    Consensus &amp; Appeal Lifecycle
                  </strong>
                  <span className="mono rounded-[2px] border border-emerald-700/40 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                    {activeCase.tx_status}
                    {activeCase.consensus_result ? ` · ${activeCase.consensus_result}` : ''}
                  </span>
                </div>
                <div className="mono mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="rounded-[2px] border border-[#CBD5E1] bg-white px-2 py-0.5 text-[#0F172A]">
                    1. Proposed
                  </span>
                  <span className="text-[#475569]">→</span>
                  <span className="rounded-[2px] border border-[#CBD5E1] bg-white px-2 py-0.5 text-[#0F172A]">
                    2. Validators Agreed
                  </span>
                  <span className="text-[#475569]">→</span>
                  <span className="rounded-[2px] border border-[#CBD5E1] bg-white px-2 py-0.5 text-[#0F172A]">
                    3. Accepted (5) Appeal Window
                  </span>
                  <span className="text-[#475569]">→</span>
                  <span className="rounded-[2px] border border-emerald-700/40 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-900">
                    4. Finalized (7)
                  </span>
                </div>
                <p className="text-xs text-[#475569]">
                  GenLayer Optimistic Democracy enters <code>Accepted (5)</code> upon validator
                  agreement before locking permanently in <code>Finalized (7)</code>.{' '}
                  <strong className="mono text-[#0F172A]">
                    {activeCase.appeal_window_status ?? 'Appeal window closed — Finalized (7)'}
                  </strong>
                </p>
              </div>
            </article>
          ) : (
            <p className="text-sm text-[#475569]">No cases found in proof.json.</p>
          )}
        </div>
      </section>

      <LiveChainPanel
        snapshot={liveSnapshot}
        loading={liveLoading}
        connectedAddress={connectedAddress}
        onRefresh={onRefreshLive}
      />
    </div>
  );
}

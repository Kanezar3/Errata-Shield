import { Database, ExternalLink, RefreshCw } from 'lucide-react';
import { formatWeiDisplay } from '../lib/format';
import { STUDIONET_RPC_URL, addressExplorerUrl, shortHash } from '../lib/genlayer';
import type { LiveChainSnapshot } from '../types/proof';
import { VerdictBadge } from './VerdictBadge';

interface LiveChainPanelProps {
  contractAddress: string;
  snapshot: LiveChainSnapshot | null;
  loading: boolean;
  connectedAddress: string | null;
  onRefresh: () => void;
}

const CONFIG_KEY_LABELS: Record<string, string> = {
  min_bond_wei: 'Minimum Bond',
  min_challenger_stake_wei: 'Minimum Challenger Stake',
  min_timeout_seconds: 'Minimum Timeout (s)',
  max_timeout_seconds: 'Maximum Timeout (s)',
  default_timeout_seconds: 'Default Timeout (s)',
  max_snippet_lines: 'Max Snippet Lines',
  max_audit_attempts: 'Max Audit Attempts',
  audit_attempts: 'Audit Attempts',
  min_quote_chars: 'Minimum Verbatim Quote Length',
  contract_version: 'Contract Version',
  owner: 'Contract Owner',
};

function formatConfigLabel(key: string): string {
  if (CONFIG_KEY_LABELS[key]) return CONFIG_KEY_LABELS[key];
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatStatusLabel(status: string | undefined): string {
  if (!status) return 'Open';
  return status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function LiveChainPanel({
  contractAddress,
  snapshot,
  loading,
  connectedAddress,
  onRefresh,
}: LiveChainPanelProps) {
  const resolvedAddress = snapshot?.contractAddress || contractAddress;
  const contractUrl = addressExplorerUrl(resolvedAddress);
  const balanceFmt = formatWeiDisplay(snapshot?.refundableBalanceWei ?? '0');

  return (
    <section className="min-w-0 max-w-full rounded-md border border-[#E2E8F0] bg-white">
      {/* Sheet Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-[#64748B]">
            <Database size={13} className="shrink-0 text-[#1D4ED8]" />
            <span>Live StudioNet RPC · Chain 61999</span>
          </div>
          <h3 className="font-display mt-0.5 text-lg font-semibold tracking-tight text-[#0F172A]">
            On-Chain Contract State
          </h3>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-semibold text-[#0F172A] transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={13} className={loading ? 'spin text-[#1D4ED8]' : 'text-[#475569]'} />
          <span>{loading ? 'Querying StudioNet…' : 'Refresh Live RPC'}</span>
        </button>
      </div>

      {/* Endpoint & Contract Metadata Strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-2.5 text-xs sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-medium text-[#64748B]">RPC Endpoint</span>
          <span className="mono truncate font-medium text-[#0F172A]">{STUDIONET_RPC_URL}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-medium text-[#64748B]">Contract</span>
          <span className="mono font-medium text-[#0F172A]">
            {resolvedAddress ? (
              contractUrl ? (
                <a
                  href={contractUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#1D4ED8] hover:underline"
                >
                  {shortHash(resolvedAddress, 8, 6)} <ExternalLink size={11} />
                </a>
              ) : (
                shortHash(resolvedAddress, 8, 6)
              )
            ) : (
              'Awaiting Address'
            )}
          </span>
        </div>
        {snapshot?.fetchedAt && (
          <div className="flex items-center gap-2">
            <span className="font-medium text-[#64748B]">Last Verified</span>
            <span className="mono font-medium text-[#0F172A]">
              {new Date(snapshot.fetchedAt).toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      {snapshot?.error ? (
        <div className="px-5 py-5 sm:px-6">
          <div className="border-l-2 border-amber-500 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
            <strong className="font-semibold">Live RPC Unavailable:</strong> {snapshot.error}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-[#E2E8F0]">
          {/* Configuration & Account Escrow Row */}
          <div className="grid min-w-0 max-w-full grid-cols-1 divide-y divide-[#E2E8F0] md:grid-cols-2 md:divide-x md:divide-y-0">
            <div className="min-w-0 px-5 py-5 sm:px-6">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h4 className="font-display text-sm font-semibold text-[#0F172A]">
                  Protocol Configuration
                </h4>
                <span className="mono text-[11px] text-[#64748B]">get_config</span>
              </div>
              {snapshot?.config ? (
                <dl className="divide-y divide-[#E2E8F0]/70 text-xs">
                  {Object.entries(snapshot.config).map(([k, v]) => {
                    const isWei = k.endsWith('_wei');
                    const formatted = isWei ? formatWeiDisplay(String(v)) : null;
                    return (
                      <div key={k} className="flex items-baseline justify-between gap-3 py-1.5">
                        <dt className="text-[#475569]">{formatConfigLabel(k)}</dt>
                        <dd
                          className="mono break-all text-right font-medium text-[#0F172A]"
                          title={formatted?.secondary}
                        >
                          {formatted ? formatted.primary : String(v)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              ) : (
                <p className="text-xs text-[#64748B]">
                  {loading ? 'Loading contract configuration…' : 'No configuration returned yet.'}
                </p>
              )}
            </div>

            <div className="min-w-0 px-5 py-5 sm:px-6">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h4 className="font-display text-sm font-semibold text-[#0F172A]">
                  Account Escrow Ledger
                </h4>
                <span className="mono text-[11px] text-[#64748B]">get_refundable_balance</span>
              </div>
              {connectedAddress ? (
                <div className="flex flex-col gap-1">
                  <span
                    className="font-display tabular-nums text-2xl font-semibold text-[#0F172A]"
                    title={balanceFmt.secondary}
                  >
                    {balanceFmt.primary}
                  </span>
                  <span className="mono text-xs text-[#64748B]">
                    {balanceFmt.secondary} · Account {shortHash(connectedAddress, 8, 6)}
                  </span>
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-[#475569]">
                  Connect a wallet in the publication header or Filing Desk to query your on-chain
                  refundable balance. Proof inspection requires no wallet.
                </p>
              )}
            </div>
          </div>

          {/* Registered Finding Bonds Table */}
          <div className="min-w-0 max-w-full px-5 py-5 sm:px-6">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h4 className="font-display text-sm font-semibold text-[#0F172A]">
                Registered Finding Bonds ({snapshot?.bonds.length ?? 0})
              </h4>
              <span className="mono text-[11px] text-[#64748B]">list_bonds</span>
            </div>
            {snapshot?.bonds && snapshot.bonds.length > 0 ? (
              <div className="w-full max-w-full overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
                      <th className="py-2 pr-4">Bond</th>
                      <th className="py-2 pr-4">Paper &amp; Finding Claim</th>
                      <th className="py-2 pr-4">Stake / Bond</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]/70">
                    {snapshot.bonds.map((b) => {
                      const bondFmt = formatWeiDisplay(b.bond_wei);
                      const refFmt = formatWeiDisplay(b.refunded_wei);
                      return (
                        <tr key={b.bond_id} className="align-top">
                          <td className="mono whitespace-nowrap py-3 pr-4">
                            <div className="font-semibold text-[#0F172A]">{b.bond_id}</div>
                            {b.creator && (
                              <div className="text-[11px] text-[#64748B]" title={b.creator}>
                                {shortHash(b.creator, 6, 4)}
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <div className="font-medium text-[#0F172A]">{b.paper_title}</div>
                            <div className="mt-0.5 text-[#475569]">{b.finding_claim}</div>
                            {b.reason && (
                              <div className="mono mt-1 text-[11px] text-[#64748B]">
                                Reason: {b.reason}
                              </div>
                            )}
                          </td>
                          <td className="mono whitespace-nowrap py-3 pr-4" title={bondFmt.secondary}>
                            <div className="text-[#0F172A]">{bondFmt.primary}</div>
                            {b.refunded_wei && String(b.refunded_wei) !== '0' && (
                              <div className="text-[11px] text-[#64748B]">
                                Refunded: {refFmt.primary}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap py-3 font-medium text-[#0F172A]">
                            {formatStatusLabel(b.status)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-[#64748B]">
                {loading ? 'Querying registered bonds…' : 'No live bonds returned from contract.'}
              </p>
            )}
          </div>

          {/* Filed Errata Audits Table */}
          <div className="min-w-0 max-w-full px-5 py-5 sm:px-6">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h4 className="font-display text-sm font-semibold text-[#0F172A]">
                Filed Errata Audits ({snapshot?.audits.length ?? 0})
              </h4>
              <span className="mono text-[11px] text-[#64748B]">list_audits</span>
            </div>
            {snapshot?.audits && snapshot.audits.length > 0 ? (
              <div className="w-full max-w-full overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
                      <th className="py-2 pr-4">Audit</th>
                      <th className="py-2 pr-4">Bond / Lines</th>
                      <th className="py-2 pr-4">Validator Verdict &amp; Excerpt</th>
                      <th className="py-2">Snippet Digest &amp; Payout</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]/70">
                    {snapshot.audits.map((a) => {
                      const payout = formatWeiDisplay(a.payout_wei);
                      return (
                        <tr key={a.audit_id} className="align-top">
                          <td className="mono whitespace-nowrap py-3 pr-4">
                            <div className="font-semibold text-[#0F172A]">{a.audit_id}</div>
                            {a.challenger && (
                              <div className="text-[11px] text-[#64748B]" title={a.challenger}>
                                {shortHash(a.challenger, 6, 4)}
                              </div>
                            )}
                          </td>
                          <td className="mono whitespace-nowrap py-3 pr-4">
                            <div className="text-[#0F172A]">{a.bond_id}</div>
                            {a.start_line !== undefined && a.end_line !== undefined && (
                              <div className="text-[11px] text-[#64748B]">
                                L{a.start_line}–L{a.end_line}
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            {a.verdict ? (
                              <VerdictBadge verdict={a.verdict} reason={a.reason} />
                            ) : (
                              <span className="mono text-[#475569]">{a.status ?? 'Pending'}</span>
                            )}
                            {a.quote && (
                              <div className="mt-1.5 italic text-[#475569]">
                                “{a.quote.slice(0, 110)}
                                {a.quote.length > 110 ? '…' : ''}”
                              </div>
                            )}
                          </td>
                          <td className="mono whitespace-nowrap py-3">
                            <div className="text-[#0F172A]" title={a.snippet_sha256}>
                              {shortHash(a.snippet_sha256, 10, 8)}
                            </div>
                            {a.payout_wei !== undefined && (
                              <div className="text-[11px] text-[#64748B]" title={payout.secondary}>
                                Payout: {payout.primary}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-[#64748B]">
                {loading ? 'Querying filed audits…' : 'No live audits returned from contract.'}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

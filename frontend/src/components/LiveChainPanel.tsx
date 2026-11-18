import { Database, ExternalLink, RefreshCw } from 'lucide-react';
import { formatWeiDisplay } from '../lib/format';
import { STUDIONET_RPC_URL, addressExplorerUrl, shortHash } from '../lib/genlayer';
import type { LiveChainSnapshot } from '../types/proof';
import { VerdictBadge } from './VerdictBadge';

interface LiveChainPanelProps {
  snapshot: LiveChainSnapshot | null;
  loading: boolean;
  connectedAddress: string | null;
  onRefresh: () => void;
}

export function LiveChainPanel({
  snapshot,
  loading,
  connectedAddress,
  onRefresh,
}: LiveChainPanelProps) {
  const contractUrl = addressExplorerUrl(snapshot?.contractAddress);
  const balanceFmt = formatWeiDisplay(snapshot?.refundableBalanceWei ?? '0');

  return (
    <section className="min-w-0 max-w-full rounded-[3px] border border-[#CBD5E1] bg-white p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[#CBD5E1] pb-4">
        <div>
          <p className="mono mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#475569]">
            <Database size={12} className="text-[#2563EB]" />
            <span>Live StudioNet RPC Reads · Chain 61999</span>
          </p>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h3 className="font-display text-xl font-semibold text-[#0F172A]">
              On-Chain Contract State
            </h3>
            <span className="mono rounded-[2px] border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-[#2563EB]">
              readContract
            </span>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-[3px] border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-semibold text-[#0F172A] hover:bg-[#F4F6F9] disabled:opacity-50"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
          <span>{loading ? 'Querying StudioNet…' : 'Refresh Live RPC'}</span>
        </button>
      </div>

      <div className="mono mb-5 flex flex-wrap gap-x-6 gap-y-2 rounded-[3px] border border-[#CBD5E1] bg-[#F4F6F9] px-3.5 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-wider text-[#475569]">
            RPC ENDPOINT
          </span>
          <span className="break-all font-medium text-[#0F172A]">{STUDIONET_RPC_URL}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-wider text-[#475569]">
            CONTRACT
          </span>
          <span className="font-medium text-[#0F172A]">
            {snapshot?.contractAddress ? (
              contractUrl ? (
                <a
                  href={contractUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#2563EB] hover:underline"
                >
                  {shortHash(snapshot.contractAddress, 10, 8)} <ExternalLink size={11} />
                </a>
              ) : (
                snapshot.contractAddress
              )
            ) : (
              'Not configured'
            )}
          </span>
        </div>
        {snapshot?.fetchedAt && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold tracking-wider text-[#475569]">
              LAST VERIFIED
            </span>
            <span className="font-medium text-[#0F172A]">
              {new Date(snapshot.fetchedAt).toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      {snapshot?.error ? (
        <div className="rounded-[3px] border border-amber-700/30 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
          <strong>Live RPC Unavailable:</strong> {snapshot.error}
        </div>
      ) : (
        <div className="grid min-w-0 max-w-full grid-cols-1 gap-4 md:grid-cols-2">
          <div className="min-w-0 rounded-[3px] border border-[#CBD5E1] bg-[#F4F6F9] p-4">
            <div className="mb-3 flex items-center justify-between gap-2 border-b border-[#CBD5E1] pb-2">
              <h4 className="font-display text-sm font-semibold text-[#0F172A]">
                Protocol Configuration
              </h4>
              <span className="mono rounded-[2px] border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-[#2563EB]">
                get_config
              </span>
            </div>
            {snapshot?.config ? (
              <dl className="flex flex-col gap-1.5 text-xs">
                {Object.entries(snapshot.config).map(([k, v]) => {
                  const isWei = k.endsWith('_wei');
                  const formatted = isWei ? formatWeiDisplay(String(v)) : null;
                  return (
                    <div key={k} className="flex justify-between gap-2">
                      <dt className="mono text-[#475569]">{k}</dt>
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
              <p className="text-xs text-[#475569]">No configuration returned yet.</p>
            )}
          </div>

          <div className="min-w-0 rounded-[3px] border border-[#CBD5E1] bg-[#F4F6F9] p-4">
            <div className="mb-3 flex items-center justify-between gap-2 border-b border-[#CBD5E1] pb-2">
              <h4 className="font-display text-sm font-semibold text-[#0F172A]">
                Account Escrow Ledger
              </h4>
              <span className="mono rounded-[2px] border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-[#2563EB]">
                get_refundable_balance
              </span>
            </div>
            {connectedAddress ? (
              <div className="flex flex-col gap-1">
                <span className="mono text-xl font-semibold text-[#0F172A]" title={balanceFmt.secondary}>
                  {balanceFmt.primary}
                </span>
                <span className="mono text-xs text-[#475569]">
                  {balanceFmt.secondary} · Account {shortHash(connectedAddress, 10, 8)}
                </span>
              </div>
            ) : (
              <p className="text-xs text-[#475569]">
                Connect a wallet in the masthead or Filing Desk to query your on-chain refundable
                balance. Proof inspection requires no wallet.
              </p>
            )}
          </div>

          <div className="min-w-0 rounded-[3px] border border-[#CBD5E1] bg-[#F4F6F9] p-4 md:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-2 border-b border-[#CBD5E1] pb-2">
              <h4 className="font-display text-sm font-semibold text-[#0F172A]">
                Registered Finding Bonds ({snapshot?.bonds.length ?? 0})
              </h4>
              <span className="mono rounded-[2px] border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-[#2563EB]">
                list_bonds
              </span>
            </div>
            {snapshot?.bonds && snapshot.bonds.length > 0 ? (
              <div className="max-w-full overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#CBD5E1] text-[11px] uppercase tracking-wider text-[#475569]">
                      <th className="py-2 pr-3">Bond</th>
                      <th className="py-2 pr-3">Paper &amp; Finding Claim</th>
                      <th className="py-2 pr-3">Stake / Bond</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.bonds.map((b) => {
                      const bondFmt = formatWeiDisplay(b.bond_wei);
                      const refFmt = formatWeiDisplay(b.refunded_wei);
                      return (
                        <tr key={b.bond_id} className="border-b border-[#CBD5E1]/70 align-top">
                          <td className="mono py-2.5 pr-3">
                            <div className="font-semibold text-[#0F172A]">{b.bond_id}</div>
                            {b.creator && (
                              <div className="text-[11px] text-[#475569]" title={b.creator}>
                                {shortHash(b.creator, 8, 6)}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="font-semibold text-[#0F172A]">{b.paper_title}</div>
                            <div className="text-[#475569]">{b.finding_claim}</div>
                            {b.reason && (
                              <div className="mono mt-0.5 text-[11px] text-[#475569]">
                                Reason: {b.reason}
                              </div>
                            )}
                          </td>
                          <td className="mono py-2.5 pr-3" title={bondFmt.secondary}>
                            <div>{bondFmt.primary}</div>
                            {b.refunded_wei && String(b.refunded_wei) !== '0' && (
                              <div className="text-[11px] text-[#475569]">
                                Refunded: {refFmt.primary}
                              </div>
                            )}
                          </td>
                          <td className="mono py-2.5 font-medium text-[#0F172A]">
                            {b.status ?? 'OPEN'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-[#475569]">No live bonds returned from contract.</p>
            )}
          </div>

          <div className="min-w-0 rounded-[3px] border border-[#CBD5E1] bg-[#F4F6F9] p-4 md:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-2 border-b border-[#CBD5E1] pb-2">
              <h4 className="font-display text-sm font-semibold text-[#0F172A]">
                Filed Errata Audits ({snapshot?.audits.length ?? 0})
              </h4>
              <span className="mono rounded-[2px] border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-[#2563EB]">
                list_audits
              </span>
            </div>
            {snapshot?.audits && snapshot.audits.length > 0 ? (
              <div className="max-w-full overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#CBD5E1] text-[11px] uppercase tracking-wider text-[#475569]">
                      <th className="py-2 pr-3">Audit</th>
                      <th className="py-2 pr-3">Bond / Lines</th>
                      <th className="py-2 pr-3">Validator Verdict &amp; Excerpt</th>
                      <th className="py-2">Snippet SHA-256 &amp; Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.audits.map((a) => {
                      const payout = formatWeiDisplay(a.payout_wei);
                      return (
                        <tr key={a.audit_id} className="border-b border-[#CBD5E1]/70 align-top">
                          <td className="mono py-2.5 pr-3">
                            <div className="font-semibold text-[#0F172A]">{a.audit_id}</div>
                            {a.challenger && (
                              <div className="text-[11px] text-[#475569]" title={a.challenger}>
                                {shortHash(a.challenger, 8, 6)}
                              </div>
                            )}
                          </td>
                          <td className="mono py-2.5 pr-3">
                            <div>{a.bond_id}</div>
                            {a.start_line !== undefined && a.end_line !== undefined && (
                              <div className="text-[11px] text-[#475569]">
                                L{a.start_line}–L{a.end_line}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 pr-3">
                            {a.verdict ? (
                              <VerdictBadge verdict={a.verdict} reason={a.reason} />
                            ) : (
                              <span className="mono">{a.status ?? 'PENDING'}</span>
                            )}
                            {a.quote && (
                              <div className="mt-1 italic text-[#475569]">
                                “{a.quote.slice(0, 110)}
                                {a.quote.length > 110 ? '…' : ''}”
                              </div>
                            )}
                          </td>
                          <td className="mono py-2.5">
                            <div title={a.snippet_sha256}>
                              {shortHash(a.snippet_sha256, 10, 8)}
                            </div>
                            {a.payout_wei !== undefined && (
                              <div className="text-[11px] text-[#475569]" title={payout.secondary}>
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
              <p className="text-xs text-[#475569]">No live audits returned from contract.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

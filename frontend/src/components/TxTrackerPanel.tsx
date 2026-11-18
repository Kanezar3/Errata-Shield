import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Radio,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { shortHash, txExplorerUrl } from '../lib/genlayer';
import type { TrackedTransaction, TxLifecycleState } from '../types/proof';

interface TxTrackerPanelProps {
  transactions: TrackedTransaction[];
  hasActive: boolean;
  onPollNow: () => void;
  onRemove: (hash: string) => void;
  onClearAll: () => void;
}

const LIFECYCLE_LABELS: Record<
  TxLifecycleState,
  { label: string; step: number; classes: string }
> = {
  submitted: {
    label: 'Submitted',
    step: 1,
    classes: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  pending: {
    label: 'Pending Consensus',
    step: 2,
    classes: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  accepted: {
    label: 'Accepted (5) · Appeal Window',
    step: 3,
    classes: 'border-blue-200 bg-blue-50 text-blue-800',
  },
  'finalized-success': {
    label: 'Finalized (7) · Success',
    step: 4,
    classes: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  'finalized-error': {
    label: 'Finalized · Error',
    step: 4,
    classes: 'border-red-200 bg-red-50 text-red-800',
  },
};

export function TxTrackerPanel({
  transactions,
  hasActive,
  onPollNow,
  onRemove,
  onClearAll,
}: TxTrackerPanelProps) {
  if (transactions.length === 0) {
    return (
      <footer
        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#E2E8F0] bg-white px-5 py-3 text-xs text-[#64748B]"
        aria-label="Transaction queue status"
      >
        <div className="flex items-center gap-2">
          <Radio size={13} className="text-[#1D4ED8]" />
          <span className="font-medium text-[#0F172A]">StudioNet Queue</span>
          <span className="text-[#CBD5E1]">·</span>
          <span>Idle</span>
        </div>
        <div className="mono text-[11px] text-[#64748B]">
          localStorage 7s auto-poll · Resumes across reloads
        </div>
      </footer>
    );
  }

  return (
    <section className="min-w-0 max-w-full rounded-md border border-[#E2E8F0] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] px-5 py-4 sm:px-6">
        <div>
          <p className="text-xs font-medium text-[#64748B]">Resumable Lifecycle Tracker</p>
          <h3 className="font-display mt-0.5 text-lg font-semibold text-[#0F172A]">
            StudioNet Transaction Queue ({transactions.length})
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {hasActive && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
              onClick={onPollNow}
            >
              <RefreshCw size={12} className="spin text-[#1D4ED8]" />
              <span>Poll Now</span>
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
            onClick={onClearAll}
          >
            <Trash2 size={12} />
            <span>Clear History</span>
          </button>
        </div>
      </div>

      <div className="divide-y divide-[#E2E8F0]">
        {transactions.map((tx) => {
          const meta = LIFECYCLE_LABELS[tx.lifecycle];
          const url = txExplorerUrl(tx.hash);
          return (
            <div key={tx.hash} className="flex flex-col gap-2.5 px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="mono text-xs font-semibold text-[#1D4ED8]">{tx.method}</span>
                  <span className="text-sm font-medium text-[#0F172A]">{tx.summary}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${meta.classes}`}
                  >
                    {tx.lifecycle === 'finalized-success' && <CheckCircle2 size={12} />}
                    {tx.lifecycle === 'finalized-error' && <XCircle size={12} />}
                    {tx.lifecycle === 'accepted' && <ShieldCheck size={12} />}
                    {(tx.lifecycle === 'submitted' || tx.lifecycle === 'pending') && (
                      <Clock size={12} />
                    )}
                    <span>{meta.label}</span>
                  </span>
                  <button
                    type="button"
                    className="rounded p-1 text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
                    title="Remove from history"
                    onClick={() => onRemove(tx.hash)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="mono flex flex-wrap items-center gap-2 text-[11px] text-[#64748B]">
                <span className={meta.step >= 1 ? 'font-semibold text-emerald-800' : ''}>
                  1. submitted
                </span>
                <span>→</span>
                <span className={meta.step >= 2 ? 'font-semibold text-emerald-800' : ''}>
                  2. pending
                </span>
                <span>→</span>
                <span className={meta.step >= 3 ? 'font-semibold text-emerald-800' : ''}>
                  3. accepted (5)
                </span>
                <span>→</span>
                <span
                  className={
                    meta.step >= 4
                      ? tx.lifecycle === 'finalized-error'
                        ? 'font-semibold text-red-800'
                        : 'font-semibold text-emerald-800'
                      : ''
                  }
                >
                  4. {tx.lifecycle === 'finalized-error' ? 'finalized-error' : 'finalized-success'}
                </span>
              </div>

              <div className="mono flex flex-wrap gap-4 text-xs text-[#64748B]">
                <span>Tx: {shortHash(tx.hash, 12, 10)}</span>
                {tx.rawStatus && <span>RPC Status: {tx.rawStatus}</span>}
                {tx.rawResult && <span>Consensus: {tx.rawResult}</span>}
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-[#1D4ED8] hover:underline"
                  >
                    <span>Explorer</span>
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
              {tx.errorMessage && (
                <p className="border-l-2 border-red-500 bg-red-50/70 px-3 py-1.5 text-xs text-red-900">
                  Poll note: {tx.errorMessage}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

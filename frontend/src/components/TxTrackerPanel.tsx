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
    classes: 'border-amber-700/40 bg-amber-50 text-amber-900',
  },
  pending: {
    label: 'Pending Consensus',
    step: 2,
    classes: 'border-amber-700/40 bg-amber-50 text-amber-900',
  },
  accepted: {
    label: 'Accepted (5) · Appeal Window',
    step: 3,
    classes: 'border-blue-700/40 bg-blue-50 text-blue-900',
  },
  'finalized-success': {
    label: 'Finalized (7) · Success',
    step: 4,
    classes: 'border-emerald-700/40 bg-emerald-50 text-emerald-900',
  },
  'finalized-error': {
    label: 'Finalized · Error / Canceled',
    step: 4,
    classes: 'border-red-700/40 bg-red-50 text-red-900',
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
        className="flex flex-wrap items-center justify-between gap-2 rounded-[3px] border border-[#CBD5E1] bg-white px-4 py-2.5 text-xs text-[#475569]"
        aria-label="Transaction queue status"
      >
        <div className="flex items-center gap-2">
          <Radio size={13} className="text-[#2563EB]" />
          <span className="mono font-medium text-[#0F172A]">StudioNet Queue</span>
          <span className="text-[#CBD5E1]">·</span>
          <span>Idle</span>
        </div>
        <div className="mono text-[11px] text-[#475569]">
          localStorage 7s auto-poll · Resumes across reloads
        </div>
      </footer>
    );
  }

  return (
    <section className="min-w-0 max-w-full rounded-[3px] border border-[#CBD5E1] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[#CBD5E1] pb-3">
        <div>
          <p className="mono text-[11px] font-semibold uppercase tracking-wider text-[#475569]">
            Resumable Lifecycle Tracker
          </p>
          <h3 className="font-display text-lg font-semibold text-[#0F172A]">
            StudioNet Transaction Queue ({transactions.length})
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {hasActive && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-[3px] border border-[#CBD5E1] bg-white px-2.5 py-1 text-xs font-medium text-[#0F172A] hover:bg-[#F4F6F9]"
              onClick={onPollNow}
            >
              <RefreshCw size={12} className="spin" />
              <span>Poll Now (7s auto)</span>
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-[3px] border border-[#CBD5E1] bg-white px-2.5 py-1 text-xs font-medium text-[#475569] hover:bg-[#F4F6F9]"
            onClick={onClearAll}
          >
            <Trash2 size={12} />
            <span>Clear History</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {transactions.map((tx) => {
          const meta = LIFECYCLE_LABELS[tx.lifecycle];
          const url = txExplorerUrl(tx.hash);
          return (
            <div
              key={tx.hash}
              className="flex flex-col gap-2 rounded-[3px] border border-[#CBD5E1] bg-[#F4F6F9] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono rounded-[2px] border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-[#2563EB]">
                    {tx.method}
                  </span>
                  <span className="text-sm font-medium text-[#0F172A]">{tx.summary}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-xs font-semibold ${meta.classes}`}
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
                    className="rounded-[2px] p-1 text-[#475569] hover:bg-white hover:text-[#0F172A]"
                    title="Remove from history"
                    onClick={() => onRemove(tx.hash)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="mono flex flex-wrap gap-1.5 text-[11px]">
                <span
                  className={`rounded-[2px] border px-2 py-0.5 ${
                    meta.step >= 1
                      ? 'border-emerald-700/30 bg-emerald-50 font-semibold text-emerald-900'
                      : 'border-[#CBD5E1] bg-white text-[#475569]'
                  }`}
                >
                  1. submitted
                </span>
                <span
                  className={`rounded-[2px] border px-2 py-0.5 ${
                    meta.step >= 2
                      ? 'border-emerald-700/30 bg-emerald-50 font-semibold text-emerald-900'
                      : 'border-[#CBD5E1] bg-white text-[#475569]'
                  }`}
                >
                  2. pending
                </span>
                <span
                  className={`rounded-[2px] border px-2 py-0.5 ${
                    meta.step >= 3
                      ? 'border-emerald-700/30 bg-emerald-50 font-semibold text-emerald-900'
                      : 'border-[#CBD5E1] bg-white text-[#475569]'
                  }`}
                >
                  3. accepted (5)
                </span>
                <span
                  className={`rounded-[2px] border px-2 py-0.5 ${
                    meta.step >= 4
                      ? tx.lifecycle === 'finalized-error'
                        ? 'border-red-700/30 bg-red-50 font-semibold text-red-900'
                        : 'border-emerald-700/30 bg-emerald-50 font-semibold text-emerald-900'
                      : 'border-[#CBD5E1] bg-white text-[#475569]'
                  }`}
                >
                  4. {tx.lifecycle === 'finalized-error' ? 'finalized-error' : 'finalized-success'}
                </span>
              </div>

              <div className="mono flex flex-wrap gap-4 text-xs text-[#475569]">
                <span>Tx: {shortHash(tx.hash, 12, 10)}</span>
                {tx.rawStatus && <span>RPC Status: {tx.rawStatus}</span>}
                {tx.rawResult && <span>Consensus: {tx.rawResult}</span>}
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-[#2563EB] hover:underline"
                  >
                    <span>Explorer</span>
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
              {tx.errorMessage && (
                <p className="rounded-[2px] border border-red-700/30 bg-red-50 px-2.5 py-1 text-xs text-red-900">
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

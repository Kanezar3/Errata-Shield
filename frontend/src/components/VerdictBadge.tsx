import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  HelpCircle,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';
import type { ErrataVerdict } from '../types/proof';

interface VerdictBadgeProps {
  verdict: ErrataVerdict | string;
  reason?: string | null;
}

const VERDICT_META: Record<
  string,
  { label: string; classes: string; Icon: typeof CheckCircle2 }
> = {
  MATERIAL_INVALIDATION: {
    label: 'Material Invalidation',
    classes: 'border-red-200 bg-red-50 text-red-800',
    Icon: ShieldAlert,
  },
  BENIGN_CORRIGENDUM: {
    label: 'Benign Corrigendum',
    classes: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    Icon: CheckCircle2,
  },
  TOO_VAGUE: {
    label: 'Gate 1 Rejected — Vague',
    classes: 'border-slate-200 bg-slate-100 text-slate-700',
    Icon: AlertTriangle,
  },
  INSUFFICIENT_EVIDENCE: {
    label: 'Insufficient Evidence',
    classes: 'border-amber-200 bg-amber-50 text-amber-800',
    Icon: HelpCircle,
  },
  UNVERIFIABLE_FETCH: {
    label: 'Unverifiable Fetch',
    classes: 'border-amber-200 bg-amber-50 text-amber-800',
    Icon: WifiOff,
  },
  REJECTED_INVALID: {
    label: 'Rejected — Invalid URL',
    classes: 'border-slate-200 bg-slate-100 text-slate-700',
    Icon: Ban,
  },
  EXPIRED_RETURNED: {
    label: 'Expired — Bond Returned',
    classes: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    Icon: Clock,
  },
};

function formatFallbackVerdict(verdict: string): string {
  return verdict
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function VerdictBadge({ verdict, reason }: VerdictBadgeProps) {
  const meta = VERDICT_META[verdict] ?? {
    label: formatFallbackVerdict(verdict),
    classes: 'border-slate-200 bg-slate-100 text-slate-700',
    Icon: HelpCircle,
  };
  const { Icon } = meta;

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-tight ${meta.classes}`}
      title={reason ? `${verdict} · ${reason}` : verdict}
    >
      <Icon size={12} strokeWidth={2} className="shrink-0" />
      <span>{meta.label}</span>
    </span>
  );
}

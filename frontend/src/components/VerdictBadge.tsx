import { AlertTriangle, CheckCircle2, Clock, HelpCircle, ShieldAlert, WifiOff } from 'lucide-react';
import type { ErrataVerdict } from '../types/proof';

interface VerdictBadgeProps {
  verdict: ErrataVerdict | string;
  reason?: string | null;
}

const VERDICT_META: Record<
  string,
  { label: string; code: string; classes: string; Icon: typeof CheckCircle2 }
> = {
  MATERIAL_INVALIDATION: {
    label: 'Material Invalidation',
    code: 'MATERIAL_INVALIDATION',
    classes: 'border-red-700/40 bg-red-50 text-red-900',
    Icon: ShieldAlert,
  },
  BENIGN_CORRIGENDUM: {
    label: 'Benign Corrigendum',
    code: 'BENIGN_CORRIGENDUM',
    classes: 'border-emerald-800/40 bg-emerald-50 text-emerald-900',
    Icon: CheckCircle2,
  },
  TOO_VAGUE: {
    label: 'Gate 1 Rejected — Vague',
    code: 'TOO_VAGUE',
    classes: 'border-slate-500/40 bg-slate-100 text-slate-800',
    Icon: AlertTriangle,
  },
  INSUFFICIENT_EVIDENCE: {
    label: 'Insufficient Evidence',
    code: 'INSUFFICIENT_EVIDENCE',
    classes: 'border-amber-700/40 bg-amber-50 text-amber-900',
    Icon: HelpCircle,
  },
  UNVERIFIABLE_FETCH: {
    label: 'Unverifiable Fetch',
    code: 'UNVERIFIABLE_FETCH',
    classes: 'border-orange-700/40 bg-orange-50 text-orange-900',
    Icon: WifiOff,
  },
  EXPIRED_RETURNED: {
    label: 'Expired — Bond Returned',
    code: 'EXPIRED_RETURNED',
    classes: 'border-blue-700/40 bg-blue-50 text-blue-900',
    Icon: Clock,
  },
};

export function VerdictBadge({ verdict, reason }: VerdictBadgeProps) {
  const meta = VERDICT_META[verdict] ?? {
    label: verdict,
    code: verdict,
    classes: 'border-slate-400 bg-slate-100 text-slate-800',
    Icon: HelpCircle,
  };
  const { Icon } = meta;

  return (
    <span
      className={`inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-[3px] border px-2 py-0.5 text-xs font-semibold ${meta.classes}`}
      title={reason ? `${meta.code} · ${reason}` : meta.code}
    >
      <Icon size={13} strokeWidth={2} className="shrink-0" />
      <span>{meta.label}</span>
      <span className="mono border-l border-current/30 pl-1.5 text-[10px] font-medium opacity-80">
        {meta.code}
      </span>
    </span>
  );
}

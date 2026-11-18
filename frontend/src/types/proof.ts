export type ErrataVerdict =
  | 'MATERIAL_INVALIDATION'
  | 'BENIGN_CORRIGENDUM'
  | 'TOO_VAGUE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'UNVERIFIABLE_FETCH'
  | 'EXPIRED_RETURNED';

export interface ErrataProofCase {
  case_id: string;
  label: string;
  bond_id: string;
  audit_id?: string | null;
  paper_title: string;
  finding_claim: string;
  allowed_source_prefix: string;
  finding_sha256: string;
  verdict: ErrataVerdict | string;
  reason?: string;
  verbatim_quote: string;
  snippet_excerpt?: string;
  evidence_url: string;
  start_line?: number | null;
  end_line?: number | null;
  snippet_sha256: string;
  create_tx_hash: string;
  audit_tx_hash?: string | null;
  settle_tx_hash?: string | null;
  withdraw_tx_hash?: string | null;
  tx_status: string;
  consensus_result?: string;
  appeal_window_status?: string;
  bond_wei: string;
  stake_wei?: string;
  payout_summary?: string;
  notes?: string;
}

export interface WithdrawalRecord {
  address: string;
  claimable_before_wei: string;
  eoa_before_wei: string;
  eoa_after_wei: string;
  contract_before_wei?: string;
  contract_after_wei?: string;
  tx_id: string;
}

export interface ErrataProofDocument {
  schema_version: string;
  is_placeholder?: boolean;
  network: {
    name: string;
    chain_id: number;
    rpc_url: string;
    explorer_url: string;
  };
  contract_address: string;
  deploy_tx_hash: string;
  evidence_probe_address?: string;
  generated_at: string;
  withdrawals?: {
    creator?: WithdrawalRecord;
    challenger?: WithdrawalRecord;
  };
  cases: ErrataProofCase[];
}

export interface LiveConfig {
  owner?: string;
  min_bond_wei?: number | string;
  min_stake_wei?: number | string;
  default_timeout_seconds?: number;
  max_audit_attempts?: number;
  bond_count?: number;
  audit_count?: number;
  [key: string]: unknown;
}

export interface LiveBond {
  bond_id: string;
  creator?: string;
  paper_title: string;
  finding_claim: string;
  allowed_source_prefix: string;
  finding_sha256?: string;
  bond_wei?: number | string;
  refunded_wei?: number | string;
  timeout_seconds?: number;
  created_at?: number;
  deadline_ts?: number;
  audit_attempts?: number;
  status?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface LiveAudit {
  audit_id: string;
  bond_id: string;
  challenger?: string;
  evidence_url: string;
  start_line?: number;
  end_line?: number;
  snippet_sha256?: string;
  snippet_excerpt?: string;
  verdict?: string;
  reason?: string;
  quote?: string;
  summary?: string;
  stake_wei?: number | string;
  payout_recipient?: string;
  payout_wei?: number | string;
  created_at?: number;
  status?: string;
  [key: string]: unknown;
}

export interface LiveChainSnapshot {
  contractAddress: string;
  fetchedAt: string;
  config: LiveConfig | null;
  bonds: LiveBond[];
  audits: LiveAudit[];
  refundableBalanceWei: string | null;
  error: string | null;
}

export type TxLifecycleState =
  | 'submitted'
  | 'pending'
  | 'accepted'
  | 'finalized-success'
  | 'finalized-error';

export interface TrackedTransaction {
  hash: `0x${string}`;
  method: string;
  summary: string;
  contractAddress: string;
  createdAt: string;
  updatedAt: string;
  lifecycle: TxLifecycleState;
  rawStatus?: string;
  rawResult?: string;
  errorMessage?: string;
}

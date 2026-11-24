export interface FirewallTxMeta {
  tx_hash: string;
  explorer_url: string;
  status: string;
  result_name: string;
  execution_result: string;
  function?: string;
  entity_id?: string;
  value_wei?: number;
  account?: string;
  withdrawn_wei?: number;
  refundable_before_wei?: number;
  refundable_after_wei?: number;
  eoa_balance_before_wei?: string;
  eoa_balance_after_wei?: string;
}

export interface CitationBondRecord {
  citation_id: string;
  author: string;
  upstream_bond_id: string;
  upstream_paper_title: string;
  upstream_status_at_registration: string;
  downstream_title: string;
  downstream_claim: string;
  allowed_source_prefix: string;
  citation_sha256: string;
  bond_wei: number;
  refunded_wei: number;
  timeout_seconds: number;
  created_at: number;
  deadline_ts: number;
  audit_attempts: number;
  challenger_attempts?: Record<string, number>;
  winning_audit_id: string;
  status:
    | 'MONITORED'
    | 'CONTAGION_SLASHED'
    | 'IMMUNE_UPHELD'
    | 'EXPIRED_RETURNED'
    | 'REJECTED_INVALID'
    | string;
  reason: string;
}

export interface FirewallAuditRecord {
  audit_id: string;
  citation_id: string;
  upstream_bond_id: string;
  upstream_live_status: string;
  challenger: string;
  evidence_url: string;
  start_line: number;
  end_line: number;
  snippet_sha256: string;
  snippet_len: number;
  snippet_excerpt: string;
  verdict:
    | 'LOAD_BEARING_DEPENDENCY'
    | 'INCIDENTAL_OR_CRITICAL_CITATION'
    | 'INSUFFICIENT_CONTEXT'
    | 'UNVERIFIABLE_FETCH'
    | 'REJECTED_INVALID'
    | string;
  reason: string;
  quote: string;
  summary: string;
  stake_wei: number;
  payout_recipient: string;
  payout_wei: number;
  created_at: number;
  status: string;
}

export interface FirewallConfig {
  owner: string;
  errata_shield_address: string;
  min_bond_wei: number;
  min_stake_wei: number;
  default_timeout_seconds: number;
  max_attempts_per_challenger: number;
  max_total_audits_per_bond: number;
  citation_count: number;
  audit_count: number;
}

export interface FirewallProofDocument {
  project: string;
  milestone: string;
  source_commit?: string;
  generated_at_utc: string;
  network: {
    name: string;
    chain_id: number;
    rpc_url: string;
    explorer_base: string;
  };
  upstream_errata_shield: {
    address: string;
    explorer_url: string;
  };
  citation_firewall: {
    address: string;
    explorer_url: string;
    deploy_tx: FirewallTxMeta;
  };
  accounts: {
    author: string;
    challenger: string;
  };
  transactions: Record<string, FirewallTxMeta>;
  on_chain_state: {
    config: FirewallConfig;
    citations: CitationBondRecord[];
    audits: FirewallAuditRecord[];
    post_withdraw_refundable_balances: {
      author_wei: number;
      challenger_wei: number;
    };
  };
}

import { useState, type FormEvent } from 'react';
import {
  BookmarkCheck,
  Coins,
  FilePlus2,
  Gavel,
  TimerReset,
  Wallet,
} from 'lucide-react';
import type { Address } from 'viem';
import { formatWeiDisplay } from '../lib/format';
import { createWalletClient, parseGenToWei, shortHash } from '../lib/genlayer';
import type { LiveChainSnapshot } from '../types/proof';

interface WalletDeskProps {
  contractAddress: string;
  connectedAddress: Address | null;
  liveSnapshot: LiveChainSnapshot | null;
  onConnectWallet: () => Promise<void>;
  onTrackTx: (entry: {
    hash: `0x${string}`;
    method: string;
    summary: string;
    contractAddress: string;
  }) => void;
}

interface FilingPreset {
  id: string;
  label: string;
  target: 'create' | 'audit';
  paperTitle?: string;
  findingClaim?: string;
  allowedSourcePrefix?: string;
  timeoutSeconds?: string;
  bondAmount?: string;
  bondUnit?: 'gen' | 'wei';
  bondId?: string;
  evidenceUrl?: string;
  startLine?: string;
  endLine?: string;
  stakeAmount?: string;
  stakeUnit?: 'gen' | 'wei';
}

const FILING_PRESETS: FilingPreset[] = [
  {
    id: 'benign-finding',
    label: 'Falsifiable Theorem Bond',
    target: 'create',
    paperTitle: 'Prime Number Theorem — Asymptotic Density',
    findingClaim:
      'The number of primes <= x is asymptotic to x / ln(x) as x approaches infinity.',
    allowedSourcePrefix: 'https://en.wikipedia.org/w/api.php',
    timeoutSeconds: '2592000',
    bondAmount: '100',
    bondUnit: 'wei',
  },
  {
    id: 'vague-claim',
    label: 'Vague Marketing Filter Test',
    target: 'create',
    paperTitle: 'Unfalsifiable AI Benchmark',
    findingClaim:
      'Our novel architecture achieves transformative, deeply intuitive reasoning superiority.',
    allowedSourcePrefix: 'https://en.wikipedia.org/w/api.php',
    timeoutSeconds: '2592000',
    bondAmount: '100',
    bondUnit: 'wei',
  },
  {
    id: 'errata-audit',
    label: 'Line-Slice Errata Audit',
    target: 'audit',
    bondId: 'bond-1',
    evidenceUrl:
      'https://en.wikipedia.org/w/api.php?action=parse&oldid=1384457883&prop=wikitext&section=0&format=json',
    startLine: '1',
    endLine: '35',
    stakeAmount: '20',
    stakeUnit: 'wei',
  },
];

const INPUT_CLASS =
  'w-full min-w-0 rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-colors focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15 focus:outline-none';

export function WalletDesk({
  contractAddress,
  connectedAddress,
  liveSnapshot,
  onConnectWallet,
  onTrackTx,
}: WalletDeskProps) {
  // create_finding_bond state
  const [paperTitle, setPaperTitle] = useState('Prime Number Theorem — Asymptotic Density');
  const [findingClaim, setFindingClaim] = useState(
    'The number of primes <= x is asymptotic to x / ln(x) as x approaches infinity.'
  );
  const [allowedSourcePrefix, setAllowedSourcePrefix] = useState(
    'https://en.wikipedia.org/w/api.php'
  );
  const [timeoutSeconds, setTimeoutSeconds] = useState('2592000');
  const [bondAmount, setBondAmount] = useState('100');
  const [bondUnit, setBondUnit] = useState<'gen' | 'wei'>('wei');

  // submit_errata_audit state
  const [auditBondId, setAuditBondId] = useState('bond-1');
  const [evidenceUrl, setEvidenceUrl] = useState(
    'https://en.wikipedia.org/w/api.php?action=parse&oldid=1384457883&prop=wikitext&section=0&format=json'
  );
  const [startLine, setStartLine] = useState('1');
  const [endLine, setEndLine] = useState('35');
  const [stakeAmount, setStakeAmount] = useState('20');
  const [stakeUnit, setStakeUnit] = useState<'gen' | 'wei'>('wei');

  // settle_expired_bond state
  const [expiredBondId, setExpiredBondId] = useState('');

  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const isContractReady = /^0x[a-fA-F0-9]{40}$/.test(contractAddress);

  const applyPreset = (preset: FilingPreset) => {
    setActivePresetId(preset.id);
    if (preset.target === 'create') {
      if (preset.paperTitle !== undefined) setPaperTitle(preset.paperTitle);
      if (preset.findingClaim !== undefined) setFindingClaim(preset.findingClaim);
      if (preset.allowedSourcePrefix !== undefined)
        setAllowedSourcePrefix(preset.allowedSourcePrefix);
      if (preset.timeoutSeconds !== undefined) setTimeoutSeconds(preset.timeoutSeconds);
      if (preset.bondAmount !== undefined) setBondAmount(preset.bondAmount);
      if (preset.bondUnit !== undefined) setBondUnit(preset.bondUnit);
    } else {
      if (preset.bondId !== undefined) setAuditBondId(preset.bondId);
      if (preset.evidenceUrl !== undefined) setEvidenceUrl(preset.evidenceUrl);
      if (preset.startLine !== undefined) setStartLine(preset.startLine);
      if (preset.endLine !== undefined) setEndLine(preset.endLine);
      if (preset.stakeAmount !== undefined) setStakeAmount(preset.stakeAmount);
      if (preset.stakeUnit !== undefined) setStakeUnit(preset.stakeUnit);
    }
  };

  const toWei = (amount: string, unit: 'gen' | 'wei'): bigint => {
    if (unit === 'wei') return BigInt(amount.trim() || '0');
    return parseGenToWei(amount);
  };

  const runWrite = async (
    actionKey: string,
    functionName: string,
    args: (string | number | bigint | boolean)[],
    value: bigint,
    summary: string
  ) => {
    setActionError(null);
    setActionSuccess(null);

    if (!isContractReady) {
      setActionError(
        'Contract address is not configured. Enter a deployed StudioNet address in the header.'
      );
      return;
    }
    if (!connectedAddress) {
      setActionError('Please connect your browser wallet on GenLayer StudioNet (Chain 61999).');
      return;
    }

    setBusyAction(actionKey);
    try {
      const client = await createWalletClient(connectedAddress);
      const txHash = (await client.writeContract({
        address: contractAddress as Address,
        functionName,
        args,
        value,
      })) as `0x${string}`;

      onTrackTx({
        hash: txHash,
        method: functionName,
        summary,
        contractAddress,
      });
      setActionSuccess(
        `${functionName} submitted (${shortHash(txHash, 10, 8)}). Tracking every 7s below.`
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateBond = async (e: FormEvent) => {
    e.preventDefault();
    const timeoutNum = Math.max(10, Number.parseInt(timeoutSeconds, 10) || 2592000);
    const valueWei = toWei(bondAmount, bondUnit);
    await runWrite(
      'create',
      'create_finding_bond',
      [paperTitle.trim(), findingClaim.trim(), allowedSourcePrefix.trim(), timeoutNum],
      valueWei,
      `${paperTitle.trim().slice(0, 36)} (${formatWeiDisplay(valueWei).primary})`
    );
  };

  const handleSubmitAudit = async (e: FormEvent) => {
    e.preventDefault();
    const sLine = Math.max(1, Number.parseInt(startLine, 10) || 1);
    const eLine = Math.max(sLine, Number.parseInt(endLine, 10) || sLine);
    const valueWei = toWei(stakeAmount, stakeUnit);
    await runWrite(
      'audit',
      'submit_errata_audit',
      [auditBondId.trim(), evidenceUrl.trim(), sLine, eLine],
      valueWei,
      `Audit on ${auditBondId.trim()} L${sLine}-L${eLine} (${formatWeiDisplay(valueWei).primary})`
    );
  };

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-5">
      {/* Wallet Status & Presets Sheet */}
      <section className="rounded-md border border-[#E2E8F0] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#64748B]">
              Interactive StudioNet Flows · Chain 61999
            </p>
            <h2 className="font-display mt-0.5 text-lg font-semibold tracking-tight text-[#0F172A] sm:text-xl">
              Finding Bond &amp; Errata Audit Filing Desk
            </h2>
            <p className="mt-1 text-xs text-[#475569]">
              Transactions are signed via <code>window.ethereum</code> and tracked through{' '}
              <code>Accepted (5)</code> to <code>Finalized (7)</code>.
            </p>
          </div>
          <div className="shrink-0">
            {connectedAddress ? (
              <div className="mono inline-flex flex-wrap items-center gap-2.5 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="font-medium text-[#0F172A]">
                  {shortHash(connectedAddress, 6, 4)}
                </span>
                <span className="border-l border-[#E2E8F0] pl-2.5 font-semibold text-emerald-800">
                  Refundable: {formatWeiDisplay(liveSnapshot?.refundableBalanceWei ?? '0').primary}
                </span>
              </div>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md bg-[#1D4ED8] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1E40AF]"
                onClick={onConnectWallet}
              >
                <Wallet size={14} />
                <span>Connect MetaMask (Chain 61999)</span>
              </button>
            )}
          </div>
        </div>

        {/* Example Filing Preset Bar */}
        <div
          className="flex flex-wrap items-center gap-2.5 bg-[#F8FAFC] px-5 py-3 sm:px-6"
          aria-label="Load example filing presets"
        >
          <div className="mr-1 flex items-center gap-1.5 text-xs font-medium text-[#64748B]">
            <BookmarkCheck size={14} className="text-[#1D4ED8]" />
            <span>Load Example:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {FILING_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  activePresetId === preset.id
                    ? 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]'
                    : 'border-[#CBD5E1] bg-white text-[#334155] hover:border-[#94A3B8] hover:text-[#0F172A]'
                }`}
              >
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {actionError && (
        <div className="rounded-md border border-red-200 border-l-4 border-l-red-600 bg-red-50/70 px-4 py-3 text-sm text-red-900">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="rounded-md border border-emerald-200 border-l-4 border-l-emerald-600 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
          {actionSuccess}
        </div>
      )}

      {/* Two-Column Forms Grid */}
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Form 1: create_finding_bond */}
        <form
          className="flex min-w-0 flex-col gap-4 rounded-md border border-[#E2E8F0] bg-white p-5 sm:p-6"
          onSubmit={handleCreateBond}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] pb-3.5">
            <div className="flex items-start gap-2.5">
              <FilePlus2 size={17} className="mt-0.5 shrink-0 text-[#1D4ED8]" />
              <div>
                <h3 className="font-display text-base font-semibold text-[#0F172A]">
                  Create Finding Bond
                </h3>
                <p className="mt-0.5 text-xs text-[#475569]">
                  Post a creator bond and bind an allowed immutable source URL prefix.
                </p>
              </div>
            </div>
            <span className="mono shrink-0 text-[11px] text-[#64748B]">create_finding_bond</span>
          </div>

          <label className="flex flex-col gap-1.5 text-xs font-medium text-[#334155]">
            <span>Monograph / Paper Title</span>
            <input
              type="text"
              required
              value={paperTitle}
              onChange={(e) => setPaperTitle(e.target.value)}
              className={INPUT_CLASS}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-medium text-[#334155]">
            <span>Falsifiable Finding Claim</span>
            <textarea
              rows={3}
              required
              value={findingClaim}
              onChange={(e) => setFindingClaim(e.target.value)}
              className={INPUT_CLASS}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-medium text-[#334155]">
            <span>Allowed Source Prefix (HTTPS)</span>
            <input
              type="url"
              required
              value={allowedSourcePrefix}
              onChange={(e) => setAllowedSourcePrefix(e.target.value)}
              className={`${INPUT_CLASS} mono text-xs`}
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-[#334155]">
              <span>Timeout (seconds, ≥ 10)</span>
              <input
                type="number"
                min={10}
                required
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(e.target.value)}
                className={`${INPUT_CLASS} mono`}
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-[#334155]">
              <span>Creator Bond ({bondUnit.toUpperCase()})</span>
              <div className="grid grid-cols-[1fr_76px] gap-1.5">
                <input
                  type="text"
                  required
                  value={bondAmount}
                  onChange={(e) => setBondAmount(e.target.value)}
                  className={`${INPUT_CLASS} mono`}
                />
                <select
                  value={bondUnit}
                  onChange={(e) => setBondUnit(e.target.value as 'gen' | 'wei')}
                  className="mono rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-2 py-2 text-xs text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
                >
                  <option value="wei">wei</option>
                  <option value="gen">GEN</option>
                </select>
              </div>
            </label>
          </div>

          <button
            type="submit"
            className="mt-auto rounded-md bg-[#1D4ED8] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1E40AF] disabled:opacity-50"
            disabled={busyAction !== null || !isContractReady}
          >
            {busyAction === 'create' ? 'Submitting…' : 'Post Bond & Register Finding'}
          </button>
        </form>

        {/* Form 2: submit_errata_audit */}
        <form
          className="flex min-w-0 flex-col gap-4 rounded-md border border-[#E2E8F0] bg-white p-5 sm:p-6"
          onSubmit={handleSubmitAudit}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] pb-3.5">
            <div className="flex items-start gap-2.5">
              <Gavel size={17} className="mt-0.5 shrink-0 text-[#1D4ED8]" />
              <div>
                <h3 className="font-display text-base font-semibold text-[#0F172A]">
                  Submit Errata Audit
                </h3>
                <p className="mt-0.5 text-xs text-[#475569]">
                  Pin an immutable URL and 120-line window for validator equivalence verification.
                </p>
              </div>
            </div>
            <span className="mono shrink-0 text-[11px] text-[#64748B]">submit_errata_audit</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-[#334155]">
              <span>Target Bond ID</span>
              <input
                type="text"
                required
                value={auditBondId}
                onChange={(e) => setAuditBondId(e.target.value)}
                className={`${INPUT_CLASS} mono`}
              />
            </label>
            {liveSnapshot?.bonds && liveSnapshot.bonds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {liveSnapshot.bonds.slice(0, 4).map((b) => (
                  <button
                    key={b.bond_id}
                    type="button"
                    className="mono rounded border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-0.5 text-[11px] text-[#334155] hover:border-[#1D4ED8] hover:text-[#1D4ED8]"
                    onClick={() => setAuditBondId(b.bond_id)}
                  >
                    {b.bond_id}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="flex flex-col gap-1.5 text-xs font-medium text-[#334155]">
            <span>Immutable Evidence URL (within allowed prefix)</span>
            <input
              type="url"
              required
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              className={`${INPUT_CLASS} mono text-xs`}
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-[#334155]">
              <span>Start Line</span>
              <input
                type="number"
                min={1}
                required
                value={startLine}
                onChange={(e) => setStartLine(e.target.value)}
                className={`${INPUT_CLASS} mono`}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-[#334155]">
              <span>End Line</span>
              <input
                type="number"
                min={1}
                required
                value={endLine}
                onChange={(e) => setEndLine(e.target.value)}
                className={`${INPUT_CLASS} mono`}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-[#334155]">
              <span>Stake ({stakeUnit.toUpperCase()})</span>
              <div className="grid grid-cols-[1fr_68px] gap-1">
                <input
                  type="text"
                  required
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  className={`${INPUT_CLASS} mono px-2.5`}
                />
                <select
                  value={stakeUnit}
                  onChange={(e) => setStakeUnit(e.target.value as 'gen' | 'wei')}
                  className="mono rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-1.5 py-2 text-xs text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
                >
                  <option value="wei">wei</option>
                  <option value="gen">GEN</option>
                </select>
              </div>
            </label>
          </div>

          <button
            type="submit"
            className="mt-auto rounded-md bg-[#1D4ED8] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1E40AF] disabled:opacity-50"
            disabled={busyAction !== null || !isContractReady}
          >
            {busyAction === 'audit' ? 'Submitting…' : 'Submit Line-Slice Audit'}
          </button>
        </form>

        {/* Form 3: Withdraw & Expiry Settlement */}
        <div className="flex min-w-0 flex-col rounded-md border border-[#E2E8F0] bg-white lg:col-span-2">
          <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] px-5 py-4 sm:px-6">
            <div className="flex items-start gap-2.5">
              <Coins size={17} className="mt-0.5 shrink-0 text-[#1D4ED8]" />
              <div>
                <h3 className="font-display text-base font-semibold text-[#0F172A]">
                  Escrow Withdrawals &amp; Bond Expiry Settlement
                </h3>
                <p className="mt-0.5 text-xs text-[#475569]">
                  Withdraw settled EOA escrow balances or reclaim uncontested expired bonds.
                </p>
              </div>
            </div>
            <span className="mono hidden text-[11px] text-[#64748B] sm:inline">
              withdraw_refundable · settle_expired_bond
            </span>
          </div>

          <div className="grid grid-cols-1 divide-y divide-[#E2E8F0] md:grid-cols-2 md:divide-x md:divide-y-0">
            <div className="flex flex-col justify-between gap-4 px-5 py-5 sm:px-6">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                  Refundable Escrow Balance
                </h4>
                <p className="font-display tabular-nums mt-1.5 text-2xl font-semibold text-[#0F172A]">
                  {formatWeiDisplay(liveSnapshot?.refundableBalanceWei ?? '0').primary}
                </p>
              </div>
              <button
                type="button"
                className="rounded-md border border-[#CBD5E1] bg-white px-3.5 py-2 text-xs font-semibold text-[#0F172A] transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
                disabled={busyAction !== null || !isContractReady || !connectedAddress}
                onClick={() =>
                  runWrite(
                    'withdraw',
                    'withdraw_refundable',
                    [],
                    0n,
                    'Withdraw refundable EOA balance'
                  )
                }
              >
                {busyAction === 'withdraw' ? 'Withdrawing…' : 'Withdraw Refundable Balance'}
              </button>
            </div>

            <div className="flex flex-col justify-between gap-4 px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-2">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                  <TimerReset size={14} className="text-[#1D4ED8]" />
                  <span>Settle Expired Finding Bond</span>
                </h4>
                <input
                  type="text"
                  value={expiredBondId}
                  onChange={(e) => setExpiredBondId(e.target.value)}
                  placeholder="bond-4"
                  className={`${INPUT_CLASS} mono`}
                />
              </div>
              <button
                type="button"
                className="rounded-md border border-[#CBD5E1] bg-white px-3.5 py-2 text-xs font-semibold text-[#0F172A] transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
                disabled={busyAction !== null || !isContractReady || !expiredBondId.trim()}
                onClick={() =>
                  runWrite(
                    'settle_expired',
                    'settle_expired_bond',
                    [expiredBondId.trim()],
                    0n,
                    `Settle expired bond ${expiredBondId.trim()}`
                  )
                }
              >
                {busyAction === 'settle_expired' ? 'Submitting…' : 'Settle Expired Bond'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

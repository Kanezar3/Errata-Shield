import { useCallback, useEffect, useState } from 'react';
import { BookMarked, ExternalLink, Shield, Wallet, X } from 'lucide-react';
import type { Address } from 'viem';
import fallbackProof from './data/proof.json';
import { ProofInspector } from './components/ProofInspector';
import { TxTrackerPanel } from './components/TxTrackerPanel';
import { WalletDesk } from './components/WalletDesk';
import { useTxTracker } from './hooks/useTxTracker';
import {
  STUDIONET_CHAIN_ID,
  STUDIONET_EXPLORER_URL,
  addressExplorerUrl,
  connectBrowserWallet,
  fetchLiveContractState,
  shortHash,
} from './lib/genlayer';
import type { ErrataProofDocument, LiveChainSnapshot } from './types/proof';

type ActiveTab = 'inspector' | 'desk';

export function App() {
  const [proof, setProof] = useState<ErrataProofDocument>(
    fallbackProof as ErrataProofDocument
  );
  const [contractOverride, setContractOverride] = useState<string>(
    import.meta.env.VITE_CONTRACT_ADDRESS ?? ''
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>('inspector');
  const [connectedAddress, setConnectedAddress] = useState<Address | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  const [liveSnapshot, setLiveSnapshot] = useState<LiveChainSnapshot | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);

  const activeContractAddress =
    contractOverride.trim() || proof.contract_address || '';

  const refreshLiveState = useCallback(async () => {
    setLiveLoading(true);
    const snap = await fetchLiveContractState(activeContractAddress, connectedAddress);
    setLiveSnapshot(snap);
    setLiveLoading(false);
  }, [activeContractAddress, connectedAddress]);

  const {
    transactions,
    hasActive,
    trackTransaction,
    clearTransactions,
    removeTransaction,
    pollNow,
  } = useTxTracker(refreshLiveState);

  useEffect(() => {
    let cancelled = false;
    fetch('/proof.json', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ErrataProofDocument | null) => {
        if (!cancelled && data && Array.isArray(data.cases) && data.cases.length > 0) {
          setProof(data);
        }
      })
      .catch(() => {
        // Keep bundled fallbackProof
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refreshLiveState();
  }, [refreshLiveState]);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth?.on) return;
    const handleAccountsChanged = (accounts: unknown) => {
      const list = Array.isArray(accounts) ? (accounts as string[]) : [];
      setConnectedAddress(list[0] ? (list[0] as Address) : null);
    };
    eth.on('accountsChanged', handleAccountsChanged);
    return () => {
      eth.removeListener?.('accountsChanged', handleAccountsChanged);
    };
  }, []);

  const handleConnectWallet = async () => {
    setWalletError(null);
    try {
      const addr = await connectBrowserWallet();
      setConnectedAddress(addr);
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Failed to connect wallet');
    }
  };

  const contractExplorer = addressExplorerUrl(activeContractAddress);
  const finalizedCount = String(
    proof.cases.filter((c) => c.tx_status === 'FINALIZED').length
  ).padStart(2, '0');
  const totalCount = String(proof.cases.length).padStart(2, '0');

  return (
    <div className="min-h-screen min-w-0 max-w-full bg-[#F8FAFC] text-[#0F172A]">
      {/* Publication Masthead */}
      <header className="border-b border-[#E2E8F0] bg-white">
        {/* Subtle Metadata Bar */}
        <div className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <div className="mono mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-[11px] text-[#64748B] sm:px-7">
            <span>StudioNet · Chain {STUDIONET_CHAIN_ID}</span>
            <span className="text-[#CBD5E1]">·</span>
            <span>
              Contract{' '}
              {activeContractAddress ? (
                contractExplorer ? (
                  <a
                    href={contractExplorer}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-[#1D4ED8] hover:underline"
                  >
                    {shortHash(activeContractAddress, 6, 4)}
                  </a>
                ) : (
                  <span className="font-medium text-[#0F172A]">
                    {shortHash(activeContractAddress, 6, 4)}
                  </span>
                )
              ) : (
                'Awaiting Deploy'
              )}
            </span>
            <span className="hidden text-[#CBD5E1] sm:inline">·</span>
            <span className="hidden sm:inline">Optimistic Democracy</span>
            <span className="text-[#CBD5E1]">·</span>
            <span>
              Finalized {finalizedCount}/{totalCount}
            </span>
          </div>
        </div>

        {/* Brand & Controls Row */}
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3.5">
            <img
              src="/logo.png"
              alt="Errata Shield monogram"
              className="h-9 w-9 shrink-0 rounded-md border border-[#E2E8F0] object-cover"
            />
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold tracking-tight text-[#0F172A] sm:text-2xl">
                Errata Shield
              </h1>
              <p className="truncate text-xs text-[#475569]">
                Scientific Peer-Review Bonds &amp; Line-Slice Errata Adjudication
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* High-Contrast Contract Address Override */}
            <div className="flex items-center gap-1.5 rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-2.5 py-1.5 focus-within:border-[#1D4ED8] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1D4ED8]/15">
              <label
                htmlFor="contract-addr-input"
                className="text-[11px] font-medium text-[#64748B]"
              >
                Contract
              </label>
              <input
                id="contract-addr-input"
                type="text"
                className="mono w-36 bg-transparent text-xs text-[#0F172A] placeholder:text-[#64748B] focus:outline-none sm:w-44"
                value={contractOverride}
                onChange={(e) => setContractOverride(e.target.value)}
                placeholder={
                  proof.contract_address
                    ? shortHash(proof.contract_address, 6, 4)
                    : '0x… address'
                }
                aria-label="Contract address override"
              />
              {contractOverride && (
                <button
                  type="button"
                  onClick={() => setContractOverride('')}
                  className="rounded p-0.5 text-[#64748B] hover:text-[#0F172A]"
                  title="Reset to proof.json contract address"
                  aria-label="Clear contract override"
                >
                  <X size={12} />
                </button>
              )}
              {contractExplorer && (
                <a
                  href={contractExplorer}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#1D4ED8] hover:text-[#1E40AF]"
                  title="View contract on StudioNet Explorer"
                >
                  <ExternalLink size={12} />
                </a>
              )}
            </div>

            {connectedAddress ? (
              <div className="mono inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>{shortHash(connectedAddress, 6, 4)}</span>
              </div>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md bg-[#1D4ED8] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1E40AF]"
                onClick={handleConnectWallet}
              >
                <Wallet size={13} />
                <span>Connect Wallet</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Compact Sticky Navigation Bar (44px single row) */}
      <nav
        className="sticky top-0 z-30 h-11 border-b border-[#E2E8F0] bg-white/95 backdrop-blur-sm"
        aria-label="Primary views"
      >
        <div className="mx-auto flex h-full max-w-[1240px] items-center gap-1 px-4 sm:gap-2 sm:px-7">
          <button
            type="button"
            className={`inline-flex h-full items-center gap-1.5 border-b-2 px-2.5 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${
              activeTab === 'inspector'
                ? 'border-[#1D4ED8] text-[#1D4ED8]'
                : 'border-transparent text-[#475569] hover:text-[#0F172A]'
            }`}
            onClick={() => setActiveTab('inspector')}
          >
            <BookMarked size={14} className="shrink-0" />
            <span className="whitespace-nowrap">Proof Dossiers</span>
          </button>

          <button
            type="button"
            className={`inline-flex h-full items-center gap-1.5 border-b-2 px-2.5 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${
              activeTab === 'desk'
                ? 'border-[#1D4ED8] text-[#1D4ED8]'
                : 'border-transparent text-[#475569] hover:text-[#0F172A]'
            }`}
            onClick={() => setActiveTab('desk')}
          >
            <Shield size={14} className="shrink-0" />
            <span className="whitespace-nowrap">Filing Desk</span>
          </button>

          <a
            href={STUDIONET_EXPLORER_URL}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-[#64748B] transition-colors hover:text-[#1D4ED8]"
          >
            <span className="hidden sm:inline">StudioNet Explorer</span>
            <span className="sm:hidden">Explorer</span>
            <ExternalLink size={12} className="shrink-0" />
          </a>
        </div>
      </nav>

      <main className="mx-auto flex max-w-[1240px] min-w-0 flex-col gap-6 px-4 py-6 sm:px-7">
        {walletError && (
          <div className="rounded-md border border-red-200 border-l-4 border-l-red-600 bg-red-50/70 px-4 py-3 text-sm text-red-900">
            {walletError}
          </div>
        )}

        {activeTab === 'inspector' ? (
          <ProofInspector
            proof={proof}
            contractAddress={activeContractAddress}
            liveSnapshot={liveSnapshot}
            liveLoading={liveLoading}
            connectedAddress={connectedAddress}
            onRefreshLive={refreshLiveState}
          />
        ) : (
          <WalletDesk
            contractAddress={activeContractAddress}
            connectedAddress={connectedAddress}
            liveSnapshot={liveSnapshot}
            onConnectWallet={handleConnectWallet}
            onTrackTx={trackTransaction}
          />
        )}

        <TxTrackerPanel
          transactions={transactions}
          hasActive={hasActive}
          onPollNow={pollNow}
          onRemove={removeTransaction}
          onClearAll={clearTransactions}
        />
      </main>
    </div>
  );
}

export default App;

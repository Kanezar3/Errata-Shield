import { useCallback, useEffect, useState } from 'react';
import { BookMarked, ExternalLink, Shield, Wallet } from 'lucide-react';
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
    <div className="min-h-screen min-w-0 max-w-full bg-[#F4F6F9] text-[#0F172A]">
      {/* Deep Navy Swiss Monograph Masthead (scrolls naturally) */}
      <header className="bg-[#0F172A] text-white">
        <div className="border-b border-slate-700/80 bg-slate-950/60">
          <div className="mono mx-auto flex max-w-[1260px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-[11px] tracking-wider text-slate-300 sm:px-7">
            <span>NETWORK · STUDIONET {STUDIONET_CHAIN_ID}</span>
            <span className="text-slate-600">·</span>
            <span>
              CONTRACT ·{' '}
              {activeContractAddress ? (
                contractExplorer ? (
                  <a
                    href={contractExplorer}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    {shortHash(activeContractAddress, 6, 4)}
                  </a>
                ) : (
                  shortHash(activeContractAddress, 6, 4)
                )
              ) : (
                'AWAITING DEPLOY'
              )}
            </span>
            <span className="text-slate-600">·</span>
            <span>CONSENSUS · OPTIMISTIC DEMOCRACY</span>
            <span className="text-slate-600">·</span>
            <span>
              FINALIZED CASES · {finalizedCount} / {totalCount}
            </span>
          </div>
        </div>

        <div className="mx-auto flex max-w-[1260px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-7">
          <div className="flex items-center gap-3.5">
            <img
              src="/logo.png"
              alt="Errata Shield monogram"
              className="h-10 w-10 rounded-[3px] border border-slate-600 object-cover"
            />
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-white">
                Errata Shield
              </h1>
              <p className="text-xs text-slate-300">
                Scientific Peer-Review Bonds &amp; Line-Slice Errata Adjudication
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 border-b border-slate-600 pb-1 focus-within:border-[#2563EB]">
              <label htmlFor="contract-addr-input" className="mono text-[11px] text-slate-400">
                Override
              </label>
              <input
                id="contract-addr-input"
                type="text"
                className="mono w-44 bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none sm:w-52"
                value={contractOverride}
                onChange={(e) => setContractOverride(e.target.value)}
                placeholder={
                  proof.contract_address
                    ? shortHash(proof.contract_address, 8, 6)
                    : '0x… contract address'
                }
                aria-label="Contract address override"
              />
              {contractExplorer && (
                <a
                  href={contractExplorer}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                  title="View contract on StudioNet Explorer"
                >
                  <ExternalLink size={13} />
                </a>
              )}
            </div>

            {connectedAddress ? (
              <div className="mono inline-flex items-center gap-2 rounded-[3px] border border-emerald-500/50 bg-emerald-950/60 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span>{shortHash(connectedAddress, 6, 4)}</span>
              </div>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-[3px] border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                onClick={handleConnectWallet}
              >
                <Wallet size={13} />
                <span>Connect Wallet</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Compact Sticky Navigation Bar (<= 44px) */}
      <nav
        className="sticky top-0 z-30 border-b border-[#CBD5E1] bg-white"
        aria-label="Primary views"
      >
        <div className="mx-auto flex max-w-[1260px] flex-wrap items-center gap-2 px-4 sm:px-7">
          <button
            type="button"
            className={`inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-semibold sm:text-sm ${
              activeTab === 'inspector'
                ? 'border-[#2563EB] text-[#2563EB]'
                : 'border-transparent text-[#475569] hover:text-[#0F172A]'
            }`}
            onClick={() => setActiveTab('inspector')}
          >
            <BookMarked size={14} />
            <span>Proof Dossiers</span>
            <span className="mono hidden rounded-[2px] border border-[#CBD5E1] px-1.5 py-0.5 text-[10px] text-[#475569] sm:inline">
              NO WALLET
            </span>
          </button>

          <button
            type="button"
            className={`inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-semibold sm:text-sm ${
              activeTab === 'desk'
                ? 'border-[#2563EB] text-[#2563EB]'
                : 'border-transparent text-[#475569] hover:text-[#0F172A]'
            }`}
            onClick={() => setActiveTab('desk')}
          >
            <Shield size={14} />
            <span>Filing Desk</span>
          </button>

          <a
            href={STUDIONET_EXPLORER_URL}
            target="_blank"
            rel="noreferrer"
            className="mono ml-auto inline-flex items-center gap-1 py-2 text-xs text-[#475569] hover:text-[#2563EB]"
          >
            <span>StudioNet Explorer</span>
            <ExternalLink size={12} />
          </a>
        </div>
      </nav>

      <main className="mx-auto flex max-w-[1260px] min-w-0 flex-col gap-6 px-4 py-6 sm:px-7">
        {walletError && (
          <div className="rounded-[3px] border border-red-700/40 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">
            {walletError}
          </div>
        )}

        {activeTab === 'inspector' ? (
          <ProofInspector
            proof={proof}
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

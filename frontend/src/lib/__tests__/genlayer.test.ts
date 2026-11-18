import { describe, expect, it } from 'vitest';
import {
  addressExplorerUrl,
  mapGenLayerTxToLifecycle,
  shortHash,
  txExplorerUrl,
} from '../genlayer';

describe('explorer URL helpers', () => {
  it('builds valid tx explorer URLs and rejects placeholder zero hashes', () => {
    const real =
      '0x0d465af8c928add02fd6c2e9d9754c609917a5db8d17a7ed64080a788a59766b';
    expect(txExplorerUrl(real)).toBe(
      `https://explorer-studio.genlayer.com/tx/${real}`
    );
    expect(
      txExplorerUrl('0x0000000000000000000000000000000000000000000000000000000000000001')
    ).toBeNull();
    expect(txExplorerUrl('')).toBeNull();
  });

  it('builds valid address explorer URLs', () => {
    const addr = '0xa528723770aaf22D6e3893D2E8168e48F9217F64';
    expect(addressExplorerUrl(addr)).toBe(
      `https://explorer-studio.genlayer.com/address/${addr}`
    );
    expect(addressExplorerUrl('not-an-address')).toBeNull();
  });

  it('truncates long hashes with shortHash', () => {
    expect(shortHash('0x1234567890abcdef1234567890abcdef12345678', 6, 4)).toBe(
      '0x1234…5678'
    );
    expect(shortHash(null)).toBe('—');
  });
});

describe('mapGenLayerTxToLifecycle', () => {
  it('maps FINALIZED + MAJORITY_AGREE to finalized-success', () => {
    expect(
      mapGenLayerTxToLifecycle({
        statusName: 'FINALIZED',
        resultName: 'MAJORITY_AGREE',
        txExecutionResultName: 'FINISHED_WITH_RETURN',
      }).lifecycle
    ).toBe('finalized-success');
  });

  it('maps FINALIZED + FINISHED_WITH_ERROR to finalized-error', () => {
    expect(
      mapGenLayerTxToLifecycle({
        statusName: 'FINALIZED',
        resultName: 'MAJORITY_AGREE',
        txExecutionResultName: 'FINISHED_WITH_ERROR',
      }).lifecycle
    ).toBe('finalized-error');
  });

  it('maps ACCEPTED (5) to accepted', () => {
    expect(mapGenLayerTxToLifecycle({ statusName: 'ACCEPTED' }).lifecycle).toBe(
      'accepted'
    );
  });

  it('maps PROPOSING / COMMITTING / PENDING to pending', () => {
    expect(mapGenLayerTxToLifecycle({ statusName: 'PROPOSING' }).lifecycle).toBe(
      'pending'
    );
    expect(mapGenLayerTxToLifecycle({ statusName: 'PENDING' }).lifecycle).toBe(
      'pending'
    );
  });

  it('maps CANCELED / UNDETERMINED to finalized-error', () => {
    expect(mapGenLayerTxToLifecycle({ statusName: 'CANCELED' }).lifecycle).toBe(
      'finalized-error'
    );
    expect(mapGenLayerTxToLifecycle({ statusName: 'UNDETERMINED' }).lifecycle).toBe(
      'finalized-error'
    );
  });
});

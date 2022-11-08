import { resolveChainId, resolveChainName } from './evm';

describe('it tests the evm module', () => {
  it('resolves a valid chain ID to a name', () => {
    const resolvedChainName = resolveChainName('1');

    expect(resolvedChainName).toEqual('mainnet');
  });

  it('resolves an unknown chain ID to a name', () => {
    const resolvedChainName = resolveChainName('3820372938292');

    expect(resolvedChainName).toBeUndefined();
  });

  it('resolves an unknown chain name to an ID', () => {
    const resolvedChainId = resolveChainId('unknown-chain');

    expect(resolvedChainId).toBeUndefined();
  });

  it('resolves a valid chain name to an ID', () => {
    const resolvedChainId = resolveChainId('mainnet');

    expect(resolvedChainId).toEqual('1');
  });
});

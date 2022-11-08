import { parseUnits } from 'ethers/lib/utils';
import { chainNames } from '@api3/airnode-protocol-v1/deployments/references.json';
import { EthValue } from './types';
import { log } from './logging';

const chainReferences = chainNames as Record<string, string>;

export const doTimeout = (interval: number) => new Promise((resolve) => setTimeout(() => resolve(null), interval));

export const convertEtherValue = (input: EthValue) => parseUnits(`${input.amount}`, input.units);

export const exit = (code = 0) => {
  console.log(`Exiting, code: ${code}`);
  process.exit(code);
};

export const isCloudFunction = () => process.env.LAMBDA_TASK_ROOT || process.env.FUNCTION_TARGET;

export const resolveChainName = (chainId: string) => {
  if (chainReferences[chainId]) {
    return chainReferences[chainId];
  }

  log('Invalid or unknown chain', 'INFO', {
    alias: 'invalid-chain-id-resolveChainName',
    description: `Please check the config and/or resolveChainName function: ${chainId}`,
    priority: 'P2',
  });
};

export const resolveChainId = (chainName: string) => {
  const chainId = Object.entries(chainNames).find(([_key, value]) => value === chainName);
  if (chainId && chainId[0]) {
    return chainId[0];
  }

  log('Invalid or unknown chain', 'INFO', {
    message: 'Invalid or unknown chain',
    alias: 'invalid-chain-name-resolveChainId',
    description: `Please check the config and/or resolveChainId function: ${chainName}`,
    priority: 'P2',
  });
};

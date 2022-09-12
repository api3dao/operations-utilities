import { parseUnits } from 'ethers/lib/utils';
import { OperationsRepository } from '@api3/operations';
import { readOperationsRepository } from '@api3/operations/dist/utils/read-operations';
import { EthValue } from './types';
import { log, logTrace } from './logging';

export const doTimeout = (interval: number) => new Promise((resolve) => setTimeout(() => resolve(null), interval));

export const convertEtherValue = (input: EthValue) => parseUnits(`${input.amount}`, input.units);

export const exit = (code = 0) => {
  console.log(`Exiting, code: ${code}`);
  process.exit(code);
};

export const isCloudFunction = () => process.env.LAMBDA_TASK_ROOT || process.env.FUNCTION_TARGET;

export const resolveChainName = (chainId: string, operationsRepository?: OperationsRepository) => {
  const operations = operationsRepository ?? readOperationsRepository();

  const chainName = Object.values(operations.chains).find((chain) => chain.id === chainId)?.name;

  if (chainName) {
    return chainName;
  }

  log('Invalid or unknown chain', 'INFO', {
    alias: 'invalid-chain-id-resolveChainName',
    description: `Please check the config and/or resolveChainName function: ${chainId}`,
    priority: 'P2',
  });
  return null;
};

export const resolveChainId = (chainName: string, operationsRepository?: OperationsRepository) => {
  const operations = operationsRepository ?? readOperationsRepository();

  const chainId = Object.values(operations.chains).find((chain) => chain.name === chainName)?.id;

  if (chainId) {
    return chainId;
  }

  log('Invalid or unknown chain', 'INFO', {
    message: 'Invalid or unknown chain',
    alias: 'invalid-chain-name-resolveChainId',
    description: `Please check the config and/or resolveChainId function: ${chainName}`,
    priority: 'P2',
  });
  return null;
};

export const resolveExplorerUrlByName = async (
  explorerUrls: Record<string, string>,
  chainName: string,
  operationsRepository?: OperationsRepository
) => {
  const chainId = resolveChainId(chainName, operationsRepository);

  const explorerUrl = explorerUrls[chainId as string];

  if (chainId && !explorerUrl) {
    logTrace(`Unable to find explorer URL for chain: ${resolveChainName(chainId, operationsRepository)}`);
  }

  return explorerUrl;
};

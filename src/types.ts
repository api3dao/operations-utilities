import { BigNumber } from 'ethers';
import { NonceManager } from '@ethersproject/experimental';

export interface EthValue {
  amount: number;
  units: 'wei' | 'kwei' | 'mwei' | 'gwei' | 'szabo' | 'finney' | 'ether';
}

export type ExtendedWalletWithMetadata = {
  chainName: string;
  providerXpub: string;
  sponsor: string;
  address?: string | undefined;
  walletType: 'Provider' | 'API3' | 'Provider-Sponsor' | 'API3-Sponsor' | 'Airseeker' | 'BYOG' | 'BYOGSponsor';
};

export interface TelemetryChainOptions {
  txType?: 'legacy' | 'eip1559';
  legacyMultiplier?: number;
}

export interface TelemetryChainConfig {
  rpc: string;
  topUpAmount?: string;
  lowBalance?: string;
  globalSponsorLowBalanceWarn?: string;
  options: TelemetryChainOptions;
}

export type GlobalSponsor = {
  chainId: string;
  sponsor: NonceManager;
} & TelemetryChainConfig;

export declare type OpsGeniePriority = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export interface OpsGenieMessage {
  message: string;
  alias: string;
  description?: string;
  priority?: OpsGeniePriority;
  details?: Record<string, string>;
}
export interface OpsGenieListAlertsResponse {
  id: string;
  alias: string;
}

export interface OpsGenieResponder {
  type: 'team' | 'user' | 'escalation' | 'schedule';
  name?: string;
  id?: string;
}

export interface OpsGenieConfig {
  apiKey: string;
  responders: OpsGenieResponder[];
}

export interface OutputMetric {
  logToDb?: boolean;
  metricName: Metric;
  value: BigNumber | number | null | undefined;
  metadata?: any;
}

export enum Metric {
  API_READ_LATENCY = 'API Read Latency',
  API_LIVENESS = 'API Liveness',
  API_VALUE = 'API Value',
  BEACON_LIVE = 'Beacon Live',
  BEACON_READ_LATENCY = 'Beacon Read Latency',
  BEACON_VALUE = 'Beacon Value',
  BEACON_OUTSTANDING_REQUEST_LATENESS = 'Beacon Outstanding Request Lateness',
  FAILED_FULFILMENTS = 'Failed Fulfilments',
  API_BEACON_DEVIATION = 'API Beacon Deviation',
  BEACON_LAST_UPDATED_DELTA = 'Beacon Last Updated Delta',
  WALLET_BALANCE = 'Wallet Balance',
  GLOBAL_SPONSOR_BALANCE = 'Global Sponsor Balance',
  BACKTEST_DEVIATION = 'Backtest Deviation',
}

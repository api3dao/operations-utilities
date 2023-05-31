import { URLSearchParams } from 'url';
import * as process from 'process';
import { TextEncoder } from 'util';
import axiosBase, { AxiosResponse } from 'axios';
import Bottleneck from 'bottleneck';
import { keccak256 } from 'ethers/lib/utils';
import { OpsGenieListAlertsResponse, OpsGenieMessage, OpsGenieConfig } from './types';
import { log, logTrace, debugLog } from './logging';
import { go } from './promises';
import { doTimeout } from './evm';

const DEFAULT_OPSGENIE_CONFIG: OpsGenieConfig = { apiKey: process.env.OPSGENIE_API_LEY!, responders: [] };

/**
 * We cache open OpsGenie alerts to reduce API calls to not hit API limits prematurely.
 * This carries the risk of eventual state desynchronisation - but we restart every 15 minutes, which means the worst
 * desynch we could see is over a 15-minute period.
 *
 * Regardless, we forcefully re-cache OpsGenie alerts.
 *
 * Closing an OpsGenie alert requires knowing an alert's ID... but we use alert aliases for de-duplication, so to close
 * an alert we need to do at least one API call in addition to our close call - and that's assuming that we know the
 * alert is open.
 *
 * Caching alerts allows us to avoid executing either of those calls as we know from our cache whether an alert is open
 * or not and what its alias is.
 */
enum AlertsCachingStatus {
  NONE,
  IN_PROGRESS,
  DONE,
}

/**
 * The Axios instance used by this library - defaults to the imported axios instance.
 */
let axios = axiosBase;

/**
 * A setter for the axios instance used by this library. Useful for reliably mocking out Axios for tests.
 *
 * @param axiosArgument
 */
export const setAxios = (axiosArgument: any) => {
  axios = axiosArgument;
};

/**
 * A cache of open alerts. This helps reduce OpsGenie API calls.
 */
export let openAlerts: OpsGenieListAlertsResponse[] | undefined = undefined;
let openAlertsCached: AlertsCachingStatus = AlertsCachingStatus.NONE;

/**
 * Used to track whether the app should warn about a missing OpsGenie API key.
 */
let opsGenieKeyMissingWarningFirstUseComplete = false;

/**
 * Check for an OpsGenie key, warn only once per application run.
 */
export const checkForOpsGenieApiKey = () => {
  if (process.env.OPSGENIE_API_KEY) {
    return false;
  }

  if (opsGenieKeyMissingWarningFirstUseComplete) {
    return true;
  }

  opsGenieKeyMissingWarningFirstUseComplete = true;
  log('No OpsGenie key found in ENVs, this is probably a mistake.');

  return true;
};

const encoder = new TextEncoder();
export const generateHash = (input: string) => keccak256(encoder.encode(input));

/**
 * Resets the cache during longer running operations
 */
export const resetCachedAlerts = () => {
  openAlertsCached = AlertsCachingStatus.NONE;
};

/**
 * Resets the open alerts cache. Mainly to be used to clean the state for tests.
 */
export const resetOpenAlerts = () => {
  openAlerts = undefined;
};

/**
 * Cache open OpsGenie alerts to reduce API calls.
 *
 * @param globalConfig
 * @param force
 */
export const cacheOpenAlerts = async (opsGenieConfig: OpsGenieConfig, force = false) => {
  switch (openAlertsCached) {
    case AlertsCachingStatus.DONE:
      if (!force) return;
      break;
    case AlertsCachingStatus.IN_PROGRESS:
      while (openAlertsCached === AlertsCachingStatus.IN_PROGRESS) {
        await doTimeout(100);
      }
      return;
    case AlertsCachingStatus.NONE:
      break;
    default:
  }

  openAlertsCached = AlertsCachingStatus.IN_PROGRESS;

  try {
    openAlerts = (await listOpenOpsGenieAlerts(opsGenieConfig)) ?? [];
    openAlertsCached = AlertsCachingStatus.DONE;

    await closeOpsGenieAlertWithAlias('opsgenie-open-alerts-cache-failure', opsGenieConfig);
  } catch (e) {
    openAlertsCached = AlertsCachingStatus.DONE;

    const typedError = e as Error;
    await sendToOpsGenieLowLevel(
      {
        message: `Unable to cache open OpsGenie Alerts: ${typedError.message}`,
        alias: generateHash('opsgenie-open-alerts-cache-failure'),
        description: typedError.stack,
      },
      opsGenieConfig
    );
  }
};

export const getOpsGenieApiKey = (opsGenieConfig: OpsGenieConfig) =>
  process.env.OPSGENIE_API_KEY ?? opsGenieConfig.apiKey;

/**
 * Close an OpsGenie alert using it's alertId
 *
 * @param alertId
 * @param opsGenieConfig
 */
export const closeOpsGenieAlertWithId = async (alertId: string, opsGenieConfig = DEFAULT_OPSGENIE_CONFIG) => {
  if (checkForOpsGenieApiKey()) {
    return;
  }

  const url = `https://api.opsgenie.com/v2/alerts/${alertId}/close`;
  const apiKey = process.env.OPSGENIE_API_KEY ?? opsGenieConfig.apiKey;

  axios({
    url,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `GenieKey ${apiKey}`,
    },
    method: 'POST',
    data: {},
    timeout: 10_000,
  })
    .catch(console.error)
    .then((result) => {
      if (result) {
        const typedResult = result as AxiosResponse;

        if (typedResult.status === 202 && openAlerts?.filter) {
          openAlerts = openAlerts.filter((alert) => alert.id !== alertId);
        }
      }
    });
};

export const getOpenAlerts = () => openAlerts;

export const setOpenAlerts = (openAlertsToSet: OpsGenieListAlertsResponse[] | undefined) => {
  openAlerts = openAlertsToSet;
};

/**
 * List open OpsGenie alerts
 *
 * @param opsGenieConfig
 */
export const listOpenOpsGenieAlerts = async (opsGenieConfig = DEFAULT_OPSGENIE_CONFIG) => {
  if (checkForOpsGenieApiKey()) {
    return;
  }

  const params = new URLSearchParams();
  params.set('query', `status: open`);

  const url = `https://api.opsgenie.com/v2/alerts`;
  const apiKey = process.env.OPSGENIE_API_KEY ?? opsGenieConfig.apiKey;

  const [err, axiosResponse] = await go(
    () =>
      axios({
        url,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `GenieKey ${apiKey}`,
        },
        params,
        method: 'GET',
        timeout: 10_000,
      }),
    { timeoutMs: 10_000, retryDelayMs: 5_000, retries: 5 }
  );

  if (err || axiosResponse.status !== 200 || !axiosResponse?.data?.data) {
    log(`Unable to list OpsGenie alerts`, 'ERROR', err as Error);
    return;
  }

  return (axiosResponse.data.data as OpsGenieListAlertsResponse[]).map(({ id, alias }) => ({ id, alias }));
};

/**
 * List open OpsGenie alerts by their alias
 *
 * @param alias
 * @param opsGenieConfig
 */
export const getOpenAlertsForAlias = async (alias: string, opsGenieConfig = DEFAULT_OPSGENIE_CONFIG) => {
  const params = new URLSearchParams();
  params.set('query', `status: open AND alias: ${generateHash(alias)}`);

  const url = `https://api.opsgenie.com/v2/alerts`;
  const apiKey = process.env.OPSGENIE_API_KEY ?? opsGenieConfig.apiKey;

  const axiosResponse = await axios({
    url,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `GenieKey ${apiKey}`,
    },
    params,
    method: 'GET',
    timeout: 10_000,
  });

  if (axiosResponse.status !== 200) {
    log(`Unable to list OpsGenie alerts`, 'ERROR');
    return;
  }

  if (!axiosResponse?.data?.data) {
    return;
  }

  return axiosResponse.data.data as OpsGenieListAlertsResponse[];
};

export const closeOpsGenieAlertWithAlias = async (alias: string, opsGenieConfig = DEFAULT_OPSGENIE_CONFIG) => {
  if (checkForOpsGenieApiKey()) {
    return;
  }

  const hashedAlias = generateHash(alias);

  await cacheOpenAlerts(opsGenieConfig);
  const cachedAlertId = openAlerts?.filter((alert) => alert.alias === hashedAlias);
  if (!cachedAlertId) {
    return;
  }

  const promisedResults = await Promise.allSettled(
    cachedAlertId!.map(async (alertRecord: OpsGenieListAlertsResponse) =>
      closeOpsGenieAlertWithId(alertRecord.id, opsGenieConfig)
    )
  );
  promisedResults
    .filter((result) => result.status === 'rejected')
    .map((rejection) => log('Alert close promise rejected', 'ERROR', rejection));
};

export const sendToOpsGenieLowLevel = async (message: OpsGenieMessage, opsGenieConfig = DEFAULT_OPSGENIE_CONFIG) => {
  log(message.message, 'INFO', message);
  if (checkForOpsGenieApiKey()) {
    return;
  }
  const url = 'https://api.opsgenie.com/v2/alerts';
  const apiKey = process.env.OPSGENIE_API_KEY ?? opsGenieConfig.apiKey;

  const hashedAlias = generateHash(message.alias);

  const payload = JSON.stringify({
    ...message,
    alias: hashedAlias,
    responders: opsGenieConfig.responders,
  });

  try {
    const response = await axios({
      url,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `GenieKey ${apiKey}`,
      },
      method: 'POST',
      data: payload,
      timeout: 10_000,
    });

    if (response?.data?.requestId) {
      if (openAlerts) {
        openAlerts = [
          ...openAlerts,
          {
            id: response?.data?.requestId,
            alias: hashedAlias,
          },
        ];
      }
    }
  } catch (e) {
    logTrace('Failed to create OpsGenie alert', 'ERROR', e);
  }
};

export const sendOpsGenieHeartbeat = async (heartBeatServiceName: string, opsGenieConfig = DEFAULT_OPSGENIE_CONFIG) =>
  new Promise<void>((resolve) => {
    if (checkForOpsGenieApiKey()) {
      resolve();
      return;
    }

    const url = `https://api.opsgenie.com/v2/heartbeats/${heartBeatServiceName}/ping`;
    const apiKey = process.env.OPSGENIE_API_KEY ?? opsGenieConfig.apiKey;

    axios({
      url,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `GenieKey ${apiKey}`,
      },
      method: 'POST',
      data: {},
      timeout: 10_000,
    })
      .catch((e) => {
        logTrace('Failed to create OpsGenie heartbeat', e);
        resolve();
      })
      .then((data) => {
        if (data) debugLog(JSON.stringify(data.data, null, 2));
        resolve();
      });
  });

export const getOpsGenieAlertIdWithAlias = async (alias: string, opsGenieConfig = DEFAULT_OPSGENIE_CONFIG) => {
  if (checkForOpsGenieApiKey()) {
    return;
  }

  const hashedAlias = generateHash(alias);

  await cacheOpenAlerts(opsGenieConfig);
  const cachedAlertId = openAlerts?.filter((alert) => alert.alias === hashedAlias);
  if (cachedAlertId) {
    return cachedAlertId;
  }

  await cacheOpenAlerts(opsGenieConfig, true);

  return openAlerts?.filter((alert) => alert.alias === alias);
};

export const closeOpsGenieAlerts = async (
  alerts: OpsGenieListAlertsResponse[],
  opsGenieConfig = DEFAULT_OPSGENIE_CONFIG
) => {
  if (checkForOpsGenieApiKey()) {
    return;
  }

  const promisedResults = await Promise.allSettled(
    alerts!.map(async (alertRecord: OpsGenieListAlertsResponse) =>
      closeOpsGenieAlertWithId(alertRecord.id, opsGenieConfig)
    )
  );

  promisedResults
    .filter((result) => result.status === 'rejected')
    .forEach((rejection) => log('Alert close promise rejected', 'ERROR', rejection));
};

// TODO improve wrapping
export const updateAlertDescription = (
  description: string,
  alertId: string,
  opsGenieConfig = DEFAULT_OPSGENIE_CONFIG
) =>
  axios({
    url: `https://api.opsgenie.com/v2/alerts/${alertId}/description`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `GenieKey ${getOpsGenieApiKey(opsGenieConfig)}`,
    },
    method: 'PUT',
    data: {
      description,
    },
    timeout: 9_000,
  });

export const getAlertContents = (alertId: string, opsGenieConfig = DEFAULT_OPSGENIE_CONFIG) =>
  axios({
    url: `https://api.opsgenie.com/v2/alerts/${alertId}?identifierType=id`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `GenieKey ${getOpsGenieApiKey(opsGenieConfig)}`,
    },
    method: 'GET',
    timeout: 10_000,
  });

export const getOpsGenieLimiter = (options: Bottleneck.ConstructorOptions = { maxConcurrent: 1, minTime: 500 }) => {
  const opsGenieLimiter = new Bottleneck(options);
  const limitedCloseOpsGenieAlertWithAlias = opsGenieLimiter.wrap(closeOpsGenieAlertWithAlias);
  const limitedSendToOpsGenieLowLevel = opsGenieLimiter.wrap(sendToOpsGenieLowLevel);

  return { opsGenieLimiter, limitedCloseOpsGenieAlertWithAlias, limitedSendToOpsGenieLowLevel };
};

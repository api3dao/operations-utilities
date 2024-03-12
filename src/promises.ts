import { go, GoAsyncOptions } from '@api3/promise-utils';
import { DEFAULT_RETRY_DELAY_MS } from './constants';

export type GoResult<T> = [Error, null] | [null, T];

export type ContinuousRetryOptions = GoAsyncOptions & {
  readonly delayMs?: number;
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function promiseTimeout<T>(ms: number, promise: Promise<T>): Promise<T> {
  let mutableTimeoutId: NodeJS.Timeout;
  const timeout = new Promise((_res, reject) => {
    mutableTimeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out in ${ms} ms.`));
    }, ms);
  });

  const wrappedPromise = promise.finally(() => {
    if (mutableTimeoutId) {
      clearTimeout(mutableTimeoutId);
    }
  });

  return Promise.race([wrappedPromise, timeout]) as Promise<T>;
}

export function retryOnTimeout<T>(maxTimeoutMs: number, operation: () => Promise<T>, options?: ContinuousRetryOptions) {
  const promise = new Promise<T>((resolve, reject) => {
    function run(): Promise<any> {
      // If the promise is successful, resolve it and bubble the result up
      return operation()
        .then(resolve)
        .catch((reason: any) => {
          // Only if the error is a timeout error, do we retry the promise
          if (reason instanceof Error && reason.message.includes('Operation timed out')) {
            // Delay the new attempt slightly
            return sleep(options?.delayMs || DEFAULT_RETRY_DELAY_MS)
              .then(run)
              .then(resolve)
              .catch(reject);
          }

          // If the error is NOT a timeout error, then we reject immediately
          return reject(reason);
        });
    }

    return run();
  });

  return promiseTimeout(maxTimeoutMs, promise);
}

export const timedExecute = async (fn: () => Promise<any>, options?: GoAsyncOptions) => {
  const operation = async () => {
    const start = new Date().getTime();
    const result = await fn();
    const end = new Date().getTime();

    return [end - start, result];
  };

  return go(operation, options);
};

export const settleAndCheckForPromiseRejections = async (promises?: Promise<any>[]) => {
  if (!promises) {
    return;
  }

  const settlements = await Promise.allSettled(promises);
  const rejections = settlements.filter((settlement) => settlement.status === 'rejected') as PromiseRejectedResult[];
  rejections.forEach((rejection) => {
    console.error(`Rejection from allSettled: ${rejection.reason}`);
  });

  if (rejections.length > 0) {
    throw new Error(`Promises rejected: ${rejections.length}`);
  }
};

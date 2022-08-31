/**
 * Prints out Node's memory usage in MB
 */
export const prettyPrintMemoryUsage = () => {
  const usage = Object.fromEntries(
    Object.entries(process.memoryUsage()).map(([key, value]) => [key, `${value / 1024 / 1024}`])
  );

  debugLog(usage);
};

/**
 * Logs the supplied arguments to stdout when the ENV DEBUG is defined
 */
export const debugLog = (...args: any[]) => {
  if (process.env.DEBUG) console.debug(args);
  console.debug(args);
};

export const log = (message: string, logLevel: 'ERROR' | 'INFO' = 'INFO', ...args: any[]) => {
  console.log(`[${logLevel}]\t ${message}`, ...args);
};

export const logTrace = (message: string, logLevel?: 'ERROR' | 'INFO', ...args: any[]) => {
  console.trace(`[${logLevel}]\t ${message}`, ...args);
};

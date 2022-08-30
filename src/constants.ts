export const MAIN_COLLECTOR_TIMEOUT = 900_000;
export const BEACON_READ_TIMEOUT = 30_000;
export const BEACON_READ_METRICS_TIMEOUT = 35_000;
export const DEFAULT_TIMEOUT = 55_000;
export const API_METRICS_TIMEOUT = 30_000;
export const GAS_METRICS_TIMEOUT = 30_000;
export const OUTSTANDING_REQUESTS_TIMEOUT = 30_000;
export const DEFAULT_RETRY_DELAY_MS = 50;

// Start of long-running collector-specific variables

// The total loop duration of the long-running collector, minus some overhead (15 minutes - 1 minute margin)
export const LOOP_DURATION = 840_000;

// The minimum period to wait per call after the first run
export const DEFAULT_MINIMUM_PERIOD_PER_CALL = 90_000;

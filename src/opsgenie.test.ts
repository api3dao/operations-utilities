import { OpsGenieConfig } from './types';
import { buildTelemetryConfig } from '../test/fixtures/config';

const _opsGenieConfig = buildTelemetryConfig().opsGenieConfig as OpsGenieConfig;

jest.mock('axios', () => jest.fn(() => Promise.resolve('teresa teng')));

describe('alert utilities', () => {});

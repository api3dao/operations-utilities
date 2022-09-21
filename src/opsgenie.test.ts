import { OpsGenieConfig } from './types';
import { checkForOpsGenieApiKey } from './opsgenie';
import { buildTelemetryConfig } from '../test/fixtures/config';

const _opsGenieConfig = buildTelemetryConfig().opsGenieConfig as OpsGenieConfig;

jest.mock('axios', () => jest.fn(() => Promise.resolve('teresa teng')));

describe('alert utilities', () => {
  it('checks for an OpsGenie key - positive case', () => {
    process.env.OPSGENIE_API_KEY = 'test key';

    const result = checkForOpsGenieApiKey();
    expect(result).toBeFalsy();
  });
});

import { mockReadFileSync } from "../mock-utils";
import * as hre from "hardhat";
import * as operations from "@api3/operations/dist/utils/read-operations";
import * as telemetry from "../../src/telemetry";
import * as database from "../../src/database";
import * as opsGenieUtils from "../../src/opsgenie-utils";
import {
  deployAndUpdateSubscriptions,
  serverETHValue,
  serverBTCValue,
} from "../setup/deployment";
import {
  buildOperationsConfig,
  buildTelemetryConfig,
} from "../fixtures/config";
import { telemetryCollectorHandler } from "../../src/handlers";
import { OpsGenieListAlertsResponse } from "../../src/types";
import * as telemetryCoordinator from "../../src/telemetry-coordinator";

// Jest version 27 has a bug where jest.setTimeout does not work correctly inside describe or test blocks
// https://github.com/facebook/jest/issues/11607
jest.setTimeout(60_000);

const alertIdETH = "eth-alert-id";
const alertIdBTC = "btc-alert-id";
const operationsConfig = buildOperationsConfig();
const telemetryConfig = buildTelemetryConfig();

describe("Alerts", () => {
  beforeEach(async () => {
    // Reset the local hardhat network state for each test to prevent issues with other test contracts
    await hre.network.provider.send("hardhat_reset");
    jest.restoreAllMocks();
    jest.clearAllTimers();

    // Reset alerts to ensure a clean state for each test
    opsGenieUtils.resetCachedAlerts();
    opsGenieUtils.resetOpenAlerts();

    // Mock calls to 3rd party APIs
    jest.spyOn(database, "sendToDb").mockImplementation(async () => {
      return;
    });
    jest
      .spyOn(opsGenieUtils, "sendToOpsGenieLowLevel")
      .mockImplementation(async () => {
        console.log("OPSGENIE MOCK WAS CALLED");
        return;
      });
    jest
      .spyOn(opsGenieUtils, "sendOpsGenieHeartbeat")
      .mockImplementation(async () => {
        return;
      });

    // Mocking this as returning 0 means all calls will execute as soon as they can
    const getNextRunSpy = jest.spyOn(telemetryCoordinator, "getNextRun");
    getNextRunSpy.mockReturnValue(0);
  });

  it("results in no alerts if deviations are not exceeded", async () => {
    await deployAndUpdateSubscriptions(serverETHValue, serverBTCValue);

    jest
      .spyOn(operations, "readOperationsRepository")
      .mockImplementation(() => operationsConfig as any);
    mockReadFileSync("telemetryConfig.json", JSON.stringify(telemetryConfig));

    const evaluateThresholdSpy = jest.spyOn(opsGenieUtils, "evaluateThreshold");
    await telemetryCollectorHandler();
    const evaluateThresholdResolvedPromises = await Promise.all(
      evaluateThresholdSpy.mock.results.map((r) => r.value)
    );

    expect(evaluateThresholdResolvedPromises).toEqual(
      expect.arrayContaining([])
    );
  });

  it("results in alerts if api beacon deviation exceeds threshold", async () => {
    await deployAndUpdateSubscriptions(
      serverETHValue * 0.9,
      serverBTCValue * 0.9
    );

    jest
      .spyOn(operations, "readOperationsRepository")
      .mockImplementation(() => operationsConfig as any);
    mockReadFileSync("telemetryConfig.json", JSON.stringify(telemetryConfig));

    const evaluateThresholdSpy = jest.spyOn(opsGenieUtils, "evaluateThreshold");
    await telemetryCollectorHandler();
    const evaluateThresholdResolvedPromises = await Promise.all(
      evaluateThresholdSpy.mock.results.map((r) => r.value)
    );

    expect(evaluateThresholdResolvedPromises).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          headline: "Beacon deviation exceeded: Local API ETH/USD on local",
          priority: "P2",
          message:
            "Current value: 11.1% vs evaluation threshold: 2.00% (2x) on chain local",
          alias:
            "API Beacon Deviation-dev-tol-0x85905fdf599914b136d4b2f6878e346ff7948ebed4510614f123bed7ef302e71",
        }),
        expect.objectContaining({
          headline: "Beacon deviation exceeded: Local API BTC/USD on local",
          priority: "P2",
          message:
            "Current value: 11.1% vs evaluation threshold: 2.00% (2x) on chain local",
          alias:
            "API Beacon Deviation-dev-tol-0xecc6d6f45c062d9cc697b4143bc8be8616ec327c3ea4e1845a907f994a1989f4",
        }),
      ])
    );
  });

  it("results in alerts if returning apiValue null", async () => {
    await deployAndUpdateSubscriptions(serverETHValue, serverBTCValue);

    jest
      .spyOn(operations, "readOperationsRepository")
      .mockImplementation(() => operationsConfig as any);
    mockReadFileSync("telemetryConfig.json", JSON.stringify(telemetryConfig));
    jest.spyOn(telemetry, "readApiValue").mockImplementation(async () => null);

    const sendToOpsGenieLowLevelSpy = jest.spyOn(
      opsGenieUtils,
      "sendToOpsGenieLowLevel"
    );
    await telemetryCollectorHandler();

    expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining(
          `0x924b5d4cb3ec6366ae4302a1ca6aec035594ea3ea48a102d160b50b0c43ebfb5`
        ),
        message: expect.stringContaining(`Failed to read API metrics:`),
        alias:
          "api-read-fail-0xd008a41455c5e8e12369d6298d153422ac57263ba559fe3a79d7920e2f732584",
        priority: "P5",
      })
    );
    expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining(
          `0xbf7ce55d109fd196de2a8bf1515d166c56c9decbe9cb473656bbca30d5743990`
        ),
        message: expect.stringContaining(`Failed to read API metrics:`),
        alias:
          "api-read-fail-0xfe312e8e4a8714b0aeed3abfc008aab89f53c25c679bdadbcc12b288bcf15298",
        priority: "P5",
      })
    );
  });

  it("results in alerts if failing to read api general error", async () => {
    await deployAndUpdateSubscriptions(serverETHValue, serverBTCValue);

    jest
      .spyOn(operations, "readOperationsRepository")
      .mockImplementation(() => operationsConfig as any);
    mockReadFileSync("telemetryConfig.json", JSON.stringify(telemetryConfig));
    jest.spyOn(telemetry, "readApiValue").mockImplementation(async () => {
      throw new Error("Failed to read API.");
    });

    const sendToOpsGenieLowLevelSpy = jest.spyOn(
      opsGenieUtils,
      "sendToOpsGenieLowLevel"
    );
    await telemetryCollectorHandler();

    expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(`Failed to read API metrics:`),
        alias: expect.stringContaining(`api-general-read-fail-`),
        priority: "P5",
      })
    );
    expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(`Failed to read API metrics:`),
        alias: expect.stringContaining(`api-general-read-fail-`),
        priority: "P5",
      })
    );
  });

  it("results in alerts if failing to read beacon", async () => {
    await deployAndUpdateSubscriptions(
      serverETHValue * 0.9,
      serverBTCValue * 0.9
    );

    jest
      .spyOn(operations, "readOperationsRepository")
      .mockImplementation(() => operationsConfig as any);
    mockReadFileSync("telemetryConfig.json", JSON.stringify(telemetryConfig));
    jest
      .spyOn(telemetry, "readBeaconValue")
      .mockReturnValue(new Promise((resolve) => resolve(null)));

    const sendToOpsGenieLowLevelSpy = jest.spyOn(
      opsGenieUtils,
      "sendToOpsGenieLowLevel"
    );
    await telemetryCollectorHandler();

    expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalledTimes(2);
  });

  it("results in alerts if reading beacon returns lastUpdated undefined", async () => {
    await deployAndUpdateSubscriptions(
      serverETHValue * 0.9,
      serverBTCValue * 0.9
    );

    jest
      .spyOn(operations, "readOperationsRepository")
      .mockImplementation(() => operationsConfig as any);
    mockReadFileSync("telemetryConfig.json", JSON.stringify(telemetryConfig));
    jest.spyOn(telemetry, "readBeaconValue").mockImplementation(
      async () =>
        ({
          lastUpdated: undefined,
        } as any)
    );
    const sendToOpsGenieLowLevelSpy = jest.spyOn(
      opsGenieUtils,
      "sendToOpsGenieLowLevel"
    );
    await telemetryCollectorHandler();

    expect(sendToOpsGenieLowLevelSpy).toHaveBeenCalled();
  });

  it("closes open alerts if deviation is not exceeded on current run", async () => {
    process.env.OPSGENIE_API_KEY = "test";

    await deployAndUpdateSubscriptions(serverETHValue, serverBTCValue);

    jest
      .spyOn(operations, "readOperationsRepository")
      .mockImplementation(() => operationsConfig as any);
    mockReadFileSync("telemetryConfig.json", JSON.stringify(telemetryConfig));
    jest.spyOn(opsGenieUtils, "listOpenOpsGenieAlerts").mockImplementation(
      async () =>
        [
          {
            alias:
              "API Beacon Deviation-dev-tol-0x85905fdf599914b136d4b2f6878e346ff7948ebed4510614f123bed7ef302e71",
            id: alertIdETH,
          },
          {
            alias:
              "API Beacon Deviation-dev-tol-0xecc6d6f45c062d9cc697b4143bc8be8616ec327c3ea4e1845a907f994a1989f4",
            id: alertIdBTC,
          },
        ] as OpsGenieListAlertsResponse[]
    );

    const closeOpsGenieAlertWithIdSpy = jest
      .spyOn(opsGenieUtils, "closeOpsGenieAlertWithId")
      .mockImplementation(async () => {
        return;
      });
    await telemetryCollectorHandler();

    expect(closeOpsGenieAlertWithIdSpy).toHaveBeenCalledWith(
      alertIdETH,
      telemetryConfig
    );
    expect(closeOpsGenieAlertWithIdSpy).toHaveBeenCalledWith(
      alertIdBTC,
      telemetryConfig
    );
  });

  it("does not close alerts if deviation is exceeded on current run", async () => {
    process.env.OPSGENIE_API_KEY = "test";
    await deployAndUpdateSubscriptions(
      serverETHValue * 0.9,
      serverBTCValue * 0.9
    );

    jest
      .spyOn(operations, "readOperationsRepository")
      .mockImplementation(() => operationsConfig as any);
    mockReadFileSync("telemetryConfig.json", JSON.stringify(telemetryConfig));
    jest.spyOn(opsGenieUtils, "listOpenOpsGenieAlerts").mockImplementation(
      async () =>
        [
          {
            alias:
              "API Beacon Deviation-dev-tol-0x85905fdf599914b136d4b2f6878e346ff7948ebed4510614f123bed7ef302e71",
            id: alertIdETH,
          },
          {
            alias:
              "API Beacon Deviation-dev-tol-0xecc6d6f45c062d9cc697b4143bc8be8616ec327c3ea4e1845a907f994a1989f4",
            id: alertIdBTC,
          },
        ] as OpsGenieListAlertsResponse[]
    );

    const closeOpsGenieAlertWithIdSpy = jest
      .spyOn(opsGenieUtils, "closeOpsGenieAlertWithId")
      .mockImplementation(async () => {
        return;
      });

    await telemetryCollectorHandler();

    expect(closeOpsGenieAlertWithIdSpy).not.toHaveBeenCalledWith(
      alertIdETH,
      telemetryConfig
    );
    expect(closeOpsGenieAlertWithIdSpy).not.toHaveBeenCalledWith(
      alertIdBTC,
      telemetryConfig
    );
  });
});

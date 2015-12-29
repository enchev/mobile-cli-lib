///<reference path="../../.d.ts"/>
"use strict";

import { Yok } from "../../../yok";
import * as assert from "assert";
import { DeviceLogProvider } from "../../../appbuilder/device-log-provider";

// $logFilter
function createTestInjector(loggingLevel: string, emptyFilteredData?: boolean) {
	let testInjector = new Yok();
	testInjector.register("logFilter", {
		loggingLevel: loggingLevel,
		filterData: (platform: string, data: string, logLevel?: string) => {
			return emptyFilteredData ? null : `${logLevel} ${data}`;
		}
	});

	return testInjector;
};

describe("proton deviceLogProvider", () => {
	let testInjector: IInjector,
		deviceLogProvider: any = null,
		testData = "testData",
		infoLogLevel = "INFO",
		fullLogLevel = "FULL",
		filteredInfoData = `${infoLogLevel} ${testData}`,
		filteredFullData = `${fullLogLevel} ${testData}`;

	describe("logData", () => {
		describe("when device identifier is not specified", () => {
			it("logs INFO messages when logging level is default", () => {
				testInjector = createTestInjector(infoLogLevel);
				deviceLogProvider = testInjector.resolve(DeviceLogProvider);
				let emittedData: string = 'some default value that should be changed';
				deviceLogProvider.on("data", (deviceIdentifier: string, data: string) => {
					emittedData = data;
				});
				deviceLogProvider.logData(testData, "platform");
				assert.deepEqual(emittedData, filteredInfoData);
			});

			it("does not emit data when whole data is filtered", () => {
				testInjector = createTestInjector(infoLogLevel, true);
				deviceLogProvider = testInjector.resolve(DeviceLogProvider);
				let emittedData: string = 'some default value that should NOT be changed';
				deviceLogProvider.on("data", (deviceIdentifier: string, data: string) => {
					emittedData = data;
				});
				deviceLogProvider.logData(testData, "platform");
				assert.deepEqual(emittedData, 'some default value that should NOT be changed');
			});
		});

		describe("when device identifier is specified", () => {
			it("logs INFO messages when logging level is INFO", () => {
				testInjector = createTestInjector(infoLogLevel);
				deviceLogProvider = testInjector.resolve(DeviceLogProvider);
				let emittedData: string = 'some default value that should be changed';
				let expectedDeviceIdentifier: string = null;
				deviceLogProvider.on("data", (deviceIdentifier: string, data: string) => {
					emittedData = data;
					expectedDeviceIdentifier = deviceIdentifier;
				});
				deviceLogProvider.logData(testData, "platform", "deviceId");
				assert.deepEqual(emittedData, filteredInfoData);
				assert.deepEqual(expectedDeviceIdentifier, "deviceId");
			});

			it("does not emit data when whole data is filtered", () => {
				testInjector = createTestInjector(infoLogLevel, true);
				deviceLogProvider = testInjector.resolve(DeviceLogProvider);
				let emittedData: string = 'some default value that should NOT be changed';
				let expectedDeviceIdentifier: string = null;
				deviceLogProvider.on("data", (deviceIdentifier: string, data: string) => {
					emittedData = data;
					expectedDeviceIdentifier = deviceIdentifier;
				});
				deviceLogProvider.logData(testData, "platform");
				assert.deepEqual(emittedData, 'some default value that should NOT be changed');
				assert.deepEqual(expectedDeviceIdentifier, null);
			});
		});
	});

	describe("setLogLevel", () => {
		it("changes logFilter's loggingLevel when device identifier is not specified", () => {
			testInjector = createTestInjector(infoLogLevel);
			deviceLogProvider = testInjector.resolve(DeviceLogProvider);
			deviceLogProvider.setLogLevel(fullLogLevel);
			let logFilter = testInjector.resolve("logFilter");
			assert.deepEqual(logFilter.loggingLevel, fullLogLevel);
		});

		it("does not change logFilter's loggingLevel when device identifier is specified", () => {
			testInjector = createTestInjector(infoLogLevel);
			deviceLogProvider = testInjector.resolve(DeviceLogProvider);
			deviceLogProvider.setLogLevel(fullLogLevel, "deviceID");
			let logFilter = testInjector.resolve("logFilter");
			assert.deepEqual(logFilter.loggingLevel, infoLogLevel);
		});
	});

	describe("keeps correct log level for each device", () => {
		beforeEach(() => {
			testInjector = createTestInjector(infoLogLevel);
			deviceLogProvider = testInjector.resolve(DeviceLogProvider);
		});

		it("emits full log level for specific deviceIdentifier and info for the rest of the devices", () => {
			deviceLogProvider.setLogLevel(fullLogLevel, "device1");
			let emittedData: string = 'some default value that should be changed';
			let expectedDeviceIdentifier: string = null;
			deviceLogProvider.on("data", (deviceIdentifier: string, data: string) => {
				emittedData = data;
				expectedDeviceIdentifier = deviceIdentifier;
			});
			deviceLogProvider.logData(testData, "platform", "device1");
			assert.deepEqual(emittedData, filteredFullData);
			assert.deepEqual(expectedDeviceIdentifier, "device1");
			deviceLogProvider.logData(testData, "platform", "device2");
			assert.deepEqual(emittedData, filteredInfoData);
			assert.deepEqual(expectedDeviceIdentifier, "device2");
			deviceLogProvider.logData(testData, "platform", "device1");
			assert.deepEqual(emittedData, filteredFullData);
			assert.deepEqual(expectedDeviceIdentifier, "device1");
		});

		it("emits info log level for all devices, when setLogLevel is called without identifier", () => {
			deviceLogProvider.setLogLevel(fullLogLevel, "device1");
			let emittedData: string = 'some default value that should be changed';
			let expectedDeviceIdentifier: string = null;
			deviceLogProvider.on("data", (deviceIdentifier: string, data: string) => {
				emittedData = data;
				expectedDeviceIdentifier = deviceIdentifier;
			});
			deviceLogProvider.logData(testData, "platform", "device1");
			assert.deepEqual(emittedData, filteredFullData);
			assert.deepEqual(expectedDeviceIdentifier, "device1");

			// Reset log level for all devices
			deviceLogProvider.setLogLevel(infoLogLevel);

			deviceLogProvider.logData(testData, "platform", "device2");
			assert.deepEqual(emittedData, filteredInfoData);
			assert.deepEqual(expectedDeviceIdentifier, "device2");
			deviceLogProvider.logData(testData, "platform", "device1");
			assert.deepEqual(emittedData, filteredInfoData);
			assert.deepEqual(expectedDeviceIdentifier, "device1");
		});
	});
});

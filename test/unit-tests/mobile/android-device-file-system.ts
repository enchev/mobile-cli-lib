///<reference path="../../.d.ts"/>
"use strict";

import {AndroidDeviceFileSystem} from "../../../mobile/android/android-device-file-system";
import {Yok} from "../../../yok";
import {Errors} from "../../../errors";
import {FileSystem} from "../../../file-system";
import {Logger} from "../../../logger";
import {MobileHelper} from "../../../mobile/mobile-helper";
import {DevicePlatformsConstants} from "../../../mobile/device-platforms-constants";
import Future = require("fibers/future");
import * as path from "path";
import { assert } from "chai";

let myTestAppIdentifier = "org.nativescript.myApp";
let isAdbPushExecuted = false;

class AndroidDebugBridgeMock {
	public executeCommand(args: string[]) {
		if (args[0] === "push") {
			isAdbPushExecuted = true;
		}

		return Future.fromResult();
	}

	public executeShellCommand() {
		return Future.fromResult();
	}
}

class LocalToDevicePathDataMock {
	constructor(private filePath: string) { }

	public getLocalPath(): string {
		return this.filePath;
	}

	public getDevicePath(): string {
		return "/data/local/tmp/" + path.basename(this.filePath);
	}
}

class MobilePlatformsCapabilitiesMock implements Mobile.IPlatformsCapabilities {
	public getPlatformNames(): string[]{
		return _.keys(this.getAllCapabilities());
	}

	public getAllCapabilities(): IDictionary<Mobile.IPlatformCapabilities> {
		return {
			iOS: {
				"wirelessDeploy": false,
				"cableDeploy": true,
				"companion": false,
				"hostPlatformsForDeploy": ["darwin"]
			},
			Android: {
				"wirelessDeploy": false,
				"cableDeploy": true,
				"companion": false,
				"hostPlatformsForDeploy": ["win32", "darwin", "linux"]
			}
		};
	}
}

function createTestInjector(): IInjector {
	let injector = new Yok();
	injector.register("fs", FileSystem);
	injector.register("logger", Logger);
	injector.register("mobileHelper", MobileHelper);
	injector.register("config", {});
	injector.register("options", {});
	injector.register("errors", Errors);
	injector.register("mobilePlatformsCapabilities", MobilePlatformsCapabilitiesMock);
	injector.register("devicePlatformsConstants", DevicePlatformsConstants);

	return injector;
}

function createAndroidDeviceFileSystem(injector: IInjector) {
	let adb = new AndroidDebugBridgeMock();
	let androidDeviceFileSystem = injector.resolve(AndroidDeviceFileSystem, {"adb": adb, "identifier": myTestAppIdentifier});
	androidDeviceFileSystem.createFileOnDevice = () => Future.fromResult();
	return androidDeviceFileSystem;
}

function createDeviceAppData() {
	return { deviceProjectRootPath: "/data/local/tmp/sync", appIdentifier: myTestAppIdentifier };
}

describe("Android device file system tests", () => {
	describe("Transfer directory unit tests", () => {
		it("pushes the whole directory when hash file doesn't exist on device", () => {
			let injector = createTestInjector();
			let deviceAppData = createDeviceAppData();

			let fileToShasumDictionary: IStringDictionary = {
				"~/TestApp/app/test.js": "1",
				"~/TestApp/app/myfile.js": "2"
			};
			let localToDevicePaths = _.keys(fileToShasumDictionary).map(file => injector.resolve(LocalToDevicePathDataMock, {filePath: file}));

			let fs = injector.resolve("fs");
			fs.getFileShasum = (filePath: string) => (() => fileToShasumDictionary[filePath]).future<string>()();
			fs.exists = (filePath: string) => Future.fromResult(false);
			fs.exists = (filePath: string) => Future.fromResult(false);
			fs.getFsStats = (filePath: string) => Future.fromResult({
				isDirectory: () => false,
				isFile: () => true
			});

			let androidDeviceFileSystem = createAndroidDeviceFileSystem(injector);
			androidDeviceFileSystem.transferDirectory(deviceAppData, localToDevicePaths, "~/TestApp/app").wait();

			assert.isTrue(isAdbPushExecuted);
			isAdbPushExecuted = false;
		});
		it("pushes the whole directory when force option is specified", () => {
			let injector = createTestInjector();

			let options = injector.resolve("options");
			options.force = true;

			let fs = injector.resolve("fs");
			fs.getFileShasum = (filePath: string) => (() => "0").future<string>()();

			let androidDeviceFileSystem = createAndroidDeviceFileSystem(injector);
			androidDeviceFileSystem.transferDirectory(createDeviceAppData(), [], "~/TestApp/app").wait();

			assert.isTrue(isAdbPushExecuted);
			isAdbPushExecuted = false;
		});
		it("pushes only changed file when hash file exists on device", () => {
			let injector = createTestInjector();
			let deviceAppData = createDeviceAppData();

			let fileToShasumDictionary: IStringDictionary = {
				"~/TestApp/app/test.js": "1",
				"~/TestApp/app/myfile.js": "2"
			};
			let localToDevicePaths = _.keys(fileToShasumDictionary).map(file => injector.resolve(LocalToDevicePathDataMock, {filePath: file}));

			let fs = injector.resolve("fs");
			fs.getFileShasum = (filePath: string) => (() => fileToShasumDictionary[filePath]).future<string>()();
			fs.exists = (filePath: string) => Future.fromResult(true);
			fs.readText = (filePath: string) => (() =>  "~/TestApp/app/test.js 0\n ~/TestApp/app/myfile.js 2").future<string>()();
			fs.getFsStats = (filePath: string) => Future.fromResult({
				isDirectory: () => false,
				isFile: () => true
			});

			let androidDeviceFileSystem = createAndroidDeviceFileSystem(injector);
			androidDeviceFileSystem.transferFile = (localPath: string, devicePath: string) => {
				assert.equal(localPath, "~/TestApp/app/test.js");
				return Future.fromResult();
			};
			androidDeviceFileSystem.transferDirectory(deviceAppData, localToDevicePaths, "~/TestApp/app").wait();
		});
		it("pushes only changed files when hashes file exists on device", () => {
			let injector = createTestInjector();
			let deviceAppData = createDeviceAppData();

			let fileToShasumDictionary: IStringDictionary = {
				"~/TestApp/app/test.js": "1",
				"~/TestApp/app/myfile.js": "2",
				"~/TestApp/app/notchangedFile.js": "3"
			};
			let localToDevicePaths = _.keys(fileToShasumDictionary).map(file => injector.resolve(LocalToDevicePathDataMock, {filePath: file}));

			let fs = injector.resolve("fs");
			fs.getFileShasum = (filePath: string) => (() => fileToShasumDictionary[filePath]).future<string>()();
			fs.exists = (filePath: string) => Future.fromResult(true);
			fs.readText = (filePath: string) => (() =>  "~/TestApp/app/test.js 0\n ~/TestApp/app/myfile.js 4\n ~/TestApp/app/notchangedFile.js 3").future<string>()();
			fs.getFsStats = (filePath: string) => Future.fromResult({
				isDirectory: () => false,
				isFile: () => true
			});

			let androidDeviceFileSystem = createAndroidDeviceFileSystem(injector);
			let transferedFilesOnDevice: string[] = [];
			androidDeviceFileSystem.transferFile = (localPath: string, devicePath: string) => {
				transferedFilesOnDevice.push(localPath);
				return Future.fromResult();
			};
			androidDeviceFileSystem.transferDirectory(deviceAppData, localToDevicePaths, "~/TestApp/app").wait();

			assert.equal(transferedFilesOnDevice.length, 2);
			assert.isTrue(_.contains(transferedFilesOnDevice, "~/TestApp/app/test.js"));
			assert.isTrue(_.contains(transferedFilesOnDevice, "~/TestApp/app/myfile.js"));
			assert.isFalse(_.contains(transferedFilesOnDevice, "~/TestApp/app/notchangedFile.js"));
		});
	});
});

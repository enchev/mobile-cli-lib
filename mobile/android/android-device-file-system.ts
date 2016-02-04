///<reference path="../../.d.ts"/>
"use strict";

import * as path from "path";
import * as temp from "temp";
import {AndroidDeviceHashService} from "./android-device-hash-service";
import Future = require("fibers/future");

export class AndroidDeviceFileSystem implements Mobile.IDeviceFileSystem {
	private _deviceHashServices = Object.create(null);

	constructor(private adb: Mobile.IAndroidDebugBridge,
		private identifier: string,
		private $fs: IFileSystem,
		private $logger: ILogger,
		private $mobileHelper: Mobile.IMobileHelper,
		private $injector: IInjector,
		private $options: ICommonOptions) { }

	public listFiles(devicePath: string): IFuture<void> {
		return Future.fromResult();
	}

	public getFile(deviceFilePath: string): IFuture<void> {
		return Future.fromResult();
	}

	public putFile(localFilePath: string, deviceFilePath: string): IFuture<void> {
		return Future.fromResult();
	}

	public transferFiles(deviceAppData: Mobile.IDeviceAppData, localToDevicePaths: Mobile.ILocalToDevicePathData[]): IFuture<void> {
		return (() => {
			_(localToDevicePaths)
				.filter(localToDevicePathData => this.$fs.getFsStats(localToDevicePathData.getLocalPath()).wait().isFile())
				.each(localToDevicePathData =>
					this.adb.executeCommand(["push", localToDevicePathData.getLocalPath(), localToDevicePathData.getDevicePath()]).wait()
				)
				.value();

			_(localToDevicePaths)
				.filter(localToDevicePathData => this.$fs.getFsStats(localToDevicePathData.getLocalPath()).wait().isDirectory())
				.each(localToDevicePathData =>
					this.adb.executeShellCommand(["chmod", "0777", localToDevicePathData.getDevicePath()]).wait()
				)
				.value();

			// Update hashes
			let deviceHashService = this.getDeviceHashService(deviceAppData.appIdentifier);
			if (!deviceHashService.updateHashes(localToDevicePaths).wait()) {
				this.$logger.trace("Unable to find hash file on device. The next livesync command will create it.");
			}
		}).future<void>()();
	}

	public transferDirectory(deviceAppData: Mobile.IDeviceAppData, localToDevicePaths: Mobile.ILocalToDevicePathData[], projectFilesPath: string): IFuture<void> {
		return (() => {
			let devicePaths: string[] = [],
				currentShasums: string[] = [];

			localToDevicePaths.forEach(localToDevicePathData => {
				let localPath = localToDevicePathData.getLocalPath();
				let stats = this.$fs.getFsStats(localPath).wait();
				if (stats.isFile()) {
					let fileShasum = this.$fs.getFileShasum(localPath).wait();
					currentShasums.push(`${localPath} ${fileShasum}`);
				}
				devicePaths.push(`"${localToDevicePathData.getDevicePath()}"`);
			});

			let commandsDeviceFilePath = this.$mobileHelper.buildDevicePath(deviceAppData.deviceProjectRootPath, "nativescript.commands.sh");

			let deviceHashService = this.getDeviceHashService(deviceAppData.appIdentifier);
			let filesToChmodOnDevice: string[] = devicePaths;
			if (this.$options.force) {
				this.adb.executeShellCommand(["rm", "-rf", deviceHashService.hashFileDevicePath]).wait();
				this.adb.executeCommand(["push", projectFilesPath, deviceAppData.deviceProjectRootPath]).wait();
			} else {
				// Create or update file hashes on device
				let oldShasums = deviceHashService.getShasumsFromDevice().wait();
				if (oldShasums) {
					let changedShasums = _(currentShasums)
						.filter(hash => !_.find(oldShasums, h => hash.trim().toLowerCase() === h.trim().toLowerCase()))
						.value();

					this.$logger.trace(`Changed file hashes are: ${changedShasums}.`);
					filesToChmodOnDevice = [];
					let futures = _(changedShasums)
						.map(hash => _.find(localToDevicePaths, ldp => ldp.getLocalPath() === hash.trim().split(" ")[0]))
						.map(localToDevicePathData => {
							filesToChmodOnDevice.push(`"${localToDevicePathData.getDevicePath()}"`);
							return this.transferFile(localToDevicePathData.getLocalPath(), localToDevicePathData.getDevicePath());
						})
						.value();
					Future.wait(futures);
				} else {
					this.adb.executeCommand(["push", projectFilesPath, deviceAppData.deviceProjectRootPath]).wait();
				}
			}

			if(filesToChmodOnDevice.length) {
				this.createFileOnDevice(commandsDeviceFilePath, "chmod 0777 " + filesToChmodOnDevice.join(" ")).wait();
				this.adb.executeShellCommand([commandsDeviceFilePath]).wait();
			}
			deviceHashService.uploadHashFileToDevice(currentShasums.join("\n")).wait();
		}).future<void>()();
	}

	public transferFile(localPath: string, devicePath: string): IFuture<void> {
		return (() => {
			this.$logger.trace(`Transfering ${localPath} to ${devicePath}`);
			let stats = this.$fs.getFsStats(localPath).wait();
			if (stats.isDirectory()) {
				this.adb.executeShellCommand(["mkdir", path.dirname(devicePath)]).wait();
			} else {
				this.adb.executeCommand(["push", localPath, devicePath]).wait();
			}
		}).future<void>()();
	}

	public createFileOnDevice(deviceFilePath: string, fileContent: string): IFuture<void> {
		return (() => {
			let hostTmpDir = this.getTempDir();
			let commandsFileHostPath = path.join(hostTmpDir, "temp.commands.file");
			this.$fs.writeFile(commandsFileHostPath, fileContent).wait();

			// copy it to the device
			this.transferFile(commandsFileHostPath, deviceFilePath).wait();
			this.adb.executeShellCommand(["chmod", "0777", deviceFilePath]).wait();
		}).future<void>()();
	}

	private getTempDir(): string {
		temp.track();
		return temp.mkdirSync("application-");
	}

	private getDeviceHashService(appIdentifier: string): Mobile.IAndroidDeviceHashService {
		if (!this._deviceHashServices[appIdentifier]) {
			this._deviceHashServices[appIdentifier] = this.$injector.resolve(AndroidDeviceHashService, {adb: this.adb, appIdentifier: appIdentifier});
		}

		return this._deviceHashServices[appIdentifier];
	}
}

///<reference path="../../.d.ts"/>
"use strict";

import * as helpers from "../../helpers";
import * as path from "path";
import * as temp from "temp";

export class AndroidDeviceHashService {
	private static HASH_FILE_NAME = "hashes";
	private static DEVICE_ROOT_PATH = "/data/local/tmp";

	private _hashFileDevicePath: string = null;
	private _hashFileLocalPath: string = null;
	private _tempDir: string = null;

	constructor(private adb: Mobile.IAndroidDebugBridge,
		private appIdentifier: string,
		private $fs: IFileSystem,
		private $mobileHelper: Mobile.IMobileHelper) { }

	public get hashFileDevicePath(): string {
		if (!this._hashFileDevicePath) {
			this._hashFileDevicePath = this.$mobileHelper.buildDevicePath(AndroidDeviceHashService.DEVICE_ROOT_PATH, this.appIdentifier, AndroidDeviceHashService.HASH_FILE_NAME);
		}

		return this._hashFileDevicePath;
	}

	public doesShasumFileExistsOnDevice(): IFuture<boolean> {
		return ((): boolean => {
			let lsResult = this.adb.executeShellCommand(["ls", this.hashFileDevicePath]).wait();
			return !!(lsResult && lsResult.trim() === this.hashFileDevicePath);
		}).future<boolean>()();
	}

	public getShasumsFromDevice(): IFuture<string[]> {
		return (() => {
			let hashFileLocalPath = this.downloadHashFileFromDevice().wait();

			if (this.$fs.exists(hashFileLocalPath).wait()) {
				let stats = this.$fs.getFsStats(hashFileLocalPath).wait();
				if (stats.isFile()) {
					return this.$fs.readText(hashFileLocalPath).wait().split("\n");
				}
			}

			return null;
		}).future<string[]>()();
	}

	public uploadHashFileToDevice(data: any): IFuture<void> {
		return (() => {
			let shasums: string = null;
			if (typeof(data) === "string") {
				shasums = data;
			} else { // data type is Mobile.ILocalToDevicePathData[]
				shasums = data.map( (localToDevicePathData: Mobile.ILocalToDevicePathData) => {
					let localPath = localToDevicePathData.getLocalPath();
					let stats = this.$fs.getFsStats(localPath).wait();
					if (stats.isFile()) {
						let fileShasum = this.$fs.getFileShasum(localPath).wait();
						return `${localPath} ${fileShasum}`;
					}
					return null;
				}).filter((a: string) => !!a).join("\n");
			}

			this.$fs.writeFile(this.hashFileLocalPath, shasums).wait();
			this.adb.executeCommand(["push", this.hashFileLocalPath, this.hashFileDevicePath]).wait();
		}).future<void>()();
	}

	public updateHashes(localToDevicePaths: Mobile.ILocalToDevicePathData[]): IFuture<boolean> {
		return (() => {
			let oldShasums = this.getShasumsFromDevice().wait();
			if (oldShasums) {
				let fileToShasumDictionary = helpers.convertToDictionary(oldShasums);
				_.each(localToDevicePaths, ldp => fileToShasumDictionary[ldp.getLocalPath()] = this.$fs.getFileShasum(ldp.getLocalPath()).wait());
				this.uploadHashFileToDevice(helpers.convertToString(fileToShasumDictionary)).wait();
				return true;
			}

			return false;
		}).future<boolean>()();
	}

	public removeHashes(localToDevicePaths: Mobile.ILocalToDevicePathData[]): IFuture<boolean> {
		return (() => {
			let oldShasums = this.getShasumsFromDevice().wait();
			if (oldShasums) {
				let fileToShasumDictionary = helpers.convertToDictionary(oldShasums);
				fileToShasumDictionary = <any>(_.omit(fileToShasumDictionary, localToDevicePaths.map(ldp => ldp.getLocalPath())));
				this.uploadHashFileToDevice(helpers.convertToString(fileToShasumDictionary)).wait();
				return true;
			}

			return false;
		}).future<boolean>()();
	}

	private get hashFileLocalPath(): string {
		if (!this._hashFileLocalPath) {
			this._hashFileLocalPath = path.join(this.tempDir, AndroidDeviceHashService.HASH_FILE_NAME);
		}

		return this._hashFileLocalPath;
	}

	private get tempDir(): string {
		if (!this._tempDir) {
			temp.track();
			this._tempDir = temp.mkdirSync(`android-device-hash-service-${this.appIdentifier}`);
		}

		return this._tempDir;
	}

	private downloadHashFileFromDevice(): IFuture<string> {
		return (() => {
			if (!this.$fs.exists(this.hashFileLocalPath).wait()) {
				this.adb.executeCommand(["pull", this.hashFileDevicePath, this.tempDir]).wait();
			}
			return this.hashFileLocalPath;
		}).future<string>()();
	}
}

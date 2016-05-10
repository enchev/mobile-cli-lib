///<reference path="../.d.ts"/>
"use strict";

import { EventEmitter } from "events";

class DeviceEmitter extends EventEmitter {
	constructor(private $androidDeviceDiscovery:Mobile.IAndroidDeviceDiscovery,
		private $iOSDeviceDiscovery: Mobile.IDeviceDiscovery,
		private $iOSSimulatorDiscovery: Mobile.IDeviceDiscovery,
		private $devicesService: Mobile.IDevicesService,
		private $deviceLogProvider: EventEmitter,
		private $companionAppsService: ICompanionAppsService,
		private $projectConstants: Project.IConstants,
		private $devicePlatformsConstants: Mobile.IDevicePlatformsConstants) {
		super();
	}

	private _companionAppIdentifiers: IDictionary<IStringDictionary>;
	private get companionAppIdentifiers(): IDictionary<IStringDictionary> {
		if(!this._companionAppIdentifiers) {
			this._companionAppIdentifiers = this.$companionAppsService.getAllCompanionAppIdentifiers();
		}

		return this._companionAppIdentifiers;
	}

	public initialize(): IFuture<void> {
		return (() => {
			this.$devicesService.on("deviceFound", (device: Mobile.IDevice) => {
				console.log("device emitter, device is found raised PID = ", process.pid);
				this.emit("deviceFound", device.deviceInfo);
				this.attachApplicationChangedHandlers(device);
				device.openDeviceLogStream();
			});

			this.$devicesService.on("deviceLost", (device: Mobile.IDevice) => {
				console.log("device emitter, device is lost raised PID = ", process.pid);
				this.emit("deviceLost", device.deviceInfo);
			});

			this.$devicesService.initialize({skipInferPlatform: true}).wait();

			this.$deviceLogProvider.on("data", (identifier: string, data: any) => {
				this.emit('deviceLogData', identifier, data.toString());
			});
		}).future<void>()();
	}

	private attachApplicationChangedHandlers(device: Mobile.IDevice): void {
		device.applicationManager.on("applicationInstalled", (applicationName: string, applicationSettings: {isLiveSyncEnabled: boolean}) => {
			this.emit("applicationInstalled", device.deviceInfo.identifier, applicationName, applicationSettings);
			this.checkCompanionAppChanged(device, applicationName, "companionAppInstalled");
		});

		device.applicationManager.on("applicationUninstalled", (applicationName: string) => {
			this.emit("applicationUninstalled", device.deviceInfo.identifier, applicationName);
			this.checkCompanionAppChanged(device, applicationName, "companionAppUninstalled");
		});
	}

	private checkCompanionAppChanged(device: Mobile.IDevice, applicationName: string, eventName: string): void {
		let devicePlatform = device.deviceInfo.platform.toLowerCase();
		_.each(this.companionAppIdentifiers, (platformsCompanionAppIdentifiers: IStringDictionary, framework: string) => {
			if(applicationName === platformsCompanionAppIdentifiers[devicePlatform]) {
				this.emit(eventName, device.deviceInfo.identifier, framework);
				// break each
				return false;
			}
		});
	}
}
$injector.register("deviceEmitter", DeviceEmitter);

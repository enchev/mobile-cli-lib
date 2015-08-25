///<reference path="../../.d.ts"/>
"use strict";

import * as ref from "ref";
import * as os from "os";
import * as IOSDevice from "../ios/ios-device";
import * as AndroidDevice from "../android/android-device";
import * as CoreTypes from "../ios/ios-core";
import Future = require("fibers/future");
import * as helpers from "../../helpers";
import { EventEmitter } from "events";

export class DeviceDiscovery extends EventEmitter implements Mobile.IDeviceDiscovery {
	private devices: {[key: string]: Mobile.IDevice} = {};

	public addDevice(device: Mobile.IDevice) {
		this.devices[device.deviceInfo.identifier] = device;
		this.raiseOnDeviceFound(device);
	}

	public removeDevice(deviceIdentifier: string) {
		let device = this.devices[deviceIdentifier];
		if(!device) {
			return;
		}
		delete this.devices[deviceIdentifier];
		this.raiseOnDeviceLost(device);
	}

	public startLookingForDevices(): IFuture<void> {
		return undefined;
	}

	private raiseOnDeviceFound(device: Mobile.IDevice) {
		this.emit("deviceFound", device);
	}

	private raiseOnDeviceLost(device: Mobile.IDevice) {
		this.emit("deviceLost", device);
	}
}
$injector.register("deviceDiscovery", DeviceDiscovery);

class ProtonDeviceDiscovery extends EventEmitter {
	// TODO: add iosDeviceDiscovery as a dependency too
	constructor(private $androidDeviceDiscovery:Mobile.IAndroidDeviceDiscovery) {
		super();
	}
	
	public initialize(): IFuture<void> {
		return (() => {
			this.$androidDeviceDiscovery.ensureAdbServerStarted().wait();
			
			setInterval(() => this.$androidDeviceDiscovery.startLookingForDevices(), 1000); // Maybe we should unref this as it will block CLI's execution and will hold the console.
			this.$androidDeviceDiscovery.on("deviceFound", (data: Mobile.IDevice) => {
				this.emit("deviceFound", data.deviceInfo);
			});
			
			this.$androidDeviceDiscovery.on("deviceLost", (data: Mobile.IDevice) => {
				this.emit("deviceLost", data.deviceInfo);
			});
		}).future<void>()();
	}

	// TODO: Expose list of all devices (use deviceInfo for each device in devicesServices.devices)
}
$injector.register("prdd", ProtonDeviceDiscovery);

class IOSDeviceDiscovery extends DeviceDiscovery {
	private static ADNCI_MSG_CONNECTED = 1;
	private static ADNCI_MSG_DISCONNECTED = 2;
	private static APPLE_SERVICE_NOT_STARTED_ERROR_CODE = 0xE8000063;

	private timerCallbackPtr: NodeBuffer = null;
	private notificationCallbackPtr: NodeBuffer = null;

	constructor(private $coreFoundation: Mobile.ICoreFoundation,
		private $mobileDevice: Mobile.IMobileDevice,
		private $errors: IErrors,
		private $injector: IInjector,
		private $options: ICommonOptions,
		private $utils: IUtils) {
		super();
		this.timerCallbackPtr = CoreTypes.CoreTypes.cf_run_loop_timer_callback.toPointer(IOSDeviceDiscovery.timerCallback);
		this.notificationCallbackPtr = CoreTypes.CoreTypes.am_device_notification_callback.toPointer(IOSDeviceDiscovery.deviceNotificationCallback);
	}

	public startLookingForDevices(): IFuture<void> {
		return (() => {
			this.subscribeForNotifications();
			let defaultTimeoutInSeconds = 1;
			let parsedTimeout =  this.$utils.getParsedTimeout(1);
			let timeout = parsedTimeout > defaultTimeoutInSeconds ? parsedTimeout/1000 : defaultTimeoutInSeconds;
			this.startRunLoopWithTimer(timeout);
			setInterval(() => this.startRunLoopWithTimer(timeout), 1000); // I think we should unref this as it will block CLI's execution and will hold the console.
		}).future<void>()();
	}

	private static deviceNotificationCallback(devicePointer?: NodeBuffer, user?: number) : any {
		let iOSDeviceDiscovery = $injector.resolve("iOSDeviceDiscovery");
		let deviceInfo = ref.deref(devicePointer);

		if(deviceInfo.msg === IOSDeviceDiscovery.ADNCI_MSG_CONNECTED) {
			iOSDeviceDiscovery.createAndAddDevice(deviceInfo.dev);
		}
		else if(deviceInfo.msg === IOSDeviceDiscovery.ADNCI_MSG_DISCONNECTED) {
			let deviceIdentifier = iOSDeviceDiscovery.$coreFoundation.convertCFStringToCString(iOSDeviceDiscovery.$mobileDevice.deviceCopyDeviceIdentifier(deviceInfo.dev));
			iOSDeviceDiscovery.removeDevice(deviceIdentifier);
		}
	}

	private static timerCallback(): void {
		let iOSDeviceDiscovery = $injector.resolve("iOSDeviceDiscovery");
		iOSDeviceDiscovery.$coreFoundation.runLoopStop(iOSDeviceDiscovery.$coreFoundation.runLoopGetCurrent());
	}

	private validateResult(result: number, error: string) {
		if(result !== 0)  {
			this.$errors.fail(error);
		}
	}

	private subscribeForNotifications() {
		let notifyFunction = ref.alloc(CoreTypes.CoreTypes.amDeviceNotificationRef);

		let result = this.$mobileDevice.deviceNotificationSubscribe(this.notificationCallbackPtr, 0, 0, 0, notifyFunction);
		let error = IOSDeviceDiscovery.APPLE_SERVICE_NOT_STARTED_ERROR_CODE ?
			"Cannot run and complete operations on iOS devices because Apple Mobile Device Service is not started. Verify that iTunes is installed and running on your system." : "Unable to subscribe for notifications";
		this.validateResult(result, error);
		this.$errors.verifyHeap("subscribeForNotifications");
	}

	private startRunLoopWithTimer(timeout: number): void {
		let kCFRunLoopDefaultMode = this.$coreFoundation.kCFRunLoopDefaultMode();
		let timer: NodeBuffer = null;

		if(timeout > 0) {
			let currentTime = this.$coreFoundation.absoluteTimeGetCurrent() + timeout;
			timer = this.$coreFoundation.runLoopTimerCreate(null, currentTime , 0, 0, 0, this.timerCallbackPtr, null);
			this.$coreFoundation.runLoopAddTimer(this.$coreFoundation.runLoopGetCurrent(), timer, kCFRunLoopDefaultMode);
		}

		this.$coreFoundation.runLoopRun();

		if(timeout > 0) {
			this.$coreFoundation.runLoopRemoveTimer(this.$coreFoundation.runLoopGetCurrent(), timer, kCFRunLoopDefaultMode);
		}

		this.$errors.verifyHeap("startRunLoopWithTimer");
	}

	/* tslint:disable:no-unused-variable */
	private createAndAddDevice(devicePointer: NodeBuffer): void {
		let device = this.$injector.resolve(IOSDevice.IOSDevice, {devicePointer: devicePointer});
		this.addDevice(device);
	}
	/* tslint:enable:no-unused-variable */
}
$injector.register("iOSDeviceDiscovery", IOSDeviceDiscovery);

class IOSDeviceDiscoveryStub extends DeviceDiscovery {
	constructor(private $logger: ILogger,
		private $staticConfig: Config.IStaticConfig,
		private $hostInfo: IHostInfo,
		private error: string) {
		super();
	}

	public startLookingForDevices(): IFuture<void> {
		if(this.error) {
			this.$logger.warn(this.error);
		} else if(this.$hostInfo.isLinux) {
			this.$logger.warn("In this version of the %s command-line interface, you cannot use connected iOS devices.", this.$staticConfig.CLIENT_NAME.toLowerCase());
		}
		
		return Future.fromResult();
	}
}

$injector.register("iOSDeviceDiscovery", ($errors: IErrors, $logger: ILogger, $fs: IFileSystem, $injector: IInjector, $iTunesValidator: Mobile.IiTunesValidator, $staticConfig: Config.IStaticConfig, $hostInfo: IHostInfo) => {
	let error = $iTunesValidator.getError().wait();
	let result: Mobile.IDeviceDiscovery = null;

	if(error || $hostInfo.isLinux) {
		result = new IOSDeviceDiscoveryStub($logger, $staticConfig, $hostInfo, error);
	} else {
		result = $injector.resolve(IOSDeviceDiscovery);
	}

	return result;
});

export class AndroidDeviceDiscovery extends DeviceDiscovery implements Mobile.IAndroidDeviceDiscovery {
	private _devices: string[] = [];

	constructor(private $childProcess: IChildProcess,
		private $injector: IInjector,
		private $staticConfig: Config.IStaticConfig) {
		super();
	}

	private createAndAddDevice(deviceIdentifier: string): void {
		this._devices.push(deviceIdentifier);
		let device = this.$injector.resolve(AndroidDevice.AndroidDevice, { identifier: deviceIdentifier });
		this.addDevice(device);
	}

	private deleteAndRemoveDevice(deviceIdentifier: string): void {
		_.remove(this._devices, d => d === deviceIdentifier);
		this.removeDevice(deviceIdentifier);
	}

	public startLookingForDevices(): IFuture<void> {
		return(()=> {
			let requestAllDevicesCommand = `"${this.$staticConfig.getAdbFilePath().wait()}" devices`;
			let result = this.$childProcess.exec(requestAllDevicesCommand).wait();

			let currentDevices = result.toString().split(os.EOL).slice(1)
				.filter( (element:string) => !helpers.isNullOrWhitespace(element) )
				.map((element: string) => {
					// http://developer.android.com/tools/help/adb.html#devicestatus
					let parts = element.split("\t");
					let identifier = parts[0];
					let state = parts[1];
					if (state === "device"/*ready*/) {
						return identifier;
					}
				});

			let oldDevices = _.difference(this._devices, currentDevices),
				newDevices = _.difference(currentDevices, this._devices);

			_.each(newDevices, d => this.createAndAddDevice(d));
			_.each(oldDevices, d => this.deleteAndRemoveDevice(d));
		}).future<void>()();
	}

	public ensureAdbServerStarted(): IFuture<void> {
		let startAdbServerCommand = `"${this.$staticConfig.getAdbFilePath().wait()}" start-server`;
		return this.$childProcess.exec(startAdbServerCommand);
	}
}
$injector.register("androidDeviceDiscovery", AndroidDeviceDiscovery);


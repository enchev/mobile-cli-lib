///<reference path="../../.d.ts"/>
"use strict";

require(process.argv[2]);
import * as fiberBootstrap from "../../fiber-bootstrap";

export class DeviceDetection {
	constructor(private $devicesService: Mobile.IDevicesService,
		private $iOSSimulatorDiscovery: Mobile.IDeviceDiscovery,
		private $iOSDeviceDiscovery: Mobile.IDeviceDiscovery,
		private $androidDeviceDiscovery: Mobile.IDeviceDiscovery) {
			this.attachToDeviceDiscoveryEvents();
			$devicesService.startDeviceDetectionInterval();
			console.log("Fork process should be started now.")
		}

	private attachToDeviceDiscoveryEvents(): void {
        console.log("ATTACH ", process.pid)
		this.$iOSSimulatorDiscovery.on("deviceFound", (device: Mobile.IDevice) => this.onDeviceFound(device));
		this.$iOSSimulatorDiscovery.on("deviceLost", (device: Mobile.IDevice) => this.onDeviceLost(device));

		this.$iOSDeviceDiscovery.on("deviceFound", (device: Mobile.IDevice) => this.onDeviceFound(device));
		this.$iOSDeviceDiscovery.on("deviceLost", (device: Mobile.IDevice) => this.onDeviceLost(device));

		this.$androidDeviceDiscovery.on("deviceFound", (device: Mobile.IDevice) => this.onDeviceFound(device));
		this.$androidDeviceDiscovery.on("deviceLost", (device: Mobile.IDevice) => this.onDeviceLost(device));
		console.log("ALL ATTACHED");
	}

	private onDeviceFound(device: Mobile.IDevice): void {
		console.log("IN THE CHILD, device is found.");
		let data = { "deviceFound": {
			"platform": device.deviceInfo.platform,
			"identifier": device.deviceInfo.identifier,
			"status": device.deviceInfo.status,
			"devicePointer": (<any>device).devicePointer
		}};

		process.send(data);
	}

	private onDeviceLost(device: Mobile.IDevice): void {
        console.log("-------------- device lost");
		process.send({"deviceLost": device.deviceInfo.identifier});
	}
}

// Create new instance so device detection will start working directly.
$injector.resolve(DeviceDetection);
setInterval(() => {}, 3000);

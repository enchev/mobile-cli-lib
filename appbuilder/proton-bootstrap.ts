///<reference path="../.d.ts"/>
"use strict";

require("../bootstrap");
$injector.require("messages", "./messages/messages");
// $injector.require("logger", "./appbuilder/proton-logger");

import {OptionsBase} from "../options";
$injector.require("staticConfig", "./appbuilder/proton-static-config");
export class MobilePlatformsCapabilities implements Mobile.IPlatformsCapabilities {
	private platformCapabilities: IDictionary<Mobile.IPlatformCapabilities>;

	constructor(private $errors: IErrors) { }

	public getPlatformNames(): string[]{
		return _.keys(this.getAllCapabilities());
	}

	public getAllCapabilities(): IDictionary<Mobile.IPlatformCapabilities> {
		this.platformCapabilities = this.platformCapabilities || {
			iOS: {
				wirelessDeploy: true,
				cableDeploy: true,
				companion: true,
				hostPlatformsForDeploy: ["win32", "darwin"]
			},
			Android: {
				wirelessDeploy: true,
				cableDeploy: true,
				companion: true,
				hostPlatformsForDeploy: ["win32", "darwin", "linux"]
			},
			WP8: {
				wirelessDeploy: true,
				cableDeploy: false,
				companion: true,
				hostPlatformsForDeploy: ["win32"]
			}
		};

		return this.platformCapabilities;
	}
}
$injector.register("mobilePlatformsCapabilities", MobilePlatformsCapabilities);

$injector.register("config", {});
// Proton will track the features and execptions, so no need of analyticsService here.
$injector.register("analyiticsService", {});
$injector.register("options", $injector.resolve(OptionsBase, {options: {}, defaultProfileDir: ""}));
$injector.requirePublicClass("deviceEmitter", "./appbuilder/device-emitter");
$injector.requirePublicClass("deviceLogProvider", "./appbuilder/device-log-provider");
import {installUncaughtExceptionListener} from "../errors";
installUncaughtExceptionListener();
// $injector.register("deviceAppDataProvider", {
// 	createFactoryRules(): IDictionary<Mobile.IDeviceAppDataFactoryRule> {
// 		return {
// 				Android: {
// 					vanilla: ""
// 				},
// 				iOS: {
// 					vanilla: ""
// 				},
// 				WP8: {
// 					vanilla: ""
// 				}
// 			};
// 		}
// 	}
// );

$injector.require("deviceAppDataProvider", "./appbuilder/device-app-data-provider");
$injector.requirePublic("liveSyncService", "./appbuilder/livesync-service");

// When debugging uncomment the lines below and comment the line #6 (requiring logger).
$injector.require("logger", "./logger");
$injector.resolve("logger").setLevel("TRACE");


export class EmulatorSettingsService implements Mobile.IEmulatorSettingsService {
	public canStart(platform: string): IFuture<boolean> {
		return (() => {
			return true;
		}).future<boolean>()();
	}

	public get minVersion(): number {
		return 10;
	}
}
$injector.register("emulatorSettingsService", EmulatorSettingsService);

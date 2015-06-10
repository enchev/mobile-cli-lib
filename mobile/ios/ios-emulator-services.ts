///<reference path="../../../.d.ts"/>
"use strict";

import util = require("util");
import Future = require("fibers/future");

class IosEmulatorServices implements Mobile.IiOSSimulatorService {
	constructor(private $logger: ILogger,
		private $emulatorSettingsService: Mobile.IEmulatorSettingsService,
		private $errors: IErrors,
		private $childProcess: IChildProcess,
		private $mobileHelper: Mobile.IMobileHelper,
		private $devicePlatformsConstants: Mobile.IDevicePlatformsConstants,
		private $hostInfo: IHostInfo,
		private $options: IOptions) { }

	public checkDependencies(): IFuture<void> {
		return (() => {
		}).future<void>()();
	}

	checkAvailability(dependsOnProject: boolean = true): IFuture<void> {
		return (() => {
			if(!this.$hostInfo.isDarwin) {
				this.$errors.fail("iOS Simulator is available only on Mac OS X.");
			}

			let platform = this.$devicePlatformsConstants.iOS;
			if(dependsOnProject && !this.$emulatorSettingsService.canStart(platform).wait()) {
				this.$errors.fail("The current project does not target iOS and cannot be run in the iOS Simulator.");
			}
		}).future<void>()();
	}

	startEmulator(app: string, emulatorOptions?: Mobile.IEmulatorOptions): IFuture<void> {
		return (() => {
			this.killLaunchdSim().wait();
			this.startEmulatorCore(app, emulatorOptions);
		}).future<void>()();
	}
	
	public getRunningEmulators(type?: Mobile.EmulatorType): IFuture<Mobile.IEmulatorDevice[]> {
		return (() => {
			let runningSimulatorsOutput: string;
			try {
				runningSimulatorsOutput = this.$childProcess.exec('xcrun simctl list | grep "(Booted)"').wait();
			} catch(err) {
				/*
				 SAMPLE OUTPUT:
				 bd-airtestmac:app1 blackdragon$ xcrun simctl list
				== Device Types ==
				iPhone 4s (com.apple.CoreSimulator.SimDeviceType.iPhone-4s)
				iPhone 5 (com.apple.CoreSimulator.SimDeviceType.iPhone-5)
				iPhone 5s (com.apple.CoreSimulator.SimDeviceType.iPhone-5s)
				iPhone 6 Plus (com.apple.CoreSimulator.SimDeviceType.iPhone-6-Plus)
				iPhone 6 (com.apple.CoreSimulator.SimDeviceType.iPhone-6)
				iPad 2 (com.apple.CoreSimulator.SimDeviceType.iPad-2)
				iPad Retina (com.apple.CoreSimulator.SimDeviceType.iPad-Retina)
				iPad Air (com.apple.CoreSimulator.SimDeviceType.iPad-Air)
				Resizable iPhone (com.apple.CoreSimulator.SimDeviceType.Resizable-iPhone)
				Resizable iPad (com.apple.CoreSimulator.SimDeviceType.Resizable-iPad)
				== Runtimes ==
				iOS 8.3 (8.3 - 12F69) (com.apple.CoreSimulator.SimRuntime.iOS-8-3)
				== Devices ==
				-- iOS 8.3 --
				    iPhone 4s (83919FC3-0C2C-4001-9B7B-759E45A6C1C9) (Shutdown)
				    iPhone 5 (BC40F50C-D754-4022-809D-98CB52B19904) (Shutdown)
				    iPhone 5s (42E06214-65FE-4D02-8E21-3F944136986D) (Shutdown)
				    iPhone 6 Plus (8E81836A-5B5F-4059-8B42-CB8B5390D25F) (Shutdown)
				    iPhone 6 (36BAC0E0-FBD2-4DE6-A4DE-0A5FF89BAAAD) (Booted)
				    iPad 2 (38A21EB4-F725-497B-B039-E44162C33619) (Shutdown)
				    iPad Retina (058444CD-16DF-40C7-9E46-673C68591E2F) (Shutdown)
				    iPad Air (6594770C-CDA6-4268-B9DD-1D8349B90E57) (Shutdown)
				    Resizable iPhone (89E952DA-F357-4BA2-9E5F-BF2BAC742AA8) (Shutdown)
				    Resizable iPad (58D862A5-CA07-4294-A7BB-3480743C988A) (Shutdown)
				 */
				if(err.code === 1) {
					// no matching line, return null
					return null;
				} else if (err.code > 1) {
					// real error was thrown
					throw err;
				}
			}

			// Sample output:
			//     iPhone 6 (36BAC0E0-FBD2-4DE6-A4DE-0A5FF89BAAAD) (Booted)
			let match = runningSimulatorsOutput.match(/\s+?(\w[\w\s]+?)\(/);
			if(match) {
				this.$logger.trace(`Running iOS Simulator found: ${runningSimulatorsOutput}`);
				let model = match[1].trim();
				return [{
					name: model,
					platform: Mobile.OperatingSystem.iOS,
					deviceType: model,
					targetSDK: "" // mystery
				}];
			}
			return null;
		}).future<Mobile.IEmulatorDevice[]>()();
	}

	public postDarwinNotification(notification: string): IFuture<void> {
		let iosSimPath = require.resolve("ios-sim-portable");
		let nodeCommandName = process.argv[0];

		let opts = [ "notify-post", notification ];

		if (this.$options.device) {
			opts.push("--device", this.$options.device);
		}

		return this.$childProcess.exec(`${nodeCommandName} ${iosSimPath} ${opts.join(' ')}`);
	}

	private killLaunchdSim(): IFuture<void> {
		this.$logger.info("Cleaning up before starting the iOS Simulator");

		let future = new Future<void>();
		let killAllProc = this.$childProcess.spawn("killall", ["launchd_sim"]);
		killAllProc.on("close", (code: number) => {
			future.return();
		});
		return future;
	}

	private startEmulatorCore(app: string, emulatorOptions?: Mobile.IEmulatorOptions): void {
		this.$logger.info("Starting iOS Simulator");
		let iosSimPath = require.resolve("ios-sim-portable");
		let nodeCommandName = process.argv[0];

		if(this.$options.availableDevices) {
			this.$childProcess.spawnFromEvent(nodeCommandName, [iosSimPath, "device-types"], "close", { stdio: "inherit" }).wait();
			return;
		}

		let opts = [
			iosSimPath,
			"launch", app,
			"--timeout", this.$options.timeout
		];

		if(!this.$options.justlaunch) {
			opts.push("--logging");
		} else {
			if(emulatorOptions) {
				if(emulatorOptions.stderrFilePath) {
					opts = opts.concat("--stderr", emulatorOptions.stderrFilePath);
				}
				if(emulatorOptions.stdoutFilePath) {
					opts = opts.concat("--stdout", emulatorOptions.stdoutFilePath);
				}
			}

			opts.push("--exit");
		}

		if(this.$options.device) {
			opts = opts.concat("--device", this.$options.device);
		}

		if(emulatorOptions && emulatorOptions.args) {
			opts.push(`--args=${emulatorOptions.args}`);
		}

		this.$childProcess.spawn(nodeCommandName, opts, { stdio: "inherit" });
	}
}
$injector.register("iOSEmulatorServices", IosEmulatorServices);
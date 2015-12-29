///<reference path="../.d.ts"/>
"use strict";

export class LogFilter implements Mobile.ILogFilter {
	private _loggingLevel: string = this.$loggingLevels.info;

	constructor(private $devicePlatformsConstants: Mobile.IDevicePlatformsConstants,
		private $injector: IInjector,
		private $loggingLevels: Mobile.ILoggingLevels) {}

	public get loggingLevel(): string {
		return this._loggingLevel;
	}

	public set loggingLevel(logLevel: string) {
		if(this.verifyLogLevel(logLevel)) {
			this._loggingLevel = logLevel;
		}
	}

	public filterData(platform: string, data: string, logLevel?: string): string {
		let deviceLogFilter = this.getDeviceLogFilterInstance(platform);
		if(deviceLogFilter) {
			return deviceLogFilter.filterData(data, logLevel || this.loggingLevel);
		}

		// In case the platform is not valid, just return the data without filtering.
		return data;
	}

	private getDeviceLogFilterInstance(platform: string): Mobile.IPlatformLogFilter {
		if(platform) {
			if(platform.toLowerCase() === this.$devicePlatformsConstants.iOS.toLowerCase()) {
				return this.$injector.resolve("iOSLogFilter");
			} else if(platform.toLowerCase() ===  this.$devicePlatformsConstants.Android.toLowerCase()) {
				return this.$injector.resolve("androidLogFilter");
			}
		}
		return null;
	}

	private verifyLogLevel(logLevel: string): boolean {
		let upperCaseLogLevel = (logLevel || '').toUpperCase();
		return upperCaseLogLevel === this.$loggingLevels.info.toUpperCase() || upperCaseLogLevel === this.$loggingLevels.full.toUpperCase();
	}

}
$injector.register("logFilter", LogFilter);

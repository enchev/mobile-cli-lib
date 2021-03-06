///<reference path="../../.d.ts"/>
"use strict";

import Future = require("fibers/future");

export abstract class AppBuilderLiveSyncProviderBase implements ILiveSyncProvider {
	constructor(private $androidLiveSyncServiceLocator: {factory: Function},
		private $iosLiveSyncServiceLocator: {factory: Function}) { }

	public get platformSpecificLiveSyncServices(): IDictionary<any> {
		return {
			android: (_device: Mobile.IDevice, $injector: IInjector): IPlatformLiveSyncService => {
				return $injector.resolve(this.$androidLiveSyncServiceLocator.factory, {_device: _device});
			},
			ios: (_device: Mobile.IDevice, $injector: IInjector) => {
				return $injector.resolve(this.$iosLiveSyncServiceLocator.factory, {_device: _device});
			}
		};
	}

	public abstract buildForDevice(device: Mobile.IDevice): IFuture<string>;

	public preparePlatformForSync(platform: string): IFuture<void> {
		return Future.fromResult();
	}

	public canExecuteFastSync(filePath: string): boolean {
		return false;
	}
}

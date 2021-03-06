///<reference path="../../.d.ts"/>
"use strict";

class LiveSyncCommands {
	public static DeployProjectCommand(liveSyncUrl: string): string {
		return `DeployProject ${liveSyncUrl} \r`;
	}

	public static ReloadStartViewCommand(): string {
		return "ReloadStartView \r";
	}

	public static SyncFilesCommand(): string {
		return "SyncFiles \r";
	}

	public static RefreshCurrentViewCommand(): string {
		return "RefreshCurrentView \r";
	}
}

export class AndroidLiveSyncService implements Mobile.IAndroidLiveSyncService {
	private static COMMANDS_FILE = "telerik.livesync.commands";
	private static LIVESYNC_BROADCAST_NAME = "com.telerik.LiveSync";

	constructor(protected device: Mobile.IAndroidDevice,
		protected $fs: IFileSystem,
		protected $mobileHelper: Mobile.IMobileHelper) { }

	public get liveSyncCommands(): any {
		return LiveSyncCommands;
	}

	public livesync(appIdentifier: string, liveSyncRoot: string, commands: string[]): IFuture<void> {
		return (() => {
			let commandsFileDevicePath = this.$mobileHelper.buildDevicePath(liveSyncRoot, AndroidLiveSyncService.COMMANDS_FILE);
			this.createCommandsFileOnDevice(commandsFileDevicePath, commands).wait();
			this.device.adb.sendBroadcastToDevice(AndroidLiveSyncService.LIVESYNC_BROADCAST_NAME, { "app-id": appIdentifier }).wait();
		}).future<void>()();
	}

	public createCommandsFileOnDevice(commandsFileDevicePath: string, commands: string[]): IFuture<void> {
		return this.device.fileSystem.createFileOnDevice(commandsFileDevicePath, commands.join("\n"));
	}
}

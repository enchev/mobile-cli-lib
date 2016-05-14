///<reference path="../.d.ts"/>
"use strict";

import * as path from "path";
import * as util from "util";
import {Configurations} from "../constants";

export abstract class ProjectFilesProviderBase implements IProjectFilesProvider {
	abstract isFileExcluded(filePath: string): boolean;
	abstract mapFilePath(filePath: string, platform: string): string;

	constructor(private $mobileHelper: Mobile.IMobileHelper,
		protected $options: ICommonOptions) {}

	public getPreparedFilePath(filePath: string): string {
		let projectFileInfo = this.getProjectFileInfo(filePath, "");
		return path.join(path.dirname(filePath), projectFileInfo.onDeviceFileName);
	}

	public getProjectFileInfo(filePath: string, platform: string, additionalConfigurations?: string[]): IProjectFileInfo {
		let parsed = this.parseFile(filePath, this.$mobileHelper.platformNames, platform || "");
		let basicConfigurations = [Configurations.Debug.toLowerCase(), Configurations.Release.toLowerCase()];
		if (!parsed) {
			parsed = this.parseFile(filePath, basicConfigurations.concat(additionalConfigurations || []), (this.$options.config && this.$options.config[0]) || basicConfigurations[0]);
		}

		return parsed || {
			filePath: filePath,
			onDeviceFileName: path.basename(filePath),
			shouldIncludeFile: true
		};
	}

	private parseFile(filePath: string, validValues: string[], value: string): IProjectFileInfo {
		let regex = util.format("^(.+?)[.](%s)([.].+?)$", validValues.join("|"));
		let parsed = filePath.match(new RegExp(regex, "i"));
		if (parsed) {
			return {
				filePath: filePath,
				onDeviceFileName: path.basename(parsed[1] + parsed[3]),
				shouldIncludeFile: parsed[2].toLowerCase() === value.toLowerCase()
			};
		}

		return null;
	}
}

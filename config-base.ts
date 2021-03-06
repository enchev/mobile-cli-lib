///<reference path=".d.ts"/>
"use strict";

import * as path from "path";

export class ConfigBase implements Config.IConfig {
	DISABLE_HOOKS: boolean = false;

	constructor(protected $fs: IFileSystem) { }

	protected loadConfig(name: string): IFuture<any> {
		let configFileName = this.getConfigPath(name);
		return this.$fs.readJson(configFileName);
	}

	protected getConfigPath(filename: string): string {
		return path.join(__dirname, "../../config/", filename + ".json");
	}
}

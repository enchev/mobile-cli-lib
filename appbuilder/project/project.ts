///<reference path="../../.d.ts"/>
"use strict";

debugger;
import {ProjectBase} from "./project-base";

export class Project extends ProjectBase {
	constructor(protected $cordovaProjectCapabilities: Project.ICapabilities,
		protected $errors: IErrors,
		protected $fs: IFileSystem,
		protected $logger: ILogger,
		protected $nativeScriptProjectCapabilities: Project.ICapabilities,
		protected $options: ICommonOptions,
		protected $projectConstants: Project.IConstants,
		protected $staticConfig: Config.IStaticConfig) {
			super($cordovaProjectCapabilities, $errors, $fs, $logger, $nativeScriptProjectCapabilities, $options, $projectConstants, $staticConfig);
		}

	protected validate(): void { }
	protected saveProjectIfNeeded(): void {}
}
$injector.register("project", Project);

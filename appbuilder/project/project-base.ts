///<reference path="../../.d.ts"/>
"use strict";

import {EOL} from "os";
import Future = require("fibers/future");
import * as path from "path";
export abstract class ProjectBase implements Project.IProjectBase {
	private static CONFIGURATION_FILE_SEARCH_PATTERN: RegExp = new RegExp(".*.abproject$", "i");
	private static VALID_CONFIGURATION_CHARACTERS_REGEX = "[-_A-Za-z0-9]";
	private static JSON_PROJECT_FILE_NAME_REGEX = "[.]abproject";
	private static CONFIGURATION_FROM_FILE_NAME_REGEX = new RegExp(`^[.](${ProjectBase.VALID_CONFIGURATION_CHARACTERS_REGEX}+?)${ProjectBase.JSON_PROJECT_FILE_NAME_REGEX}$`, "i");

	private _hasBuildConfigurations = false;
	protected _shouldSaveProject = false;
	protected _projectData: Project.IData;
	public configurationSpecificData: IDictionary<Project.IData>;

	constructor(protected $cordovaProjectCapabilities: Project.ICapabilities,
		protected $errors: IErrors,
		protected $fs: IFileSystem,
		protected $logger: ILogger,
		protected $nativeScriptProjectCapabilities: Project.ICapabilities,
		protected $options: ICommonOptions,
		protected $projectConstants: Project.IConstants,
		protected $staticConfig: Config.IStaticConfig) {

		}

	// This property is purposely written as two separate methods so that only get/set can be overriden
	protected getShouldSaveProject(): boolean {
		return this._shouldSaveProject;
	}

	protected setShouldSaveProject(shouldSaveProject: boolean) {
		this._shouldSaveProject = shouldSaveProject;
	}

	public get projectData(): Project.IData {
		this.readProjectData().wait();
		return this._projectData;
	}

	public set projectData(projectData: Project.IData) {
		this._projectData = projectData;
	}

	public projectDir: string;
	public getProjectDir(): IFuture<string> {
		return Future.fromResult(this.projectDir);
	}

	public get capabilities(): Project.ICapabilities {
		let projectData = this.projectData;
		if(projectData) {
			if(projectData.Framework && projectData.Framework.toLowerCase() === this.$projectConstants.TARGET_FRAMEWORK_IDENTIFIERS.NativeScript.toLowerCase()) {
				return this.$nativeScriptProjectCapabilities;
			} else if(projectData.Framework && projectData.Framework.toLowerCase() === this.$projectConstants.TARGET_FRAMEWORK_IDENTIFIERS.Cordova.toLowerCase()) {
				return this.$cordovaProjectCapabilities;
			}
		}

		return null;
	}

	public get hasBuildConfigurations(): boolean {
		return this._hasBuildConfigurations;
	}

	public get projectInformation(): Project.IProjectInformation {
		return {
			projectData: this.projectData,
			configurationSpecificData: this.configurationSpecificData,
			hasBuildConfigurations: this.hasBuildConfigurations,
			configurations: Object.keys(this.configurationSpecificData)
		};
	}

	protected abstract validate(): void;
	protected abstract saveProjectIfNeeded(): void;

	protected readProjectData(): IFuture<void> {
		return (() => {
			let projectDir = this.getProjectDir().wait();
			this.setShouldSaveProject(false);
			if(projectDir) {
				let projectFilePath = path.join(projectDir, this.$projectConstants.PROJECT_FILE);
				try {
					let data = this.$fs.readJson(projectFilePath).wait();
					if(data.projectVersion && data.projectVersion.toString() !== "1") {
						this.$errors.fail("FUTURE_PROJECT_VER");
					}

					if(!_.has(data, "Framework")) {
						if(_.has(data, "projectType")) {
							data["Framework"] = data["projectType"];
							delete data["projectType"];
						} else {
							data["Framework"] = this.$projectConstants.TARGET_FRAMEWORK_IDENTIFIERS.Cordova;
						}

						this.setShouldSaveProject(true);
					}

					this.projectData = data;

					debugger;
					this.validate();

					let debugProjectFile = path.join(projectDir, this.$projectConstants.DEBUG_PROJECT_FILE_NAME);
					if(this.$options.debug && !this.$fs.exists(debugProjectFile).wait()) {
						this.$fs.writeJson(debugProjectFile, {}).wait();
					}

					let releaseProjectFile = path.join(projectDir, this.$projectConstants.RELEASE_PROJECT_FILE_NAME);
					if(this.$options.release && !this.$fs.exists(releaseProjectFile).wait()) {
						this.$fs.writeJson(releaseProjectFile, {}).wait();
					}

					let allProjectFiles = this.$fs.enumerateFilesInDirectorySync(projectDir, (file: string, stat: IFsStats) => {
						return ProjectBase.CONFIGURATION_FILE_SEARCH_PATTERN.test(file);
					});

					_.each(allProjectFiles, (configProjectFile: string) => {
						let configMatch = path.basename(configProjectFile).match(ProjectBase.CONFIGURATION_FROM_FILE_NAME_REGEX);
						if(configMatch && configMatch.length > 1) {
							let configurationName = configMatch[1];
							let configProjectContent = this.$fs.readJson(configProjectFile).wait();
							this.configurationSpecificData[configurationName.toLowerCase()] = configProjectContent;
							this._hasBuildConfigurations = true;
						}
					});
				} catch(err) {
					if(err === "FUTURE_PROJECT_VER") {
						this.$errors.fail({
							formatStr: "This project is created by a newer version of AppBuilder. Upgrade AppBuilder CLI to work with it.",
							suppressCommandHelp: true
						});
					}
					this.$errors.fail({
						formatStr: "The project file %s is corrupted." + EOL +
						"Consider restoring an earlier version from your source control or backup." + EOL +
						"To create a new one with the default settings, delete this file and run $ appbuilder init hybrid." + EOL +
						"Additional technical information: %s",
						suppressCommandHelp: true
					},
						projectFilePath, err.toString());
				}

				this.saveProjectIfNeeded();
			}
		}).future<void>()();
	}
}

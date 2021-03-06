///<reference path="../.d.ts"/>
"use strict";

require("../bootstrap");
$injector.require("projectConstants", "./appbuilder/project-constants");
$injector.require("projectFilesProvider", "./appbuilder/providers/project-files-provider");
$injector.require("pathFilteringService", "./appbuilder/services/path-filtering");
$injector.require("androidLiveSyncServiceLocator", "./appbuilder/services/livesync/android-livesync-service");
$injector.require("iosLiveSyncServiceLocator", "./appbuilder/services/livesync/ios-livesync-service");
$injector.require("deviceAppDataProvider", "./appbuilder/providers/device-app-data-provider");
$injector.requirePublic("companionAppsService", "./appbuilder/services/livesync/companion-apps-service");
$injector.require("nativeScriptProjectCapabilities", "./appbuilder/project/nativescript-project-capabilities");
$injector.require("cordovaProjectCapabilities", "./appbuilder/project/cordova-project-capabilities");
$injector.require("mobilePlatformsCapabilities", "./appbuilder/mobile-platforms-capabilities");

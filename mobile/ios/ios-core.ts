///<reference path="../../../.d.ts"/>
"use strict";

import path = require("path");
import ref = require("ref");
import ffi = require("ffi");
import struct = require("ref-struct");
import bufferpack = require("bufferpack");
import plistlib = require("plistlib");
import plist = require("plist");
import helpers = require("../../helpers");
import hostInfo = require("../../host-info");
import net = require("net");
import util = require("util");
import Future = require("fibers/future");
import bplistParser = require("bplist-parser");

export class CoreTypes {
	public static pointerSize = ref.types.size_t.size;
	public static voidPtr = ref.refType(ref.types.void);
	public static intPtr = ref.refType(ref.types.int);
	public static uintPtr = ref.refType(ref.types.uint);
	public static charPtr = ref.refType(ref.types.char);
	public static ptrToVoidPtr = ref.refType(ref.refType(ref.types.void));
	public static uintType = ref.types.uint;
	public static uint32Type = ref.types.uint32;
	public static intType = ref.types.int;
	public static longType = ref.types.long;
	public static boolType = ref.types.bool;
	public static doubleType = ref.types.double;

	public static am_device_p = CoreTypes.voidPtr;
	public static cfDictionaryRef = CoreTypes.voidPtr;
	public static cfDataRef = CoreTypes.voidPtr;
	public static cfStringRef = CoreTypes.voidPtr;
	public static afcConnectionRef = CoreTypes.voidPtr;
	public static afcFileRef = ref.types.uint64;
	public static afcDirectoryRef = CoreTypes.voidPtr;
	public static afcError = ref.types.uint32;
	public static amDeviceRef = CoreTypes.voidPtr;
	public static amDeviceNotificationRef = CoreTypes.voidPtr;
	public static cfTimeInterval = ref.types.double;
	public static kCFPropertyListXMLFormat_v1_0 = 100;
	public static kCFPropertyListBinaryFormat_v1_0 = 200;
	public static kCFPropertyListImmutable = 0;

	public static am_device_notification = struct({
		unknown0: ref.types.uint32,
		unknown1: ref.types.uint32,
		unknown2: ref.types.uint32,
		callback: CoreTypes.voidPtr,
		cookie: ref.types.uint32
	});

	public static am_device_notification_callback_info = struct({
		dev: CoreTypes.am_device_p,
		msg: ref.types.uint,
		subscription: ref.refType(CoreTypes.am_device_notification)
	});

	public static am_device_notification_callback = ffi.Function("void", [ref.refType(CoreTypes.am_device_notification_callback_info), CoreTypes.voidPtr]);
	public static am_device_install_application_callback = ffi.Function("void", [CoreTypes.cfDictionaryRef, CoreTypes.voidPtr]);
	public static am_device_mount_image_callback = ffi.Function("void", [CoreTypes.voidPtr, CoreTypes.intType]);
	public static cf_run_loop_timer_callback = ffi.Function("void", [CoreTypes.voidPtr, CoreTypes.voidPtr]);
}

class IOSCore implements Mobile.IiOSCore {

	constructor(private $logger: ILogger,
		private $fs: IFileSystem,
		private $errors: IErrors) { }

	private cfDictionaryKeyCallBacks = struct({
		version: CoreTypes.uintType,
		retain: CoreTypes.voidPtr,
		release: CoreTypes.voidPtr,
		copyDescription: CoreTypes.voidPtr,
		equal: CoreTypes.voidPtr,
		hash: CoreTypes.voidPtr
	});

	private cfDictionaryValueCallBacks = struct({
		version: CoreTypes.uintType,
		retain: CoreTypes.voidPtr,
		release: CoreTypes.voidPtr,
		copyDescription: CoreTypes.voidPtr,
		equal: CoreTypes.voidPtr
	});

	public static kCFStringEncodingUTF8 = 0x08000100;

	private get CoreFoundationDir(): string {
		if(hostInfo.isWindows()) {
			return path.join(this.CommonProgramFilesPath, "Apple", "Apple Application Support");
		} else if(hostInfo.isDarwin()) {
			return "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";
		}

		return null;
	}

	private get MobileDeviceDir(): string {
		if(hostInfo.isWindows()) {
			return path.join(this.CommonProgramFilesPath, "Apple", "Mobile Device Support");
		} else if(hostInfo.isDarwin()) {
			return "/System/Library/PrivateFrameworks/MobileDevice.framework/MobileDevice";
		}

		return null;
	}

	private get CommonProgramFilesPath(): string {
		return process.env.CommonProgramFiles;
	}

	private is32BitProcess(): boolean {
		return ref.types.size_t.size === 4;
	}

	private getForeignPointer(lib: ffi.DynamicLibrary, name: string, type: ref.Type): NodeBuffer {
		var pointer = lib.get(name);
		pointer.type = ref.refType(type);
		return pointer;
	}

	public getCoreFoundationLibrary(): {[key: string]: any} {
		if(hostInfo.isWindows()) {
			process.env.PATH = this.CoreFoundationDir + ";" + process.env.PATH;
			process.env.PATH += ";" + this.MobileDeviceDir;
		}

		var coreFoundationDll = hostInfo.isWindows() ?  path.join(this.CoreFoundationDir, "CoreFoundation.dll") : this.CoreFoundationDir;
		var lib = ffi.DynamicLibrary(coreFoundationDll);

		return {
			"CFRunLoopRun": ffi.ForeignFunction(lib.get("CFRunLoopRun"), "void", []),
			"CFRunLoopStop": ffi.ForeignFunction(lib.get("CFRunLoopStop"), "void", [CoreTypes.voidPtr]),
			"CFRunLoopGetCurrent": ffi.ForeignFunction(lib.get("CFRunLoopGetCurrent"), CoreTypes.voidPtr, []),
			"CFStringCreateWithCString": ffi.ForeignFunction(lib.get("CFStringCreateWithCString"), CoreTypes.cfStringRef, [CoreTypes.voidPtr, "string", "uint"]),
			"CFDictionaryGetValue": ffi.ForeignFunction(lib.get("CFDictionaryGetValue"), CoreTypes.voidPtr, [CoreTypes.cfDictionaryRef, CoreTypes.cfStringRef]),
			"CFNumberGetValue": ffi.ForeignFunction(lib.get("CFNumberGetValue"), CoreTypes.boolType, [CoreTypes.voidPtr, "uint", CoreTypes.voidPtr]),
			"CFStringGetCStringPtr": ffi.ForeignFunction(lib.get("CFStringGetCStringPtr"), CoreTypes.charPtr, [CoreTypes.cfStringRef, "uint"]),
			"CFStringGetCString": ffi.ForeignFunction(lib.get("CFStringGetCString"), CoreTypes.boolType, [CoreTypes.cfStringRef, CoreTypes.charPtr, "uint", "uint"]),
			"CFStringGetLength":  ffi.ForeignFunction(lib.get("CFStringGetLength"), "ulong", [CoreTypes.cfStringRef]),
			"CFDictionaryGetCount": ffi.ForeignFunction(lib.get("CFDictionaryGetCount"), CoreTypes.intType, [CoreTypes.cfDictionaryRef]),
			"CFDictionaryGetKeysAndValues": ffi.ForeignFunction(lib.get("CFDictionaryGetKeysAndValues"), "void", [CoreTypes.cfDictionaryRef, CoreTypes.ptrToVoidPtr, CoreTypes.ptrToVoidPtr]),
			"CFDictionaryCreate": ffi.ForeignFunction(lib.get("CFDictionaryCreate"), CoreTypes.cfDictionaryRef, [CoreTypes.voidPtr, CoreTypes.ptrToVoidPtr, CoreTypes.ptrToVoidPtr, "int", ref.refType(this.cfDictionaryKeyCallBacks), ref.refType(this.cfDictionaryValueCallBacks)]),
			"kCFTypeDictionaryKeyCallBacks": lib.get("kCFTypeDictionaryKeyCallBacks"),
			"kCFTypeDictionaryValueCallBacks": lib.get("kCFTypeDictionaryValueCallBacks"),
			"CFRunLoopRunInMode": ffi.ForeignFunction(lib.get("CFRunLoopRunInMode"),CoreTypes.intType, [CoreTypes.cfStringRef, CoreTypes.cfTimeInterval, CoreTypes.boolType]),
			"kCFRunLoopDefaultMode": this.getForeignPointer(lib, "kCFRunLoopDefaultMode", ref.types.void),
			"kCFRunLoopCommonModes": this.getForeignPointer(lib, "kCFRunLoopCommonModes", ref.types.void),
			"CFRunLoopTimerCreate": ffi.ForeignFunction(lib.get("CFRunLoopTimerCreate"), CoreTypes.voidPtr, [CoreTypes.voidPtr, CoreTypes.doubleType, CoreTypes.doubleType, CoreTypes.uintType, CoreTypes.uintType, CoreTypes.cf_run_loop_timer_callback, CoreTypes.voidPtr]),
			"CFRunLoopAddTimer": ffi.ForeignFunction(lib.get("CFRunLoopAddTimer"), "void", [CoreTypes.voidPtr, CoreTypes.voidPtr, CoreTypes.cfStringRef]),
			"CFRunLoopRemoveTimer": ffi.ForeignFunction(lib.get("CFRunLoopRemoveTimer"), "void", [CoreTypes.voidPtr, CoreTypes.voidPtr, CoreTypes.cfStringRef]),
			"CFAbsoluteTimeGetCurrent": ffi.ForeignFunction(lib.get("CFAbsoluteTimeGetCurrent"), CoreTypes.doubleType, []),
			"CFPropertyListCreateData": ffi.ForeignFunction(lib.get("CFPropertyListCreateData"), CoreTypes.voidPtr, [CoreTypes.voidPtr, CoreTypes.voidPtr, ref.types.long, ref.types.ulong, CoreTypes.voidPtr]),
			"CFPropertyListCreateWithData": ffi.ForeignFunction(lib.get("CFPropertyListCreateWithData"), CoreTypes.voidPtr, [CoreTypes.voidPtr, CoreTypes.voidPtr, ref.types.ulong, ref.refType(ref.types.long), CoreTypes.voidPtr]),
			"CFGetTypeID": ffi.ForeignFunction(lib.get("CFGetTypeID"), ref.types.long, [CoreTypes.voidPtr]),
			"CFStringGetTypeID": ffi.ForeignFunction(lib.get("CFStringGetTypeID"), ref.types.long, []),
			"CFDictionaryGetTypeID": ffi.ForeignFunction(lib.get("CFDictionaryGetTypeID"), ref.types.long, []),
			"CFDataGetTypeID": ffi.ForeignFunction(lib.get("CFDataGetTypeID"), ref.types.long, []),
			"CFNumberGetTypeID": ffi.ForeignFunction(lib.get("CFNumberGetTypeID"), ref.types.long, []),
			"CFBooleanGetTypeID": ffi.ForeignFunction(lib.get("CFBooleanGetTypeID"), ref.types.long, []),
			"CFArrayGetTypeID": ffi.ForeignFunction(lib.get("CFArrayGetTypeID"), ref.types.long, []),
			"CFDateGetTypeID": ffi.ForeignFunction(lib.get("CFDateGetTypeID"), ref.types.long, []),
			"CFSetGetTypeID": ffi.ForeignFunction(lib.get("CFSetGetTypeID"), ref.types.long, []),
			"CFDataGetBytePtr": ffi.ForeignFunction(lib.get("CFDataGetBytePtr"), ref.refType(ref.types.uint8), [CoreTypes.voidPtr]),
			"CFDataGetLength": ffi.ForeignFunction(lib.get("CFDataGetLength"), ref.types.long, [CoreTypes.voidPtr]),
			"CFDataCreate": ffi.ForeignFunction(lib.get("CFDataCreate"), CoreTypes.voidPtr, [CoreTypes.voidPtr, CoreTypes.voidPtr, ref.types.long]),
			"CFStringGetMaximumSizeForEncoding": ffi.ForeignFunction(lib.get("CFStringGetMaximumSizeForEncoding"), CoreTypes.intType, [CoreTypes.intType, CoreTypes.uint32Type])
		};
	}

	public getMobileDeviceLibrary(): {[key: string]: any} {
		var mobileDeviceDll = hostInfo.isWindows() ? path.join(this.MobileDeviceDir, "MobileDevice.dll") : this.MobileDeviceDir;
		var lib = ffi.DynamicLibrary(mobileDeviceDll);

		return {
			"AMDeviceNotificationSubscribe": ffi.ForeignFunction(lib.get("AMDeviceNotificationSubscribe"), "uint", [CoreTypes.am_device_notification_callback, "uint", "uint", "uint", CoreTypes.ptrToVoidPtr]),
			"AMDeviceConnect": ffi.ForeignFunction(lib.get("AMDeviceConnect"), "uint", [CoreTypes.am_device_p]),
			"AMDeviceIsPaired": ffi.ForeignFunction(lib.get("AMDeviceIsPaired"), "uint", [CoreTypes.am_device_p]),
			"AMDevicePair": ffi.ForeignFunction(lib.get("AMDevicePair"), "uint", [CoreTypes.am_device_p]),
			"AMDeviceValidatePairing": ffi.ForeignFunction(lib.get("AMDeviceValidatePairing"), "uint", [CoreTypes.am_device_p]),
			"AMDeviceStartSession": ffi.ForeignFunction(lib.get("AMDeviceStartSession"), "uint", [CoreTypes.am_device_p]),
			"AMDeviceStopSession": ffi.ForeignFunction(lib.get("AMDeviceStopSession"), "uint", [CoreTypes.am_device_p]),
			"AMDeviceDisconnect": ffi.ForeignFunction(lib.get("AMDeviceDisconnect"), "uint", [CoreTypes.am_device_p]),
			"AMDeviceStartService": ffi.ForeignFunction(lib.get("AMDeviceStartService"), "uint", [CoreTypes.am_device_p, CoreTypes.cfStringRef, CoreTypes.intPtr, CoreTypes.voidPtr]),
			"AMDeviceTransferApplication": ffi.ForeignFunction(lib.get("AMDeviceTransferApplication"), "uint", ["int", CoreTypes.cfStringRef, CoreTypes.cfDictionaryRef, CoreTypes.am_device_install_application_callback, CoreTypes.voidPtr]),
			"AMDeviceInstallApplication": ffi.ForeignFunction(lib.get("AMDeviceInstallApplication"), "uint", ["int", CoreTypes.cfStringRef, CoreTypes.cfDictionaryRef, CoreTypes.am_device_install_application_callback, CoreTypes.voidPtr]),
			"AMDeviceLookupApplications": ffi.ForeignFunction(lib.get("AMDeviceLookupApplications"), CoreTypes.uintType, [CoreTypes.am_device_p, CoreTypes.uintType, ref.refType(CoreTypes.cfDictionaryRef)]),
			"AMDeviceUninstallApplication": ffi.ForeignFunction(lib.get("AMDeviceUninstallApplication"), "uint", ["int", CoreTypes.cfStringRef, CoreTypes.cfDictionaryRef, CoreTypes.am_device_install_application_callback, CoreTypes.voidPtr]),
			"AFCConnectionOpen": ffi.ForeignFunction(lib.get("AFCConnectionOpen"), "uint", ["int", "uint", ref.refType(CoreTypes.afcConnectionRef)]),
			"AFCConnectionClose": ffi.ForeignFunction(lib.get("AFCConnectionClose"), "uint", [CoreTypes.afcConnectionRef]),
			"AFCDirectoryCreate": ffi.ForeignFunction(lib.get("AFCDirectoryCreate"), "uint", [CoreTypes.afcConnectionRef, "string"]),
			"AFCFileRefOpen": (hostInfo.isDarwin() || process.arch === "x64") ? ffi.ForeignFunction(lib.get("AFCFileRefOpen"), "uint", [CoreTypes.afcConnectionRef, "string", "uint", ref.refType(CoreTypes.afcFileRef)]) : ffi.ForeignFunction(lib.get("AFCFileRefOpen"), "uint", [CoreTypes.afcConnectionRef, "string", "uint", "uint", ref.refType(CoreTypes.afcFileRef)]),
			"AFCFileRefClose": ffi.ForeignFunction(lib.get("AFCFileRefClose"), "uint", [CoreTypes.afcConnectionRef, CoreTypes.afcFileRef]),
			"AFCFileRefWrite": ffi.ForeignFunction(lib.get("AFCFileRefWrite"), "uint", [CoreTypes.afcConnectionRef, CoreTypes.afcFileRef, CoreTypes.voidPtr, "uint"]),
			"AFCFileRefRead": ffi.ForeignFunction(lib.get("AFCFileRefRead"), "uint", [CoreTypes.afcConnectionRef, CoreTypes.afcFileRef, CoreTypes.voidPtr, CoreTypes.uintPtr]),
			"AFCRemovePath": ffi.ForeignFunction(lib.get("AFCRemovePath"), "uint", [CoreTypes.afcConnectionRef,  "string"]),
			"AFCDirectoryOpen": ffi.ForeignFunction(lib.get("AFCDirectoryOpen"), CoreTypes.afcError, [CoreTypes.afcConnectionRef, "string", ref.refType(CoreTypes.afcDirectoryRef)]),
			"AFCDirectoryRead": ffi.ForeignFunction(lib.get("AFCDirectoryRead"), CoreTypes.afcError, [CoreTypes.afcConnectionRef, CoreTypes.afcDirectoryRef, ref.refType(CoreTypes.charPtr)]),
			"AFCDirectoryClose": ffi.ForeignFunction(lib.get("AFCDirectoryClose"), CoreTypes.afcError, [CoreTypes.afcConnectionRef, CoreTypes.afcDirectoryRef]),
			"AMDeviceCopyDeviceIdentifier": ffi.ForeignFunction(lib.get("AMDeviceCopyDeviceIdentifier"), CoreTypes.cfStringRef, [CoreTypes.am_device_p]),
			"AMDeviceCopyValue": ffi.ForeignFunction(lib.get("AMDeviceCopyValue"), CoreTypes.cfStringRef, [CoreTypes.am_device_p, CoreTypes.cfStringRef, CoreTypes.cfStringRef]),
			"AMDeviceNotificationUnsubscribe": ffi.ForeignFunction(lib.get("AMDeviceNotificationUnsubscribe"), CoreTypes.intType, [CoreTypes.amDeviceNotificationRef]),
			"AMDeviceMountImage": hostInfo.isDarwin() ? ffi.ForeignFunction(lib.get("AMDeviceMountImage"), CoreTypes.uintType, [CoreTypes.am_device_p, CoreTypes.cfStringRef, CoreTypes.cfDictionaryRef, CoreTypes.am_device_mount_image_callback, CoreTypes.voidPtr]) : null,
			"AMDSetLogLevel": ffi.ForeignFunction(lib.get("AMDSetLogLevel"), CoreTypes.intType, [CoreTypes.intType]),
			"AMDeviceGetInterfaceType": ffi.ForeignFunction(lib.get("AMDeviceGetInterfaceType"), CoreTypes.longType, [CoreTypes.am_device_p]),
			"AMDeviceGetConnectionID": ffi.ForeignFunction(lib.get("AMDeviceGetConnectionID"), CoreTypes.longType, [CoreTypes.am_device_p]),
			"USBMuxConnectByPort": ffi.ForeignFunction(lib.get("USBMuxConnectByPort"), CoreTypes.intType, [CoreTypes.intType, CoreTypes.intType, CoreTypes.intPtr])
		};
	}

	public static getWinSocketLibrary(): {[key: string]: any} {
		var winSocketDll = path.join(process.env.SystemRoot, "System32", "ws2_32.dll");

		return ffi.Library(winSocketDll, {
			"closesocket": ["int", ["uint"]],
			"recv": ["int", ["uint", CoreTypes.charPtr, "int", "int"]],
			"send": ["int", ["uint", CoreTypes.charPtr, "int", "int"]],
			"setsockopt": ["int", ["uint", "int", "int", CoreTypes.voidPtr, "int"]],
			"WSAGetLastError": ["int", []]
		});
	}
}
$injector.register("iOSCore", IOSCore);

export class CoreFoundation implements  Mobile.ICoreFoundation {
	private coreFoundationLibrary: any;

	constructor($iOSCore: Mobile.IiOSCore,
		private $errors: IErrors){
		this.coreFoundationLibrary = $iOSCore.getCoreFoundationLibrary();
	}

	public stringGetMaximumSizeForEncoding(len: number, encoding: number): number {
		return this.coreFoundationLibrary.CFStringGetMaximumSizeForEncoding(len, encoding);
	}

	public runLoopRun(): void {
		this.coreFoundationLibrary.CFRunLoopRun();
	}

	public runLoopGetCurrent(): any {
		return this.coreFoundationLibrary.CFRunLoopGetCurrent();
	}

	public kCFRunLoopCommonModes(): NodeBuffer {
		return this.coreFoundationLibrary.kCFRunLoopCommonModes.deref();
	}

	public kCFRunLoopDefaultMode(): NodeBuffer {
		return this.coreFoundationLibrary.kCFRunLoopDefaultMode.deref();
	}

	public kCFTypeDictionaryValueCallBacks(): NodeBuffer {
		return this.coreFoundationLibrary.kCFTypeDictionaryValueCallBacks;
	}

	public kCFTypeDictionaryKeyCallBacks(): NodeBuffer {
		return this.coreFoundationLibrary.kCFTypeDictionaryKeyCallBacks;
	}

	public runLoopTimerCreate(allocator: NodeBuffer, fireDate: number, interval: number, flags: number, order: number, callout: NodeBuffer, context: any): NodeBuffer {
		return this.coreFoundationLibrary.CFRunLoopTimerCreate(allocator, fireDate, interval, flags, order, callout, context);
	}

	public absoluteTimeGetCurrent(): number {
		return this.coreFoundationLibrary.CFAbsoluteTimeGetCurrent();
	}

	public runLoopAddTimer(r1: NodeBuffer, timer: NodeBuffer, mode: NodeBuffer): void {
		this.coreFoundationLibrary.CFRunLoopAddTimer(r1, timer, mode);
	}

	public runLoopRemoveTimer(r1: NodeBuffer, timer: NodeBuffer, mode: NodeBuffer): void {
		this.coreFoundationLibrary.CFRunLoopRemoveTimer(r1,  timer, mode);
	}

	public runLoopStop(r1: any): void {
		this.coreFoundationLibrary.CFRunLoopStop(r1);
	}

	public stringGetCStringPtr(theString: NodeBuffer, encoding: number): any {
		return this.coreFoundationLibrary.CFStringGetCStringPtr(theString, encoding);
	}

	public stringGetLength(theString: NodeBuffer): number {
		return this.coreFoundationLibrary.CFStringGetLength(theString);
	}

	public stringGetCString(theString: NodeBuffer, buffer: any, bufferSize: number, encoding: number): boolean {
		return this.coreFoundationLibrary.CFStringGetCString(theString, buffer, bufferSize, encoding);
	}

	public stringCreateWithCString(alloc: NodeBuffer, str: string, encoding: number): NodeBuffer {
		return this.coreFoundationLibrary.CFStringCreateWithCString(alloc, str, encoding);
	}

	public createCFString(str: string): NodeBuffer {
		return this.stringCreateWithCString(null, str, IOSCore.kCFStringEncodingUTF8 );
	}

	public dictionaryCreate(allocator: NodeBuffer, keys: NodeBuffer, values: NodeBuffer, count: number, dictionaryKeyCallbacks: NodeBuffer, dictionaryValueCallbacks: NodeBuffer): NodeBuffer {
		return this.coreFoundationLibrary.CFDictionaryCreate(allocator, keys, values, count, dictionaryKeyCallbacks, dictionaryValueCallbacks);
	}

	public dictionaryGetValue(theDict: NodeBuffer, value: NodeBuffer): NodeBuffer {
		return this.coreFoundationLibrary.CFDictionaryGetValue(theDict, value);
	}

	public dictionaryGetCount(theDict: NodeBuffer): number {
		return this.coreFoundationLibrary.CFDictionaryGetCount(theDict);
	}

	public dictionaryGetKeysAndValues(dictionary: NodeBuffer, keys: NodeBuffer, values: NodeBuffer): void {
		this.coreFoundationLibrary.CFDictionaryGetKeysAndValues(dictionary, keys, values);
	}

	public dictionaryGetTypeID(): number {
		return this.coreFoundationLibrary.CFDictionaryGetTypeID();
	}

	public numberGetValue(num: NodeBuffer, theType: number, valuePtr: NodeBuffer): boolean {
		return this.coreFoundationLibrary.CFNumberGetValue(num, theType, valuePtr);
	}

	public getTypeID(buffer: NodeBuffer): number {
		return this.coreFoundationLibrary.CFGetTypeID(buffer);
	}

	public propertyListCreateData(allocator: NodeBuffer, propertyListRef: NodeBuffer , propertyListFormat: number, optionFlags: number, error: NodeBuffer): NodeBuffer {
		return this.coreFoundationLibrary.CFPropertyListCreateData(allocator, propertyListRef, propertyListFormat, optionFlags, error);
	}

	public propertyListCreateWithData(allocator: NodeBuffer, propertyList: NodeBuffer, optionFlags: number, propertyListFormat: NodeBuffer, error: NodeBuffer): NodeBuffer {
		return this.coreFoundationLibrary.CFPropertyListCreateWithData(allocator, propertyList, optionFlags, propertyListFormat, error);
	}

	public stringGetTypeID(): number {
		return this.coreFoundationLibrary.CFStringGetTypeID();
	}

	public dataGetTypeID():  number {
		return this.coreFoundationLibrary.CFDataGetTypeID();
	}

	public numberGetTypeID(): number {
		return this.coreFoundationLibrary.CFNumberGetTypeID();
	}

	public booleanGetTypeID(): number {
		return this.coreFoundationLibrary.CFBooleanGetTypeID();
	}

	public arrayGetTypeID(): number {
		return this.coreFoundationLibrary.CFArrayGetTypeID();
	}

	public dateGetTypeID(): number {
		return this.coreFoundationLibrary.CFDateGetTypeID();
	}

	public setGetTypeID(): number {
		return this.coreFoundationLibrary.CFSetGetTypeID();
	}

	public dataGetBytePtr(buffer: NodeBuffer): NodeBuffer {
		return this.coreFoundationLibrary.CFDataGetBytePtr(buffer);
	}

	public dataGetLength(buffer: NodeBuffer): number {
		return this.coreFoundationLibrary.CFDataGetLength(buffer);
	}

	public dataCreate(allocator: NodeBuffer, data: NodeBuffer, length: number) {
		return this.coreFoundationLibrary.CFDataCreate(allocator, data, length);
	}

	public convertCFStringToCString(cfstr: NodeBuffer): string {
		var result: string;
		if (cfstr != null) {
			var rawData = this.stringGetCStringPtr(cfstr, IOSCore.kCFStringEncodingUTF8);
			if (ref.address(rawData) === 0) {
				var cfstrLength = this.stringGetLength(cfstr);
				var length = cfstrLength + 1;
				var stringBuffer = new Buffer(length);
				var status = this.stringGetCString(cfstr, stringBuffer, length, IOSCore.kCFStringEncodingUTF8 );
				if (status) {
					result = stringBuffer.toString("utf8", 0, cfstrLength);
				} else {
				}
			} else {
				result = ref.readCString(rawData, 0);
			}
		}

		return result;
	}

	public cfTypeFrom(value: IDictionary<any>): NodeBuffer {
		var keys = _.keys(value);
		var values = _.values(value);

		var len = keys.length;
		var keysBuffer = new Buffer(CoreTypes.pointerSize * len);
		var valuesBuffer = new Buffer(CoreTypes.pointerSize * len);

		var offset = 0;

		for(var i=0; i< len; i++) {
			var cfKey = this.createCFString(keys[i]);
			var cfValue: any;

			if(typeof values[i] === "string") {
				cfValue = this.createCFString(values[i]);
			} else if(values[i] instanceof Buffer) {
				cfValue = this.dataCreate(null, values[i], values[i].length);
			} else {
				cfValue = this.cfTypeFrom(values[i]);
			}

			ref.writePointer(keysBuffer, offset, cfKey);
			ref.writePointer(valuesBuffer, offset, cfValue);
			offset += CoreTypes.pointerSize;
		}

		return this.dictionaryCreate(null, keysBuffer, valuesBuffer, len, this.kCFTypeDictionaryKeyCallBacks(), this.kCFTypeDictionaryValueCallBacks());
	}

	public cfTypeTo(dataRef: NodeBuffer): any {
		var typeId = this.getTypeID(dataRef);

		if(typeId === this.stringGetTypeID()) {
			return this.convertCFStringToCString(dataRef);
		} else if(typeId === this.dataGetTypeID()) {
			var len = this.dataGetLength(dataRef);
			var retval = ref.reinterpret(this.dataGetBytePtr(dataRef), len);
			return retval;
		} else if(typeId === this.dictionaryGetTypeID()) {
			var count = this.dictionaryGetCount(dataRef);

			var keys = new Buffer(count * CoreTypes.pointerSize);
			var values = new Buffer(count * CoreTypes.pointerSize);
			this.dictionaryGetKeysAndValues(dataRef, keys, values);

			var jsDictionary = Object.create(null);
			var offset = 0;

			for(var i=0; i<count; i++) {
				var keyPointer = ref.readPointer(keys, offset, CoreTypes.pointerSize);
				var valuePointer = ref.readPointer(values, offset, CoreTypes.pointerSize);
				offset += CoreTypes.pointerSize;

				var jsKey = this.cfTypeTo(keyPointer);
				var jsValue = this.cfTypeTo(valuePointer);
				jsDictionary[jsKey] = jsValue;
			}

			return jsDictionary;
		} else { // We don't need it for now
			return "";
		}
	}

	public dictToPlistEncoding(dict: {[key: string]: {}}, format: number): NodeBuffer {

		var cfDict = this.cfTypeFrom(dict);
		var cfData = this.propertyListCreateData(null, cfDict, format, 0, null);

		return this.cfTypeTo(cfData);
	}

	public dictFromPlistEncoding(str: NodeBuffer): NodeBuffer {
		var retval: NodeBuffer = null;

		var cfData = this.dataCreate(null, str, str.length);
		if(cfData) {
			var cfDict = this.propertyListCreateWithData(null, cfData, CoreTypes.kCFPropertyListImmutable, null, null);
			if(cfDict) {
				retval = this.cfTypeTo(cfDict);
			}
		}

		return retval;
	}
}
$injector.register("coreFoundation", CoreFoundation);

export class MobileDevice implements Mobile.IMobileDevice {
	private mobileDeviceLibrary: any;

	constructor($iOSCore: Mobile.IiOSCore,
		private $errors: IErrors) {
		this.mobileDeviceLibrary = $iOSCore.getMobileDeviceLibrary();
	}

	public deviceNotificationSubscribe(notificationCallback: NodeBuffer, p1: number, p2: number, p3: number, callbackSignature: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceNotificationSubscribe(notificationCallback, p1, p2, p3, callbackSignature);
	}

	public deviceCopyDeviceIdentifier(devicePointer: NodeBuffer): NodeBuffer {
		return this.mobileDeviceLibrary.AMDeviceCopyDeviceIdentifier(devicePointer);
	}

	public deviceCopyValue(devicePointer: NodeBuffer, domain: NodeBuffer, name: NodeBuffer): NodeBuffer {
		return this.mobileDeviceLibrary.AMDeviceCopyValue(devicePointer, domain, name);
	}

	public deviceConnect(devicePointer: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceConnect(devicePointer);
	}

	public deviceIsPaired(devicePointer: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceIsPaired(devicePointer);
	}

	public devicePair(devicePointer: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDevicePair(devicePointer);
	}

	public deviceValidatePairing(devicePointer: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceValidatePairing(devicePointer);
	}

	public deviceStartSession(devicePointer: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceStartSession(devicePointer);
	}

	public deviceStopSession(devicePointer: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceStopSession(devicePointer);
	}

	public deviceDisconnect(devicePointer: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceDisconnect(devicePointer);
	}

	public deviceStartService(devicePointer: NodeBuffer, serviceName: NodeBuffer, socketNumber: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceStartService(devicePointer, serviceName, socketNumber, null);
	}

	public deviceTransferApplication(service: number, packageFile: NodeBuffer, options: NodeBuffer, installationCallback: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceTransferApplication(service, packageFile, options, installationCallback, null);
	}

	public deviceInstallApplication(service: number, packageFile: NodeBuffer, options: NodeBuffer, installationCallback: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceInstallApplication(service, packageFile, options, installationCallback, null);
	}

	public deviceMountImage(devicePointer: NodeBuffer, imagePath: NodeBuffer, options: NodeBuffer, mountCallBack: NodeBuffer): number {
		if(hostInfo.isDarwin()) {
			return this.mobileDeviceLibrary.AMDeviceMountImage(devicePointer, imagePath, options, mountCallBack, null);
		}

		this.$errors.fail("AMDeviceMountImage is exported only on Darwin OS");
	}

	public deviceLookupApplications(devicePointer: NodeBuffer, appType: number, result: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceLookupApplications(devicePointer, appType, result);
	}

	public deviceGetInterfaceType(devicePointer: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceGetInterfaceType(devicePointer);
	}

	public deviceGetConnectionId(devicePointer: NodeBuffer): number {
		return this.mobileDeviceLibrary.AMDeviceGetConnectionID(devicePointer);
	}

	public afcConnectionOpen(service: number, timeout: number, afcConnection: NodeBuffer): number {
		return this.mobileDeviceLibrary.AFCConnectionOpen(service, timeout, afcConnection);
	}

	public afcConnectionClose(afcConnection: NodeBuffer): number {
		return this.mobileDeviceLibrary.AFCConnectionClose(afcConnection);
	}

	public afcDirectoryCreate(afcConnection: NodeBuffer, path: string): number {
		return this.mobileDeviceLibrary.AFCDirectoryCreate(afcConnection, path);
	}

	public afcFileRefOpen(afcConnection: NodeBuffer, path: string,  mode: number, afcFileRef: NodeBuffer): number {
		if(hostInfo.isWindows() && process.arch === "ia32") {
			return this.mobileDeviceLibrary.AFCFileRefOpen(afcConnection, path, mode, 0, afcFileRef);
		} else if(hostInfo.isDarwin() || process.arch === "x64") {
			return this.mobileDeviceLibrary.AFCFileRefOpen(afcConnection, path, mode, afcFileRef);
		}
	}

	public afcFileRefClose(afcConnection: NodeBuffer, afcFileRef: number): number {
		return this.mobileDeviceLibrary.AFCFileRefClose(afcConnection, afcFileRef);
	}

	public afcFileRefWrite(afcConnection: NodeBuffer, afcFileRef: number, buffer: NodeBuffer, byteLength: number): number {
		return this.mobileDeviceLibrary.AFCFileRefWrite(afcConnection, afcFileRef, buffer, byteLength);
	}

	public afcFileRefRead(afcConnection: NodeBuffer, afcFileRef: number, buffer: NodeBuffer, byteLength: number): number {
		return this.mobileDeviceLibrary.AFCFileRefRead(afcConnection, afcFileRef, buffer, byteLength);
	}

	public afcRemovePath(afcConnection: NodeBuffer, path: string): number {
		return this.mobileDeviceLibrary.AFCRemovePath(afcConnection, path);
	}

	public afcDirectoryOpen(afcConnection: NodeBuffer, path: string, afcDirectory: NodeBuffer): number {
		return this.mobileDeviceLibrary.AFCDirectoryOpen(afcConnection, path, afcDirectory);
	}

	public afcDirectoryRead(afcConnection: NodeBuffer, afcDirectory: NodeBuffer,  name: NodeBuffer): number {
		return this.mobileDeviceLibrary.AFCDirectoryRead(afcConnection, afcDirectory, name);
	}

	public afcDirectoryClose(afcConnection: NodeBuffer, afcDirectory: NodeBuffer): number {
		return this.mobileDeviceLibrary.AFCDirectoryClose(afcConnection, afcDirectory);
	}

	public isDataReceivingCompleted(reply: Mobile.IiOSSocketResponseData): boolean {
		return reply.Status && reply.Complete && !reply.PercentComplete;
	}

	public setLogLevel(logLevel: number): number {
		return this.mobileDeviceLibrary.AMDSetLogLevel(logLevel);
	}

	public uSBMuxConnectByPort(connectionId: number, port: number, socketRef: NodeBuffer): number {
		return this.mobileDeviceLibrary.USBMuxConnectByPort(connectionId, port, socketRef);
	}
 }
$injector.register("mobileDevice", MobileDevice);

class WinSocket implements Mobile.IiOSDeviceSocket {
	private winSocketLibrary: any = null;
	private static BYTES_TO_READ = 1024;

	constructor(private service: number,
		private format: number,
		private $logger: ILogger,
		private $errors: IErrors) {
		this.winSocketLibrary = IOSCore.getWinSocketLibrary();
	}

	private read(bytes: number): NodeBuffer {
		var data = new Buffer(bytes);
		var result: Number;
		helpers.block(() => {
			result = this.winSocketLibrary.recv(this.service, data, bytes, 0);
		});
		if (result < 0) {
			this.$errors.fail("Error receiving data: %s", result);
		} else if (result === 0) {
			return null;
		}

		return data;
	}

	public readSystemLog(printData: any) {
		var data = this.read(WinSocket.BYTES_TO_READ);
		while (data) {
			printData(data);
			data = this.read(WinSocket.BYTES_TO_READ);
		}
		this.close();
	}

	public receiveMessage(): IFuture<Mobile.IiOSSocketResponseData> {
		return (() => {
			var message = this.receiveMessageCore();
			if(this.format === CoreTypes.kCFPropertyListXMLFormat_v1_0) {
				var reply = plist.parse(message);
				return reply;
			}

			// TODO: add parsing for binary plists
			return null;
		}).future<Mobile.IiOSSocketResponseData>()();
	}

	public sendMessage(data: any): void {
		var message: NodeBuffer = null;

		if(typeof(data) === "string") {
			message = new Buffer(data);
		}
		else {
			var payload:NodeBuffer = new Buffer(plistlib.toString(this.createPlist(data)));
			var packed:any = bufferpack.pack(">i", [payload.length]);
			message = Buffer.concat([packed, payload]);
		}

		var writtenBytes = this.sendCore(message);
		this.$logger.debug("WinSocket-> sending message: '%s', written bytes: '%s'", message.toString(), writtenBytes.toString());
		this.$errors.verifyHeap("sendMessage");
	}

	public sendAll(data: NodeBuffer): void {
		while(data.length !== 0) {
			var result = this.sendCore(data);
			if(result < 0) {
				this.$errors.fail("Error sending data: %s", result);
			}
			data = data.slice(result);
		}
	}

	public receiveAll(handler: (data: NodeBuffer) => void): void {
		var data = this.read(WinSocket.BYTES_TO_READ);
		while (data) {
			handler(data);
			data = this.read(WinSocket.BYTES_TO_READ);
		}
		this.close();
	}

	public exchange(message: IDictionary<any>): IFuture<Mobile.IiOSSocketResponseData> {
		this.sendMessage(message);
		return this.receiveMessage();
	}

	public close(): void {
		this.winSocketLibrary.closesocket(this.service);
		this.$errors.verifyHeap("socket close");
	}

	private receiveMessageCore(): string {
		var data = this.read(4);
		var reply = "";

		if (data !== null && data.length === 4) {
			var l = bufferpack.unpack(">i", data)[0];
			var left = l;
			while (left > 0) {
				var r = this.read(left);
				if (r === null) {
					this.$errors.fail("Unable to read reply");
				}
				reply += r;
				left -= r.length;
			}
		}

		var result = reply.toString();
		this.$errors.verifyHeap("receiveMessage");
		return result;
	}

	private sendCore(data: NodeBuffer): number {
		var writtenBytes = this.winSocketLibrary.send(this.service, data, data.length, 0);
		this.$logger.debug("WinSocket-> sendCore: writtenBytes '%s'", writtenBytes);
		return writtenBytes;
	}

	private createPlist(data: IDictionary<any>) : {} {
		var keys = _.keys(data);
		var values = _.values(data);
		var plistData: {type:string; value:any} = {type: "dict", value: {}};

		for(var i=0; i<keys.length; i++) {
			var type = "";
			var value: any;
			if(values[i] instanceof Buffer) {
				type = "data";
				value = values[i].toString("base64")
			} else if(values[i] instanceof Object) {
				type = "dict";
				value = {};
			} else  if(typeof(values[i]) === "number" ) {
				type = "integer";
				value = values[i];
			} else {
				type = "string";
				value = values[i];
			}

			plistData.value[keys[i]] = {type: type, value: value};
		}

		this.$logger.trace("created plist: '%s'", plistData.toString());

		return plistData;
	}
}

class PosixSocket implements Mobile.IiOSDeviceSocket {
	private socket: net.NodeSocket = null;

	constructor(service: number,
		private format: number,
		private $coreFoundation: Mobile.ICoreFoundation,
		private $mobileDevice: Mobile.IMobileDevice,
		private $logger: ILogger,
		private $errors: IErrors) {
		this.socket = new net.Socket({ fd: service });
	}

	public receiveMessage(): IFuture<Mobile.IiOSSocketResponseData> {
		var result = new Future<Mobile.IiOSSocketResponseData>();
		var capturedData: NodeBuffer = new Buffer(0);

		this.socket
			.on("data", (data: NodeBuffer) => {
				capturedData = Buffer.concat([capturedData, data]);

				if(this.format === CoreTypes.kCFPropertyListBinaryFormat_v1_0) {
					var isExceptionThrown = false;

					try {
						var message = bplistParser.parseBuffer(data);
					} catch(e) {
						isExceptionThrown = true;
					}

					if(!isExceptionThrown) {
						this.$logger.trace("MESSAGE RECEIVING");
						this.$logger.trace(message);

						if(message && typeof(message) === "object" && message[0]) {
							message = message[0];
							var output = "";
							if(message.Status) {
								output += util.format("Status: %s", message.Status);
							}
							if(message.PercentComplete) {
								output += util.format(" PercentComplete: %s", message.PercentComplete);
							}
							this.$logger.out(output);

							if(message.Status && message.Status === "Complete") {
								if(!result.isResolved()) {
									result.return(message);
								}
							}
						}
					}
				} else if(this.format === CoreTypes.kCFPropertyListXMLFormat_v1_0) {
					try {
						var parsedData = plist.parse(capturedData.toString());
					} catch(e) {
						parsedData = {};
					}

					if(!result.isResolved()) {
						result.return(parsedData);
					}
				}
			})
			.on("error", (error: Error) => {
				if(!result.isResolved()) {
					result.throw(error);
				}
			});

		return result;
	}

	public readSystemLog(action: (data: NodeBuffer) => void) {
		this.socket
			.on("data", (data: NodeBuffer) => {
				action(data);
			})
			.on("end", () => {
				this.close();
				this.$errors.verifyHeap("readSystemLog");
			})
			.on("error", (error: Error) => {
				this.$errors.fail(error);
			});
	}

	public sendMessage(message: any, format?: number): void {
		if(typeof(message) === "string") {
			this.socket.write(message);
		} else {
			var data = this.$coreFoundation.dictToPlistEncoding(message, format);
			var payload = bufferpack.pack(">i", [data.length]);

			this.$logger.trace("PlistService sending: ");
			this.$logger.trace(data.toString());

			this.socket.write(payload);
			this.socket.write(data);
		}

		this.$errors.verifyHeap("sendMessage");
	}

	public receiveAll(handler: (data: NodeBuffer) => void): void {
		this.socket.on('data', handler);
	}

	public exchange(message: IDictionary<any>): IFuture<Mobile.IiOSSocketResponseData> {
		this.$errors.fail("Exchange function is not implemented for OSX");
		return null;
	}

	public close(): void {
		this.socket.destroy();
		this.$errors.verifyHeap("socket close");
	}
 }

export class PlistService implements Mobile.IiOSDeviceSocket {
	private socket: Mobile.IiOSDeviceSocket  = null;

	constructor(private service: number,
		private format: number,
		private $injector: IInjector) {
		if(hostInfo.isWindows()) {
			this.socket = this.$injector.resolve(WinSocket, {service: this.service, format: this.format });
		} else if(hostInfo.isDarwin()) {
			this.socket = this.$injector.resolve(PosixSocket, {service: this.service, format: this.format });
		}
	}

	public receiveMessage(): IFuture<Mobile.IiOSSocketResponseData> {
		return this.socket.receiveMessage();
	}

	public readSystemLog(action: (data: NodeBuffer) => void): any {
		this.socket.readSystemLog(action);
	}

	public sendMessage(message: any) : void {
		this.socket.sendMessage(message, this.format);
	}

	public exchange(message: IDictionary<any>): IFuture<Mobile.IiOSSocketResponseData> {
		return this.socket.exchange(message);
	}

	public close() {
		this.socket.close();
	}

	public sendAll(data: NodeBuffer): void {
		this.socket.sendAll(data);
	}

	public receiveAll(handler: (data: NodeBuffer) => void): void {
		if (this.socket.receiveAll) {
			this.socket.receiveAll(handler);
		}
	}
}

export class GDBServer implements Mobile.IGDBServer {
	private socket: Mobile.IiOSDeviceSocket  = null;

	constructor(private service: number,
		private $injector: IInjector) {

		if(hostInfo.isWindows()) {
			this.socket = this.$injector.resolve(WinSocket, {service: this.service, format: 0});
		} else if(hostInfo.isDarwin()) {
			this.socket = this.$injector.resolve(PosixSocket, {service: this.service, format: CoreTypes.kCFPropertyListXMLFormat_v1_0});
		}
	}

	public run(argv: string[]): void {
		this.send("QStartNoAckMode");
		this.socket.sendMessage("+");
		this.send("QEnvironmentHexEncoded:");
		this.send("QSetDisableASLR:1");

		var encodedArguments = _.map(argv, (arg, index) => util.format("%d,%d,%s", arg.length*2, index, new Buffer(arg).toString("hex"))).join(",");
		this.send("A"+encodedArguments);

		this.send("qLaunchSuccess");
		this.send("vCont;c");
	}

	private send(packet: string): void {
		var sum = 0;
		for(var i=0; i< packet.length; i++) {
			sum += packet.charCodeAt(i);
		}
		sum = sum & 255;
		var data = util.format("$%s#%s", packet, sum.toString(16));

		this.socket.sendMessage(data);
		var commands = ['C', 'c', 'S', 's', 'vCont', 'vAttach', 'vRun', 'vStopped', '?'];
		var stopReply = _.any(commands, command => _.startsWith(packet, command));
		// TODO: extend the protocol communication
	}
}
$injector.register("gdbServer", GDBServer);

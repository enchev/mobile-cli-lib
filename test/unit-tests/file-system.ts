///<reference path="../.d.ts"/>
"use strict";

import {Yok} from "../../yok";
import * as path from "path";
import temp = require("temp");
import * as hostInfoLib from "../../host-info";
import {assert} from "chai";
import * as fileSystemFile from "../../file-system";
import * as childProcessLib from "../../child-process";
import {CommonLoggerStub} from "./stubs";

let sampleZipFileTest = path.join(__dirname, "../resources/sampleZipFileTest.zip");
let unzippedFileName = "sampleZipFileTest.txt";
let sampleZipFileTestIncorrectName = path.join(__dirname, "../resources/sampleZipfileTest.zip");

function isOsCaseSensitive(testInjector: IInjector): boolean {
	let hostInfo = testInjector.resolve("hostInfo");
	return hostInfo.isLinux;
};
temp.track();

function createTestInjector(): IInjector {
	let testInjector = new Yok();

	testInjector.register("fs", fileSystemFile.FileSystem);
	testInjector.register("errors", {
		fail: (...args: any[]) => { throw new Error(args[0]); }
	});

	testInjector.register("logger", CommonLoggerStub);
	testInjector.register("childProcess", childProcessLib.ChildProcess);
	testInjector.register("staticConfig", {
		disableAnalytics: true
	});
	testInjector.register("hostInfo", hostInfoLib.HostInfo);
	testInjector.register("injector", testInjector);
	return testInjector;
}

describe("FileSystem", () => {
	describe("unzip",() => {
		describe("overwriting files tests",() => {
			let testInjector: IInjector,
				tempDir: string,
				fs: IFileSystem,
				file: string,
				msg = "data";

			beforeEach(() => {
				testInjector = createTestInjector();
				tempDir = temp.mkdirSync("projectToUnzip");
				fs = testInjector.resolve("fs");
				file = path.join(tempDir, unzippedFileName);
				fs.writeFile(file, msg).wait();
			});
			it("does not overwrite files when overwriteExisitingFiles is false",() => {
				fs.unzip(sampleZipFileTest, tempDir, { overwriteExisitingFiles: false }, [unzippedFileName]).wait();
				let data = fs.readFile(file).wait();
				assert.strictEqual(msg, data.toString(), "When overwriteExistingFiles is false, we should not ovewrite files.");
			});

			it("overwrites files when overwriteExisitingFiles is true",() => {
				fs.unzip(sampleZipFileTest, tempDir, { overwriteExisitingFiles: true }, [unzippedFileName]).wait();
				let data = fs.readFile(file).wait();
				assert.notEqual(msg, data.toString(), "We must overwrite files when overwriteExisitingFiles is true.");
			});

			it("overwrites files when overwriteExisitingFiles is not set",() => {
				fs.unzip(sampleZipFileTest, tempDir, {}, [unzippedFileName]).wait();
				let data = fs.readFile(file).wait();
				assert.notEqual(msg, data.toString(), "We must overwrite files when overwriteExisitingFiles is not set.");
			});

			it("overwrites files when options is not set",() => {
				fs.unzip(sampleZipFileTest, tempDir, undefined, [unzippedFileName]).wait();
				let data = fs.readFile(file).wait();
				assert.notEqual(msg, data.toString(), "We must overwrite files when options is not defined.");
			});
		});

		// NOTE: This tests will never fail on Windows/Mac as file system is case insensitive
		describe("case sensitive tests", () => {
			it("is case sensitive when options is not defined",() => {
				let testInjector = createTestInjector();
				let tempDir = temp.mkdirSync("projectToUnzip");
				let fs: IFileSystem = testInjector.resolve("fs");
				if(isOsCaseSensitive(testInjector)) {
					assert.throws(() => fs.unzip(sampleZipFileTestIncorrectName, tempDir, undefined, [unzippedFileName]).wait());
				}
			});

			it("is case sensitive when caseSensitive option is not defined",() => {
				let testInjector = createTestInjector();
				let tempDir = temp.mkdirSync("projectToUnzip");
				let fs: IFileSystem = testInjector.resolve("fs");
				if(isOsCaseSensitive(testInjector)) {
					assert.throws(() => fs.unzip(sampleZipFileTestIncorrectName, tempDir, {}, [unzippedFileName]).wait());
				}
			});

			it("is case sensitive when caseSensitive option is true",() => {
				let testInjector = createTestInjector();
				let tempDir = temp.mkdirSync("projectToUnzip");
				let fs: IFileSystem = testInjector.resolve("fs");
				if(isOsCaseSensitive(testInjector)) {
					assert.throws(() => fs.unzip(sampleZipFileTestIncorrectName, tempDir, { caseSensitive: true }, [unzippedFileName]).wait());
				}
			});

			it("is case insensitive when caseSensitive option is false",() => {
				let testInjector = createTestInjector();
				let tempDir = temp.mkdirSync("projectToUnzip");
				let fs: IFileSystem = testInjector.resolve("fs");
				let file = path.join(tempDir, unzippedFileName);
				fs.unzip(sampleZipFileTestIncorrectName, tempDir, { caseSensitive: false }, [unzippedFileName]).wait();
				// This will throw error in case file is not extracted
				fs.readFile(file).wait();
			});
		});
	});

	describe("renameIfExists", () => {
		it("returns true when file is renamed", () => {
			let testInjector = createTestInjector();
			let tempDir = temp.mkdirSync("renameIfExists");
			let testFileName = path.join(tempDir, "testRenameIfExistsMethod");
			let newFileName = path.join(tempDir, "newfilename");

			let fs: IFileSystem = testInjector.resolve("fs");
			fs.writeFile(testFileName, "data").wait();

			let result = fs.renameIfExists(testFileName, newFileName).wait();
			assert.isTrue(result, "On successfull rename, result must be true.");
			assert.isTrue(fs.exists(newFileName).wait(), "Renamed file should exists.");
			assert.isFalse(fs.exists(testFileName).wait(), "Original file should not exist.");
		});

		it("returns false when file does not exist", () => {
			let testInjector = createTestInjector();
			let fs: IFileSystem = testInjector.resolve("fs");
			let newName = "tempDir2";
			let result = fs.renameIfExists("tempDir", newName).wait();
			assert.isFalse(result, "When file does not exist, result must be false.");
			assert.isFalse(fs.exists(newName).wait(), "New file should not exist.");
		});
	});

	describe("copyFile", () => {
		let testInjector: IInjector,
			tempDir: string,
			testFileName: string,
			newFileName: string,
			fileContent = "data",
			fs: IFileSystem;

		beforeEach(() => {
			testInjector = createTestInjector();
			tempDir = temp.mkdirSync("copyFile");
			testFileName = path.join(tempDir, "testCopyFile");
			newFileName = path.join(tempDir, "newfilename");

			fs = testInjector.resolve("fs");
			fs.writeFile(testFileName, fileContent).wait();
		});

		it("correctly copies file to the same directory", () => {
			fs.copyFile(testFileName, newFileName).wait();
			assert.isTrue(fs.exists(newFileName).wait(), "Renamed file should exists.");
			assert.isTrue(fs.exists(testFileName).wait(), "Original file should exist.");
			assert.deepEqual(fs.getFsStats(testFileName).wait().size, fs.getFsStats(testFileName).wait().size, "Original file and copied file must have the same size.");
		});

		it("copies file to non-existent directory", () => {
			let newFileNameInSubDir = path.join(tempDir, "subDir", "newfilename");
			assert.isFalse(fs.exists(newFileNameInSubDir).wait());
			fs.copyFile(testFileName, newFileNameInSubDir).wait();
			assert.isTrue(fs.exists(newFileNameInSubDir).wait(), "Renamed file should exists.");
			assert.isTrue(fs.exists(testFileName).wait(), "Original file should exist.");
			assert.deepEqual(fs.getFsStats(testFileName).wait().size, fs.getFsStats(testFileName).wait().size, "Original file and copied file must have the same size.");
		});

		it("produces correct file when source and target file are the same", () => {
			let originalSize = fs.getFsStats(testFileName).wait().size;
			fs.copyFile(testFileName, testFileName).wait();
			assert.isTrue(fs.exists(testFileName).wait(), "Original file should exist.");
			assert.deepEqual(fs.getFsStats(testFileName).wait().size, originalSize, "Original file and copied file must have the same size.");
			assert.deepEqual(fs.readText(testFileName).wait(), fileContent, "File content should not be changed.");
		});
	});
});

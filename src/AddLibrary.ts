// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, ExtensionContext, QuickPickItem, RelativePattern, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as path from "path";
import * as fs from "fs-extra";
import { dir } from "console";

// Zip handler library
const yauzl = require("yauzl");

// Encoding handler library
const iconv = require("iconv-lite");

export class AddLibraryHandler {
	private readonly dialects = { vdmsl: "vdmsl", vdmpp: "vdmpp", vdmrt: "vdmrt" };
	private readonly libraryEncoding: BufferEncoding = "utf8";

	constructor(private readonly clients: Map<string, SpecificationLanguageClient>, private context: ExtensionContext) {
		commands.executeCommand("setContext", "add-lib-show-button", true);
		this.context = context;
		this.registerCommand((inputUri: Uri) => this.addLibrary(workspace.getWorkspaceFolder(inputUri)));
	}

	private registerCommand = (callback: (...args: any[]) => any) => {
		let disposable = commands.registerCommand("vdm-vscode.addLibrary", callback);
		this.context.subscriptions.push(disposable);
		return disposable;
	};

	private async addLibrary(wsFolder: WorkspaceFolder) {
		window.setStatusBarMessage(
			`Adding Libraries.`,
			new Promise(async (resolve, reject) =>
				this.getDialect(wsFolder).then((dialect) =>
					// Gather available libraries in jars
					this.getLibsFromJars(dialect, wsFolder).then(async (jarPathToLibs) => {
						// Let user select libraries
						const selectedItems = await window.showQuickPick(
							Array.from(jarPathToLibs.values())
								.reduce((prev, curr) => prev.concat(curr), [])
								.map((lib) => ({ label: lib.name, description: lib.description } as QuickPickItem)),
							{
								placeHolder: jarPathToLibs.values().next() == undefined ? "No libraries available.." : "Choose libraries..",
								canPickMany: true,
							}
						);
						// None selected
						if (selectedItems === undefined || selectedItems.length == 0) return resolve(`Empty selection. Add library completed.`);

						// Ensure that target folder exists
						const libPathTarget = path.resolve(wsFolder.uri.fsPath, "lib");
						fs.ensureDir(libPathTarget)
							.then(() => {
								const jarPathTofileNames: Map<string, string[]> = new Map();

								// Find files that are needed for the selected libraries and map them to jarPaths
								jarPathToLibs.forEach((libs: Library[], jarPath: string) => {
									const resolvedItems: QuickPickItem[] = [];
									selectedItems.forEach((quickPickItem) => {
										// Only act if the selected item corresponds to library from this jar.
										const selectedLib = libs.find((lib) => lib.name == quickPickItem.label);
										if (selectedLib) {
											// Resolve dependencies
											const unresolvedDependencies: string[] = [];
											if (selectedLib.depends.length > 0) {
												const jarPathsToDependencyFiles: Map<string, string[]> = this.LocateDependencyFiles(
													jarPath,
													selectedLib,
													jarPathToLibs,
													new Map<string, string[]>(),
													unresolvedDependencies
												);

												// Add dependency files
												if (unresolvedDependencies.length == 0 && jarPathsToDependencyFiles.size > 0) {
													Array.from(jarPathsToDependencyFiles.entries()).forEach((entry) => {
														if (jarPathTofileNames.has(entry[0])) {
															jarPathTofileNames.get(entry[0]).push(...entry[1]);
														} else {
															jarPathTofileNames.set(entry[0], entry[1]);
														}
													});
												}
											}

											// Warn of any unresolved dependencies
											if (unresolvedDependencies.length > 0) {
												const msg = `Unable to resolve all dependencies for the library '${
													selectedLib.name
												}' as library files for the following libraries could not be found: ${unresolvedDependencies.reduce((prev, cur) => prev + ", " + cur)}`;
												window.showWarningMessage(msg);
												console.log(msg);
											}
											// Else add the library files.
											else if (jarPathTofileNames.has(jarPath)) {
												jarPathTofileNames.get(jarPath).push(...selectedLib.files);
											} else {
												jarPathTofileNames.set(jarPath, selectedLib.files);
											}

											resolvedItems.push(quickPickItem);
										}
									});

									// Remove items that were located in this jar.
									resolvedItems.forEach((itemToRemove) =>
										selectedItems.splice(
											selectedItems.findIndex((quickPickItem) => quickPickItem.label == itemToRemove.label),
											1
										)
									);
								});

								// Remove any duplicate file names
								const jarsToFiles: [string, string[]][] = Array.from(jarPathTofileNames.entries()).map((entry) => [
									entry[0],
									entry[1].filter((elem, index, self) => index === self.indexOf(elem)),
								]);

								// Copy library files from jars to the target folder
								const wsEncoding = workspace.getConfiguration("files", wsFolder).get("encoding", "utf8");
								Promise.all(jarsToFiles.map((jarToFiles) => this.copyLibFilesToTarget(jarToFiles[0], jarToFiles[1], libPathTarget, wsEncoding)))
									.then(() => {
										resolve("Added libraries.");
									})
									.catch((err) => {
										window.showWarningMessage(`Add library failed with error: ${err}`);
										console.log(`Add library failed with error: ${err}`);
										reject("Add library failed with error");
									});
							})
							.catch((error) => {
								window.showWarningMessage("Creating directory for library failed");
								console.log(`Creating directory for library files failed with error: ${error}`);
								reject("Creating directory for library files failed");
							});
					})
				)
			)
		);
	}

	private LocateDependencyFiles(
		jarPath: string,
		library: Library,
		jarPathToLibs: Map<string, Library[]>,
		jarPathToFilenames: Map<string, string[]>,
		unresolvedDependencies: string[]
	): Map<string, string[]> {
		// Resolve dependencies
		library.depends.forEach((libName) => {
			// First search through libraries from the jarPath where the dependencies originated.
			let dependency: Library = jarPathToLibs.get(jarPath).find((lib) => lib.name == libName);
			if (!dependency) {
				// The dependency is not in the given jarPath - look in the other jars
				const otherJars = new Map(jarPathToLibs);
				otherJars.delete(jarPath);

				for (let entry of Array.from(otherJars)) {
					dependency = entry[1].find((lib) => lib.name == libName);
					if (dependency) {
						jarPath = entry[0];
						break;
					}
				}
			}

			if (dependency) {
				// Found the jar with the dependency. Add the needed files to the files extract map.
				if (jarPathToFilenames.has(jarPath)) {
					jarPathToFilenames.get(jarPath).push(...dependency.files);
				} else {
					jarPathToFilenames.set(jarPath, dependency.files);
				}

				// Locate any depedencies of this dependency.
				if (dependency.depends.length > 0) {
					jarPathToFilenames = new Map([
						...Array.from(jarPathToFilenames.entries()),
						...Array.from(this.LocateDependencyFiles(jarPath, dependency, jarPathToLibs, jarPathToFilenames, unresolvedDependencies).entries()),
					]);
				}
			} else {
				unresolvedDependencies.push(libName);
			}
		});
		return jarPathToFilenames;
	}

	private getDialect(wsFolder: WorkspaceFolder): Promise<string> {
		return new Promise<string>(async (resolve, reject) => {
			const client = this.clients.get(wsFolder.uri.toString());
			if (client) {
				resolve(this.dialects[client.language]);
			} else {
				console.log(`No client found for the folder: ${wsFolder.name}`);

				// Guess dialect
				for (const dialect in this.dialects) {
					const pattern = new RelativePattern(wsFolder.uri.path, "*." + dialect);
					if ((await workspace.findFiles(pattern, null, 1)).length == 1) resolve(this.dialects[dialect]);
				}

				const dialect: string = await window.showQuickPick(Object.keys(this.dialects), {
					placeHolder: "Choose dialect",
					canPickMany: false,
				});
				if (!dialect) {
					reject("Add library failed! Unable to determine VDM dialect for workspace");
				} else {
					resolve(this.dialects[dialect]);
				}
			}
		});
	}

	private getLibsFromJars(dialect: string, wsFolder: WorkspaceFolder): Promise<Map<string, Library[]>> {
		return new Promise<Map<string, Library[]>>(async (resolve, reject) => {
			//Get jars from class path
			const libsPath = path.resolve(this.context.extensionPath, "resources", "jars", "libs");
			//const jarPaths: string[] = workspace.getConfiguration("vdm-vscode.server", wsFolder).inspect("classPathAdditions").globalValue as string[];
			const jarPaths: string[] = fs
				.readdirSync(libsPath)
				.filter((fileName) => fileName.endsWith(".jar"))
				.map((fileName) => path.resolve(libsPath, fileName));

			if (!jarPaths || jarPaths.length < 1) return resolve(new Map());

			// Extract libraries
			Promise.all(
				jarPaths.map(
					(jarPath) =>
						new Promise<[string, Library[]]>(async (resolve, reject) => {
							yauzl.open(jarPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
								if (err) reject(err);
								zipfile.on("error", (err) => {
									reject(err);
									zipfile.close();
								});
								// Resolve to empty array if we have read the whole zip file without finding any libraries
								zipfile.on("end", () => {
									resolve(["", []]);
									zipfile.close();
								});
								zipfile.on("entry", async (entry) => {
									// If we found a library file then read it else we read the next zip entry
									if (!/\/$/.test(entry.fileName) && entry.fileName.toLowerCase().endsWith("library.json")) {
										zipfile.openReadStream(entry, async (error, readStream) => {
											if (error) {
												reject(error);
												zipfile.close();
											}
											readStream.on("data", (data) => {
												// Create mapping from jar path to libraries
												const jsonData = JSON.parse(data.toString());
												zipfile.close();
												return resolve(jsonData[dialect] ? [jarPath, jsonData[dialect]] : ["", []]);
											});
										});
									} else {
										zipfile.readEntry();
									}
								});
								zipfile.readEntry();
							});
						})
				)
			) // When we have looked through all jar files and found all libraries
				.then((jarPathToLibs) => {
					// Merge libraries to single map
					const mergedJarPathToLibs: Map<string, Library[]> = new Map();
					jarPathToLibs.forEach((jarToLib) => {
						if (jarToLib[0]) {
							// Watch out for libraries with identical names
							const jarPathToDuplicateLibs: Map<string, Library[]> = new Map();
							for (let entry of Array.from(mergedJarPathToLibs.entries())) {
								const duplicateLib = Array.from(entry[1]).find((existingLib) => jarToLib[1].find((newLib) => existingLib.name == newLib.name));
								if (duplicateLib) {
									// Library exists in another jar so no need to extract it from this jar.
									jarToLib[1].splice(
										jarToLib[1].findIndex((lib) => lib.name == duplicateLib.name),
										1
									);

									if (jarPathToDuplicateLibs.has(entry[0])) {
										jarPathToDuplicateLibs.get(entry[0]).push(duplicateLib);
									} else {
										jarPathToDuplicateLibs.set(entry[0], [duplicateLib]);
									}
								}
							}

							// Inform of libraries with identical names - this is done per jar to avoid generating too many messages.
							jarPathToDuplicateLibs.forEach((libraries, jarPath) => {
								const msg = `Libraries '${libraries
									.map((library) => library.name)
									.reduce((prev, cur) => prev + ", " + cur)}' are in multiple jars.. Using libraries from '${jarPath}`;
								window.showWarningMessage(msg);
								console.log(msg);
							});

							mergedJarPathToLibs.set(jarToLib[0], jarToLib[1]);
						}
					});
					resolve(mergedJarPathToLibs);
				})
				.catch((err) => reject(err));
		});
	}

	private copyLibFilesToTarget(jarPath: string, libFileNames: string[], targetFolderPath: string, wsEncoding: string): Promise<void> {
		// Extract library from jar file and write it to the target folder
		return new Promise<void>(async (resolve, reject) => {
			if (!jarPath) return reject();
			if (libFileNames.length < 1) return resolve();
			try {
				// Open the jar file
				yauzl.open(jarPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
					if (err) return reject(err);
					zipfile.on("error", (err) => {
						reject(err);
					});

					zipfile.on("end", () => {
						reject(`Unable to locate and copy the following files: ${libFileNames.reduce((prev, cur) => prev + ", " + cur)}`);
					});

					// Handle entry
					zipfile.on("entry", (entry) => {
						const fileName = path.basename(entry.fileName);
						// Resolve when we have found all library files
						if (libFileNames.length < 1) {
							zipfile.close();
							resolve();
						} else if (!/\/$/.test(entry.fileName)) {
							// We have found a file and not a folder. See if the file is for a library that we need to extract and copy it to the target folder
							const libFileNamesIndex = libFileNames.findIndex((libFileName) => libFileName == fileName);
							if (libFileNamesIndex >= 0) {
								// Create a read stream from the file and pipe it to a write stream to the target folder.
								zipfile.openReadStream(entry, (error, readStream) => {
									if (error) return reject(error);
									// Check encoding
									if (!Buffer.isEncoding(wsEncoding)) console.log(`Encoding (files.encoding: ${wsEncoding}) not possible using the default: UTF-8`);
									// Create writestream with needed encoding to the target path
									const writeStream = fs.createWriteStream(path.join(targetFolderPath, fileName), {
										encoding: wsEncoding == this.libraryEncoding || !Buffer.isEncoding(wsEncoding) ? this.libraryEncoding : wsEncoding,
									});

									// Pipe the readstream into the iconv-lite decoder, then into the encoder (to handle workspaces encoded in other formats than utf8), then finally to the writestream and handle erros.
									readStream
										.pipe(iconv.decodeStream(this.libraryEncoding))
										.pipe(iconv.encodeStream(wsEncoding))
										.pipe(writeStream)
										.on("error", (err) => {
											return reject(`Copy library files failed with error: ${err}`);
										});
								});
								libFileNames.splice(libFileNamesIndex, 1);
							}
						}
						zipfile.readEntry();
					});
					zipfile.readEntry();
				});
			} catch (exception) {
				reject(exception);
			}
		});
	}
}

class Library {
	constructor(public readonly name: string, public readonly description: string, public readonly depends: string[], public readonly files: string[]) {}
}

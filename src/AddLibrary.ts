// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, ExtensionContext, QuickPickItem, RelativePattern, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as path from "path";
import * as fs from "fs-extra";

const yauzl = require("yauzl");
const iconv = require("iconv-lite");

export class AddLibraryHandler {
	private readonly dialects = { vdmsl: "vdmsl", vdmpp: "vdmpp", vdmrt: "vdmrt" };

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
					// Gather available libraries and let user select
					this.getLibraryDefinitionsFromJars(dialect, wsFolder).then(async (libdefs) => {
						const selectedItems = await window.showQuickPick(
							Array.from(libdefs.values())
								.reduce((prev, curr) => prev.concat(curr), [])
								.map((libdef) => ({ label: libdef.name, description: libdef.description } as QuickPickItem)),
							{
								placeHolder: libdefs.values().next() == undefined ? "No libraries available.." : "Choose libraries..",
								canPickMany: true,
							}
						);
						// None selected
						if (selectedItems === undefined || selectedItems.length == 0) return resolve(`Empty selection. Add library completed.`);

						// Ensure that target folder exists
						const libPathTarget = path.resolve(wsFolder.uri.fsPath, "lib");
						fs.ensureDir(libPathTarget)
							.then(() => {
								const selectedLibDefs: Map<string, string[]> = new Map();

								libdefs.forEach((value: libdef[], key: string) => {
									const foundItems: QuickPickItem[] = [];
									selectedItems.forEach((quickPickItem) => {
										const selectedLib = value.find((libdef) => libdef.name == quickPickItem.label);
										if (selectedLib) {
											const libFileNames: string[] = selectedLib.files.concat(selectedLib.depends);
											foundItems.push(quickPickItem);
											if (selectedLibDefs.has(key)) {
												libFileNames.forEach((fileName) => {
													const existingFileNames = selectedLibDefs.get(key);
													if (!existingFileNames.find((existingFileName) => existingFileName == fileName)) {
														selectedLibDefs.get(key).push(fileName);
													}
												});
											} else {
												selectedLibDefs.set(key, libFileNames);
											}
										}
									});
									foundItems.forEach((itemToRemove) =>
										selectedItems.splice(
											selectedItems.findIndex((quickPickItem) => quickPickItem.label == itemToRemove.label),
											1
										)
									);
								});

								// Copy libraries from jars to target folder
								const wsEncoding = workspace.getConfiguration("files", wsFolder).get("encoding", "utf8");
								Promise.all(
									Array.from(selectedLibDefs.entries()).map((selectedLibDef) =>
										this.extractLibsFromJarToTarget(dialect, selectedLibDef[0], selectedLibDef[1], libPathTarget, wsEncoding)
									)
								)
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

	private getLibraryDefinitionsFromJars(dialect: string, wsFolder: WorkspaceFolder): Promise<Map<string, libdef[]>> {
		return new Promise<Map<string, libdef[]>>(async (resolve, reject) => {
			//Get library jars
			const jarPaths: string[] = workspace.getConfiguration("vdm-vscode.server", wsFolder).inspect("classPathAdditions").globalValue as string[];
			if (!jarPaths) return resolve(new Map());

			// Extract library definitions
			Promise.all(
				jarPaths.map(
					(jarPath) =>
						new Promise<[string, libdef[]]>(async (resolve, reject) => {
							yauzl.open(jarPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
								if (err) reject(err);
								zipfile.on("error", (err) => {
									reject(err);
									zipfile.close();
								});
								// Resolve to empty array if we have read the whole zip file without finding any definitions
								zipfile.on("end", () => {
									resolve(["", []]);
									zipfile.close();
								});
								zipfile.on("entry", async (entry) => {
									// If we found the libdefs file then read it else we read the next zip entry
									if (!/\/$/.test(entry.fileName) && entry.fileName.toLowerCase().includes("libdefs")) {
										zipfile.openReadStream(entry, async (error, readStream) => {
											if (error) {
												reject(error);
												zipfile.close();
											}
											readStream.on("data", (data) => {
												// Create mapping from dialect to library definitions from the data
												const jsonData = JSON.parse(data.toString());
												zipfile.close();
												if (jsonData.Dialects) {
													const dialectToLibDefs: [string, libdef[]] = Object.entries<libdef[]>(jsonData.Dialects).find((entry: [string, libdef[]]) =>
														entry[0].toLowerCase().includes(dialect)
													);
													if (dialectToLibDefs) {
														// Resolve and close the zip as we have at least found the library definitions file.
														return resolve([jarPath, dialectToLibDefs[1]]);
													}
												}
												return resolve(["", []]);
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
			) // When we have looked through all zip files and found all library definitions
				.then((jarToLibs) => {
					// Resolve merged library definitions
					const mapToReturn: Map<string, libdef[]> = new Map();
					jarToLibs.forEach((jarToLib) => {
						const existingLib = Array.from(mapToReturn.values())
							.reduce((prev, curr) => prev.concat(curr), [])
							.find((existingLibDef) => jarToLib[1].find((newLibDef) => existingLibDef.name == newLibDef.name));
						if (existingLib) {
							window.showWarningMessage(`Found library with the name '${existingLib.name}' in multiple jars.. Using library from '${jarToLib[0]}`);
							console.log(`Found library with the name '${existingLib.name}' in multiple jars.. Using library from '${jarToLib[0]}`);
						} else if (jarToLib[0]) {
							mapToReturn.set(jarToLib[0], jarToLib[1]);
						}
					});
					resolve(mapToReturn);
				})
				.catch((err) => reject(err));
		});
	}

	private extractLibsFromJarToTarget(dialect: string, jarPath: string, libFileNames: string[], targetFolderPath: string, wsEncoding: BufferEncoding): Promise<void> {
		// Extract library from jar file and write it to the target folder
		return new Promise<void>(async (resolve, reject) => {
			if (!jarPath) return reject();
			if (libFileNames.length < 1) return resolve();
			try {
				// Open the jar file
				yauzl.open(jarPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
					if (err) reject(err);
					zipfile.on("error", (err) => {
						reject(err);
					});

					// Handle entry
					zipfile.on("entry", (entry) => {
						const fileName = path.basename(entry.fileName);
						// Resolve when we have found all library files
						if (libFileNames.length < 1) {
							zipfile.close();
							resolve();
						} else if (!/\/$/.test(entry.fileName)) {
							// We have found a file and not a folder. See if the file is a library file that we need to extract and move to the target folder
							const libFileNamesIndex = libFileNames.findIndex((libFileName) => libFileName == fileName || (fileName.includes(libFileName) && fileName.endsWith(dialect)));
							if (libFileNamesIndex >= 0) {
								// Create a read stream from the library file and pipe it to a write stream to the target folder.
								zipfile.openReadStream(entry, (error, readStream) => {
									if (error) reject(error);
									// Check encoding
									if (!Buffer.isEncoding(wsEncoding)) console.log(`Encoding (files.encoding: ${wsEncoding}) not possible using the default: UTF-8`);
									const libraryEncoding: BufferEncoding = "utf8";
									// Create writestream with needed encoding to the target path
									const writeStream = fs.createWriteStream(path.join(targetFolderPath, fileName), {
										encoding: wsEncoding == libraryEncoding || !Buffer.isEncoding(wsEncoding) ? libraryEncoding : wsEncoding,
									});

									// Pipe the readstream into the iconv-lite decoder, then into the encoder (to handle workspaces in encoding formats other than utf8) and then finally to the writestream and handle erros.
									readStream
										.pipe(iconv.decodeStream(libraryEncoding))
										.pipe(iconv.encodeStream(wsEncoding))
										.pipe(writeStream)
										.on("error", (err) => {
											window.showInformationMessage(`Add library ${fileName} failed`);
											reject(`Copy library files failed with error: ${err}`);
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

class libdef {
	constructor(public readonly name: string, public readonly description: string, public readonly depends: string[], public readonly files: string[]) {}
}

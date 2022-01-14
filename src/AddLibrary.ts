// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, ExtensionContext, QuickPickItem, RelativePattern, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as path from "path";
import * as fs from "fs-extra";

const yauzl = require("yauzl");

export class AddLibraryHandler {
	private readonly dialects = { vdmsl: "VDMSL", vdmpp: "VDMPP", vdmrt: "VDMRT" };

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
		window.setStatusBarMessage(`Adding Libraries.`,
			new Promise(async (resolve, reject) =>
				this.getDialect(wsFolder).then(dialect =>
					// Gather available libraries and let user select
					this.getLibJarsForDialect(dialect, wsFolder).then(async libdefs => {
						const selectedItems = await window.showQuickPick(libdefs.map(libdef => ({ label: libdef.name, description: libdef.description } as QuickPickItem)), {
							placeHolder: "Choose libraries",
							canPickMany: true,
						});
						// None selected
						if (selectedItems === undefined || selectedItems.length == 0) resolve(`Empty selection. Add library completed.`);

						// Ensure that target folder exists
						const folderPath = path.resolve(wsFolder.uri.fsPath, "lib");
						fs.ensureDir(folderPath)
							.then(() => {
								const selectedLibDefs = selectedItems.map(selected => libdefs.find(libdef => libdef.name == selected.label));
								// Copy libraries from jars to target folder
								Promise.all(selectedLibDefs.map((selectedLibDef) => this.extractLibrariesFromJar(selectedLibDef, dialect, folderPath))).then(() => resolve("Added libraries.")).catch(err => {
									window.showWarningMessage(`Add library failed with error: ${err}`);
									console.log(`Add library failed with error: ${err}`);
									reject("Add library failed with error");
								})
							}).catch((error) => {
								window.showWarningMessage("Creating directory for library failed");
								console.log(`Creating directory for library files failed with error: ${error}`);
								reject("Creating directory for library files failed");
							});
					})
				)
			)
		);
	}

	// const folderPath = path.resolve(wsFolder.uri.fsPath, "lib");
	// fs.ensureDir(folderPath)
	// 	.then(async () => {
	// 		try {
	// 			const wsEncoding = workspace.getConfiguration("files", wsFolder).get("encoding", "utf8");
	// 			if (!Buffer.isEncoding(wsEncoding)) console.log(`Encoding (files.encoding: ${wsEncoding}) not possible using the default: UTF-8`);

	// 			for (const lib of selectedLibs) {
	// 				const src = path.resolve(libPath, lib);
	// 				const dest = path.resolve(folderPath, lib);

	// 				// Copy files to project with UTF-8 encoding
	// 				if (wsEncoding == "utf8" || !Buffer.isEncoding(wsEncoding)) {
	// 					// Copy library from resources/lib to here
	// 					fs.copyFile(src, dest).catch((e) => {
	// 						window.showInformationMessage(`Add library ${lib} failed`);
	// 						console.log(`Copy library files failed with error: ${e}`);
	// 					});
	// 				} else {
	// 					// Convert encoding
	// 					fs.writeFileSync(dest, fs.readFileSync(src, { encoding: "utf8" }), { encoding: wsEncoding });
	// 				}
	// 			}
	// 			resolve(`Add library completed.`);
	// 		} catch (error) {
	// 			window.showWarningMessage(`Add library failed with error: ${error}`);
	// 			console.log(`Add library failed with error: ${error}`);
	// 			reject();
	// 		}
	// 	})
	// 	.catch((error) => {
	// 		window.showWarningMessage("Creating directory for library failed");
	// 		console.log(`Creating directory for library files failed with error: ${error}`);
	// 		reject();
	// 	});

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
					window.showInformationMessage(`Add library failed! Unable to determine VDM dialect for workspace`);
					reject();
				}

				resolve(this.dialects[dialect]);
			}
		});
	}

	private getLibJarsForDialect(dialect: string, wsFolder: WorkspaceFolder): Promise<libdef[]> {
		return new Promise<libdef[]>(async (resolve, reject) => {
			const jarPaths: string[] = workspace.getConfiguration('vdm-vscode.server', wsFolder).inspect("classPathAdditions").globalValue as string[];

			Promise.all(jarPaths.map(jarPath => new Promise<libdef[]>(async (resolve, reject) => {
				yauzl.open(jarPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
					if (err) reject(err);
					zipfile.on("error", (err) => {
						reject(err);
					});
					zipfile.on("end", () => {
						resolve([]);
					});
					zipfile.on("entry", (entry) => {
						if (!/\/$/.test(entry.fileName) && entry.fileName.toLowerCase().includes("libdefs")) {
							zipfile.openReadStream(entry, (error, readStream) => {
								readStream.on('data', data => {
									const libdef: libdef[] = Object.entries(JSON.parse(data.toString()).Dialects).find((entry: [string, libdef[]]) => entry[0].includes(dialect))[1] as libdef[];
									if (libdef) {
										libdef.jarPath = jarPath;
										resolve(libdef);
									}
								})
								if (error) reject(error);
							});
						}
						zipfile.readEntry();
					});
					zipfile.readEntry();
				});
			}))).then(libdefs => {
				resolve(libdefs.filter(libdef => libdef.dialect.find(libDialect => libDialect.toLocaleLowerCase().endsWith(dialect.toLocaleLowerCase()))));
			}).catch(err => reject(err));
		});
	}

	private extractLibrariesFromJar(selectedLibDef: libdef, dialect: string, targetFolderPath: string): Promise<void> {
		return new Promise<void>(async (resolve, reject) => {
			if (!selectedLibDef.jarPath) reject();
			const libFiles: string[] = selectedLibDef.files[dialect];
			try {
				yauzl.open(selectedLibDef.jarPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
					if (err) reject(err);
					zipfile.on("error", (err) => {
						reject(err);
					});
					zipfile.on("entry", (entry) => {
						if (libFiles.length == 0) {
							resolve();
						}
						else if (!/\/$/.test(entry.fileName)) {
							const libFile: string = libFiles.find(fileName => fileName.includes(path.basename(entry.fileName)));
							if (libFile) {
								zipfile.openReadStream(entry, (error, readStream) => {
									if (error) reject(error);
									const writeStream = fs.createWriteStream(path.join(targetFolderPath, libFile), { flags: "a" });
									readStream.pipe(writeStream).on("error", (err) => {
										window.showInformationMessage(`Add library ${libFile} failed`);
										reject(`Copy library files failed with error: ${err}`);
									});
								});
								delete libFiles[libFile];
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
	constructor(public readonly name: string, public readonly description: string, public readonly depends: string[], public readonly files: {}, public jarPath?: string) {

	}
}

// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, ExtensionContext, RelativePattern, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as path from "path";
import * as fs from "fs-extra";

const yauzl = require("yauzl");

export class AddLibraryHandler {
	private readonly dialects = { vdmsl: "SL", vdmpp: "PP", vdmrt: "RT" };

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
			new Promise(async (resolve, reject) => {
				this.getDialect(wsFolder).then((dialect) => {
					// Gather available libraries and let user select
					const jarsPath = path.resolve(this.context.extensionPath, "resources", "jars", "vdmj");

					Promise.all(fs.readdirSync(jarsPath, { withFileTypes: true }).map((entry) => this.extractLibrariesFromJar(path.join(jarsPath, entry.name), dialect))).then(
						async (libsStreamMaps) => {
							const reducedStreamMap = libsStreamMaps.reduce((prev, curr) => new Map([...Array.from(prev.entries()), ...Array.from(curr.entries())]));

							const selectedLibs: string[] = await window.showQuickPick(Array.from(reducedStreamMap.keys()), {
								placeHolder: "Choose libraries",
								canPickMany: true,
							});

							// None selected
							if (selectedLibs === undefined || selectedLibs.length == 0) return resolve(`Empty selection. Add library completed.`);

							const folderPath = path.resolve(wsFolder.uri.fsPath, "lib");

							fs.ensureDir(folderPath)
								.then(async () => {
									try {
										const wsEncoding = workspace.getConfiguration("files", wsFolder).get("encoding", "utf8");
										if (!Buffer.isEncoding(wsEncoding)) console.log(`Encoding (files.encoding: ${wsEncoding}) not possible using the default: UTF-8`);

										selectedLibs.forEach((libName) => {
											const writeStream = fs.createWriteStream(path.join(folderPath, libName), { flags: "a" });
											reducedStreamMap
												.get(libName)
												.pipe(writeStream)
												.on("error", (err) => {
													window.showInformationMessage(`Add library ${libName} failed`);
													console.log(`Copy library files failed with error: ${err}`);
												});
										});
										resolve(`Add library completed.`);
									} catch (error) {
										window.showWarningMessage(`Add library failed with error: ${error}`);
										console.log(`Add library failed with error: ${error}`);
										reject(`Add library failed with error: ${error}`);
									}
								})
								.catch((error) => {
									window.showWarningMessage("Creating directory for library failed");
									console.log(`Creating directory for library files failed with error: ${error}`);
									reject(`Creating directory for library files failed with error: ${error}`);
								});
						}
					);
				});

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
			})
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
					window.showInformationMessage(`Add library failed! Unable to determine VDM dialect for workspace`);
					reject();
				}

				resolve(this.dialects[dialect]);
			}
		});
	}

	private extractLibrariesFromJar(jarsPath: string, dialect: string): Promise<Map<string, fs.ReadStream>> {
		return new Promise<Map<string, fs.ReadStream>>(async (resolve, reject) => {
			try {
				const fileNamesToStreams = new Map<string, fs.ReadStream>();
				yauzl.open(jarsPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
					if (err) reject(err);
					zipfile.on("end", () => {
						resolve(fileNamesToStreams);
					});
					zipfile.on("error", (err) => {
						reject(err);
					});
					zipfile.on("entry", (entry) => {
						if (!/\/$/.test(entry.fileName) && entry.fileName.toUpperCase().endsWith(dialect)) {
							zipfile.openReadStream(entry, (error, readStream) => {
								if (error) reject(error);
								fileNamesToStreams.set(path.basename(entry.fileName), readStream);
							});
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

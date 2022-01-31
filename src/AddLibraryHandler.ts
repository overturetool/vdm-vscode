// SPDX-License-Identifier: GPL-3.0-or-later

import {
    commands,
    ExtensionContext,
    ProgressLocation,
    QuickPickItem,
    RelativePattern,
    Uri,
    window,
    workspace,
    WorkspaceConfiguration,
    WorkspaceFolder,
} from "vscode";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as Path from "path";
import * as Fs from "fs-extra";
import * as Util from "./Util";

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
        Util.registerCommand(context, "vdm-vscode.addLibraryJarFolders", () =>
            Util.addToSettingsArray(true, "VDM libraries", "vdm-vscode.server.libraries", "VDM-Libraries")
        );
        Util.registerCommand(context, "vdm-vscode.addLibraryJars", () =>
            Util.addToSettingsArray(false, "VDM libraries", "vdm-vscode.server.libraries", "VDM-Libraries")
        );
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
                    this.getLibrariesFromJars(dialect, wsFolder).then(async (jarPathToLibs) => {
                        if (jarPathToLibs.size < 1) {
                            // No libraries available. Let user go to settings
                            window
                                .showInformationMessage(
                                    "Cannot locate any VDM libraries. These can be added in the settings",
                                    ...["Go to settings"]
                                )
                                .then(() => commands.executeCommand("workbench.action.openSettings", "vdm-vscode.server.libraries"));
                            return;
                        }

                        // Let user select libraries
                        const selectedItems: QuickPickItem[] = await window.showQuickPick(
                            Array.from(jarPathToLibs.values())
                                .reduce((prev, curr) => prev.concat(curr), [])
                                .map((lib) => ({ label: lib.name, description: lib.description } as QuickPickItem)),
                            {
                                placeHolder: jarPathToLibs.values().next() == undefined ? "No libraries available.." : "Choose libraries..",
                                canPickMany: true,
                            }
                        );
                        // None selected
                        if (selectedItems === undefined || selectedItems.length == 0)
                            return resolve(`Empty selection. Add library completed.`);

                        // Ensure that target folder exists
                        const libPathTarget = Path.resolve(wsFolder.uri.fsPath, "lib");
                        Fs.ensureDir(libPathTarget)
                            .then(() => {
                                const jarPathTofileNames: Map<string, string[]> = new Map();

                                // Find files that are needed for the selected libraries and map them to jarPaths
                                jarPathToLibs.forEach((libs: Library[], jarPath: string) => {
                                    const resolvedItems: QuickPickItem[] = [];
                                    selectedItems.forEach((quickPickItem) => {
                                        // Only act if the selected library name corresponds to library from this jar.
                                        const selectedLib = libs.find((lib) => lib.name == quickPickItem.label);
                                        // Resolve dependencies
                                        if (selectedLib) {
                                            const unresolvedDependencies: string[] = [];
                                            if (selectedLib.depends.length > 0) {
                                                const jarPathsToDependLibraries: Map<string, Library[]> = this.ResolveLibraryDependencies(
                                                    jarPath,
                                                    selectedLib,
                                                    jarPathToLibs,
                                                    new Map<string, Library[]>(),
                                                    unresolvedDependencies
                                                );

                                                // Add dependency files
                                                if (unresolvedDependencies.length == 0 && jarPathsToDependLibraries.size > 0) {
                                                    Array.from(jarPathsToDependLibraries.entries()).forEach((entry) => {
                                                        const fileNames: string[] = entry[1]
                                                            .map((lib) => lib.files)
                                                            .reduce((prev, cur) => prev.concat(cur));
                                                        if (jarPathTofileNames.has(entry[0])) {
                                                            jarPathTofileNames.get(entry[0]).push(...fileNames);
                                                        } else {
                                                            jarPathTofileNames.set(entry[0], fileNames);
                                                        }
                                                    });

                                                    // Inform of libraries being added as part of a dependency
                                                    window.showInformationMessage(
                                                        `Including '${Array.from(jarPathsToDependLibraries.values())
                                                            .reduce((prev, cur) => prev.concat(cur))
                                                            .map((lib) => lib.name)
                                                            .reduce((prev, cur) => prev + ", " + cur)}'` +
                                                            ` as required by '${selectedLib.name}' library dependencies`
                                                    );
                                                }
                                            }

                                            // Warn of any unresolved dependencies
                                            if (unresolvedDependencies.length > 0) {
                                                const msg = `Unable to resolve all dependencies for the library '${
                                                    selectedLib.name
                                                }' as the following dependencies could not be found: ${unresolvedDependencies.reduce(
                                                    (prev, cur) => prev + ", " + cur
                                                )}. '${selectedLib.name}' has not been added!`;
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
                                Promise.all(
                                    jarsToFiles.map((jarToFiles) =>
                                        this.copyLibFilesToTarget(jarToFiles[0], jarToFiles[1], libPathTarget, wsEncoding)
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

    private ResolveLibraryDependencies(
        jarPath: string,
        library: Library,
        jarPathToAllLibs: Map<string, Library[]>,
        jarPathToDependendLibs: Map<string, Library[]>,
        unresolvedDependencies: string[]
    ): Map<string, Library[]> {
        // Resolve dependencies
        library.depends.forEach((dependLibName) => {
            // First search through libraries from the jarPath where the dependencies originated.
            let dependency: Library = jarPathToAllLibs.get(jarPath).find((lib) => lib.name == dependLibName);
            if (!dependency) {
                // The dependency is not in the given jarPath - look in the other jars
                const otherJars = new Map(jarPathToAllLibs);
                otherJars.delete(jarPath);

                for (let entry of Array.from(otherJars)) {
                    dependency = entry[1].find((lib) => lib.name == dependLibName);
                    if (dependency) {
                        jarPath = entry[0];
                        break;
                    }
                }
            }

            if (dependency) {
                // Found the jar with the dependency. Add the library if not already in dependency map.
                if (jarPathToDependendLibs.has(jarPath)) {
                    if (!jarPathToDependendLibs.get(jarPath).find((dependencyLib) => dependencyLib.name == dependency.name)) {
                        jarPathToDependendLibs.get(jarPath).push(dependency);
                    }
                } else {
                    jarPathToDependendLibs.set(jarPath, [dependency]);
                }

                // Locate any depedencies of this dependency.
                if (dependency.depends.length > 0) {
                    jarPathToDependendLibs = new Map([
                        ...Array.from(jarPathToDependendLibs.entries()),
                        ...Array.from(
                            this.ResolveLibraryDependencies(
                                jarPath,
                                dependency,
                                jarPathToAllLibs,
                                jarPathToDependendLibs,
                                unresolvedDependencies
                            ).entries()
                        ),
                    ]);
                }
            } else {
                unresolvedDependencies.push(dependLibName);
            }
        });
        return jarPathToDependendLibs;
    }

    private getDialect(wsFolder: WorkspaceFolder): Promise<string> {
        return new Promise<string>(async (resolve, reject) => {
            const client = this.clients.get(wsFolder.uri.toString());
            if (client) {
                resolve(this.dialects[client.language]);
            } else {
                console.log(`No client found for the folder: ${wsFolder.name}`);

                // Guess dialect
                for (const dp in this.dialects) {
                    if ((await workspace.findFiles(new RelativePattern(wsFolder.uri.path, "*." + dp), null, 1)).length == 1)
                        return resolve(this.dialects[dp]);
                }
                // Let user chose
                const chosenDialect = await window.showQuickPick(Object.keys(this.dialects), {
                    placeHolder: "Choose dialect",
                    canPickMany: false,
                });
                if (!chosenDialect) {
                    reject("Add library failed! Unable to determine VDM dialect for workspace");
                } else {
                    resolve(this.dialects[chosenDialect]);
                }
            }
        });
    }

    public static getDefaultLibraryJars(extensionPath: string): string[] {
        const libPath = Path.resolve(extensionPath, "resources", "jars", "libs");
        if (!Fs.existsSync(libPath)) {
            const msg = "Invalid path for default libraries: " + libPath;
            window.showWarningMessage(msg);
            console.log(msg);
            return [];
        } else {
            return (
                Fs.readdirSync(libPath, { withFileTypes: true })
                    ?.filter((dirent) => dirent.name.endsWith(".jar"))
                    ?.map((dirent) => Path.resolve(libPath, dirent.name)) ?? []
            );
        }
    }

    public static async getUserDefinedLibraryJars(wsFolder: WorkspaceFolder): Promise<string[]> {
        const libraryConfig = workspace.getConfiguration("vdm-vscode.server.libraries", wsFolder);
        const libraryJars = libraryConfig.get("VDM-Libraries") as string[];
        // Get any library jars specified by the user
        return (
            (
                await Promise.all(
                    libraryJars.map((path) => {
                        if (Fs.existsSync(path)) {
                            if (Fs.lstatSync(path).isDirectory()) {
                                return Util.getFilesFromDir(path, "jar");
                            } else {
                                return [path];
                            }
                        }
                        return [];
                    })
                )
            )?.reduce((prev, cur) => prev.concat(cur), []) ?? []
        );
    }

    private getLibrariesFromJars(dialect: string, wsFolder: WorkspaceFolder): Promise<Map<string, Library[]>> {
        return new Promise<Map<string, Library[]>>(async (resolve, reject) => {
            // Get user defined library jars
            const jarPaths: string[] = await AddLibraryHandler.getUserDefinedLibraryJars(wsFolder);

            // Include default library jars
            if (workspace.getConfiguration("vdm-vscode.server.libraries", wsFolder).includeDefaultLibraries) {
                jarPaths.push(...AddLibraryHandler.getDefaultLibraryJars(this.context.extensionPath));
            }
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
                                                // Get library information and close file
                                                const jsonData = JSON.parse(data.toString());
                                                zipfile.close();
                                                // Create mapping from jar path to libraries
                                                const jarPathToLib: [string, Library[]] = [jarPath, []];
                                                const libraries: Library[] = jsonData[dialect];
                                                if (libraries) {
                                                    // Include jarpath in library object
                                                    libraries.forEach((library) => {
                                                        const libraryToAdd = library;
                                                        libraryToAdd.jarPath = jarPath;
                                                        jarPathToLib[1].push(libraryToAdd);
                                                    });
                                                }
                                                return resolve(jarPathToLib);
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
                    // Collect entries to single map
                    const jarPathsToLibs: Map<string, Library[]> = new Map();
                    jarPathToLibs.forEach((jarToLib) => {
                        if (jarToLib[0] && jarToLib[1].length > 0) {
                            // Watch out for libraries with identical names
                            const jarPathToDuplicateLibs: Map<string, Library[]> = new Map();
                            for (let entry of Array.from(jarPathsToLibs.entries())) {
                                const duplicateLib = Array.from(entry[1]).find((existingLib) =>
                                    jarToLib[1].find((newLib) => existingLib.name == newLib.name)
                                );
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

                            jarPathsToLibs.set(jarToLib[0], jarToLib[1]);
                        }
                    });
                    resolve(jarPathsToLibs);
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
                        const fileName = Path.basename(entry.fileName);
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
                                    if (!Buffer.isEncoding(wsEncoding))
                                        console.log(`Encoding (files.encoding: ${wsEncoding}) not possible using the default: UTF-8`);
                                    // Create writestream with needed encoding to the target path
                                    const writeStream = Fs.createWriteStream(Path.join(targetFolderPath, fileName), {
                                        encoding:
                                            wsEncoding == this.libraryEncoding || !Buffer.isEncoding(wsEncoding)
                                                ? this.libraryEncoding
                                                : wsEncoding,
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
    constructor(
        public readonly name: string,
        public readonly description: string,
        public readonly depends: string[],
        public readonly files: string[],
        public jarPath?: string
    ) {}
}

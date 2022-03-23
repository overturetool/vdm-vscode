// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, QuickPickItem, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { SpecificationLanguageClient } from "../slsp/SpecificationLanguageClient";
import * as Path from "path";
import * as Fs from "fs-extra";
import * as Util from "../util/Util";
import { guessDialect, getDialectFromAlias, pickDialect, vdmDialects } from "../util/DialectUtil";
import { ClientManager } from "../ClientManager";
import AutoDisposable from "../helper/AutoDisposable";
// Zip library
import yauzl = require("yauzl");
// Encoding library
import iconv = require("iconv-lite");
import { getExtensionPath } from "../util/ExtensionUtil";
import { getFilesFromDirRecur } from "../util/DirectoriesUtil";

export class AddLibraryHandler extends AutoDisposable {
    private readonly _libraryEncoding: BufferEncoding = "utf8";
    private static _userDefinedJarPaths: string[] = [];

    constructor(private readonly clientManager: ClientManager) {
        super();
        commands.executeCommand("setContext", "vdm-vscode.addLibrary", true);
        Util.registerCommand(this._disposables, "vdm-vscode.addLibrary", (inputUri: Uri) =>
            this.addLibrary(workspace.getWorkspaceFolder(inputUri))
        );
        Util.registerCommand(this._disposables, "vdm-vscode.addLibraryJarFolders", () =>
            Util.addToSettingsArray(true, "VDM libraries", "vdm-vscode.server.libraries", "VDM-Libraries")
        );
        Util.registerCommand(this._disposables, "vdm-vscode.addLibraryJars", () =>
            Util.addToSettingsArray(false, "VDM libraries", "vdm-vscode.server.libraries", "VDM-Libraries")
        );
    }

    public static getIncludedLibrariesFolderPath(extensionPath: string, wsFolder: WorkspaceFolder): string {
        // Get the standard or high precision path of the included library jars folder
        const libPath: string = Path.resolve(
            extensionPath,
            "resources",
            "jars",
            workspace.getConfiguration("vdm-vscode.server", wsFolder)?.highPrecision ? "vdmj_hp" : "vdmj" ?? "vdmj",
            "libs"
        );

        if (!Fs.existsSync(libPath)) {
            AddLibraryHandler.showAndLogWarning("Invalid path for default libraries: " + libPath);
            return "";
        }

        return libPath;
    }

    public static getUserDefinedLibraryJars(wsFolder: WorkspaceFolder): string[] {
        // Get library jars specified by the user at the folder level setting - if not defined at this level then the "next up" level where it is defined is returned.
        let folderSettings: string[] = (workspace.getConfiguration("vdm-vscode.server.libraries", wsFolder.uri)?.get("VDM-Libraries") ??
            []) as string[];

        // Get library jars specified by the user at the user or workspace level setting - if the workspace level setting is defined then it is returned instead of the user level setting.
        let userOrWorkspaceSettings: string[] = (workspace.getConfiguration("vdm-vscode.server.libraries")?.get("VDM-Libraries") ??
            []) as string[];
        const resolveFailedPaths: string[] = [];
        const jarPathsFromSettings: string[] = AddLibraryHandler.resolveJarPathsFromSettings(
            folderSettings,
            resolveFailedPaths,
            "Folder",
            wsFolder.uri
        );

        // Determine if settings are equal, e.g. if the setting is not defined at the folder level.
        if (
            folderSettings.length != userOrWorkspaceSettings.length ||
            !folderSettings.every((ujp: string) => userOrWorkspaceSettings.find((fjp: string) => fjp == ujp))
        ) {
            // If the settings are not equal then merge them and in case of duplicate jar names the folder level takes precedence over the workspace/user level.
            jarPathsFromSettings.push(
                ...AddLibraryHandler.resolveJarPathsFromSettings(userOrWorkspaceSettings, resolveFailedPaths, "User or Workspace").filter(
                    (uwsPath: string) => {
                        const uwsPathName: string = Path.basename(uwsPath);
                        const existingJarPath: string = jarPathsFromSettings.find(
                            (fsPath: string) => Path.basename(fsPath) == Path.basename(uwsPath)
                        );
                        if (existingJarPath) {
                            window.showInformationMessage(
                                `The library jar ${uwsPathName} has been defined on multiple setting levels. The path '${existingJarPath}' from the 'folder' level is being used.`
                            );
                            return false;
                        }
                        return true;
                    }
                )
            );
        }

        if (resolveFailedPaths.length > 0) {
            const msg: string = `Unable to resolve the following VDM library jar/folder paths: <${resolveFailedPaths.reduce(
                (prev, curr) => (curr += `> <${prev}`)
            )}>. These can be changed in the settings.`;
            console.log(msg);
            window
                .showInformationMessage(msg, ...["Go to settings"])
                .then(() => commands.executeCommand("workbench.action.openSettings", "vdm-vscode.server.libraries"));
        }

        // Save the list of jar paths as this is the list known by the server and therefore does not need to be generated again.
        AddLibraryHandler._userDefinedJarPaths = jarPathsFromSettings;
        return jarPathsFromSettings;
    }

    private static resolveJarPathsFromSettings(
        jarPaths: string[],
        resolveFailedPaths: string[],
        settingsLevel: string,
        rootUri?: Uri
    ): string[] {
        // Resolve jar paths, flatten directories, filter duplicate jar names and inform the user
        const visitedJarPaths: Map<string, string> = new Map<string, string>();
        return (
            jarPaths
                .map((path: string) => {
                    const originalPath: string = path;
                    if (rootUri && !Path.isAbsolute(path)) {
                        // Path should be relative to the project
                        const resolvedPath: string = Path.resolve(...[rootUri.fsPath, path]);
                        path = resolvedPath;
                    }
                    if (!Fs.existsSync(path)) {
                        resolveFailedPaths.push(originalPath);
                        return [];
                    }
                    return Fs.lstatSync(path).isDirectory() ? getFilesFromDirRecur(path, "jar") : [path];
                })
                ?.reduce((prev: string[], cur: string[]) => prev.concat(cur), []) ?? []
        ).filter((jarPath: string) => {
            const jarName: string = Path.basename(jarPath);
            if (!visitedJarPaths.has(jarName)) {
                visitedJarPaths.set(jarName, jarPath);
                return true;
            }
            window.showInformationMessage(
                `The library jar '${jarName}' is in multiple paths for the setting level ${settingsLevel}. Using the path '${visitedJarPaths.get(
                    jarName
                )}'.`
            );
            return false;
        });
    }

    private static showAndLogWarning(msg: string, err?: string) {
        window.showWarningMessage(msg);
        console.log(err ? `${msg} - ${err}` : msg);
    }

    private async addLibrary(wsFolder: WorkspaceFolder) {
        window.setStatusBarMessage(
            `Adding Libraries.`,
            new Promise((resolve, reject) => {
                this.getDialect(wsFolder)
                    .then((dialect: vdmDialects) =>
                        // Gather available libraries in jars
                        this.getLibInfoFromJars(dialect, wsFolder).then(async (jarPathToLibs: Map<string, LibInfo[]>) => {
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
                                    .reduce((prev: LibInfo[], curr: LibInfo[]) => prev.concat(curr), [])
                                    .map((lib: LibInfo) => ({ label: lib.name, description: lib.description } as QuickPickItem)),
                                {
                                    placeHolder:
                                        jarPathToLibs.values().next() == undefined ? "No libraries available.." : "Choose libraries..",
                                    canPickMany: true,
                                }
                            );
                            // None selected
                            if (selectedItems === undefined || selectedItems.length == 0)
                                return resolve(`Empty selection. Add library completed.`);

                            // Ensure that target folder exists
                            const libPathTarget: string = Path.resolve(wsFolder.uri.fsPath, "lib");
                            Fs.ensureDir(libPathTarget)
                                .then(() => {
                                    const jarPathTofileNames: Map<string, string[]> = new Map();

                                    // Find files that are needed for the selected libraries and map them to jarPaths
                                    jarPathToLibs.forEach((libs: LibInfo[], jarPath: string) => {
                                        const resolvedItems: QuickPickItem[] = [];
                                        selectedItems.forEach((quickPickItem: QuickPickItem) => {
                                            // Only act if the selected library name corresponds to library from this jar.
                                            const selectedLib: LibInfo = libs.find((lib) => lib.name == quickPickItem.label);
                                            // Resolve dependencies
                                            if (selectedLib) {
                                                const unresolvedDependencies: string[] = [];
                                                if (selectedLib.depends.length > 0) {
                                                    const jarPathsToDependLibraries: Map<string, LibInfo[]> =
                                                        this.ResolveLibraryDependencies(
                                                            jarPath,
                                                            selectedLib,
                                                            jarPathToLibs,
                                                            new Map<string, LibInfo[]>(),
                                                            unresolvedDependencies
                                                        );

                                                    // Add dependency files
                                                    if (unresolvedDependencies.length == 0 && jarPathsToDependLibraries.size > 0) {
                                                        Array.from(jarPathsToDependLibraries.entries()).forEach(
                                                            (entry: [string, LibInfo[]]) => {
                                                                const fileNames: string[] = entry[1]
                                                                    .map((lib: LibInfo) => lib.files)
                                                                    .reduce((prev: string[], cur: string[]) => prev.concat(cur));
                                                                if (jarPathTofileNames.has(entry[0])) {
                                                                    jarPathTofileNames.get(entry[0]).push(...fileNames);
                                                                } else {
                                                                    jarPathTofileNames.set(entry[0], fileNames);
                                                                }
                                                            }
                                                        );

                                                        // Inform of libraries being added as part of a dependency
                                                        window.showInformationMessage(
                                                            `Additionally including '${Array.from(jarPathsToDependLibraries.values())
                                                                .reduce((prev: LibInfo[], cur: LibInfo[]) => prev.concat(cur))
                                                                .map((lib: LibInfo) => lib.name)
                                                                .reduce((prev: string, cur: string) => prev + ", " + cur)}'` +
                                                                ` as required by '${selectedLib.name}' library dependencies`
                                                        );
                                                    }
                                                }

                                                // Warn of any unresolved dependencies
                                                if (unresolvedDependencies.length > 0) {
                                                    AddLibraryHandler.showAndLogWarning(
                                                        `Unable to resolve all dependencies for the library '${
                                                            selectedLib.name
                                                        }' as the following dependencies could not be found: ${unresolvedDependencies.reduce(
                                                            (prev: string, cur: string) => prev + ", " + cur
                                                        )}. '${selectedLib.name}' has not been added!`
                                                    );
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
                                        resolvedItems.forEach((itemToRemove: QuickPickItem) =>
                                            selectedItems.splice(
                                                selectedItems.findIndex(
                                                    (quickPickItem: QuickPickItem) => quickPickItem.label == itemToRemove.label
                                                ),
                                                1
                                            )
                                        );
                                    });

                                    // Remove any duplicate file names
                                    const jarsToFiles: [string, string[]][] = Array.from(jarPathTofileNames.entries()).map((entry) => [
                                        entry[0],
                                        entry[1].filter((elem: string, index: number, self: string[]) => index === self.indexOf(elem)),
                                    ]);

                                    // Copy library files from jars to the target folder
                                    const wsEncoding = workspace.getConfiguration("files", wsFolder).get("encoding", "utf8");
                                    Promise.all(
                                        jarsToFiles.map((jarToFiles: [string, string[]]) =>
                                            this.copyLibFilesToTarget(jarToFiles[0], jarToFiles[1], libPathTarget, wsEncoding)
                                        )
                                    )
                                        .then(() => {
                                            resolve("Added libraries.");
                                        })
                                        .catch((err: any) => {
                                            const msg: string = "Failed to add library";
                                            AddLibraryHandler.showAndLogWarning(msg, `Error: ${err}`);
                                            reject(msg);
                                        });
                                })
                                .catch((error: any) => {
                                    const msg: string = "Creating directory for library files failed";
                                    AddLibraryHandler.showAndLogWarning(msg, `Error: ${error}`);
                                    reject(msg);
                                });
                        })
                    )
                    .catch((e: any) => {
                        console.info(`[AddLibrary] Failed with error: ${e}`);
                    });
            })
        );
    }

    private ResolveLibraryDependencies(
        jarPath: string,
        library: LibInfo,
        jarPathToAllLibs: Map<string, LibInfo[]>,
        jarPathToDependendLibs: Map<string, LibInfo[]>,
        unresolvedDependencies: string[]
    ): Map<string, LibInfo[]> {
        // Resolve dependencies
        library.depends.forEach((dependLibName) => {
            // First search through libraries from the jarPath where the dependencies originated.
            let dependency: LibInfo = jarPathToAllLibs.get(jarPath).find((lib: LibInfo) => lib.name == dependLibName);
            if (!dependency) {
                // The dependency is not in the given jarPath - look in the other jars
                const otherJars: Map<string, LibInfo[]> = new Map(jarPathToAllLibs);
                otherJars.delete(jarPath);

                for (let entry of Array.from(otherJars)) {
                    dependency = entry[1].find((lib: LibInfo) => lib.name == dependLibName);
                    if (dependency) {
                        jarPath = entry[0];
                        break;
                    }
                }
            }

            if (dependency) {
                // Found the jar with the dependency. Add the library if not already in dependency map.
                if (jarPathToDependendLibs.has(jarPath)) {
                    if (!jarPathToDependendLibs.get(jarPath).find((dependencyLib: LibInfo) => dependencyLib.name == dependency.name)) {
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

    private getDialect(wsFolder: WorkspaceFolder): Promise<vdmDialects> {
        return new Promise<vdmDialects>((resolve, reject) => {
            const client: SpecificationLanguageClient = this.clientManager.get(wsFolder);
            if (client) {
                resolve(getDialectFromAlias(client.languageId));
            } else {
                console.log(`No client found for the folder: ${wsFolder.name}`);

                // Guess dialect
                guessDialect(wsFolder)
                    .then((d: vdmDialects) => resolve(d))
                    .catch(async () => {
                        // Let user chose
                        await pickDialect()
                            .then((pick) => {
                                if (!pick) reject("Add library failed! Unable to determine VDM dialect for workspace");
                                else resolve(pick);
                            })
                            .catch((e) => reject(e));
                    });
            }
        });
    }

    private getLibInfoFromJars(dialect: vdmDialects, wsFolder: WorkspaceFolder): Promise<Map<string, LibInfo[]>> {
        return new Promise<Map<string, LibInfo[]>>((resolve, reject) => {
            // Get user defined library jars
            const jarPaths: string[] = AddLibraryHandler._userDefinedJarPaths;

            // Include default library jars
            if (workspace.getConfiguration("vdm-vscode.server.libraries", wsFolder).includeDefaultLibraries) {
                let includedJarsPaths: string[] = getFilesFromDirRecur(
                    AddLibraryHandler.getIncludedLibrariesFolderPath(getExtensionPath(), wsFolder),
                    "jar"
                );

                if (jarPaths.length > 0) {
                    includedJarsPaths = includedJarsPaths.filter((ijp: string) => {
                        const jarName: string = Path.basename(ijp);
                        const existingJarPath: string = jarPaths.find((jp: string) => Path.basename(jp) == jarName);
                        if (existingJarPath) {
                            window.showInformationMessage(
                                `The included library jar '${jarName}' is also defined by the user in the path '${existingJarPath}'. Ignoring the version included with the extension.`
                            );
                            return false;
                        }
                        return true;
                    });
                }

                jarPaths.push(...includedJarsPaths);
            }

            if (!jarPaths || jarPaths.length < 1) return resolve(new Map());

            // Extract libraries information from jars
            Promise.all(
                jarPaths.map(
                    (jarPath: string) =>
                        new Promise<[string, LibInfo[]]>((resolve, reject) => {
                            yauzl.open(jarPath, { lazyEntries: true, autoClose: true }, (err: any, zipfile: any) => {
                                if (err) reject(err);
                                zipfile.on("error", (err: any) => {
                                    zipfile.close();
                                    reject(err);
                                });
                                // Resolve to empty array if the whole zip file has been read without finding any libraries information file
                                zipfile.on("end", () => {
                                    zipfile.close();
                                    resolve(["", []]);
                                });
                                zipfile.on("entry", (entry: any) => {
                                    // If a libraries information file has been found then read it else read the next zip entry
                                    if (!/\/$/.test(entry.fileName) && entry.fileName.toLowerCase().endsWith("library.json")) {
                                        zipfile.openReadStream(entry, (error: any, readStream: any) => {
                                            if (error) {
                                                zipfile.close();
                                                return reject(error);
                                            }
                                            readStream.on("data", (data: any) => {
                                                // Get libraries information and close file
                                                const jsonData: any = JSON.parse(data.toString());
                                                zipfile.close();
                                                // Create mapping from jar path to library information
                                                const jarPathToLib: [string, LibInfo[]] = [jarPath, []];
                                                const libraries: LibInfo[] = jsonData[dialect];
                                                if (libraries) {
                                                    // Include jarpath in library information object
                                                    libraries.forEach((library: LibInfo) => {
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
            ) // When we have looked through all jar files and found all information on all libraries
                .then((jarPathToLibs: [string, LibInfo[]][]) => {
                    // Collect entries to single map
                    const jarPathsToLibs: Map<string, LibInfo[]> = new Map();
                    jarPathToLibs.forEach((jarToLibInfos: [string, LibInfo[]]) => {
                        if (jarToLibInfos[0] && jarToLibInfos[1].length > 0) {
                            // Watch out for libraries with identical names
                            const jarPathToDuplicateLibs: Map<string, LibInfo[]> = new Map();
                            jarPathsToLibs.forEach((existingLibInfos, existingJarName) => {
                                jarToLibInfos[1]
                                    .filter((libInfo: LibInfo) =>
                                        existingLibInfos.find((existingLibInfo: LibInfo) => libInfo.name == existingLibInfo.name)
                                    )
                                    .forEach((libInfo: LibInfo) => {
                                        // Library has already been found in another jar so no need to extract it from this jar.
                                        jarToLibInfos[1].splice(
                                            jarToLibInfos[1].findIndex((lib) => lib.name == libInfo.name),
                                            1
                                        );

                                        if (jarPathToDuplicateLibs.has(existingJarName)) {
                                            jarPathToDuplicateLibs.get(existingJarName).push(libInfo);
                                        } else {
                                            jarPathToDuplicateLibs.set(existingJarName, [libInfo]);
                                        }
                                    });
                            });
                            // Inform of libraries with identical names - this is done per jar to avoid generating too many messages.
                            jarPathToDuplicateLibs.forEach((libraries: LibInfo[], jarPath: string) => {
                                AddLibraryHandler.showAndLogWarning(
                                    `Libraries '${libraries
                                        .map((library) => library.name)
                                        .reduce((prev, cur) => prev + ", " + cur)}' are in multiple jars.. Using libraries from '${jarPath}`
                                );
                            });

                            jarPathsToLibs.set(jarToLibInfos[0], jarToLibInfos[1]);
                        }
                    });
                    resolve(jarPathsToLibs);
                })
                .catch((err: any) => reject(err));
        });
    }

    private copyLibFilesToTarget(jarPath: string, libFileNames: string[], targetFolderPath: string, wsEncoding: string): Promise<void> {
        // Extract library from jar file and write it to the target folder
        return new Promise<void>((resolve, reject) => {
            if (!jarPath) return reject();
            if (libFileNames.length < 1) return resolve();
            try {
                // Open the jar file
                yauzl.open(jarPath, { lazyEntries: true, autoClose: true }, (err: any, zipfile: any) => {
                    if (err) return reject(err);
                    zipfile.on("error", (err: any) => {
                        reject(err);
                    });

                    zipfile.on("end", () => {
                        reject(
                            `Unable to locate and copy the following files: ${libFileNames.reduce(
                                (prev: string, cur: string) => prev + ", " + cur
                            )}`
                        );
                    });

                    // Handle entry
                    zipfile.on("entry", (entry: any) => {
                        const fileName: string = Path.basename(entry.fileName);
                        // Resolve when all library files have been found
                        if (libFileNames.length < 1) {
                            zipfile.close();
                            resolve();
                        } else if (!/\/$/.test(entry.fileName)) {
                            // A file has been found and not a folder. See if the file is for a library that needs to be extracted and copy it to the target folder
                            const libFileNamesIndex: number = libFileNames.findIndex((libFileName: string) => libFileName == fileName);
                            if (libFileNamesIndex >= 0) {
                                // Create a read stream from the file and pipe it to a write stream to the target folder.
                                zipfile.openReadStream(entry, (error: any, readStream: any) => {
                                    if (error) return reject(error);
                                    // Check encoding
                                    if (!Buffer.isEncoding(wsEncoding))
                                        console.log(`Encoding (files.encoding: ${wsEncoding}) not possible using the default: UTF-8`);
                                    // Create writestream with needed encoding to the target path
                                    const writeStream: Fs.WriteStream = Fs.createWriteStream(Path.join(targetFolderPath, fileName), {
                                        encoding:
                                            wsEncoding == this._libraryEncoding || !Buffer.isEncoding(wsEncoding)
                                                ? this._libraryEncoding
                                                : wsEncoding,
                                    });

                                    // Pipe the readstream into the iconv-lite decoder, then into the encoder (to handle workspaces encoded in other formats than utf8), then finally to the writestream and handle erros.
                                    readStream
                                        .pipe(iconv.decodeStream(this._libraryEncoding))
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
            } catch (exception: any) {
                reject(exception);
            }
        });
    }
}

class LibInfo {
    constructor(
        public readonly name: string,
        public readonly description: string,
        public readonly depends: string[],
        public readonly files: string[],
        public jarPath?: string
    ) {}
}

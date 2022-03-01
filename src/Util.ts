// SPDX-License-Identifier: GPL-3.0-or-later

import * as Path from "path";
import * as Fs from "fs-extra";
import { commands, Disposable, DocumentFilter, DocumentSelector, Uri, window, workspace, WorkspaceFolder } from "vscode";
import * as glob from "glob";

export function ensureDirectoryExistence(filePath) {
    var dirname = Path.dirname(filePath);
    return Fs.ensureDirSync(dirname);
}

export function getDefaultWorkspaceFolderLocation(): Uri | undefined {
    if (workspace.workspaceFolders === undefined) {
        return undefined;
    }
    if (workspace.workspaceFile && workspace.workspaceFile.scheme == "file") {
        return Uri.parse(Path.dirname(workspace.workspaceFile.path));
    }
    if (workspace.workspaceFolders.length > 0) {
        return Uri.parse(Path.dirname(workspace.workspaceFolders[0].uri.path));
    }
    return undefined;
}

export function recursivePathSearch(resourcesPath: string, searcher: { [Symbol.search](string: string): number }): string {
    if (!Fs.existsSync(resourcesPath) || !isDir(resourcesPath)) return null;

    let elementsInFolder = Fs.readdirSync(resourcesPath, { withFileTypes: true });
    for (let i = 0; i < elementsInFolder.length; i++) {
        let element: Fs.Dirent = elementsInFolder[i];
        let fullElementPath = Path.resolve(resourcesPath, element.name);
        if (isDir(fullElementPath)) fullElementPath = recursivePathSearch(fullElementPath, searcher);
        else if (fullElementPath.split(Path.sep)[fullElementPath.split(Path.sep).length - 1].search(searcher) != -1) return fullElementPath;
    }
    return null;
}

export function isDir(path: Fs.PathLike): boolean {
    return Fs.lstatSync(path).isDirectory();
}

export function createDirectory(fullUri: Uri, timestamped?: boolean): Promise<Uri> {
    return new Promise((resolve, reject) => {
        try {
            if (timestamped) {
                var dateString = new Date().toLocaleString().replace(/\//g, "-").replace(/:/g, "."); //Replace "/" in date format and ":" in time format as these are not allowed in directory names..
                fullUri = Uri.parse(fullUri + " " + dateString);
            }

            Fs.ensureDirSync(fullUri.fsPath);
            return resolve(fullUri);
        } catch (error) {
            console.warn(`[Util] Create directory failed with error: ${error}`);
            reject(error);
        }
    });
}

export function createDirectorySync(fullUri: Uri, timestamped?: boolean): Uri {
    if (timestamped) {
        //Replace "/" in date format and ":" in time format as these are not allowed in directory names..
        var dateString = new Date().toLocaleString().replace(/\//g, "-").replace(/:/g, ".");
        fullUri = Uri.parse(fullUri + " " + dateString);
    }

    Fs.ensureDirSync(fullUri.fsPath);

    return fullUri;
}

export function writeToLog(path: string, msg: string) {
    let logStream = Fs.createWriteStream(path, { flags: "a" });
    let timeStamp = `[${new Date(Date.now()).toLocaleString()}] `;
    logStream.write(timeStamp + msg + "\n");
    logStream.close();
}

export async function addToSettingsArray(
    folders: boolean,
    settingName: string,
    configurationIdentifier: string,
    configurationSettingElement: string
) {
    window.setStatusBarMessage(
        `Adding to ${settingName}`,
        new Promise(async (resolve, reject) => {
            // Determine scope
            const wsFolders = workspace.workspaceFolders;
            let defaultScopes = ["User", "Workspace"];
            let scopes = defaultScopes;
            if (wsFolders.length > 1) wsFolders.forEach((f) => scopes.push(f.name));
            let scopeName: string = await window.showQuickPick(scopes, {
                placeHolder: "Choose scope",
                canPickMany: false,
            });
            if (scopeName === undefined) return reject(`Empty selection. Aborting.`);
            let scope = scopes.findIndex((x) => x == scopeName);

            // Get location(s) to add
            const workspaceFolder = scope < 2 ? undefined : wsFolders[scope - 2];
            const location = await window.showOpenDialog({
                defaultUri: workspaceFolder && workspaceFolder.uri,
                canSelectFiles: !folders,
                canSelectFolders: folders,
                canSelectMany: true,
                openLabel: "Add",
                title: `Add to ${settingName}`,
            });

            // None selected
            if (!location || !location.length) {
                return reject("No location(s) selected");
            }

            // Get current class path additions
            const configuration = workspace.getConfiguration(configurationIdentifier, workspaceFolder);
            const cpa = configuration.inspect(configurationSettingElement);
            if (!cpa) return reject("Cannot find configuration element");

            let currentSettingElementValue;
            if (scope == 0)
                // User
                currentSettingElementValue = cpa.globalValue;
            else if (scope == 1)
                // Workspace
                currentSettingElementValue = cpa.workspaceValue;
            else currentSettingElementValue = cpa.workspaceFolderValue;

            // Make sure a class path array exists
            if (!currentSettingElementValue) currentSettingElementValue = [];

            // Add selected locations
            location.forEach((l) => {
                if (!currentSettingElementValue.includes(l.fsPath)) currentSettingElementValue.push(l.fsPath);
            });

            // Save to configurations file
            configuration.update(configurationSettingElement, currentSettingElementValue, scope < 2 ? scope + 1 : 3);

            resolve(`Add to ${settingName} completed`);
        })
    );
}

export function getFilesFromDir(dir: string, fileType: string): string[] {
    const files = Fs.readdirSync(dir, { withFileTypes: true }).map((dirent) => {
        const filePath: string = Path.resolve(dir, dirent.name);
        return dirent.isDirectory() ? getFilesFromDir(filePath, fileType) : filePath.endsWith(fileType) ? filePath : [];
    });
    return Array.prototype.concat(...files);
}

// MIT Licensed code from: https://github.com/georgewfraser/vscode-javac
export function findJavaExecutable(binname: string) {
    if (process.platform === "win32") binname = binname + ".exe";

    // First search each JAVA_HOME bin folder
    if (process.env["JAVA_HOME"]) {
        let workspaces = process.env["JAVA_HOME"].split(Path.delimiter);
        for (let i = 0; i < workspaces.length; i++) {
            let binpath = Path.join(workspaces[i], "bin", binname);
            if (Fs.existsSync(binpath)) {
                return binpath;
            }
        }
    }

    // Then search PATH parts
    if (process.env["PATH"]) {
        let pathparts = process.env["PATH"].split(Path.delimiter);
        for (let i = 0; i < pathparts.length; i++) {
            let binpath = Path.join(pathparts[i], binname);
            if (Fs.existsSync(binpath)) {
                return binpath;
            }
        }
    }

    // Else return the binary name directly (this will likely always fail downstream)
    return null;
}

export function registerCommand(disposables: Disposable[], command: string, callback: (...args: any[]) => any) {
    let disposable = commands.registerCommand(command, callback);
    disposables.push(disposable);
    return disposable;
}

export function joinUriPath(uri: Uri, ...additions: string[]): Uri {
    let uriString = uri.toString() + "/" + additions.join("/");
    return Uri.parse(uriString);
}

/**
 * Used to determine if a Uri matches with the parameters of a document selector.
 * Normally you would use the vscode.languages.match(DocumentSelector, TextDocument) function.
 * However, this requires a TextDocument, which is not possible to get for folders.
 * For features like "translate" they can be applied at a folder level, hecnce the need for matching folder URIs.
 * This match function tries to match as many of the DocumentSelector parameters as possible, but may not work for some edgecases.
 */
export function match(documentSelector: DocumentSelector, uri: Uri) {
    let dsArray: ReadonlyArray<DocumentFilter | string> = Array.isArray(documentSelector) ? documentSelector : [documentSelector];
    let match = 0;

    for (const ds of dsArray.values()) {
        if (typeof ds != "string") {
            let df = ds as DocumentFilter;
            if (df.pattern) {
                const g = new glob.GlobSync(df.pattern.toString());
                const found = g.found.map((f) => f.toLowerCase());
                if (found.some((f) => f.includes(uri.path.substring(1).toLowerCase()))) {
                    if (df.scheme) {
                        if (df.scheme == uri.scheme) {
                            ++match;
                        }
                    } else {
                        ++match;
                    }
                }
            } else if (df.scheme && df.language === undefined) {
                if (df.scheme == uri.scheme) {
                    ++match;
                }
            }
        } else if (ds == "*") {
            ++match;
        }
    }

    return match;
}

export function isSameUri(a: Uri, b: Uri) {
    if (!a || !b) return false;
    return a.toString() == b.toString();
}

export function isSameWorkspaceFolder(a: WorkspaceFolder, b: WorkspaceFolder) {
    if (!a || !b) return false;
    else return isSameUri(a.uri, b.uri);
}

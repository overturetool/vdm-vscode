// SPDX-License-Identifier: GPL-3.0-or-later

import * as path from 'path'
import * as fs from 'fs'
import { commands, ExtensionContext, RelativePattern, Uri, window, workspace, WorkspaceFolder } from 'vscode';
import { DocumentUri } from 'vscode-languageclient';

export function ensureDirectoryExistence(filePath) {
    var dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }

    fs.mkdirSync(dirname, { recursive: true });

    return fs.existsSync(dirname);
}

export function getDefaultWorkspaceFolderLocation(): Uri | undefined {
    if (workspace.workspaceFolders === undefined) {
        return undefined;
    }
    if (workspace.workspaceFile && workspace.workspaceFile.scheme == 'file') {
        return Uri.parse(path.dirname(workspace.workspaceFile.path));
    }
    if (workspace.workspaceFolders.length === 1) {
        return workspace.workspaceFolders[0].uri;
    }
    if (window.activeTextEditor) {
        return workspace.getWorkspaceFolder(window.activeTextEditor.document.uri).uri;
    }
    return undefined;
}

export function getJarsFromFolder(resourcesPath: string): string[] {
    if (!fs.existsSync(resourcesPath) || !isDir(resourcesPath))
        return null;

    let jarPaths: string[] = []
    let elementsInFolder = fs.readdirSync(resourcesPath, { withFileTypes: true });
    for (let i = 0; i < elementsInFolder.length; i++) {
        let element: fs.Dirent = elementsInFolder[i];
        let fullElementPath = path.resolve(resourcesPath, element.name);
        if (!isDir(fullElementPath) && element.name.search(/.*jar/i) != -1)
            jarPaths.push(fullElementPath);
    }
    return jarPaths;
}

export function recursivePathSearch(resourcesPath: string, searcher: { [Symbol.search](string: string): number; }): string {
    if (!fs.existsSync(resourcesPath) || !isDir(resourcesPath))
        return null;

    let elementsInFolder = fs.readdirSync(resourcesPath, { withFileTypes: true });
    for (let i = 0; i < elementsInFolder.length; i++) {
        let element: fs.Dirent = elementsInFolder[i];
        let fullElementPath = path.resolve(resourcesPath, element.name);
        if (isDir(fullElementPath))
            fullElementPath = recursivePathSearch(fullElementPath, searcher);
        else if (fullElementPath.split(path.sep)[fullElementPath.split(path.sep).length - 1].search(searcher) != -1)
            return fullElementPath;
    }
    return null;
}

export function isDir(path: fs.PathLike): boolean {
    return fs.lstatSync(path).isDirectory();
}

export function createDirectory(fullUri: Uri): Promise<void> {
    return new Promise((resolve, reject) => {
        ensureDirectoryExistence(fullUri.fsPath);
        fs.access(fullUri.fsPath, fs.constants.F_OK | fs.constants.R_OK, (accessErr) => {
            if (!accessErr)
                return resolve();
            if (accessErr.code === 'ENOENT') {
                fs.mkdir(fullUri.fsPath, dirErr => {
                    if (dirErr) {
                        return reject(dirErr);
                    }
                    return resolve();
                });
            }
            else
                return reject(accessErr);
        });
    });
}

export function createTimestampedDirectory(rootPath: Uri, dirName: string): Promise<DocumentUri> {
    return new Promise(async (resolve, reject) => {
        var dateString = new Date().toLocaleString().replace(/\//g, "-").replace(/:/g, "."); //Replace "/" in date format and ":" in time format as these are not allowed in directory names..
        let fullUri = Uri.joinPath(rootPath, dirName + " " + dateString);
        ensureDirectoryExistence(fullUri.fsPath);
        fs.access(fullUri.fsPath, fs.constants.F_OK | fs.constants.R_OK, (accessErr) => {
            if (!accessErr)
                return resolve(fullUri.fsPath);
            if (accessErr.code === 'ENOENT') {
                fs.mkdir(fullUri.fsPath, dirErr => {
                    if (dirErr) {
                        return reject(dirErr);
                    }
                    return resolve(fullUri.toString());
                });
            }
            else
                return reject(accessErr);
        });
    });
}

export function writeToLog(path: string, msg: string) {
    let logStream = fs.createWriteStream(path, { flags: 'a' });
    let timeStamp = `[${new Date(Date.now()).toLocaleString()}] `
    logStream.write(timeStamp + msg + "\n");
    logStream.close();
}

// MIT Licensed code from: https://github.com/georgewfraser/vscode-javac
export function findJavaExecutable(binname: string) {
    if (process.platform === 'win32')
        binname = binname + '.exe';

    // First search each JAVA_HOME bin folder
    if (process.env['JAVA_HOME']) {
        let workspaces = process.env['JAVA_HOME'].split(path.delimiter);
        for (let i = 0; i < workspaces.length; i++) {
            let binpath = path.join(workspaces[i], 'bin', binname);
            if (fs.existsSync(binpath)) {
                return binpath;
            }
        }
    }

    // Then search PATH parts
    if (process.env['PATH']) {
        let pathparts = process.env['PATH'].split(path.delimiter);
        for (let i = 0; i < pathparts.length; i++) {
            let binpath = path.join(pathparts[i], binname);
            if (fs.existsSync(binpath)) {
                return binpath;
            }
        }
    }

    // Else return the binary name directly (this will likely always fail downstream) 
    return null;
}

export async function guessDialect(wsFolder: WorkspaceFolder) {
    const dialects = { "vdmsl": "SL", "vdmpp": "PP", "vdmrt": "RT" }
    let dialect = undefined;
    for (var dp in dialects) {
        let pattern = new RelativePattern(wsFolder.uri.path, "*." + dp);
        let res = await workspace.findFiles(pattern, null, 1)
        if (res.length == 1) dialect = dp;
    }

    return dialect
}

export function registerCommand(context: ExtensionContext, command: string, callback: (...args: any[]) => any) {
    let disposable = commands.registerCommand(command, callback)
    context.subscriptions.push(disposable);
    return disposable;
};
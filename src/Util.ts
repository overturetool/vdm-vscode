// SPDX-License-Identifier: GPL-3.0-or-later

import * as path from 'path'
import * as fs from 'fs-extra'
import { commands, DocumentFilter, DocumentSelector, ExtensionContext, RelativePattern, Uri, workspace, WorkspaceFolder } from 'vscode';
import * as glob from 'glob'

export function ensureDirectoryExistence(filePath) {
    var dirname = path.dirname(filePath);
    return fs.ensureDirSync(dirname);
}

export function getDefaultWorkspaceFolderLocation(): Uri | undefined {
    if (workspace.workspaceFolders === undefined) {
        return undefined;
    }
    if (workspace.workspaceFile && workspace.workspaceFile.scheme == 'file') {
        return Uri.parse(path.dirname(workspace.workspaceFile.path));
    }
    if (workspace.workspaceFolders.length > 0) {
        return Uri.parse(path.dirname(workspace.workspaceFolders[0].uri.path));
    }
    return undefined;
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

export function createDirectory(fullUri: Uri, timestamped?: boolean): Promise<Uri> {
    return new Promise((resolve, reject) => {
        if (timestamped) {
            var dateString = new Date().toLocaleString().replace(/\//g, "-").replace(/:/g, "."); //Replace "/" in date format and ":" in time format as these are not allowed in directory names..
            fullUri = Uri.parse(fullUri + " " + dateString);
        }

        fs.ensureDir(fullUri.fsPath).then(
            () => resolve(fullUri),
            e => reject(e)
        );
    });
}

export function createDirectorySync(fullUri: Uri, timestamped?: boolean): Uri {
    if (timestamped) {
        //Replace "/" in date format and ":" in time format as these are not allowed in directory names..
        var dateString = new Date().toLocaleString().replace(/\//g, "-").replace(/:/g, ".");
        fullUri = Uri.parse(fullUri + " " + dateString);
    }

    fs.ensureDirSync(fullUri.fsPath);

    return fullUri;
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

export function joinUriPath(uri: Uri, ...additions: string[]): Uri {
    let uriString = uri.toString() + '/' + additions.join('/')
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
                let g = new glob.GlobSync(df.pattern.toString());
                if (g.found.some(f => f.includes(uri.path.substring(1)))) {
                    if (df.scheme) {
                        if (df.scheme == uri.scheme) {
                            ++match;
                        }
                    }
                    else {
                        ++match;
                    }
                }
            }
            else if (df.scheme && df.language === undefined) {
                if (df.scheme == uri.scheme) {
                    ++match;
                }
            }
        }
        else if (ds == '*') {
            ++match;
        }
    }

    return match;
}

export function isSameUri(a: Uri, b: Uri) {
    return a.toString() == b.toString();
}

export function isSameWorkspaceFolder(a: WorkspaceFolder, b: WorkspaceFolder) {
    return isSameUri(a.uri, b.uri);
}
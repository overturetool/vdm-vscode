// SPDX-License-Identifier: GPL-3.0-or-later

import * as Path from "path";
import * as Fs from "fs-extra";
import { Uri } from "vscode";

export function ensureDirectoryExistence(filePath) {
    var dirname = Path.dirname(filePath);
    return Fs.ensureDirSync(dirname);
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

export function getFilesFromDirRecur(dir: string, fileType: string): string[] {
    const files = Fs.readdirSync(dir, { withFileTypes: true }).map((dirent) => {
        const filePath: string = Path.resolve(dir, dirent.name);
        return dirent.isDirectory() ? getFilesFromDirRecur(filePath, fileType) : filePath.endsWith(fileType) ? filePath : [];
    });
    return Array.prototype.concat(...files);
}

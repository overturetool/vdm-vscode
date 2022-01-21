// SPDX-License-Identifier: GPL-3.0-or-later

import * as Path from "path";
// import * as fs from 'fs'
import * as Fs from "fs-extra";
import { commands, ExtensionContext, RelativePattern, Uri, window, workspace, WorkspaceFolder } from "vscode";

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
		if (timestamped) {
			var dateString = new Date().toLocaleString().replace(/\//g, "-").replace(/:/g, "."); //Replace "/" in date format and ":" in time format as these are not allowed in directory names..
			fullUri = Uri.parse(fullUri + " " + dateString);
		}

		Fs.ensureDirSync(fullUri.fsPath);
		return resolve(fullUri);
	});
}

export function writeToLog(path: string, msg: string) {
	let logStream = Fs.createWriteStream(path, { flags: "a" });
	let timeStamp = `[${new Date(Date.now()).toLocaleString()}] `;
	logStream.write(timeStamp + msg + "\n");
	logStream.close();
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

export async function getFilesFromDir(dir: string, fileType: string): Promise<string[]> {
	const dirents = await Fs.readdirSync(dir, { withFileTypes: true });
	const files = await Promise.all(
		dirents.map((dirent) => {
			const res = Path.resolve(dir, dirent.name);
			return dirent.isDirectory() ? this.getLibraryJarPaths(res, fileType) : res.endsWith(fileType) ? res : [];
		})
	);
	return Array.prototype.concat(...files);
}

export function registerCommand(context: ExtensionContext, command: string, callback: (...args: any[]) => any) {
	let disposable = commands.registerCommand(command, callback);
	context.subscriptions.push(disposable);
	return disposable;
}

export function joinUriPath(uri: Uri, ...additions: string[]): Uri {
	let uriString = uri.toString() + "/" + additions.join("/");
	return Uri.parse(uriString);
}

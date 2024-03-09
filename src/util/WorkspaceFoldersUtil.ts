// SPDX-License-Identifier: GPL-3.0-or-later

import { Uri, workspace, WorkspaceFolder } from "vscode";
import * as Path from "path";

let _sortedWorkspaceFolders: string[] | undefined;

export function sortedWorkspaceFolders(): string[] {
    if (_sortedWorkspaceFolders === void 0) {
        _sortedWorkspaceFolders = workspace.workspaceFolders
            ? workspace.workspaceFolders
                  .map((folder) => {
                      let result = folder.uri.toString();
                      if (result.charAt(result.length - 1) !== "/") {
                          result = result + "/";
                      }
                      return result;
                  })
                  .sort((a, b) => {
                      return a.length - b.length;
                  })
            : [];
    }
    return _sortedWorkspaceFolders;
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

export function getOuterMostWorkspaceFolder(folder: WorkspaceFolder): WorkspaceFolder {
    const sorted = sortedWorkspaceFolders();
    console.log(sorted);
    for (const element of sorted) {
        let uri = folder.uri.toString();
        if (uri.charAt(uri.length - 1) !== "/") {
            uri = uri + "/";
        }
        if (uri.startsWith(element)) {
            return workspace.getWorkspaceFolder(Uri.parse(element))!;
        }
    }
    console.log(folder);
    return folder;
}

export function isSameUri(a: Uri, b: Uri) {
    if (!a || !b) return false;
    return a.toString() == b.toString();
}

export function isSameWorkspaceFolder(a: WorkspaceFolder, b: WorkspaceFolder) {
    if (!a || !b) return false;
    else return isSameUri(a.uri, b.uri);
}

export function resetSortedWorkspaceFolders() {
    _sortedWorkspaceFolders = undefined;
}

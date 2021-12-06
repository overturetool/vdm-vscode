// SPDX-License-Identifier: GPL-3.0-or-later

import { ExtensionContext, window, workspace } from "vscode";
import * as util from "./Util"

export class AddToClassPathHandler {
    constructor(
        context: ExtensionContext
    ) {
        util.registerCommand(context, "vdm-vscode.addFoldersToClassPath", () => this.addToClassPath(true));
        util.registerCommand(context, "vdm-vscode.addFilesToClassPath", () => this.addToClassPath(false));
    }

    private async addToClassPath(folders: boolean) {
        window.setStatusBarMessage(`Adding to Class Path.`, new Promise(async (resolve, reject) => {
            // Determine scope
            const wsFolders = workspace.workspaceFolders;
            let defaultScopes = ["User","Workspace"];
            let scopes = defaultScopes;
            wsFolders.forEach(f => scopes.push(f.name))
            let scopeName: string = await window.showQuickPick(scopes, {
                placeHolder: 'Choose scope',
                canPickMany: false,
            });
            if (scopeName === undefined) return reject(`Empty selection. Aborting.`)
            let scope = scopes.findIndex(x => x == scopeName)
            
            // Get location(s) to add
            const workspaceFolder = (scope < 2 ? undefined : wsFolders[scope-2])
            const location = await window.showOpenDialog({
                defaultUri: workspaceFolder && workspaceFolder.uri,
                canSelectFiles: !folders,
                canSelectFolders: folders,
                canSelectMany:true,
                openLabel: "Add",
                title: "Add to class path..."
            });

             // None selected
            if (!location || !location.length) { 
                return reject("No location(s) selected"); 
            }

            // Get current class path additions
            const configuration = workspace.getConfiguration('vdm-vscode', workspaceFolder);
            const cpa = configuration.inspect("classPathAdditions");
            let classPaths;
            if (scope == 0) // User
                classPaths = cpa.globalValue;
            else if (scope == 1) // Workspace
                classPaths = cpa.workspaceValue;
            else 
                classPaths = cpa.workspaceFolderValue;

            // Make sure a class path array exists
            if (!classPaths)
                classPaths = [];

            // Add selected locations
            location.forEach(l => {
                if(!classPaths.includes(l.fsPath))
                    classPaths.push(l.fsPath);
            })

            // Save to configurations file
            configuration.update("classPathAdditions", classPaths, (scope < 2 ? scope + 1 : 3));

            resolve("Add to class path completed");
        }));
    }
}



// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, ExtensionContext, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as util from "./Util"
import { Dirent, readdirSync } from 'fs';
import { copySync } from 'fs-extra';
import * as path from 'path'



export class AddExampleHandler {

    constructor(
        private readonly clients: Map<string, SpecificationLanguageClient>,
        private context: ExtensionContext
    ) {
        this.context = context;
        this.registerCommand(() => this.addExample());
    }

    private registerCommand = (callback: (...args: any[]) => any) => {
        let disposable = commands.registerCommand("vdm-vscode.importExample", callback)
        this.context.subscriptions.push(disposable);
        return disposable;
    };

    private async addExample() {


        const dialects = ["VDMSL", "VDM++", "VDMRT"];

        window.setStatusBarMessage(`Adding Example.`, new Promise(async (resolve, reject) => {

            let dialect: string = await window.showQuickPick(dialects, {
                placeHolder: 'Choose dialect',
                canPickMany: false,
            });

            if (dialect === undefined) return reject(`Empty selection. Add example completed.`)

            // Gather available examples and let user select
            const exaPath = path.resolve(this.context.extensionPath, "resources", "examples", dialect);

            const exsInFolder: Dirent[] = readdirSync(exaPath, { withFileTypes: true });

            let exsOptions: string[] = exsInFolder.map((x: Dirent) => x.name);

            let selectedEx: string = await window.showQuickPick(exsOptions, {
                placeHolder: 'Choose example',
                canPickMany: false,
            });

            // None selected 
            if (selectedEx === undefined) return reject(`Empty selection. Add example completed.`)

            // Get save location
            const workspaceFolderLocation = util.getDefaultWorkspaceFolderLocation();
            const location = await window.showOpenDialog({
                defaultUri: workspaceFolderLocation,
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: "Select project location",
                title: `Select Folder that the project ${selectedEx} should be created within`
            });

            // None selected
            if (!location || !location.length) {
                return;
            }

            // Project save location
            let projectPath = path.resolve(location[0].fsPath, selectedEx);
            let projectUri = Uri.file(projectPath);

            // Sync copy
            try {
                copySync(path.resolve(exaPath, selectedEx), projectPath)
            } catch (err) {
                window.showInformationMessage(`Add example ${selectedEx} failed`);
                console.log(`Copy example files failed with error: ${err}`);
            }

            // Open project
            if (workspace && workspace.workspaceFolders && workspace.workspaceFolders.length > 0) { // Add imported example to workspace if there are workspace folders in the window
                workspace.updateWorkspaceFolders(
                    workspace.workspaceFolders.length,
                    null,
                    {
                        uri: projectUri,
                        name: selectedEx
                    }
                )
            } else { // Otherwise open the imported folder
                await commands.executeCommand("vscode.openFolder", projectUri);
            }

            resolve(`Add example completed.`);


        }));

    }
}



// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, ExtensionContext, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as util from "./Util"
import { copyFile, Dirent, readdirSync } from 'fs';
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

            const workspaceFolder = util.getDefaultWorkspaceFolder();
            const location = await window.showOpenDialog({
                defaultUri: workspaceFolder && workspaceFolder.uri,
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany:false,
                openLabel: "Save",
                title: "Save in folder..."
            });
            if (!location || !location.length) {
                return;
            }
        
            const basePath: string = location[0].fsPath;

            let destURI = Uri.joinPath(location[0], selectedEx);
            util.createDirectory(destURI).then(async () => {
                try {


                    const srcPath = path.resolve(exaPath, selectedEx);
                    const files = readdirSync(srcPath);

                    for (const file of files) {

                        copyFile(path.resolve(srcPath, file), path.resolve(destURI.fsPath,file), (reason) => {

                            if (reason) {
                                window.showInformationMessage(`Add example ${selectedEx} failed`);
                                console.log(`Copy example files failed with error: ${reason}`);
                                reject(`Add example  ${selectedEx} failed.`);
                            }
                        }
                        );
                    }

                    const openInNewWindow = workspace && workspace.workspaceFolders && workspace.workspaceFolders.length > 0;
                    await commands.executeCommand("vscode.openFolder", Uri.file(path.join(basePath, selectedEx)), openInNewWindow);

                    resolve(`Add example completed.`);
                }
                catch (error) {
                    window.showWarningMessage(`Fetching example failed with error: ${error}`);
                    console.log(`Fetching example failed with error: ${error}`);
                    reject(`Add example  ${selectedEx} failed.`);
                }
            }, (reason) => {
                window.showWarningMessage("Creating directory for example failed");
                console.log(`Creating directory for example files failed with error: ${reason}`);
                reject(`Add example  ${selectedEx} failed.`);
            });
        }));

    }
}

// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, ExtensionContext, RelativePattern, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as path from 'path'
import * as fs from 'fs-extra'

export class AddLibraryHandler {

    constructor(
        private readonly clients: Map<string, SpecificationLanguageClient>,
        private context: ExtensionContext
    ) {
        commands.executeCommand('setContext', 'add-lib-show-button', true);
        this.context = context;
        this.registerCommand((inputUri: Uri) => this.addLibrary(workspace.getWorkspaceFolder(inputUri)));
    }

    private registerCommand = (callback: (...args: any[]) => any) => {
        let disposable = commands.registerCommand("vdm-vscode.addLibrary", callback)
        this.context.subscriptions.push(disposable);
        return disposable;
    };

    private async addLibrary(wsFolder: WorkspaceFolder) {

        let dialect = null;
        const dialects = { "vdmsl": "SL", "vdmpp": "PP", "vdmrt": "RT" }

        window.setStatusBarMessage(`Adding Libraries.`, new Promise(async (resolve, reject) => {
            let client = this.clients.get(wsFolder.uri.toString());
            if (client) {
                dialect = dialects[client.language];
            } else {
                console.log(`No client found for the folder: ${wsFolder.name}`);

                // Guess dialect
                for (var dp in dialects) {
                    let pattern = new RelativePattern(wsFolder.uri.path, "*." + dp);
                    let res = await workspace.findFiles(pattern, null, 1)
                    if (res.length == 1) dialect = dialects[dp];
                }

                if (dialect == null) {
                    // TODO could insert a selection window here so that the user can manually choose the dialect if we can't guess
                    window.showInformationMessage(`Add library failed! Unable to guess VDM dialect for workspace`);
                    reject();
                    return;
                }
            }

            // Gather available libraries and let user select
            const libPath = path.resolve(this.context.extensionPath, "resources", "lib", dialect);

            const libsInFolder: fs.Dirent[] = fs.readdirSync(libPath, { withFileTypes: true });

            let libsOptions: string[] = libsInFolder.map((x: fs.Dirent) => x.name);

            let selectedLibs: string[] = await window.showQuickPick(libsOptions, {
                placeHolder: 'Choose libraries',
                canPickMany: true,
            });

            // None selected 
            if (selectedLibs === undefined || selectedLibs.length == 0) return resolve(`Empty selection. Add library completed.`)

            const folderPath = path.resolve(wsFolder.uri.fsPath, "lib");
            fs.ensureDir(folderPath).then(async () => {
                try {
                    for (const lib of selectedLibs) {
                        // Copy library from resources/lib to here
                        fs.copyFile(path.resolve(libPath, lib), path.resolve(folderPath, lib), (reason) => {
                            if (reason) {
                                window.showInformationMessage(`Add library ${lib} failed`);
                                console.log(`Copy library files failed with error: ${reason}`);
                                reject(`Add library  ${lib} failed.`);
                            }
                            window.showInformationMessage(`Add library ${lib} completed`);
                        }
                        );
                    }
                    resolve(`Add library completed.`);
                }
                catch (error) {
                    window.showWarningMessage(`Add library failed with error: ${error}`);
                    console.log(`Add library failed with error: ${error}`);
                    reject();
                }
            }).catch(error => {
                window.showWarningMessage("Creating directory for library failed");
                console.log(`Creating directory for library files failed with error: ${error}`);
                reject();
            });
        }));

    }
}

// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, ExtensionContext, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as util from "./Util"
import { copyFile, Dirent, readdirSync } from 'fs';
import * as path from 'path'


export class AddLibraryHandler {

    constructor(
        private readonly clients: Map<string, SpecificationLanguageClient>,
        private context: ExtensionContext
    ) {
        this.context = context;
        this.registerCommand((inputUri: Uri) => this.addLibrary(workspace.getWorkspaceFolder(inputUri)));
    }

    private registerCommand = (callback: (...args: any[]) => any) => {
        let disposable = commands.registerCommand("vdm-vscode.addLibrary", callback)
        this.context.subscriptions.push(disposable);
        return disposable;
    };

    private async addLibrary(wsFolder: WorkspaceFolder) {

        window.setStatusBarMessage(`Adding Libraries.`, new Promise(async (resolve, reject) => {
            let client = this.clients.get(wsFolder.uri.toString());
            if (client == undefined) {
                window.showInformationMessage(`No client found for the folder: ${wsFolder.name}`);
                return;
            }


            util.createLibDirectory(wsFolder.uri).then(async (projLibPath) => {
                try {

                    const dialect = "PP";
                    const libPath = path.resolve(this.context.extensionPath, "resources", "lib", dialect);

                    const libsInFolder: Dirent[] = readdirSync(libPath, { withFileTypes: true });

                    let libsOptions: string[] = libsInFolder.map((x: Dirent) => x.name);

                    let selectedLibs: string[] = await window.showQuickPick(libsOptions, {
                        placeHolder: 'Choose libraries',
                        canPickMany: true,
                    });


                    for (let lib of selectedLibs) {

                        window.showInformationMessage(`Adding library ${lib}`);

                        // Copy library from resources/lib to here
                        copyFile(path.resolve(libPath, lib), path.resolve(projLibPath, lib), (reason) => {

                            if (reason) {
                                resolve(`Add library  ${lib} failed.`);
                                window.showInformationMessage(`Add library ${lib} failed`);
                                util.writeToLog(client.logPath, `Copy library files failed with error: ${reason}`);
                                reject();
                            }
                            window.showInformationMessage(`Add library ${lib} completed`);
                        }
                        );
                    }
                    resolve(`Add library completed.`);
                }
                catch (error) {
                    window.showWarningMessage(`Add library failed with error: ${error}`);
                    util.writeToLog(client.logPath, `Add library failed with error: ${error}`);
                    reject();
                }
            }, (reason) => {
                window.showWarningMessage("Creating directory for library failed");
                util.writeToLog(client.logPath, `Creating directory for library files failed with error: ${reason}`);
                reject();
            });


        }));

    }
}
// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, ExtensionContext, RelativePattern, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as util from "./Util"
import { copyFile, Dirent, readdirSync } from 'fs';
import * as path from 'path'
import { VdmDapSupport } from "./VdmDapSupport";
import { SlowBuffer } from "buffer";


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

        let dialect = null;
        const dialects = {"vdmsl" : "SL", "vdmpp" : "PP", "vdmrt" : "RT"}

        window.setStatusBarMessage(`Adding Libraries.`, new Promise(async (resolve, reject) => {
            let client = this.clients.get(wsFolder.uri.toString());
            if (client) {
                dialect = dialects[client.dialect];
            }else{
            console.log(`No client found for the folder: ${wsFolder.name}`);

                // Guess dialect
                for (var dp in dialects){
                   let pattern = new RelativePattern(wsFolder.uri.path, "*." + dp);
                   let res = await workspace.findFiles(pattern,null,1)
                   if(res.length == 1) dialect = dialects[dp];
                } 

                if(dialect == null)
                {
                    // TODO could insert a selection window here so that the user can manually choose the dialect if we can't guess
                    window.showInformationMessage(`Add library failed! Unable to guess VDM dialect for workspace`); 
                    reject();
                    return;
                }
            }

            // Gather available libraries and let user select
            const libPath = path.resolve(this.context.extensionPath, "resources", "lib", dialect);
            
            const libsInFolder: Dirent[] = readdirSync(libPath, { withFileTypes: true });
            
            let libsOptions: string[] = libsInFolder.map((x: Dirent) => x.name);

            let selectedLibs: string[] = await window.showQuickPick(libsOptions, {
                placeHolder: 'Choose libraries',
                canPickMany: true,
            });

            // None selected 
            if(selectedLibs === undefined || selectedLibs.length == 0) return resolve(`Empty selection. Add library completed.`)

            let folderUri = Uri.joinPath(wsFolder.uri, "lib");

            util.createDirectory(folderUri).then(async () => {
                try {

                    for (let lib of selectedLibs) {

                        window.showInformationMessage(`Adding library ${lib}`);

                        // Copy library from resources/lib to here
                        copyFile(path.resolve(libPath, lib), path.resolve(folderUri.path, lib), (reason) => {

                            if (reason) {
                                window.showInformationMessage(`Add library ${lib} failed`);
                                console.log( `Copy library files failed with error: ${reason}`);
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
            }, (reason) => {
                window.showWarningMessage("Creating directory for library failed");
                console.log(`Creating directory for library files failed with error: ${reason}`);
                reject();
            });
        }));

    }
}

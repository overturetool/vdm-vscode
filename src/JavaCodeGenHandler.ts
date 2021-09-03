// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, ExtensionContext, RelativePattern, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as util from "./Util"
import {spawn} from 'child_process';
import * as path from 'path'



export class JavaCodeGenHandler {

    constructor(
        private readonly clients: Map<string, SpecificationLanguageClient>,
        private context: ExtensionContext
    ) {
        this.context = context;
        this.registerCommand((inputUri: Uri) => this.javaCodeGen(workspace.getWorkspaceFolder(inputUri)));
    }

    private registerCommand = (callback: (...args: any[]) => any) => {
        let disposable = commands.registerCommand("vdm-vscode.javaCodeGen", callback)
        this.context.subscriptions.push(disposable);
        return disposable;
    };

    private async javaCodeGen(wsFolder: WorkspaceFolder) {

        let dialect = null;
        let dialectext = null;
        const dialects = { "vdmsl": "sl", "vdmpp": "pp", "vdmrt": "rt" }

        window.setStatusBarMessage(`Starting code generation.`, new Promise(async (resolve, reject) => {
            let client = this.clients.get(wsFolder.uri.toString());
            if (client && client.dialect) {
                dialect = dialects[client.dialect];
                dialectext = client.dialect;

            } else {
                console.log(`No client found for the folder: ${wsFolder.name}`);

                // Guess dialect
                for (var dp in dialects) {
                    let pattern = new RelativePattern(wsFolder.uri.path, "*." + dp);
                    let res = await workspace.findFiles(pattern, null, 1)
                    if (res.length == 1) {
                        dialect = dialects[dp];
                        dialectext = dp;
                    }
                }

                if (!dialect || !dialectext) {
                    // TODO could insert a selection window here so that the user can manually choose the dialect if we can't guess
                    window.showInformationMessage(`Code generation failed! Unable to guess VDM dialect for workspace`);
                    reject();
                    return;
                }
            }

            let folderUri = Uri.joinPath(wsFolder.uri, "generated", "java");

            util.createDirectory(folderUri).then(async () => {
                try {

                    // Invoke java code gen
                    let args: string[] = [];

                    let javaPath = util.findJavaExecutable('java');
                    if (!javaPath) {
                        window.showErrorMessage("Java runtime environment not found!")
                        console.log("Java runtime environment not found!");
                        reject();
                    }
                   
                    let jarPath = util.recursivePathSearch(path.resolve(this.context.extensionPath, "resources", "jars"), /javagen.*jar/i);
                    if (!jarPath) {
                        window.showErrorMessage("Code generation jar not found!")
                        console.log("Code generation jar not found!");
                        reject();
                    }   
                    args.push(...[
                        '-jar',
                        jarPath,
                        '-' + dialect,
                        '-output', folderUri.fsPath
                    ]);

                    let pattern = new RelativePattern(wsFolder.uri.path, "*." + dialectext);
                    let res = await workspace.findFiles(pattern, null)
                    if (res && res.length > 0) 
                    {
                        args.push(...res.map( u => u.fsPath));
                    }
                    else{
                        window.showErrorMessage("Could not find project files!")
                        console.log("Could not find project files!");
                        reject();
                    }

                    const outputChannel = window.createOutputChannel(`Java Code Generation`);
                    outputChannel.show(false);

                    const javap = spawn(javaPath, args); 

                    javap.stdout.on('data', (data) => {
                        outputChannel.append(data.toString());
                    });

                    javap.stderr.on('data', (data) => {
                        outputChannel.append(data.toString());
                    });
                      
                    javap.on('close', (code) => {
                        if (code != 0){
                            window.showErrorMessage("Code generation error!")
                            console.log(`child process exited with code ${code}`);
                            reject();
                        }
                    });

                    resolve(`Code  generation completed.`);
                }
                catch (error) {
                    window.showWarningMessage(`Code generation failed with error: ${error}`);
                    console.log(`Code generation failed with error: ${error}`);
                    reject();
                }
            }, (reason) => {
                window.showWarningMessage("Creating directory for code failed");
                console.log(`Creating directory for code failed with error: ${reason}`);
                reject();
            });
        }));
    }
}
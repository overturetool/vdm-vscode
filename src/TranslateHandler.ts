// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from "fs";
import { commands, DecorationOptions, ExtensionContext, Range, Uri, ViewColumn, window, workspace, WorkspaceFolder } from "vscode";
import { TranslateParams, TranslateRequest } from "./protocol.slsp";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as util from "./Util"

export class TranslateHandler {
    constructor(
        private readonly clients: Map<string, SpecificationLanguageClient>,
        private context: ExtensionContext,
        private readonly languageKind: string,
        private readonly translationCommandName
    ) {
        this.registerCommand(this.translationCommandName, (inputUri: Uri) => this.translate(inputUri, workspace.getWorkspaceFolder(inputUri)));
    }

    private registerCommand = (command: string, callback: (...args: any[]) => any) => {
        let disposable = commands.registerCommand(command, callback)
        this.context.subscriptions.push(disposable);
        return disposable;
    };

    private async translate(fileUri: Uri, wsFolder: WorkspaceFolder) {
        window.setStatusBarMessage(`Generating ${this.languageKind}.`, new Promise(async (resolve, reject) => {
            let client = this.clients.get(wsFolder.uri.toString());
            if (client == undefined){
                window.showInformationMessage(`No client found for the folder: ${wsFolder.name}`);
                return;
            }

            // Check if server supports the translation
            if (client.initializeResult.capabilities?.experimental?.translateProvider
                && (typeof client.initializeResult.capabilities.experimental.translateProvider != "boolean")
                && (client.initializeResult.capabilities.experimental.translateProvider.languageId?.includes(this.languageKind))
            ) {

                util.createTimestampedDirectory(client.projectSavedDataPath, this.languageKind).then(async (saveUri): Promise<void> => {
                    try {
                        // Setup message parameters
                        let params: TranslateParams = {
                            languageId: this.languageKind,
                            saveUri: saveUri.toString()
                        };
                        if (fileUri.toString() != wsFolder.uri.toString()) // If it not the workspace folder add the uri. 
                            params.uri = fileUri.toString();
                        
                        // Add arguments based on settings
                        this.addArguments(params);

                        // Send request
                        const response = await client.sendRequest(TranslateRequest.type, params);

                        // Check if a directory has been returned
                        if (!util.isDir(Uri.parse(response.uri).fsPath)) {
                            if ( this.languageKind == SpecificationLanguageClient.covLanguageId ) {
                                // Open the main file in the translation
                                let doc = await workspace.openTextDocument(Uri.parse(fileUri.toString()));

                                const decorationType = window.createTextEditorDecorationType({
                                    backgroundColor: '#0080FF80',
                                    border: '2px solid black',
                                })

                                let ranges = getCovtblFileRanges(Uri.parse(response.uri).fsPath)

                                // Show the file
                                window.showTextDocument(doc.uri)
                                    .then( (editor) => editor.setDecorations(decorationType, ranges)
                                    );
                            }
                            else {
                                // Open the main file in the translation
                                let doc = await workspace.openTextDocument(Uri.parse(response.uri));

                                // Show the file
                                window.showTextDocument(doc.uri, { viewColumn: ViewColumn.Beside })
                            }
                        }

                        resolve(`Generation of ${this.languageKind} succeeded.`);
                        window.showInformationMessage(`Generation of ${this.languageKind} completed`);
                    }
                    catch (error) {
                        window.showWarningMessage(`Generation of ${this.languageKind} failed with error: ${error}`);
                        util.writeToLog(client.logPath, `Generation of ${this.languageKind} failed with error: ${error}`);
                        reject();
                    }
                }, (reason) => {
                    window.showWarningMessage("Creating timestamped directory failed");
                    util.writeToLog(client.logPath, `Creating timestamped directory failed with error: ${reason}`);
                    reject();
                });
            }
            else {
                window.showInformationMessage(`Generation of ${this.languageKind} is not supported`);
            }
        }));

    }

    private addArguments(params:TranslateParams) : void {
        const config = workspace.getConfiguration(
            this.translationCommandName,
            workspace.workspaceFolders[0].uri
        );

        let once = true;
        Object.keys(config).forEach(key => {
            if (typeof config[key] !== 'function') {
                if (once){params.arguments = []; once = false;} // Initialise argument only once

                // Add argument object to array
                let obj = {};
                obj[key] = config[key];
                params.arguments.push(obj)
                // TODO Change to?: params.arguments.push(`${key}=${config[key]}`)
            }
        });
    }
}

function getCovtblFileRanges(fsPath: string): DecorationOptions[] {

    let ranges: DecorationOptions[] = [];

    try {
        // read contents of the file
        const data = readFileSync(fsPath, { encoding: 'utf8' });

        // split the contents by new line
        const lines = data.split(/\r?\n/);

        // iterate over each coverage region
        lines.forEach((line) => {

            if ( line.length > 0){

            // Lines follow "ln c1-c2+ct"
            let lnsplit = line.split(" ");
            let c1split = lnsplit[1].split("-");
            let c2split = c1split[1].split("=");
            //
            let ln = parseInt(lnsplit[0]);
            let c1 = parseInt(c1split[0]);
            let c2 = parseInt(c2split[0]);

            let range = new Range(ln-1, c1-1, ln-1, c2);

            ranges.push({ range });

            }

        });

    } catch (err) {
        console.error(err);
    }

    return ranges
}

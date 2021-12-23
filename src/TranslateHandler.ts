// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from 'fs-extra'
import { commands, DecorationOptions, ExtensionContext, Range, Uri, ViewColumn, window, workspace, WorkspaceFolder } from "vscode";
import { TranslateParams, TranslateRequest } from "./protocol.slsp";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as util from "./Util"
import * as LanguageId from "./LanguageId"


export class TranslateHandler {
    readonly extensionName: string;
    constructor(
        private readonly clients: Map<string, SpecificationLanguageClient>,
        private context: ExtensionContext,
        private readonly language: string,
        private readonly translationCommandName: string
    ) {
        this.registerCommand(this.translationCommandName, (inputUri: Uri) => this.translate(inputUri, workspace.getWorkspaceFolder(inputUri)));
        this.extensionName = this.context.extension?.id?.split('.')[1];
    }

    private registerCommand = (command: string, callback: (...args: any[]) => any) => {
        let disposable = commands.registerCommand(command, callback)
        this.context.subscriptions.push(disposable);
        return disposable;
    };

    private async translate(fileUri: Uri, wsFolder: WorkspaceFolder) {
        window.setStatusBarMessage(`Generating ${this.language}.`, new Promise(async (resolve, reject) => {
            let client = this.clients.get(wsFolder.uri.toString());
            if (client == undefined) {
                window.showInformationMessage(`No client found for the folder: ${wsFolder.name}`);
                return;
            }

            // Check if server supports the translation
            if (client.initializeResult.capabilities?.experimental?.translateProvider
                && (typeof client.initializeResult.capabilities.experimental.translateProvider != "boolean")
                && (client.initializeResult.capabilities.experimental.translateProvider.languageId?.includes(this.language))
            ) {
                // Check timestamp setting
                const translateConfig = workspace.getConfiguration(
                    [this.extensionName, 'translate', 'general'].join('.'),
                    wsFolder.uri
                );
                let saveLocation = util.joinUriPath(client.projectSavedDataUri, this.language);
                util.createDirectory(saveLocation, translateConfig?.get("storeAllTranslations")).then(
                    async (saveUri): Promise<void> => {
                        try {
                            // Make sure the directory is empty
                            fs.emptyDirSync(saveUri.fsPath);

                            // Setup message parameters
                            let params: TranslateParams = {
                                languageId: this.language,
                                saveUri: saveUri.toString()
                            };

                            // If it not the workspace folder add the uri. 
                            if (translateConfig?.allowSingleFileTranslation && fileUri.toString() != wsFolder.uri.toString())
                                params.uri = fileUri.toString();

                            // Add options based on configuration settings
                            params = this.addOptions(params, wsFolder);

                            // Send request
                            const response = await client.sendRequest(TranslateRequest.type, params);

                            // Check if a directory has been returned
                            if (!util.isDir(Uri.parse(response.uri).fsPath)) {
                                if (this.language == LanguageId.coverage) {
                                    // Open the main file in the translation
                                    let doc = await workspace.openTextDocument(Uri.parse(fileUri.toString()));

                                    const decorationType = window.createTextEditorDecorationType({
                                        backgroundColor: '#0080FF80',
                                        border: '2px solid black',
                                    })

                                    let ranges = getCovtblFileRanges(Uri.parse(response.uri).fsPath)

                                    // Show the file
                                    window.showTextDocument(doc.uri)
                                        .then((editor) => editor.setDecorations(decorationType, ranges));
                                }
                                else {
                                    // Open the main file in the translation
                                    let doc = await workspace.openTextDocument(Uri.parse(response.uri));

                                    // Show the file
                                    window.showTextDocument(doc.uri, { viewColumn: ViewColumn.Beside })
                                }
                            }

                            resolve(`Generation of ${this.language} succeeded.`);
                            window.showInformationMessage(`Generation of ${this.language} completed`);
                        }
                        catch (error) {
                            window.showWarningMessage(`Generation of ${this.language} failed with error: ${error}`);
                            util.writeToLog(client.logPath, `Generation of ${this.language} failed with error: ${error}`);
                            reject();
                        }
                    }, 
                    (reason) => {
                        window.showWarningMessage("Creating timestamped directory failed");
                        util.writeToLog(client.logPath, `Creating timestamped directory failed with error: ${reason}`);
                        reject();
                    });
            }
            else {
                window.showInformationMessage(`Generation of ${this.language} is not supported`);
            }
        }));

    }

    private addOptions(params: TranslateParams, wsFolder: WorkspaceFolder): TranslateParams {
        // Get configurations related to translation
        const config = workspace.getConfiguration(
            [this.extensionName, 'translate', this.language].join('.'),
            wsFolder.uri
        );

        // Add configurations to the command options
        let once = true;
        Object.keys(config).forEach(key => {
            if (typeof config[key] !== 'function') {
                if (once) { params.options = {}; once = false; } // Initialise options only once

                // Add options object to array
                params.options[key] = config[key];
            }
        });

        return params;
    }
}

function getCovtblFileRanges(fsPath: string): DecorationOptions[] {

    let ranges: DecorationOptions[] = [];

    try {
        // read contents of the file
        const data = fs.readFileSync(fsPath, { encoding: 'utf8' });

        // split the contents by new line
        const lines = data.split(/\r?\n/);

        // iterate over each coverage region
        lines.forEach((line) => {

            if (line.length > 0) {

                // Lines follow "ln c1-c2+ct"
                let lnsplit = line.split(" ");
                let c1split = lnsplit[1].split("-");
                let c2split = c1split[1].split("=");
                //
                let ln = parseInt(lnsplit[0]);
                let c1 = parseInt(c1split[0]);
                let c2 = parseInt(c2split[0]);

                let range = new Range(ln - 1, c1 - 1, ln - 1, c2);

                ranges.push({ range });
            }
        });

    } catch (err) {
        console.error(err);
    }

    return ranges
}

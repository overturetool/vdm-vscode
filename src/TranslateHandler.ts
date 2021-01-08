import { commands, ExtensionContext, Uri, ViewColumn, window, workspace, WorkspaceFolder } from "vscode";
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
        this.registerCommand(this.translationCommandName, (inputUri: Uri) => this.translate(workspace.getWorkspaceFolder(inputUri)));
    }

    private registerCommand = (command: string, callback: (...args: any[]) => any) => {
        let disposable = commands.registerCommand(command, callback)
        this.context.subscriptions.push(disposable);
        return disposable;
    };

    private async translate(wsFolder: WorkspaceFolder) {
        window.setStatusBarMessage(`Translating to ${this.languageKind}.`, new Promise(async (resolve, reject) => {
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

                util.createTimestampedDirectory(client.projectSavedDataPath, this.languageKind).then(async (saveUri) => {
                    try {
                        // Setup message parameters
                        let params: TranslateParams = {
                            uri: null, //TODO Change this when workspace has been implemented.
                            languageId: this.languageKind,
                            saveUri: saveUri.toString()
                        };

                        // Send request
                        const response = await client.sendRequest(TranslateRequest.type, params);
                        // Check if a directory has been returned
                        if (!util.isDir(Uri.parse(response.uri).fsPath)) {
                            // Open the main file in the translation
                            let doc = await workspace.openTextDocument(response.uri);

                            // Show the file
                            window.showTextDocument(doc.uri, { viewColumn: ViewColumn.Beside })
                        }

                        resolve(`Translated to ${this.languageKind}.`);
                        window.showInformationMessage(`Translation to ${this.languageKind} completed`);
                    }
                    catch (error) {
                        window.showWarningMessage(`Translation to ${this.languageKind} failed with error: ${error}`);
                        util.writeToLog(globalThis.clientLogPath, `Translation to ${this.languageKind} failed with error: ${error}`);
                        reject();
                    }
                }, (reason) => {
                    window.showWarningMessage("Creating directory for translation files failed");
                    util.writeToLog(globalThis.clientLogPath, "Creating directory for translation files failed with error: " + reason);
                    reject();
                });
            }
            else {
                window.showInformationMessage(`Translation to ${this.languageKind} is not supported`);
            }
        }));

    }
}
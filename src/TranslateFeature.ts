import path = require("path");
import { commands, ExtensionContext, window, Disposable, Uri, workspace, ViewColumn } from "vscode";
import { ClientCapabilities, DocumentSelector, ServerCapabilities, StaticFeature, WorkDoneProgressOptions } from "vscode-languageclient";
import { ExperimentalCapabilities, TranslateParams, TranslateRequest } from "./protocol.slsp";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as util from "./Util"

export class TranslateFeature implements StaticFeature {
    private _translateDisp: Disposable;
    private _supportWorkDone: boolean = false;

    constructor(
        private _client: SpecificationLanguageClient, 
        private _context: ExtensionContext,
        private readonly _languageKind: string,
        private readonly _translationCommandName) {

        this._translateDisp = this.registerCommand(_translationCommandName, () => {
            window.showInformationMessage(`Translation to ${this._languageKind} is not supported by the language server`)
        });
    }
    
    fillClientCapabilities(capabilities: ClientCapabilities): void {
        // Client supports Translate
        if(!capabilities.experimental)
            capabilities.experimental = { translateProvider: true };
        else
            Object.assign(capabilities.experimental, {translateProvider: true});
    }
    initialize(capabilities: ServerCapabilities<ExperimentalCapabilities>, _documentSelector: DocumentSelector): void {
        // If server supports Translate
        if (capabilities?.experimental?.translateProvider) {
            if (typeof capabilities.experimental.translateProvider != "boolean"){
                if (capabilities.experimental.translateProvider.languageId?.includes(this._languageKind))
                    // TODO Only register commands for the ones that the server says it can
                    this.registerTranslateCommand();
            }

            // Check if support work done progress
            if (WorkDoneProgressOptions.hasWorkDoneProgress(capabilities?.experimental?.translateProvider))
                this._supportWorkDone = capabilities?.experimental?.translateProvider.workDoneProgress
        }
    }

    private registerCommand = (command: string, callback: (...args: any[]) => any) => {
        let disposable = commands.registerCommand(command, callback)
        this._context.subscriptions.push(disposable);
        return disposable;
    };

    private registerTranslateCommand(): void {
        this._translateDisp.dispose();
        this.registerCommand(this._translationCommandName, () => this.translate());
    }

    private async translate(){
        window.setStatusBarMessage(`Translating to ${this._languageKind}.`, new Promise(async (resolve, reject) => {
            util.createTimestampedDirectory(this._client.projectSavedDataPath, this._languageKind).then(async (saveUri) => {
                try {
                    // Setup message parameters
                    let params: TranslateParams = {
                        uri: null, //TODO Change this when workspace has been implemented.
                        languageId: this._languageKind,
                        saveUri:saveUri.toString()
                    };
        
                    // Send request
                    const response = await this._client.sendRequest(TranslateRequest.type, params);
                    // Check if a directory has been returned
                    if(!util.isDir(Uri.parse(response.uri).fsPath)){
                         // Open the main file in the translation
                        let doc = await workspace.openTextDocument(response.uri);
                        
                        // Show the file
                        window.showTextDocument(doc.uri, { viewColumn: ViewColumn.Beside })
                    } 
                                  
                    resolve(`Translated to ${this._languageKind}.`);
                    window.showInformationMessage(`Translation to ${this._languageKind} completed`);
                }
                catch (error) {
                    window.showWarningMessage(`Translation to ${this._languageKind} failed with error: ${error}`);
                    util.writeToLog(globalThis.clientLogPath, `Translation to ${this._languageKind} failed with error: ${error}`);
                    reject();
                }
            }, (reason) => {
                window.showWarningMessage("Creating directory for translation files failed");
                util.writeToLog(globalThis.clientLogPath, "Creating directory for translation files failed with error: " + reason);
                reject();
            });
        }));
        
    }
}
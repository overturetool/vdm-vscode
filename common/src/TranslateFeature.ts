import path = require("path");
import { commands, ExtensionContext, window, Disposable, Uri, workspace, ViewColumn } from "vscode";
import { ClientCapabilities, DocumentSelector, ServerCapabilities, StaticFeature, WorkDoneProgressOptions } from "vscode-languageclient";
import { ExperimentalCapabilities, TranslateOptions, TranslateParams, TranslateRequest } from "./protocol.slsp";
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
                if (capabilities.experimental.translateProvider.languageIds.includes(this._languageKind))
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
        this.registerCommand(this._translationCommandName, () => this.translateToLaTeX());
    }

    private async translateToLaTeX(){
        window.setStatusBarMessage(`Translating to ${this._languageKind}.`, 1000);
        try {
            // Setup message parameters
            let params: TranslateParams = {
                uri: null, //TODO Change this when workspace has been implemented.
                languageId: this._languageKind,
                saveUri:util.createTimestampedDirectory(this._client.projectSavedDataPath, this._languageKind).toString()
            };

            // Send request
            const response = await this._client.sendRequest(TranslateRequest.type, params);
            if(util.isDir(Uri.parse(response.uri).fsPath)) // Check if a directory has been returned
                return;
            
            // Open the main file in the translation
            let doc = await workspace.openTextDocument(response.uri);
            
            // Show the file
            window.showTextDocument(doc.uri, { viewColumn: ViewColumn.Beside })
        }
        catch (error) {
            window.showInformationMessage(`Translation to ${this._languageKind} failed.` + error);
        }
    }
}
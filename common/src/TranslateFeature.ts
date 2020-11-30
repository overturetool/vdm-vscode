import path = require("path");
import { commands, ExtensionContext, window, Disposable, Uri, workspace, ViewColumn } from "vscode";
import { ClientCapabilities, DocumentSelector, ServerCapabilities, StaticFeature } from "vscode-languageclient";
import { LanguageKind, TranslateParams, TranslateRequest } from "./protocol.slsp";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as util from "./Util"

export class TranslateFeature implements StaticFeature {
    private _translateDisp: Disposable;
    private readonly _languageKindName: string;

    constructor(
        private _client: SpecificationLanguageClient, 
        private _context: ExtensionContext,
        private readonly _languageKind: LanguageKind,
        private readonly _translationCommandName) {

        this._languageKindName = LanguageKind[_languageKind];

        this._translateDisp = this.registerCommand(_translationCommandName, () => {
            window.showInformationMessage(`Translation to ${this._languageKindName} is not supported by the language server`)
        });
    }
    
    fillClientCapabilities(capabilities: ClientCapabilities): void {
        // Client supports Translate
        if(!capabilities.experimental)
            capabilities.experimental = { translateProvider: true };
        else
            Object.assign(capabilities.experimental, {translateProvider: true});
    }
    initialize(capabilities: ServerCapabilities<any>, _documentSelector: DocumentSelector): void {
        // If server supports Translate
        if (capabilities?.experimental?.translateProvider) {
            // TODO Only register commands for the ones that the server says it can
           this.registerTranslateCommand();
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
        window.setStatusBarMessage(`Translating to ${this._languageKindName}.`, 1000);
        try {
            // Setup message parameters
            let params: TranslateParams = {
                uri: null, //TODO Change this when workspace has been implemented.
                language: this._languageKind,
                saveUri:util.createTimestampedDirectory(this._client.projectSavedDataPath, this._languageKindName).toString()
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
            window.showInformationMessage(`Translation to ${this._languageKindName} failed.` + error);
        }
    }
}
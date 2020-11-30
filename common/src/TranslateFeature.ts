import path = require("path");
import { commands, ExtensionContext, window, Disposable, Uri, workspace, ViewColumn } from "vscode";
import { ClientCapabilities, DocumentSelector, ServerCapabilities, StaticFeature } from "vscode-languageclient";
import { LanguageKind, TranslateParams, TranslateRequest } from "./protocol.slsp";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as util from "./Util"

export class TranslateFeature implements StaticFeature {
    private _translateDisp: Disposable;
    private readonly _languageKindName:string;

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
        // Client supports POG
        if(!capabilities.experimental)
            capabilities.experimental = { translate: true };
        else
            Object.assign(capabilities.experimental, {translate: true});
    }
    initialize(capabilities: ServerCapabilities<any>, _documentSelector: DocumentSelector): void {
        // If server supports POG
        if (capabilities?.experimental?.translateProvider) {
           this.registerTranslateCommand();
        }
        this.registerTranslateCommand();
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
        window.setStatusBarMessage(`Translating to ${this._languageKindName}.`);

        try {
            // Setup message parameters
            let params: TranslateParams = {
                uri: this._client.projectRoot?.fsPath,
                language: this._languageKind,
                saveUri: util.createTimestampedDirectory(this._client.projectSavedDataPath.fsPath, this._languageKindName)?.fsPath
            };

            // Send request
            const mainFileUri = await this._client.sendRequest(TranslateRequest.type, params);

            // Open the resulting LaTeX file
            let doc = await workspace.openTextDocument(mainFileUri.uri);
            
            // Show the file
            window.showTextDocument(doc.uri, { viewColumn: ViewColumn.Beside })
        }
        catch (error) {
            window.showInformationMessage(`Translation to ${this._languageKindName} failed.` + error);
        }
    }
}
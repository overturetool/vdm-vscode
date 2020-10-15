import * as vscode from 'vscode'
import { ExtensionContext, Disposable, Uri } from 'vscode';
import { StaticFeature } from 'vscode-languageclient';
import { ClientCapabilities, ServerCapabilities, NotificationHandler } from 'vscode-languageserver-protocol';
import { POGController } from './POGController';
import { POGExperimentalCapabilities, POGUpdatedNotification } from './protocol.lspx';
import { SpecificationLanguageClient } from './SpecificationLanguageClient';






/**
 * The feature that handles Proof Obligation Generation
 */
export class ProofObligationGenerationFeature implements StaticFeature {
    private _pogController: POGController.POGCommandsHandler;
    private _client: SpecificationLanguageClient;
    private _context: ExtensionContext;
    private _runPOGDisp: Disposable;


    constructor(client: SpecificationLanguageClient, context: ExtensionContext) {
        this._client = client;
        this._context = context;

        this._runPOGDisp = this.registerCommand('extension.runPOG', () => {
            vscode.window.showInformationMessage("Proof Obligation Generation is not supported by the language server")
        });
    }

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        // Client supports POG
        capabilities.experimental = { proofObligationGeneration: true };
    }

    initialize(capabilities: ServerCapabilities<POGExperimentalCapabilities>): void {
        // If server supports POG
        if (capabilities?.experimental?.proofObligationProvider) {
            this._pogController = new POGController.POGCommandsHandler(this._client.promise, Uri.file(this._context.extensionPath))

            this.registerPOGCommand();
            this.registerPOGUpdatedNotificationHandler();
        }
    }

    private registerCommand = (command: string, callback: (...args: any[]) => any) => {
        let disposable = vscode.commands.registerCommand(command, callback)
        this._context.subscriptions.push(disposable);
        return disposable;
    };

    private registerPOGCommand(): void {
        this._runPOGDisp.dispose();
        this.registerCommand('extension.runPOG', (inputUri: Uri) => this._pogController.runPOG(inputUri));
    }

    private registerPOGUpdatedNotificationHandler(): void {
        this._client.onNotification(POGUpdatedNotification.type, (params) => {
            if (this._pogController.pogViewVisible()){
                if (params.successful)
                    this._pogController.runPOG(Uri.parse(params.uri))
                else
                    this._pogController.viewWarning();
            }
        });
    }
}
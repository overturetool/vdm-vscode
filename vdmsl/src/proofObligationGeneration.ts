import * as vscode from 'vscode'
import { ExtensionContext, Disposable, Uri } from 'vscode';
import { LanguageClient, StaticFeature } from 'vscode-languageclient';
import { ClientCapabilities, ServerCapabilities } from 'vscode-languageserver-protocol';
import { POGController } from './POGController';
import { SpecificationLanguageClient } from './SpecificationLanguageClient';



/**
 * The experimental capabilities that the server can reply
 */
export interface POGExperimentalCapabilities {
	proofObligationProvider ?: boolean
}

/**
 * The feature that handles Proof Obligation Generation
 */
export class ProofObligationGenerationFeature implements StaticFeature {
    private _pogController : POGController.POGCommandsHandler;
	private _client : SpecificationLanguageClient;
    private _context : ExtensionContext;
    private _runPOGDisp : Disposable;


	constructor(client : SpecificationLanguageClient, context : ExtensionContext){
		this._client = client;
        this._context = context;

        this._runPOGDisp = this.registerCommand('extension.runPOG', () => {
            vscode.window.showInformationMessage("Proof Obligation Generation is not supported by the language server")
        });
	}

    fillClientCapabilities(capabilities : ClientCapabilities): void {
		// Client supports POG
        capabilities.experimental = { proofObligationGeneration: true };
	}
	
    initialize(capabilities: ServerCapabilities<POGExperimentalCapabilities>): void {
		// If server supports POG
		if(capabilities?.experimental?.proofObligationProvider){
            this._pogController = new POGController.POGCommandsHandler(this._client.promise, Uri.file(this._context.extensionPath))

			this.registerPOGCommand();
		}
    }
    
    private registerCommand = (command: string, callback: (...args: any[]) => any) => {
		let disposable = vscode.commands.registerCommand(command, callback)
		this._context.subscriptions.push(disposable);
		return disposable;
    };
    
    private registerPOGCommand(){
		this._runPOGDisp.dispose();
		this.registerCommand('extension.runPOG', (inputUri:Uri) => this._pogController.runPOG(inputUri));
	}
}
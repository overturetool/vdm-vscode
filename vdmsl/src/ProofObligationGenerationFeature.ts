import { ExtensionContext, Disposable, Uri, window, commands } from "vscode";
import { StaticFeature, ClientCapabilities, ServerCapabilities } from "vscode-languageclient";
import { ProofObligationPanel } from "./ProofObligationPanel";
import { ExperimentalCapabilities, POGUpdatedNotification, ProofObligation, GeneratePOParams, GeneratePORequest } from "./protocol.lspx";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";

export class ProofObligationGenerationFeature implements StaticFeature {
    private _client: SpecificationLanguageClient;
    private _context: ExtensionContext;
    private _runPOGDisp: Disposable;
    private _lastUri: Uri;

    constructor(client: SpecificationLanguageClient, context: ExtensionContext) {
        this._client = client;
        this._context = context;

        this._runPOGDisp = this.registerCommand('extension.runPOG', () => {
            window.showInformationMessage("Proof obligation generation is not supported by the language server")
        });
    }

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        // Client supports POG
        capabilities.experimental = { proofObligationGeneration: true };
    }

    initialize(capabilities: ServerCapabilities<ExperimentalCapabilities>): void {
        // If server supports POG
        if (capabilities?.experimental?.proofObligationProvider) {
            this.registerPOGCommand();
            this.registerPOGUpdatedNotificationHandler();
        }
    }

    private registerCommand = (command: string, callback: (...args: any[]) => any) => {
        let disposable = commands.registerCommand(command, callback)
        this._context.subscriptions.push(disposable);
        return disposable;
    };

    private registerPOGCommand(): void {
        this._runPOGDisp.dispose();
        this.registerCommand('extension.runPOG', (inputUri: Uri) => this.runPOG(inputUri));
    }

    private registerPOGUpdatedNotificationHandler(): void {
        this._client.onNotification(POGUpdatedNotification.type, (params) => {
            // Only perform actions if POG View is visible
            if (ProofObligationPanel.isVisible()) {
                // If POG is possible
                if (params.successful) {
                    // Request new POG
                    this.runPOG(this._lastUri, false);
                }
                else {
                    // Display warning that POs may be outdated
                    ProofObligationPanel.currentPanel.displayWarning();
                }

            }
        });
    }

    async runPOG(inputUri: Uri, showPanel: boolean = true) {
        window.setStatusBarMessage('Running Proof Obligation Generation', 2000);

        let uri = inputUri || window.activeTextEditor?.document.uri;
        this._lastUri = uri;

        try {
            // Setup message parameters
            let params: GeneratePOParams = {
                uri: uri.toString(),
            };

            // Send request
            const pos = await this._client.sendRequest(GeneratePORequest.type, params);

            // Show POG View - but not if it is already visible and showPanel = false
            if (showPanel || !ProofObligationPanel.isVisible())
                ProofObligationPanel.createOrShowPanel(Uri.file(this._context.extensionPath));
            ProofObligationPanel.currentPanel.displayNewPOS(pos);
        }
        catch (error) {
            window.showInformationMessage("Proof obligation generation failed. " + error);
        }
    }
}

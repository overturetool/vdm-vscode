import { Disposable, ExtensionContext, Uri, window, commands } from "vscode";
import { ClientCapabilities, LanguageClient, LanguageClientOptions, Range, ServerCapabilities, ServerOptions, StaticFeature } from "vscode-languageclient";
import { ProofObligationPanel } from "./ProofObligationPanel";
import { ExperimentalCapabilities, GeneratePOParams, GeneratePORequest, POGUpdatedNotification, ProofObligation } from "./protocol.lspx";

export class SpecificationLanguageClient extends LanguageClient
{
	private _context : ExtensionContext;
	private readonly _extensionUri: Uri;
	private _lastUri: Uri;
	
	constructor(id: string, name: string, serverOptions: ServerOptions, clientOptions: LanguageClientOptions, context : ExtensionContext, forceDebug?: boolean){
		super(id, name, serverOptions, clientOptions, forceDebug);

		this._extensionUri = Uri.file(context.extensionPath);

		this._context = context
		this.registerFeature(new ProofObligationGenerationFeature(this, this._context));
	}

	public async runPOG(inputUri: Uri) {
		window.setStatusBarMessage('Running Proof Obligation Generation', 2000);

		let uri = inputUri || window.activeTextEditor?.document.uri;
		this._lastUri = uri;

		try {
			let pos = await this.getPOFromServer(uri);
			ProofObligationPanel.createOrShowPanel(this._extensionUri);
			ProofObligationPanel.currentPanel.displayNewPOS(pos);
		}
		catch (error) {
			window.showInformationMessage("Proof obligation generation failed. " + error);
		}
	}

	private async getPOFromServer(uri: Uri, range?: Range): Promise<ProofObligation[]> {
		// Only use entries compatible with LSP
		if (range)
			var lspRange = Range.create(range.start,range.end)
		
		// Setup message parameters
		let params: GeneratePOParams = {
			uri: uri.toString(),
			range: lspRange
		};

		// Send request
		const values = await this.sendRequest(GeneratePORequest.type, params);
		return values;
	}

	public async updatePOG() {
		this.runPOG(this._lastUri);
	}

	public pogViewVisible() : boolean {
		return (ProofObligationPanel.currentPanel ? true : false)
	}

	public async viewWarning()
	{
		ProofObligationPanel.currentPanel.displayWarning();
	}
}

class ProofObligationGenerationFeature implements StaticFeature {
    private _client: SpecificationLanguageClient;
    private _context: ExtensionContext;
    private _runPOGDisp: Disposable;


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
        this.registerCommand('extension.runPOG', (inputUri: Uri) => this._client.runPOG(inputUri));
    }

    private registerPOGUpdatedNotificationHandler(): void {
        this._client.onNotification(POGUpdatedNotification.type, (params) => {
            if (this._client.pogViewVisible()){
                if (params.successful)
                    this._client.updatePOG();
                else
                    this._client.viewWarning();
            }
        });
    }
}

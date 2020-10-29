import path = require("path");
import { commands, Disposable, ExtensionContext, Uri, window, workspace } from "vscode";
import { ClientCapabilities, ServerCapabilities, StaticFeature } from "vscode-languageclient";
import { CombinatorialTestPanel } from "./CombinatorialTestPanel";
import { CTDataProvider } from "./CTTreeDataProvider";
import { ExperimentalCapabilities } from "./protocol.lspx";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";

export class CombinantorialTestingFeature implements StaticFeature {
    private _client: SpecificationLanguageClient;
    private _context: ExtensionContext;
    private _runCTDisp: Disposable;
    private _lastUri: Uri;

    constructor(client: SpecificationLanguageClient, context: ExtensionContext) {
        this._client = client;
        this._context = context;
    }

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        if(!capabilities.experimental)
            capabilities.experimental = { combinatorialTesting: true };
        else
            Object.assign(capabilities.experimental, {combinatorialTesting: true});
    }

    initialize(capabilities: ServerCapabilities<ExperimentalCapabilities>): void {
        // If server supports CT
        if (capabilities?.experimental?.proofObligationProvider) {
            this.registerCTCommand();
        }     
    }

    private registerCTCommand()
    {
        //this.registerCommand('extension.runCT', (inputUri: Uri) => this.runCT(inputUri));

        const ctDataprovider = new CTDataProvider(workspace.rootPath);
        window.registerTreeDataProvider('combinatorialTests', ctDataprovider);
    
        commands.registerCommand('combinatorialTests.refreshEntry', () =>
            ctDataprovider.refresh()
        );
    }

    private registerCommand = (command: string, callback: (...args: any[]) => any) => {
        let disposable = commands.registerCommand(command, callback)
        this._context.subscriptions.push(disposable);
        return disposable;
    };

    private async runCT(inputUri: Uri, revealCTView: boolean = true) {
        window.setStatusBarMessage('Running Proof Obligation Generation', 2000);

        let uri = inputUri || window.activeTextEditor?.document.uri;
        let dirUri = Uri.file(uri.fsPath.substring(0,uri.fsPath.lastIndexOf(path.sep)));
        this._lastUri = uri;

        try {
            // Create new view or show existing POG View
            CombinatorialTestPanel.createOrShowPanel(Uri.file(this._context.extensionPath), revealCTView);
            CombinatorialTestPanel.currentPanel.displayTraces();
        }
        catch (error) {
            window.showInformationMessage("Proof obligation generation failed. " + error);
        }
    }
}
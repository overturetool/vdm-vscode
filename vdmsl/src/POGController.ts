import { Uri } from "vscode"
import * as vscode from 'vscode'
import { SpecificationLanguageClient } from "./SpecificationLanguageClient"
import path = require("path")
import { ProofObligation } from "./protocol.lspx"

export namespace POGController {
    export class POGCommandsHandler {
        private _client: Promise<SpecificationLanguageClient>
        private readonly _extensionUri: vscode.Uri;

        constructor(client: Promise<SpecificationLanguageClient>, extensionUri: vscode.Uri) {
            this._client = client;
            this._extensionUri = extensionUri;
        }

        // async runPOGSelection(inputUri:Uri)
        // {
        //     let client = await this._client;

        //     vscode.window.setStatusBarMessage('Running Proof Obligation Generation on Selection', 2000);
        //     let selection = vscode.window.activeTextEditor.selection;

        //     ProofObligationPanel.createOrShowPanel(this._extensionUri);
        //     let pos = await client.generatePO(inputUri);
        //     ProofObligationPanel.currentPanel.displayPOGS(pos);
        // }

        async runPOG(inputUri: Uri) {
            let client = await this._client;

            vscode.window.setStatusBarMessage('Running Proof Obligation Generation', 2000);

            let uri = inputUri || vscode.window.activeTextEditor?.document.uri;

            ProofObligationPanel.createOrShowPanel(this._extensionUri);
            let pos = await client.generatePO(uri);
            ProofObligationPanel.currentPanel.displayPOGS(pos);
        }
    }


    class ProofObligationPanel {
        public static currentPanel: ProofObligationPanel | undefined;

        public static readonly viewType = 'proofObligationPanel';

        private readonly _panel: vscode.WebviewPanel;
        private _disposables: vscode.Disposable[] = [];

        private readonly _extensionUri: vscode.Uri;

        private _pos: ProofObligation[];

        public static createOrShowPanel(extensionUri: vscode.Uri) {
            const column = vscode.window.activeTextEditor
                ? vscode.window.activeTextEditor.viewColumn + 1
                : 2;

            // If we already have a panel, show it.
            if (ProofObligationPanel.currentPanel) {
                ProofObligationPanel.currentPanel._panel.reveal(column);
                return;
            }

            // Create a new panel.
            const panel = vscode.window.createWebviewPanel(
                ProofObligationPanel.viewType,
                'Proof Obligations',
                column || vscode.ViewColumn.One,
                {
                    // Enable javascript in the webview
                    enableScripts: true,

                    // Restrict the webview to only loading content from our extension's `resources` directory.
                    localResourceRoots: [Uri.parse(extensionUri + '/' + 'resources')],

                    // Retain state when PO view goes into the background
                    retainContextWhenHidden: true
                }
            );

            ProofObligationPanel.currentPanel = new ProofObligationPanel(extensionUri, panel);
        }

        private constructor(extensionUri: vscode.Uri, panel: vscode.WebviewPanel) {
            this._panel = panel;
            this._extensionUri = extensionUri;
            // Listen for when the panel is disposed
            // This happens when the user closes the panel or when the panel is closed programatically
            this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

            // Handle messages from the webview
            this._panel.webview.onDidReceiveMessage(
                async message => {
                    switch (message.command) {
                        case 'poid':
                            let json = message.text;
                            let po = this._pos.find(d => d.id.toString() == json);
                            let path = Uri.parse(po.location.uri.toString()).path;

                            let doc = await vscode.workspace.openTextDocument(path);

                            vscode.window.showTextDocument(doc.uri, { selection: po.location.range, viewColumn: 1 })
                            return;
                    }
                },
                null,
                this._disposables
            );

            // Generate the html for the webview
            this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
        }

        public displayPOGS(pos: ProofObligation[]) {
            this._pos = pos;
            this._panel.webview.postMessage({ command: "po", text: pos });
        }

        public dispose() {
            ProofObligationPanel.currentPanel = undefined;

            // Clean up our resources
            this._panel.dispose();

            while (this._disposables.length) {
                const x = this._disposables.pop();
                if (x) {
                    x.dispose();
                }
            }
        }

        private _getHtmlForWebview(webview: vscode.Webview) {
            const scriptUri = webview.asWebviewUri(Uri.parse(this._extensionUri + path.sep + 'resources' + path.sep + 'main.js'));
            const styleUri = webview.asWebviewUri(Uri.parse(this._extensionUri + path.sep + 'resources' + path.sep + 'main.css'));

            // Use a nonce to only allow specific scripts to be run
            const nonce = getNonce();

            return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                
                <link href="${styleUri}" rel="stylesheet">
            </head>
            <body>
            
            <div id="poContainer"></div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
        }
    }

    function getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}


import * as vscode from 'vscode'
import { SpecificationLanguageClient } from "./SpecificationLanguageClient"
import path = require("path")
import { GeneratePOParams, GeneratePORequest, ProofObligation } from "./protocol.lspx"
import { Uri } from 'vscode'
import { Range } from 'vscode-languageclient'

export namespace POGController {
    export class POGCommandsHandler {
        private _client: Promise<SpecificationLanguageClient>
        private readonly _extensionUri: vscode.Uri;
        private _lastUri: vscode.Uri;

        constructor(client: Promise<SpecificationLanguageClient>, extensionUri: vscode.Uri) {
            this._client = client;
            this._extensionUri = extensionUri;
        }

        async runPOG(inputUri: vscode.Uri) {
            let client = await this._client;

            vscode.window.setStatusBarMessage('Running Proof Obligation Generation', 2000);

            let uri = inputUri || vscode.window.activeTextEditor?.document.uri;
            this._lastUri = uri;

            ProofObligationPanel.createOrShowPanel(this._extensionUri);
            let pos = await this.getPOFromServer(uri);
            ProofObligationPanel.currentPanel.displayNewPOS(pos);
        }

        async getPOFromServer(uri: Uri, range?: Range): Promise<ProofObligation[]> {
            if (range)
                var lspRange = Range.create(range.start,range.end)
            
            let params: GeneratePOParams = {
                uri: uri.toString(),
                range: lspRange
            };
            const values = await (await this._client).sendRequest(GeneratePORequest.type, params);
            return values;
        }

        async updatePOG() {
            this.runPOG(this._lastUri);
        }

        pogViewVisible() : boolean {
            return (ProofObligationPanel.currentPanel ? true : false)
        }

        async viewWarning()
        {
            ProofObligationPanel.currentPanel.displayWarning();
        }
    }


    class ProofObligationPanel {
        public static currentPanel: ProofObligationPanel | undefined;

        public static readonly viewType = 'proofObligationPanel';

        private readonly _panel: vscode.WebviewPanel;
        private _disposables: vscode.Disposable[] = [];

        private readonly _extensionUri: vscode.Uri;

        private _pos: ProofObligation[];

        private _showProvedPOs = true;

        private _expandPOs = false;

        private _sorting = new Map<string, boolean>(); // Maps a header to a boolean telling if sorting should be done DESCENDING.

        private _currentSortingHeader = "id";

        public static createOrShowPanel(extensionUri: vscode.Uri) {
            // Define which column the po view should be in
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

                    // Restrict the webview to only load content from the extension's `resources` directory.
                    localResourceRoots: [vscode.Uri.parse(extensionUri + '/' + 'resources')],

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
                        case 'goToSymbol':
                            // Find path of po with id
                            let po = this._pos.find(d => d.id.toString() == message.text);
                            let path = vscode.Uri.parse(po.location.uri.toString()).path;

                            // Open the specification file with the symbol responsible for the po
                            let doc = await vscode.workspace.openTextDocument(path);

                            // Show the file
                            vscode.window.showTextDocument(doc.uri, { selection: po.location.range, viewColumn: 1 })
                            return;
                        case 'sort':
                            // Sort and post pos to javascript
                            this._currentSortingHeader = message.text;                     
                            this._panel.webview.postMessage({ command: "rebuildPOview", pos: this.sortPOs(this._pos, this._currentSortingHeader, true) });
                            return;
                        case 'toggleDisplayProvedPOs':
                            this._showProvedPOs = this._showProvedPOs ? false : true;
                            this._panel.webview.postMessage({ command: "rebuildPOview", pos: this.sortPOs(this._pos, this._currentSortingHeader, false) });
                            this._panel.webview.postMessage({ command: "displayProvedPOsToggled", toggleState: this._showProvedPOs });
                            return; 
                    }
                },
                null,
                this._disposables
            );

            // Generate the html for the webview
            this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
        }

        public displayWarning()
        {
            // Post display warming message to javascript
            this._panel.webview.postMessage({ command: "posInvalid" });
        }

        public displayNewPOS(pos: ProofObligation[]) {
            // Sort and post pos to javascript
            this._pos = pos;
            this._panel.webview.postMessage({ command: "newPOs", pos: this.sortPOs([...pos],this._currentSortingHeader,false) });
            this._panel.webview.postMessage({ command: "displayProvedPOsToggled", toggleState: this._showProvedPOs });            
        }

        private sortPOs(pos, sortingHeader, changeSortingDirection)
        {
            if(pos.length < 1)
                return pos;

            // Add header and sorting state to sorting map
            if(!this._sorting.has(sortingHeader))
                this._sorting.set(sortingHeader, false)
            else if(changeSortingDirection)
                this._sorting.set(sortingHeader, this._sorting.get(sortingHeader) ? false : true);


            // Filter proved pos
            if(!this._showProvedPOs)
                pos = pos.filter(function( po ) {
                    let t = po.proved !== true;
                    return t;
                });

            // Check if values are numbers - assumes all values found in the column are of the same type
            let isNum = /^\d+$/.test(pos[0][sortingHeader]);  

            // Do number sort
            if(isNum)
            {
                pos.sort(function(a,b){
                    let aval = a[Object.keys(a).find( k => k == sortingHeader)];
                    let bval = b[Object.keys(b).find( k => k == sortingHeader)];
                    return aval - bval;
                });
            }
            // Do string sort
            else
            {
                pos.sort(function(a,b){
                    let aval = a[Object.keys(a).find( k => k == sortingHeader)];
                    let bval = b[Object.keys(b).find( k => k == sortingHeader)];
                    return aval.localeCompare(bval);
                });
            }
            // Change sorted direction
            if(this._sorting.get(sortingHeader))
                pos.reverse();

            return pos;
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
            const scriptUri = webview.asWebviewUri(vscode.Uri.parse(this._extensionUri + path.sep + 'resources' + path.sep + 'main.js'));
            const styleUri = webview.asWebviewUri(vscode.Uri.parse(this._extensionUri + path.sep + 'resources' + path.sep + 'main.css'));

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
                <button id="expandPOsBtn">Expand all proof obligations</button>
                <button id="hideProvedPosBtn">Hide proved proof obligations</button>
                <p id="poInvalid">Warning: Proof obligations are no longer guarenteed to be valid!</p>
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


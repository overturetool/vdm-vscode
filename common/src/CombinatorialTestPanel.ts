import { Uri, WebviewPanel, Disposable, window, ViewColumn, workspace, Webview } from 'vscode'
import path = require("path")

export class CombinatorialTestPanel {
    private readonly _panel: WebviewPanel;
    private _disposables: Disposable[] = [];
    private readonly _extensionUri: Uri;

    public static currentPanel: CombinatorialTestPanel | undefined;
    public static readonly viewType = 'combinatorialTestPanel';

    public static createOrShowPanel(extensionUri: Uri, moveFocus: boolean) {
        // Define which column the po view should be in
        const column = window.activeTextEditor
            ? window.activeTextEditor.viewColumn + 1
            : ViewColumn.Two;

        // Check if a panel already exists
        if (CombinatorialTestPanel.currentPanel) {
            // Put panel in focus
            if(moveFocus)
            CombinatorialTestPanel.currentPanel._panel.reveal(column, true);
            return;
        }

        // Create a new panel.
        const panel = window.createWebviewPanel(
            CombinatorialTestPanel.viewType,
            'Combinatorial Tests',
            {
                viewColumn: column,
                preserveFocus: true
            },
            {
                // Enable javascript in the webview
                enableScripts: true,

                // Restrict the webview to only load content from the extension's `resources` directory.
                localResourceRoots: [CombinatorialTestPanel.resourcesUri(extensionUri)],

                // Retain state when PO view goes into the background
                retainContextWhenHidden: true
            },
        );

        CombinatorialTestPanel.currentPanel = new CombinatorialTestPanel(extensionUri, panel);
    }

    private constructor(extensionUri: Uri, panel: WebviewPanel) {
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
                        
                        return;
                }
            },
            null,
            this._disposables
        );

        // Generate the html for the webview
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    }

    public displayCTs() {    
        this._panel.webview.postMessage({ command: "newCTs"});
    }

    public dispose() {
        CombinatorialTestPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private static resourcesUri(extensionUri: Uri){
        let res = Uri.joinPath(extensionUri,'resources');
        return res;
    }

    private _getHtmlForWebview(webview: Webview) {
        const scriptUri = webview.asWebviewUri(Uri.joinPath(CombinatorialTestPanel.resourcesUri(this._extensionUri), 'ctView.js'));
        const styleUri = webview.asWebviewUri(Uri.joinPath(CombinatorialTestPanel.resourcesUri(this._extensionUri), 'ctView.css'));

        // Use a nonce to only allow specific scripts to be run
        const scriptNonce = getNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${scriptNonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            
            <link href="${styleUri}" rel="stylesheet">
        </head>
        <body>
            <div id="ctContainer"></div>

            <OL class="outerOL">
                <LI> <details>
                <summary>CT SYMBOL 1</summary>
                    <UL>
                        <details>
                            <summary>TRACE 1</summary>                     
                            <OL>
                                <details>
                                    <summary>Test 1</summary>
                                    <p>Stuff</p>
                                </details>
                                <details>
                                    <summary>Test 2</summary>
                                    <p>Stuff</p>
                                </details>
                            </OL>
                            </details>
                        <details>
                            <summary>TRACE 2</summary>                     
                            <OL>
                                <details>
                                    <summary>Test 1</summary>
                                    <p>Stuff</p>
                                </details>
                                <details>
                                    <summary>Test 2</summary>
                                    <p>Stuff</p>
                                </details>
                        </OL>
                        </details>
                    </UL>
                </details>

                <LI> <details>
                <summary>CT SYMBOL 2</summary>
                    <UL>
                        <details>
                            <summary>TRACE 1</summary>                     
                            <OL>
                                <details>
                                    <summary>Test 1</summary>
                                    <p>Stuff</p>
                                </details>
                                <details>
                                    <summary>Test 2</summary>
                                    <p>Stuff</p>
                                </details>
                            </OL>
                            </details>
                        <details>
                            <summary>TRACE 1</summary>                     
                            <OL>
                                <details>
                                    <summary>Test 1</summary>
                                    <p>Stuff</p>
                                </details>
                                <details>
                                    <summary>Test 2</summary>
                                    <p>Stuff</p>
                                </details>
                        </OL>
                        </details>
                    </UL>
                </details>
            </OL>         
            <script nonce="${scriptNonce}" src="${scriptUri}"></script>
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
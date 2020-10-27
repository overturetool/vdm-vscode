import { Uri, WebviewPanel, Disposable, window, ViewColumn, workspace, Webview, Location } from 'vscode'
import path = require("path")

import { CTSymbol, VerdictKind } from "./protocol.lspx"

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
        
        let ctSymbols = [];
        let iter = 0;
        let maxGenerate = 10;
        while(iter < maxGenerate)
        {
            let traceIter = 0;
            let traces = [];
            while(traceIter < maxGenerate)
            {
                let testResIter = 0;
                let testResults = [];
                while(testResIter < maxGenerate)
                {
                    let testCaseIter = 0;
                    let testCases = [];
                    while(testCaseIter < maxGenerate)
                    {
                        let testCase = {case: "Test case " + testCaseIter, result: "TEST!"};
                        testCases.push(testCase);
                        testCaseIter++;
                    }

                    let testResult = {id: testResIter, verdict: VerdictKind.Passed, cases: testCases};
                    testResults.push(testResult);
                    testResIter++;
                }

                let trace = {name: "trace " + traceIter, id: traceIter, location: null, verdict: VerdictKind.Passed, testResults: testResults};
                traces.push(trace);
                traceIter++;
            }

            let ctSymbol = {name: "CTSymbol " + iter, traces: traces};
            ctSymbols.push(ctSymbol)
            iter++;
        }

        this._panel.webview.postMessage({ command: "showCTResolved", cts: ctSymbols});
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
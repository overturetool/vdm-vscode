// SPDX-License-Identifier: GPL-3.0-or-later

import { Uri, WebviewPanel, Disposable, window, ViewColumn, workspace, Webview } from 'vscode'
import { ProofObligation } from "./protocol.slsp"
import { Protocol2CodeConverter } from 'vscode-languageclient';
import * as util from "./Util"
import { createConverter } from 'vscode-languageclient/lib/common/protocolConverter';

export class ProofObligationPanel {
    private _p2cConverter: Protocol2CodeConverter = createConverter(undefined, undefined);
    private readonly _panel: WebviewPanel;
    private _disposables: Disposable[] = [];
    private readonly _extensionUri: Uri;
    private _pos: ProofObligation[];
    private _sorting = new Map<string, boolean>(); // Maps a header to a boolean telling if sorting should be done DESCENDING.
    private _currentSortingHeader: string;
    private _statusFilter: string[] = [];

    public static currentPanel: ProofObligationPanel | undefined;
    public static readonly viewType = 'proofObligationPanel';
    private static lastWorkspace: string;

    public static createOrShowPanel(extensionUri: Uri, moveFocus: boolean, workspace?: string) {
        // Define which column the po view should be in
        const column = window.activeTextEditor
            ? ViewColumn.Beside
            : ViewColumn.Two;

        // Check if a panel already exists
        if (ProofObligationPanel.currentPanel) {
            // Check if panel is for another workspace folder
            if (workspace && workspace != this.lastWorkspace) {
                ProofObligationPanel.currentPanel.dispose();
            }
            else {
                // Put panel in focus
                if (moveFocus)
                    ProofObligationPanel.currentPanel._panel.reveal(column, true);
                return;
            }


        }

        // Create a new panel.
        let panelName: string = 'Proof Obligations' + (workspace ? ': ' + workspace : '');
        const panel = window.createWebviewPanel(
            ProofObligationPanel.viewType,
            panelName,
            {
                viewColumn: column,
                preserveFocus: true
            },
            {
                // Enable javascript in the webview
                enableScripts: true,

                // Restrict the webview to only load content from the extension's `resources` directory.
                localResourceRoots: [ProofObligationPanel.resourcesUri(extensionUri)],

                // Retain state when PO view goes into the background
                retainContextWhenHidden: true
            },
        );

        this.lastWorkspace = workspace;
        ProofObligationPanel.currentPanel = new ProofObligationPanel(extensionUri, panel);
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
                        // Find path of po with id
                        let po = this._pos.find(d => d.id.toString() == message.text);
                        let path = Uri.parse(po.location.uri.toString()).path;

                        // Open the specification file with the symbol responsible for the po
                        let doc = await workspace.openTextDocument(path);

                        // Show the file
                        window.showTextDocument(doc.uri, { selection: this._p2cConverter.asRange(po.location.range), viewColumn: 1 })
                        return;
                    case 'sort':
                        // Sort and post pos to javascript
                        this._currentSortingHeader = message.text;
                        this._panel.webview.postMessage({ command: "rebuildPOview", pos: this.sortPOs(this._pos, this._currentSortingHeader, true) });
                        return;
                    case 'filterPOs':
                        this.filterByStatus();
                        return;
                    case 'filterPOsDisable':
                        this._statusFilter = []; // Remove filter
                        this._panel.webview.postMessage({ command: "updateFilterBtn", active: false });
                        this._panel.webview.postMessage({ command: "rebuildPOview", pos: this.sortPOs(this._pos, this._currentSortingHeader, false) });
                        return;
                }
            },
            null,
            this._disposables
        );

        // Generate the html for the webview
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    }

    public static displayWarning() {
        // Post display warming message to javascript
        this.currentPanel._panel.webview.postMessage({ command: "posInvalid" });
    }

    public displayNewPOS(pos: ProofObligation[]) {
        // Sort and post pos to javascript
        this._pos = pos;

        if (pos.length < 1) {
            this._panel.webview.postMessage({ command: "newPOs", pos: pos });
            return;
        }

        if (!this._currentSortingHeader)
            this._currentSortingHeader = Object.keys(pos[0])[0];

        this._panel.webview.postMessage({ command: "newPOs", pos: this.sortPOs([...pos], this._currentSortingHeader, false) });
    }

    private onlyUnique(value, index, self) {
        return self.indexOf(value) === index;
    }

    public filterByStatus() {
        let items: string[] = this._pos.map(po => po.status).filter(this.onlyUnique); // Create list of available status's
        window.showQuickPick(items, { title: 'Select which to show', canPickMany: true }).then((selected: string[]) => {
            if (!selected || selected.length == 0 || selected.length == items.length)
                return; // Abort

            // Update filter and UI
            this._statusFilter = selected;
            this._panel.webview.postMessage({ command: "updateFilterBtn", active: true });
            this._panel.webview.postMessage({ command: "rebuildPOview", pos: this.sortPOs(this._pos, this._currentSortingHeader, false) });
        })
    }

    private sortPOs(pos, sortingHeader, changeSortingDirection) {
        if (pos.length < 1)
            return pos;

        // Add header and sorting state to sorting map
        if (!this._sorting.has(sortingHeader))
            this._sorting.set(sortingHeader, false)
        else if (changeSortingDirection)
            this._sorting.set(sortingHeader, this._sorting.get(sortingHeader) ? false : true);


        // Filter proved pos
        if (this._statusFilter.length != 0)
            pos = pos.filter(po => this._statusFilter.includes(po.status))

        // Check if values are numbers - assumes all values found in the column are of the same type
        let isNum = /^\d+$/.test(pos[0][sortingHeader]);

        // Do number sort
        if (isNum) {
            pos.sort(function (a, b) {
                let aval = a[Object.keys(a).find(k => k == sortingHeader)];
                let bval = b[Object.keys(b).find(k => k == sortingHeader)];
                return aval - bval;
            });
        }
        // Do string sort
        else {
            pos.sort(function (a, b) {
                let aStringVal = a[Object.keys(a).find(k => k == sortingHeader)];
                let bStringVal = b[Object.keys(b).find(k => k == sortingHeader)];
                let aIdVal = a["id"];
                let bIdVal = b["id"];

                if (aStringVal instanceof Array) {
                    aStringVal = aStringVal.join(".");
                    bStringVal = bStringVal.join(".");
                }

                return aStringVal == bStringVal ? aIdVal - bIdVal : aStringVal.localeCompare(bStringVal);
            });
        }
        // Change sorted direction
        if (this._sorting.get(sortingHeader))
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

    private static resourcesUri(extensionUri: Uri) {
        let res = util.joinUriPath(extensionUri, 'resources');
        return res;
    }

    private _getHtmlForWebview(webview: Webview) {
        const scriptUri = webview.asWebviewUri(util.joinUriPath(ProofObligationPanel.resourcesUri(this._extensionUri), 'poView.js'));
        const styleUri = webview.asWebviewUri(util.joinUriPath(ProofObligationPanel.resourcesUri(this._extensionUri), 'poView.css'));

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
            <button id="expandPOsBtn">Expand all proof obligations</button>
            <button id="filterPOsBtn">Filter by status</button>
            <br>
            <p id="posInvalid"><b>Warning:</b> Proof obligations are no longer guaranteed to be valid!</p>
            <div id="poContainer"></div>
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



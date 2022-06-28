// SPDX-License-Identifier: GPL-3.0-or-later

import {
    WorkspaceFolder,
    Uri,
    WebviewPanel,
    Disposable,
    window,
    ViewColumn,
    workspace,
    Webview,
    Location,
    Event,
    ExtensionContext,
    commands,
    DocumentSelector,
} from "vscode";
import { ClientManager } from "../../ClientManager";
import * as util from "../../util/Util";
import { isSameWorkspaceFolder } from "../../util/WorkspaceFoldersUtil";

export interface ProofObligation {
    id: number;
    kind: string;
    name: string[];
    location: Location;
    source: string | string[];
    status?: string;
}

export interface ProofObligationProvider {
    onDidChangeProofObligations: Event<boolean>;
    provideProofObligations(uri: Uri): Thenable<ProofObligation[]>;
}

interface Message {
    command: string;
    data?: any;
}

export class ProofObligationPanel implements Disposable {
    private static _providers: { selector: DocumentSelector; provider: ProofObligationProvider }[] = [];

    private _panel: WebviewPanel;
    private _lastWsFolder: WorkspaceFolder;
    private _lastUri: Uri;
    private _disposables: Disposable[] = [];
    private _pos: ProofObligation[];
    private _sorting = new Map<string, boolean>(); // Maps a header to a boolean telling if sorting should be done DESCENDING.
    private _currentSortingHeader: string;
    private _statusFilter: string[] = [];

    constructor(private readonly _context: ExtensionContext, clientManager: ClientManager) {
        this._disposables.push(
            commands.registerCommand(
                `vdm-vscode.pog.run`,
                async (uri: Uri) => {
                    const wsFolder: WorkspaceFolder = workspace.getWorkspaceFolder(uri);
                    if (!wsFolder) throw Error(`[POG]: Cannot find workspace folder for iri: ${uri.toString()}`);
                    // If in a multi project workspace environment the user could utilise the pog.run command on a project for which no client (and therefore server) has been started.
                    // So check if a client is present for the workspacefolder or else start it.
                    if (!clientManager.get(wsFolder)) {
                        await clientManager.launchClientForWorkspace(wsFolder);
                    }
                    this.onRunPog(uri);
                },
                this
            )
        );
        this._disposables.push(commands.registerCommand(`vdm-vscode.pog.update`, this.onUpdate, this));
    }

    public get viewType(): string {
        return `${this._context.extension.id}.proofObligationPanel`;
    }

    private get _resourcesUri(): Uri {
        return Uri.joinPath(this._context.extensionUri, "resources");
    }

    public static registerProofObligationProvider(documentSelector: DocumentSelector, provider: ProofObligationProvider): Disposable {
        this._providers.push({ selector: documentSelector, provider: provider });
        commands.executeCommand("setContext", `vdm-vscode.pog.run`, true);

        let listener = provider.onDidChangeProofObligations((e) => commands.executeCommand(`vdm-vscode.pog.update`, e));

        return {
            dispose: () => {
                listener.dispose();
                this._providers = this._providers.filter((p) => p.selector != documentSelector || p.provider != provider);
                if (this._providers.length == 0) commands.executeCommand("setContext", `vdm-vscode.pog.run`, false);
            },
        };
    }

    protected async onRunPog(uri: Uri) {
        this._pos = [];
        for await (const p of ProofObligationPanel._providers) {
            if (util.match(p.selector, uri)) {
                try {
                    let res = await p.provider.provideProofObligations(uri);
                    this._pos.push(...res);
                } catch (e) {
                    console.warn(`[Proof Obligation View] Provider failed with message: ${e}`);
                }
            }
        }

        let wsFolder = workspace.getWorkspaceFolder(uri);
        this.createWebView(wsFolder);
        this.updateContent();

        this._lastUri = uri;
        this._lastWsFolder = wsFolder;
    }

    protected onUpdate(canRun: boolean) {
        // Only perform actions if POG View exists
        if (this._panel) {
            let uri = this._lastUri;

            // Switch to active editor is on a file from the clients workspace
            let activeWsFolder = workspace.getWorkspaceFolder(window.activeTextEditor?.document.uri);
            if (!isSameWorkspaceFolder(activeWsFolder, this._lastWsFolder)) uri = activeWsFolder.uri;

            // If POG is possible
            if (canRun) {
                this.onRunPog(uri);
            } else {
                // Display warning that POs may be outdated
                this.displayWarning();
            }
        }
    }

    protected createWebView(wsFolder?: WorkspaceFolder) {
        // Define which column the po view should be in
        const column = window.activeTextEditor ? ViewColumn.Beside : ViewColumn.Two;

        // Check if a panel already exists
        if (this._panel) {
            // Check if panel is for another workspace folder
            if (wsFolder && !isSameWorkspaceFolder(wsFolder, this._lastWsFolder)) {
                this._panel.title = "Proof Obligations" + (wsFolder ? ": " + wsFolder.name : "");
            }

            this._panel.reveal(column, true);
        } else {
            // Create panel
            this._panel =
                this._panel ||
                window.createWebviewPanel(
                    this.viewType,
                    "Proof Obligations" + (wsFolder ? ": " + wsFolder.name : ""),
                    {
                        viewColumn: column,
                        preserveFocus: true,
                    },
                    {
                        enableScripts: true, // Enable javascript in the webview
                        localResourceRoots: [this._resourcesUri], // Restrict the webview to only load content from the extension's `resources` directory.
                        retainContextWhenHidden: true, // Retain state when PO view goes into the background
                    }
                );

            // Listen for when the panel is disposed
            // This happens when the user closes the panel or when the panel is closed programatically
            this._panel.onDidDispose(this.clearPanelInfo, this, this._disposables);

            // Handle messages from the webview
            this._panel.webview.onDidReceiveMessage(
                async (message: Message) => {
                    console.log(`[Proof Obligation View] Received new message: ${message.command}`);
                    switch (message.command) {
                        case "goToSymbol":
                            // Find path of po with id
                            let po = this._pos.find((d) => d.id.toString() == message.data);
                            let path = Uri.parse(po.location.uri.toString()).path;

                            // Open the specification file with the symbol responsible for the po
                            let doc = await workspace.openTextDocument(path);

                            // Show the file
                            window.showTextDocument(doc.uri, { selection: po.location.range, viewColumn: 1 });
                            break;
                        case "sort":
                            // Sort and post pos to javascript
                            this._currentSortingHeader = message.data;
                            this._panel.webview.postMessage({
                                command: "rebuildPOview",
                                pos: this.sortPOs(this._pos, this._currentSortingHeader, true),
                            });
                            break;
                        case "filterPOs":
                            this.filterByStatus();
                            break;
                        case "filterPOsDisable":
                            this._statusFilter = []; // Remove filter
                            this._panel.webview.postMessage({ command: "updateFilterBtn", active: false });
                            this._panel.webview.postMessage({
                                command: "rebuildPOview",
                                pos: this.sortPOs(this._pos, this._currentSortingHeader, false),
                            });
                            break;
                    }
                },
                null,
                this._disposables
            );

            // Generate the html for the webview
            this._panel.webview.html = this.buildHtmlForWebview(this._panel.webview);
        }
    }

    private clearPanelInfo() {
        this._panel = undefined;
        this._lastWsFolder = undefined;
        this._lastUri = undefined;
    }

    private displayWarning() {
        // Post display warming message to javascript
        this._panel.webview.postMessage({ command: "posInvalid" });
    }

    protected updateContent() {
        const pos = this._pos;

        if (pos.length < 1) {
            this._panel.webview.postMessage({ command: "newPOs", pos: pos });
            return;
        }

        if (!this._currentSortingHeader) this._currentSortingHeader = Object.keys(pos[0])[0];

        this._panel.webview.postMessage({ command: "newPOs", pos: this.sortPOs([...pos], this._currentSortingHeader, false) });
    }

    private onlyUnique(value, index, self) {
        return self.indexOf(value) === index;
    }

    private filterByStatus() {
        let items: string[] = this._pos.map((po) => po.status).filter(this.onlyUnique); // Create list of available status's
        window.showQuickPick(items, { title: "Select which to show", canPickMany: true }).then((selected: string[]) => {
            if (!selected || selected.length == 0 || selected.length == items.length) return; // Abort

            // Update filter and UI
            this._statusFilter = selected;
            this._panel.webview.postMessage({ command: "updateFilterBtn", active: true });
            this._panel.webview.postMessage({ command: "rebuildPOview", pos: this.sortPOs(this._pos, this._currentSortingHeader, false) });
        });
    }

    private sortPOs(pos, sortingHeader, changeSortingDirection) {
        if (pos.length < 1) return pos;

        // Add header and sorting state to sorting map
        if (!this._sorting.has(sortingHeader)) this._sorting.set(sortingHeader, false);
        else if (changeSortingDirection) this._sorting.set(sortingHeader, this._sorting.get(sortingHeader) ? false : true);

        // Filter proved pos
        if (this._statusFilter.length != 0) pos = pos.filter((po) => this._statusFilter.includes(po.status));

        // Check if values are numbers - assumes all values found in the column are of the same type
        let isNum = /^\d+$/.test(pos[0][sortingHeader]);

        // Do number sort
        if (isNum) {
            pos.sort(function (a, b) {
                let aval = a[Object.keys(a).find((k) => k == sortingHeader)];
                let bval = b[Object.keys(b).find((k) => k == sortingHeader)];
                return aval - bval;
            });
        }
        // Do string sort
        else {
            pos.sort(function (a, b) {
                let aStringVal = a[Object.keys(a).find((k) => k == sortingHeader)];
                let bStringVal = b[Object.keys(b).find((k) => k == sortingHeader)];
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
        if (this._sorting.get(sortingHeader)) pos.reverse();

        return pos;
    }

    public dispose() {
        commands.executeCommand("setContext", `vdm-vscode.pog.run`, false);

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) this._disposables.pop().dispose();
    }

    private buildHtmlForWebview(webview: Webview) {
        const scriptUri = webview.asWebviewUri(Uri.joinPath(this._resourcesUri, "webviews", "poView", "poView.js"));
        const styleUri = webview.asWebviewUri(Uri.joinPath(this._resourcesUri, "webviews", "poView", "poView.css"));

        // Use a nonce to only allow specific scripts to be run
        const scriptNonce = this.generateNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${scriptNonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            
            <link href="${styleUri}" rel="stylesheet">
        </head>
        <body>
            <button class="button" id="expandPOsBtn">Expand all proof obligations</button>
            <button class="button" id="filterPOsBtn">Filter by status</button>
            <br>
            <p id="posInvalid"><b>Warning:</b> Proof obligations are no longer guaranteed to be valid!</p>
            <div id="poContainer"></div>
            <script nonce="${scriptNonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
    }

    private generateNonce() {
        let text = "";
        const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}

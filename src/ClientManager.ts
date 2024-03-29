/* eslint-disable eqeqeq */
// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, Disposable, RelativePattern, TextDocument, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { LanguageClientOptions, State, StateChangeEvent } from "vscode-languageclient";
import VdmMiddleware from "./lsp/VdmMiddleware";
import { ServerFactory } from "./server/ServerFactory";
import { SpecificationLanguageClient } from "./slsp/SpecificationLanguageClient";
import { VdmDapSupport as dapSupport } from "./dap/VdmDapSupport";
import AutoDisposable from "./helper/AutoDisposable";
import { getOuterMostWorkspaceFolder } from "./util/WorkspaceFoldersUtil";
import * as encoding from "./Encoding";

export class ClientManager extends AutoDisposable {
    private _clients: Map<string, SpecificationLanguageClient> = new Map();
    private _wsDisposables: Map<string, Disposable[]> = new Map();
    private _restartOnCrash: boolean = true;
    private _highPrecisionClients: Set<SpecificationLanguageClient> = new Set();

    constructor(
        private _serverFactory: ServerFactory,
        private _acceptedLanguageIds: Set<string>,
        private _languageIdFilePatternFunc: (fsPath: string) => RelativePattern
    ) {
        super();
        this._disposables.push(commands.registerCommand("vdm-vscode.restartActiveClient", () => this.restartActiveClient()));
    }

    get name(): string {
        return this.constructor["name"];
    }

    isHighPrecisionClient(client: SpecificationLanguageClient): boolean {
        return this._highPrecisionClients.has(client);
    }

    has(wsFolder: WorkspaceFolder): boolean {
        return this._clients.has(ClientManager.getKey(wsFolder));
    }

    get(wsFolder: WorkspaceFolder): SpecificationLanguageClient {
        return this._clients.get(ClientManager.getKey(wsFolder));
    }

    delete(wsFolder: WorkspaceFolder): boolean {
        if (!this._clients.has(ClientManager.getKey(wsFolder))) {
            return false;
        }
        this.getDisposables(wsFolder).forEach((d) => d.dispose());
        const client: SpecificationLanguageClient = this._clients.get(ClientManager.getKey(wsFolder));
        this._clients.delete(ClientManager.getKey(wsFolder));
        if (this._highPrecisionClients.has(client)) {
            this._highPrecisionClients.delete(client);
        }
        return true;
    }

    restart(wsFolder: WorkspaceFolder): void {
        let client = this.get(wsFolder);
        if (client) {
            this.delete(wsFolder);
            client.stop().then(() => this.startClient(wsFolder, client.languageId));
        }
    }

    getAllClients(): SpecificationLanguageClient[] {
        return Array.from(this._clients.values());
    }

    stopClients(wsFolders: readonly WorkspaceFolder[]) {
        for (const wsFolder of wsFolders) {
            const client = this.get(wsFolder);
            if (client) {
                this.delete(wsFolder);
                client
                    .stop()
                    .then(() => {
                        console.info(`[${this.name}] Client closed for the workspace folder ${wsFolder.name}`);
                    })
                    .catch((e) => `[${this.name}] Client close failed with error: ${e}`);
            }
        }
    }

    dispose() {
        super.dispose();

        // Dispose of server factory
        this._serverFactory.dispose();

        // Dispose of clients
        console.info(`[${this.name}] Stopping all clients`);
        this._clients.forEach((client, wsFolderKey) => {
            // Dispose of client specific subscriptions
            this._clients.delete(wsFolderKey);

            // Stop client
            if (client.needsStop()) {
                client.stop();
            }
        });
    }

    async launchClientForWorkspace(wsFolder: WorkspaceFolder): Promise<SpecificationLanguageClient> {
        // Locate any file with accepted language id in the project.

        const files: Uri[] = await workspace.findFiles(this._languageIdFilePatternFunc(wsFolder.uri.fsPath), null, 1);
        if (files.length > 0) {
            // Open a file in the workspace folder to force the client to start for the folder.
            await workspace.openTextDocument(files[0]);

            const client: SpecificationLanguageClient = this.get(wsFolder);
            // Wait for the client to be ready - i.e. completed initialization phase.
            await client.onReady();

            return client;
        }
        return null;
    }

    launchClient(document: TextDocument) {
        // Only accept documents with accepted language ids.
        if (!this._acceptedLanguageIds.has(document.languageId)) {
            return;
        }
        // Check that the document encoding matches the encoding setting
        encoding.checkEncoding(document);

        const folder = workspace.getWorkspaceFolder(document.uri);
        // Files outside a folder can't be handled.
        if (!folder) {
            // TODO remove if we get support for single file workspace
            return;
        }
        // If we have nested workspace folders we only start a server on the outer most workspace folder.
        const wsFolder = getOuterMostWorkspaceFolder(folder);
        this.startClient(wsFolder, document.languageId);
    }

    private addClient(wsFolder: WorkspaceFolder, client: SpecificationLanguageClient): void {
        if (this._clients.has(ClientManager.getKey(wsFolder))) {
            console.info(`[${this.name}] Overwriting client for workspace folder: ${wsFolder.name}`);
        }

        this._clients.set(ClientManager.getKey(wsFolder), client);
    }

    private startClient(wsFolder: WorkspaceFolder, dialect: string) {
        // Abort if client already exists
        if (this.has(wsFolder)) {
            return;
        }

        // Setup client options
        const clientOptions: LanguageClientOptions = {
            // Document selector defines which files from the workspace, that is also open in the client, to monitor.
            documentSelector: [{ scheme: "file", language: dialect, pattern: `${wsFolder.uri.fsPath}/**/*` }],
            diagnosticCollectionName: "vdm-vscode",
            workspaceFolder: wsFolder,
            traceOutputChannel: window.createOutputChannel(`vdm-vscode LSP: ${wsFolder.name}`),
            middleware: new VdmMiddleware(),
        };

        // Create the language client with the defined client options and the function to create and setup the server.
        const client = new SpecificationLanguageClient(
            `vdm-vscode`,
            dialect,
            this._serverFactory.createServerOptions(wsFolder, dialect),
            clientOptions
        );

        // Save client
        this.addClient(wsFolder, client);
        if (workspace.getConfiguration("vdm-vscode.server", wsFolder)?.highPrecision == true ?? false) {
            this._highPrecisionClients.add(client);
        }

        // Setup listener for un-intentional stop of the client, which requires a client restart
        // XXX Look here if unexpected client restart behaviour starts to happen
        this.addDisposable(
            wsFolder,
            client.onDidChangeState((e) => this.checkForClientCrash(e, wsFolder), this)
        );

        // Setup DAP
        client.onReady().then(() => {
            const port = client?.initializeResult?.capabilities?.experimental?.dapServer?.port;
            if (port) {
                dapSupport.addPort(wsFolder, port);
            } else {
                console.warn(`[${this.name}] Did not receive a DAP port on start up, debugging is not activated`);
            }
        });

        // Start the client
        console.info(`[${this.name}] Launching client for the folder ${wsFolder.name} with language ID ${dialect}`);
        client.start();
    }

    private checkForClientCrash(e: StateChangeEvent, wsFolder: WorkspaceFolder) {
        if (e.newState == State.Stopped && e.oldState == State.Running) {
            // Check for un-intentional stop
            if (this._restartOnCrash && this.has(wsFolder)) {
                let client = this.get(wsFolder);

                let m = `Client stopped unexpectantly, restarting client..`;
                console.warn(`[${this.name}] ${m}`);
                window.showWarningMessage(m, "Don't restart again", "Ok").then((press) => {
                    if (press == "Don't restart again") {
                        this._restartOnCrash = false;
                    }
                });

                this.delete(wsFolder);
                this.startClient(wsFolder, client.languageId);
            }
        }
    }

    private addDisposable(wsFolder: WorkspaceFolder, disposable: Disposable) {
        const wsKey = ClientManager.getKey(wsFolder);
        let disposables = this._wsDisposables.get(wsKey) ?? [];
        disposables.push(disposable);
        this._wsDisposables.set(wsKey, disposables);
    }

    private getDisposables(wsFolder: WorkspaceFolder): Disposable[] {
        return this._wsDisposables.get(ClientManager.getKey(wsFolder)) ?? [];
    }

    private restartActiveClient(): void {
        this.restart(workspace.getWorkspaceFolder(window.activeTextEditor.document.uri));
    }

    private static getKey(wsFolder: WorkspaceFolder): string {
        return wsFolder.uri.toString();
    }
}

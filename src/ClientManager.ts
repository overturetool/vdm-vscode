/* eslint-disable eqeqeq */
// SPDX-License-Identifier: GPL-3.0-or-later

import {
    commands,
    Diagnostic,
    Disposable,
    languages,
    Range,
    RelativePattern,
    TextDocument,
    Uri,
    window,
    workspace,
    WorkspaceFolder,
} from "vscode";
import { DiagnosticSeverity, LanguageClientOptions, State, StateChangeEvent } from "vscode-languageclient";
import VdmMiddleware from "./lsp/VdmMiddleware";
import { ServerFactory } from "./server/ServerFactory";
import { SpecificationLanguageClient } from "./slsp/SpecificationLanguageClient";
import { VdmDapSupport as dapSupport } from "./dap/VdmDapSupport";
import AutoDisposable from "./helper/AutoDisposable";
import { getOuterMostWorkspaceFolder } from "./util/WorkspaceFoldersUtil";
import * as encoding from "./Encoding";
import { getDialectFromAlias, VdmDialect } from "./util/DialectUtil";
import { ErrorAction, CloseAction } from "vscode-languageclient";
import * as crypto from "crypto";
import * as AdmZip from "adm-zip";
import * as fs from "fs";
import * as path from "path";

export class ClientManager extends AutoDisposable {
    private _clients: Map<string, SpecificationLanguageClient> = new Map();
    private _wsDisposables: Map<string, Disposable[]> = new Map();
    private _restartOnCrash: boolean = true;
    private _highPrecisionClients: Set<SpecificationLanguageClient> = new Set();
    private _stdlibHashes: Map<string, string> = new Map();
    private _stdlibDiagnostics = languages.createDiagnosticCollection("vdm-stdlib");

    constructor(
        private _serverFactory: ServerFactory,
        private _acceptedLanguageIds: Set<string>,
        private _languageIdFilePatternFunc: (fsPath: string) => RelativePattern,
    ) {
        super();
        this._disposables.push(commands.registerCommand("vdm-vscode.restartActiveClient", () => this.restartActiveClient()));
        this._disposables.push(this._stdlibDiagnostics);
        this._disposables.push(...this.registerLibConsistencyCheck());
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

    async restart(wsFolder: WorkspaceFolder): Promise<void> {
        let client = this.get(wsFolder);
        if (client) {
            this.delete(wsFolder);
            await client.stop();
            await this.startClient(wsFolder, getDialectFromAlias(client.languageId));
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

    async dispose() {
        super.dispose();

        // Dispose of server factory
        this._serverFactory.dispose();

        // Dispose of clients
        console.info(`[${this.name}] Stopping all clients`);
        for (const [wsFolderKey, client] of this._clients.entries()) {
            // Dispose of client specific subscriptions
            this._clients.delete(wsFolderKey);

            // Stop client
            if (client.needsStop()) {
                await client.stop();
            }
        }
    }

    async launchClientForWorkspace(wsFolder: WorkspaceFolder): Promise<SpecificationLanguageClient> {
        // Locate any file with accepted language id in the project.

        const files: Uri[] = await workspace.findFiles(this._languageIdFilePatternFunc(wsFolder.uri.fsPath), null, 1);
        if (files.length > 0) {
            // Open a file in the workspace folder to force the client to start for the folder.
            await workspace.openTextDocument(files[0]);

            const client: SpecificationLanguageClient = this.get(wsFolder);
            // Start client if not already started.
            if (client.needsStart()) {
                await client.start();
            }

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
        console.log("Launching client", document.languageId);
        void this.startClient(wsFolder, getDialectFromAlias(document.languageId));
    }

    private addClient(wsFolder: WorkspaceFolder, client: SpecificationLanguageClient): void {
        if (this._clients.has(ClientManager.getKey(wsFolder))) {
            console.info(`[${this.name}] Overwriting client for workspace folder: ${wsFolder.name}`);
        }

        this._clients.set(ClientManager.getKey(wsFolder), client);
    }

    private async startClient(wsFolder: WorkspaceFolder, dialect: VdmDialect) {
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
            errorHandler: {
                error: () => {
                    const isExperimental = workspace.getConfiguration("vdm-vscode.server.development")?.experimentalServer;
                    if (isExperimental) {
                        window
                            .showErrorMessage("Cannot connect to experimental server. Is the debugger running?", "Open Output")
                            .then((choice) => {
                                if (choice == "Open Output") {
                                    client.outputChannel.show(true);
                                }
                            });
                        return { action: ErrorAction.Shutdown };
                    }
                    return { action: ErrorAction.Continue };
                },
                closed: () => {
                    const isExperimental = workspace.getConfiguration("vdm-vscode.server.development")?.experimentalServer;
                    if (isExperimental) {
                        return { action: CloseAction.DoNotRestart };
                    }
                    return { action: CloseAction.Restart };
                },
            },
        };

        // Create the language client with the defined client options and the function to create and setup the server.
        const client = new SpecificationLanguageClient(
            `vdm-vscode`,
            dialect,
            this._serverFactory.createServerOptions(wsFolder, dialect),
            clientOptions,
        );

        // Save client
        this.addClient(wsFolder, client);
        if (workspace.getConfiguration("vdm-vscode.server", wsFolder)?.highPrecision ?? false) {
            this._highPrecisionClients.add(client);
        }

        // Setup listener for un-intentional stop of the client, which requires a client restart
        // XXX Look here if unexpected client restart behaviour starts to happen
        this.addDisposable(
            wsFolder,
            client.onDidChangeState(async (e) => await this.checkForClientCrash(e, wsFolder), this),
        );

        // Setup DAP
        // Start the client
        console.info(`[${this.name}] Launching client for the folder ${wsFolder.name} with language ID ${dialect}`);
        await client.start();
        const port = client?.initializeResult?.capabilities?.experimental?.dapServer?.port;
        if (port) {
            dapSupport.addPort(wsFolder, port);
        } else {
            console.warn(`[${this.name}] Did not receive a DAP port on start up, debugging is not activated`);
        }

        // Load stdlib hashes only once
        if (this._stdlibHashes.size === 0) {
            const jarPath = this.findStdLibJar();
            if (jarPath) {
                this.loadStdLibFromJar(jarPath);
            }
        }
        // Check project lib consistency
        this.checkLibConsistency(wsFolder, dialect);
    }

    private async checkForClientCrash(e: StateChangeEvent, wsFolder: WorkspaceFolder) {
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
                await this.startClient(wsFolder, getDialectFromAlias(client.languageId));
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

    private hash(content: string): string {
        const normalized = content.replace(/\r\n/g, "\n").trim();
        return crypto.createHash("sha256").update(normalized).digest("hex");
    }

    private loadStdLibFromJar(jarPath: string) {
        const zip = new AdmZip(jarPath);
        const validExtensions = [".vdmsl", ".vdmpp", ".vdmrt"];

        zip.getEntries().forEach((entry) => {
            if (entry.isDirectory) {
                return;
            }
            if (!validExtensions.some((ext) => entry.entryName.endsWith(ext))) {
                return;
            }

            const content = entry.getData().toString("utf8");
            this._stdlibHashes.set(entry.entryName, this.hash(content));
        });
    }

    private async checkLibConsistency(wsFolder: WorkspaceFolder, dialect: string) {
        const libPath = path.join(wsFolder.uri.fsPath, "lib");
        if (!fs.existsSync(libPath)) {
            return;
        }

        const files = fs.readdirSync(libPath);

        for (const file of files) {
            if (!file.endsWith(`.${dialect}`)) {
                continue;
            }

            const fullPath = path.join(libPath, file);
            const uri = Uri.file(fullPath);

            if (!this._stdlibHashes.has(file)) {
                this._stdlibDiagnostics.delete(uri);
                continue;
            }

            const doc = await workspace.openTextDocument(uri);
            const projectContent = doc.getText();
            const projectHash = this.hash(projectContent);
            const stdHash = this._stdlibHashes.get(file);

            if (projectHash !== stdHash) {
                const diagnostics = new Diagnostic(
                    new Range(0, 0, 0, 1),
                    `Library file '${file}' differs from stdlib.jar. It may be outdated.`,
                    DiagnosticSeverity.Error,
                );
                this._stdlibDiagnostics.set(uri, [diagnostics]);
                window
                    .showWarningMessage(`Library file '${file}' differs from the current stdlib. It may be outdated.`, "Open File")
                    .then((choice) => {
                        if (choice === "Open File") {
                            workspace.openTextDocument(uri).then((doc) => window.showTextDocument(doc));
                        }
                    });
            } else {
                this._stdlibDiagnostics.delete(uri);
            }
        }
    }

    private findStdLibJar(): string | undefined {
        const extensionRoot = path.resolve(__dirname, "..");
        const libsPath = path.join(extensionRoot, "resources", "jars", "vdmj", "libs");
        if (!fs.existsSync(libsPath)) {
            return undefined;
        }
        const files = fs.readdirSync(libsPath);
        const jarFile = files.find((f) => f.startsWith("stdlib") && f.endsWith(".jar"));
        if (!jarFile) {
            return undefined;
        }
        return path.join(libsPath, jarFile);
    }

    private registerLibConsistencyCheck(): Disposable[] {
        const watcher = workspace.createFileSystemWatcher("**/lib/*.{vdmsl,vdmpp,vdmrt}");

        const check = (uri: Uri) => {
            const wsFolder = workspace.getWorkspaceFolder(uri);
            if (!wsFolder) {
                return;
            }
            const client = this.get(wsFolder);
            if (!client) {
                return;
            }
            this.checkLibConsistency(wsFolder, client.languageId);
        };

        return [
            watcher,
            watcher.onDidChange(check),
            watcher.onDidCreate(check),
            watcher.onDidDelete((uri) => {
                this._stdlibDiagnostics.delete(uri);
            }),
        ];
    }
}

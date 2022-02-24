// SPDX-License-Identifier: GPL-3.0-or-later

import { Disposable, WorkspaceFolder } from "vscode";
import { BaseLanguageClient } from "vscode-languageclient";

export class Clients implements Disposable {
    private _clients: Map<string, BaseLanguageClient> = new Map();

    // Singleton
    private static _instance: Clients;
    private constructor() {}
    static get instance(): Clients {
        if (!Clients._instance) {
            Clients._instance = new Clients();
        }
        return Clients._instance;
    }

    get name(): string {
        return this.constructor["name"];
    }

    addClient(wsFolder: WorkspaceFolder, client: BaseLanguageClient): void {
        if (this._clients.has(Clients.getKey(wsFolder)))
            console.info(`[${this.name}] Overwriting client for workspace folder: ${wsFolder.name}`);

        this._clients.set(Clients.getKey(wsFolder), client);
    }

    has(wsFolder: WorkspaceFolder): boolean {
        return this._clients.has(Clients.getKey(wsFolder));
    }

    get(wsFolder: WorkspaceFolder): BaseLanguageClient {
        return this._clients.get(Clients.getKey(wsFolder));
    }

    delete(wsFolder: WorkspaceFolder): boolean {
        return this._clients.delete(Clients.getKey(wsFolder));
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
        // Dispose of clients
        console.info(`[${this.name}] Stopping all clients`);
        this._clients.forEach((client) => {
            if (client.needsStop()) {
                client.stop();
            }
        });
        this._clients.clear();
    }

    private static getKey(wsFolder: WorkspaceFolder): string {
        return wsFolder.uri.toString();
    }
}

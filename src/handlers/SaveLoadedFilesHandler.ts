// SPDX-License-Identifier: GPL-3.0-or-later

import * as vscode from "vscode";
import * as fs from "fs";
import AutoDisposable from "../helper/AutoDisposable";
import { registerCommand } from "../util/Util";
import { ClientManager } from "../ClientManager";
import { FileOrderRequest } from "../slsp/protocol/FileOrder";
import { CompletedParsingNotification } from "../server/ServerNotifications";

export class SaveLoadedFilesHandler extends AutoDisposable {
    private _checkedCallback: ((successful: boolean) => void) | undefined;

    constructor(private readonly clients: ClientManager) {
        super();

        registerCommand(this._disposables, "vdm-vscode.saveLoadedFiles", () => this._saveLoadedFiles());

        this._disposables.push(
            clients.onClientStarted((client) => {
                this._disposables.push(
                    client.onNotification(CompletedParsingNotification.type, (params) => {
                        vscode.commands.executeCommand("setContext", "vdm-vscode.saveLoadedFiles", params.successful);
                        if (this._checkedCallback) {
                            this._checkedCallback(params.successful);
                            this._checkedCallback = undefined;
                        }
                    }),
                );
            }),
        );

        const watcher = vscode.workspace.createFileSystemWatcher(`**/*.{vdmsl,vdmpp,vdmrt}`);
        this._disposables.push(watcher);
        this._disposables.push(watcher.onDidCreate((uri) => this._onVdmFilesChanged(uri)));
        this._disposables.push(watcher.onDidDelete((uri) => this._onVdmFilesChanged(uri)));
    }

    private async _writeOrderingFile(wsFolder: vscode.WorkspaceFolder, files: string[]): Promise<void> {
        const orderingUri = vscode.Uri.joinPath(wsFolder.uri, ".vscode", "ordering");
        fs.mkdirSync(vscode.Uri.joinPath(wsFolder.uri, ".vscode").fsPath, { recursive: true });
        fs.writeFileSync(orderingUri.fsPath, files.join("\n") + "\n", "utf8");
    }

    private async _saveLoadedFiles(): Promise<void> {
        const wsFolder = this._resolveWorkspaceFolder();
        if (!wsFolder) {
            return;
        }

        const client = this.clients.get(wsFolder);
        if (!client) {
            vscode.window.showWarningMessage(`No active VDM language server for workspace "${wsFolder.name}".`);
            return;
        }

        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: "Optimizing build order" },
            async (progress) => {
                const orderingPath = vscode.Uri.joinPath(wsFolder.uri, ".vscode", "ordering").fsPath;
                const orderingExists = fs.existsSync(orderingPath);

                if (orderingExists) {
                    progress.report({ message: "Clearing existing ordering..." });
                    const checkedPromise = this._waitForChecked();
                    fs.unlinkSync(orderingPath);

                    progress.report({ message: "Waiting for rebuild..." });
                    const success = await checkedPromise;
                    if (!success) {
                        vscode.window.showErrorMessage("Build failed after clearing ordering - cannot optimize");
                        return;
                    }
                }

                progress.report({ message: "Calculating optimal order..." });
                const files = await this._requestFileOrder(wsFolder);
                if (!files) {
                    return;
                }

                progress.report({ message: "Writing ordering file..." });
                const checkedPromise = this._waitForChecked();
                await this._writeOrderingFile(wsFolder, files);

                progress.report({ message: "Rebuilding in optimal order..." });
                await checkedPromise;

                progress.report({ message: "Done." });
                await new Promise((r) => setTimeout(r, 1500));

                vscode.window.showInformationMessage(`File order saved to .vscode/ordering`);
            },
        );
    }

    private _waitForChecked(): Promise<boolean> {
        return new Promise((resolve) => {
            this._checkedCallback = resolve;
        });
    }

    private async _onVdmFilesChanged(changedUri: vscode.Uri): Promise<void> {
        const wsFolder = vscode.workspace.getWorkspaceFolder(changedUri);
        if (!wsFolder) {
            return;
        }

        const orderingPath = vscode.Uri.joinPath(wsFolder.uri, ".vscode", "ordering").fsPath;
        if (!fs.existsSync(orderingPath)) {
            return;
        }

        const choice = await vscode.window.showWarningMessage(`.vscode/ordering may be out of date.`, "Rebuild", "Dismiss");
        if (choice !== "Rebuild") {
            return;
        }

        const files = await this._requestFileOrder(wsFolder);
        if (!files) {
            return;
        }

        await this._writeOrderingFile(wsFolder, files);
        vscode.window.showInformationMessage(`.vscode/ordering has been rebuilt.`);
    }

    private async _requestFileOrder(wsFolder: vscode.WorkspaceFolder): Promise<string[] | undefined> {
        const client = this.clients.get(wsFolder);
        if (!client) {
            vscode.window.showWarningMessage(`No active VDM language server for workspace "${wsFolder.name}".`);
            return undefined;
        }

        const supported = client.initializeResult?.capabilities?.experimental?.orderingProvider;
        if (!supported) {
            vscode.window.showWarningMessage("The connected server does not support ordering");
            return undefined;
        }

        try {
            const response = await client.sendRequest(FileOrderRequest.type);
            if (!response?.length) {
                vscode.window.showWarningMessage(`The server returned an empty file list.`);
                return undefined;
            }
            return response;
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to get file order from server: ${e}`);
            return undefined;
        }
    }

    private _resolveWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
        const activeUri = vscode.window.activeTextEditor?.document?.uri;
        const wsFolder = activeUri ? vscode.workspace.getWorkspaceFolder(activeUri) : vscode.workspace.workspaceFolders?.[0];

        if (!wsFolder) {
            vscode.window.showErrorMessage("No workspace folder found");
        }
        return wsFolder;
    }
}

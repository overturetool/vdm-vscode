// SPDX-License-Identifier: GPL-3.0-or-later

import * as vscode from "vscode";
import * as fs from "fs";
import AutoDisposable from "../helper/AutoDisposable";
import { ClientManager } from "../ClientManager";
import { registerCommand } from "../util/Util";
import { FileOrderRequest, FileOrderResponse } from "../slsp/protocol/FileOrder";

export class SaveLoadedFilesHandler extends AutoDisposable {
    constructor(private readonly clients: ClientManager) {
        super();

        registerCommand(this._disposables, "vdm-vscode.saveLoadedFiles", () => this._saveLoadedFiles());

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

        const files = await this._requestFileOrder(wsFolder);
        if (!files) {
            return;
        }

        await this._writeOrderingFile(wsFolder, files);
        vscode.window.showInformationMessage(`File order saved to .vscode/ordering`);
    }

    private async _onVdmFilesChanged(changedUri: vscode.Uri): Promise<void> {
        const wsFolder = vscode.workspace.getWorkspaceFolder(changedUri);
        if (!wsFolder) {
            return;
        }

        const orderingParh = vscode.Uri.joinPath(wsFolder.uri, ".vscode", "ordering").fsPath;
        if (!fs.existsSync(orderingParh)) {
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
            vscode.window.showErrorMessage(`No active VDM language server for workspace "${wsFolder.name}".`);
            return undefined;
        }

        try {
            const params = { uri: client.code2ProtocolConverter.asUri(wsFolder.uri) };
            const response: FileOrderResponse | null = await client.sendRequest(FileOrderRequest.type, params);
            if (!response?.files?.length) {
                vscode.window.showWarningMessage(`The server returned an empty file list.`);
                return undefined;
            }
            return response.files;
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

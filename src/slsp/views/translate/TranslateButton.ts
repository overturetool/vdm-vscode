// SPDX-License-Identifier: GPL-3.0-or-later

import * as Fs from "fs-extra";
import * as util from "../../../util/Util";
import { Uri, ViewColumn, window, workspace, WorkspaceFolder, commands, WorkspaceConfiguration } from "vscode";
import { Disposable } from "vscode-languageclient";
import { TranslateProviderManager } from "./TranslateProviderManager";
import { createDirectorySync, isDir } from "../../../util/DirectoriesUtil";
import { ClientManager } from "../../../ClientManager";

export class TranslateButton implements Disposable {
    protected _commandDisposable: Disposable;

    constructor(protected _language: string, protected _extensionName: string, clientManager: ClientManager) {
        this._commandDisposable = commands.registerCommand(
            `${_extensionName}.translate.${this._language}`,
            async (uri) => {
                const wsFolder: WorkspaceFolder = workspace.getWorkspaceFolder(uri);
                if (!wsFolder) throw Error(`Cannot find workspace folder for Uri: ${uri.toString()}`);
                // If in a multi project workspace environment the user could utilise the translate command on a project for which no client (and therefore server) has been started.
                // So check if a client is present for the workspacefolder or else start it.
                if (!clientManager.get(wsFolder)) {
                    await clientManager.launchClientForWorkspace(wsFolder);
                }
                this.translate(uri, wsFolder);
            },
            this
        );
    }

    protected async translate(uri: Uri, wsFolder: WorkspaceFolder): Promise<void> {
        // Check timestamp setting
        const translateConfig = workspace.getConfiguration([this._extensionName, "translate", "general"].join("."), wsFolder);
        const timestamped = translateConfig?.get("storeAllTranslations", false);
        const allowSingleFile = translateConfig?.get("allowSingleFileTranslation", true);

        // Check if translate whole workspace folder
        if (!allowSingleFile) {
            uri = wsFolder.uri;
        }

        for await (const p of TranslateProviderManager.getProviders(this._language)) {
            if (util.match(p.selector, uri)) {
                try {
                    // Get save location for the translation
                    const saveUri = this.createSaveDir(timestamped, Uri.joinPath(util.generatedDataPath(wsFolder), this._language));

                    // Perform translation and handle result
                    const languageConfig = workspace.getConfiguration(
                        [this._extensionName, "translate", this._language].join("."),
                        wsFolder
                    );
                    p.provider.doTranslation(saveUri, uri, this.getOptions(languageConfig)).then(async (mainFileUri) => {
                        // Check if a file has been returned
                        if (!isDir(mainFileUri.fsPath)) {
                            // Open the main file in the translation
                            const doc = await workspace.openTextDocument(mainFileUri);

                            // Show the file
                            window.showTextDocument(doc.uri, { viewColumn: ViewColumn.Beside, preserveFocus: true });
                        }
                    });
                } catch (e) {
                    const message = `${this._language} translate provider failed with message: ${e}`;
                    window.showWarningMessage(message);
                    console.warn(message);
                }
            }
        }
    }

    protected createSaveDir(timestamped: boolean = false, location: Uri): Uri {
        // Create save location in "...<worksapcefolder>/.generate/<language>"
        const saveLocation = createDirectorySync(location, timestamped);

        // Make sure the directory is empty
        Fs.emptyDirSync(saveLocation.fsPath);

        return saveLocation;
    }

    private getOptions(config: WorkspaceConfiguration): any {
        let options = {};

        // Add configurations to the command options
        Object.keys(config).forEach((key) => {
            if (typeof config[key] !== "function") {
                // Add options object to array
                options[key] = config[key];
            }
        });

        return options;
    }

    dispose(): void {
        commands.executeCommand("setContext", `${this._extensionName}.translate.${this._language}`, false);

        // Clean up our resources
        this._commandDisposable.dispose();
    }
}

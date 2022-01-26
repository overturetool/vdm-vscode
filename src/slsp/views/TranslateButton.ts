// SPDX-License-Identifier: GPL-3.0-or-later

import * as Fs from "fs-extra";
import * as util from "../../Util";

import { Uri, ViewColumn, window, workspace, WorkspaceFolder, commands, WorkspaceConfiguration } from "vscode";
import { Disposable } from "vscode-languageclient";
import { TranslateProviderManager } from "../../TranslateProviderManager";

export class TranslateButton {
    protected _commandDisposable: Disposable;

    constructor(private _language: string) {
        this._commandDisposable = commands.registerCommand(`vdm-vscode.translate.${this._language}`, this.translate, this);
    }

    protected async translate(uri: Uri): Promise<void> {
        const wsFolder: WorkspaceFolder = workspace.getWorkspaceFolder(uri);
        if (!wsFolder) throw Error(`Cannot find workspace folder for Uri: ${uri.toString()}`);

        // Check timestamp setting
        const translateConfig = workspace.getConfiguration(["vdm-vscode", "translate", "general"].join("."), wsFolder);
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
                    const saveUri = this.createSaveLocation(wsFolder, timestamped);

                    // Perform translation and handle result
                    p.provider.doTranslation(saveUri, uri, this.getOptions(translateConfig)).then(async (mainFileUri) => {
                        // Check if a file has been returned
                        if (!util.isDir(uri.fsPath)) {
                            // Open the main file in the translation
                            let doc = await workspace.openTextDocument(uri);

                            // Show the file
                            window.showTextDocument(doc.uri, { viewColumn: ViewColumn.Beside, preserveFocus: true });
                        }
                    });
                } catch (e) {
                    let message = `[Translate] Provider failed with message: ${e}`;
                    window.showWarningMessage(message);
                    console.warn(message);
                }
            }
        }
    }

    protected createSaveLocation(wsFolder: WorkspaceFolder, timestamped: boolean = false): Uri {
        // Create save location in "...<worksapcefolder>/.generate/<language>"
        let saveLocation = Uri.joinPath(wsFolder.uri, ".generated", this._language, this._language);
        saveLocation = util.createDirectorySync(saveLocation, timestamped);

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
        commands.executeCommand("setContext", `vdm-vscode.translate.${this._language}`, false);

        // Clean up our resources
        this._commandDisposable.dispose();
    }
}

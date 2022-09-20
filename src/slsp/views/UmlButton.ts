// SPDX-License-Identifier: GPL-3.0-or-later

import * as Fs from "fs-extra";
// import { debug } from "vscode";
import * as util from "../../util/Util";
import { Uri, ViewColumn, window, workspace, WorkspaceFolder, commands, WorkspaceConfiguration } from "vscode";
import { Disposable } from "vscode-languageclient";
import { createDirectorySync, isDir } from "../../util/DirectoriesUtil";
import { ClientManager } from "../../ClientManager";
import { VdmjUmlInterpreterHandler } from "../../vdmj/VdmjUmlInterpreterHandler"
import { VdmDapSupport as dapSupport, VdmDebugConfiguration } from "../../dap/VdmDapSupport";
import { debug } from "console";

export class UmlButton implements Disposable {
    protected _commandDisposable: Disposable;

    constructor(protected _extensionName: string) {
        this._commandDisposable = commands.registerCommand(
            `${_extensionName}.vdm2uml`,
            async (uri) => {
                const wsFolder: WorkspaceFolder = workspace.getWorkspaceFolder(uri);
                if (!wsFolder) throw Error(`Cannot find workspace folder for Uri: ${uri.toString()}`);
                // // If in a multi project workspace environment the user could utilise the translate command on a project for which no client (and therefore server) has been started.
                // // So check if a client is present for the workspacefolder or else start it.
                // if (!clientManager.get(wsFolder)) {
                //     await clientManager.launchClientForWorkspace(wsFolder);
                this.vdm2uml(wsFolder);
            },
            this
        );
    }

    protected async vdm2uml(wsFolder): Promise<void> {
        // Check timestamp setting
        // const translateConfig = workspace.getConfiguration([this._extensionName, "translate", "general"].join("."), wsFolder);
        // const timestamped = translateConfig?.get("storeAllTranslations", false);
        // const allowSingleFile = translateConfig?.get("allowSingleFileTranslation", true);

        // Check if translate whole workspace folder
        // if (!allowSingleFile) {
        //     uri = wsFolder.uri;
        // }

        try {
            dapSupport.startDebugConsoleWithCommand("vdm2uml", wsFolder)
            // Get save location for the translation
            // const saveUri = this.createSaveDir(false, Uri.joinPath(util.generatedDataPath(wsFolder), "uml"));

            // Perform translation and handle result
            // const languageConfig = workspace.getConfiguration(
            //     [this._extensionName, "translate", this._language].join("."),
            //     wsFolder
            // );
            // p.provider.doTranslation(saveUri, uri, this.getOptions(languageConfig)).then(async (mainFileUri) => {
            //     // Check if a file has been returned
            //     if (!isDir(mainFileUri.fsPath)) {
            //         // Open the main file in the translation
            //         const doc = await workspace.openTextDocument(mainFileUri);

            //         // Show the file
            //         window.showTextDocument(doc.uri, { viewColumn: ViewColumn.Beside, preserveFocus: true });
                // }
        } catch (e) {
            const message = `vdm2uml provider failed with message: ${e}`;
            window.showWarningMessage(message);
            console.warn(message);
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
        commands.executeCommand("setContext", `${this._extensionName}.vdm2uml`, false);

        // Clean up our resources
        this._commandDisposable.dispose();
    }
}

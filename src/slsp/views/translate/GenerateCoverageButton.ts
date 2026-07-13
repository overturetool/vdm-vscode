// SPDX-License-Identifier: GPL-3.0-or-later

import * as Fs from "fs-extra";
import { commands, Disposable, Uri, window, workspace, WorkspaceFolder } from "vscode";
import * as Util from "../../../util/Util";
import { ClientManager } from "../../../ClientManager";
import { CoverageProviderManager } from "./CoverageProviderManager";
import { createDirectorySync } from "../../../util/DirectoriesUtil";

const events = require("events");

export class GenerateCoverageButton implements Disposable {
    public eventEmitter = new events.EventEmitter();
    public static translationDoneId: string = "TDONE";
    private static readonly _language = "coverage";

    protected _commandDisposable: Disposable;

    constructor(
        protected _extensionName: string,
        clientManager: ClientManager,
    ) {
        this._commandDisposable = commands.registerCommand(
            `${_extensionName}.translate.${GenerateCoverageButton._language}`,
            async (uri: Uri) => {
                const wsFolder = workspace.getWorkspaceFolder(uri);
                if (!wsFolder) {
                    throw Error(`Cannor find workspace folder for Uri: ${uri.toString()}`);
                }
                if (!clientManager.get(wsFolder)) {
                    await clientManager.launchClientForWorkspace(wsFolder);
                }
                this.generateCoverage(wsFolder);
            },
            this,
        );
    }

    private async generateCoverage(wsFolder: WorkspaceFolder): Promise<void> {
        for (const entry of CoverageProviderManager.getProviders()) {
            if (Util.match(entry.selector, wsFolder.uri)) {
                try {
                    const saveUri = this.createSaveDir(
                        Uri.joinPath(Util.generatedDataPath(wsFolder), GenerateCoverageButton._language, GenerateCoverageButton._language),
                    );

                    entry.provider
                        .doCoverage(saveUri, wsFolder.uri, { storeAllTranslations: "true", allowSingleFileTranslation: "false" })
                        .then(() => {
                            this.eventEmitter.emit(GenerateCoverageButton.translationDoneId, {
                                uri: saveUri,
                                wsFolder: wsFolder,
                            } as GeneratedCoverage);
                        });
                } catch (e) {
                    const message = `Coverage provider failed with message: ${e}`;
                    window.showWarningMessage(message);
                    console.warn(message);
                }
            }
        }
    }

    private createSaveDir(location: Uri): Uri {
        const saveLocation = createDirectorySync(location, true);
        Fs.removeSync(saveLocation.fsPath);
        Fs.ensureDirSync(saveLocation.fsPath);
        return saveLocation;
    }

    dispose() {
        this._commandDisposable.dispose();
    }
}

export type GeneratedCoverage = {
    uri: Uri;
    wsFolder: WorkspaceFolder;
};

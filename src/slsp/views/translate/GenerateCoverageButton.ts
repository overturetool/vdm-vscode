// SPDX-License-Identifier: GPL-3.0-or-later

import { TranslateButton } from "./TranslateButton";
import * as LanguageId from "../../protocol/LanguageId";
import { Uri, window, WorkspaceFolder } from "vscode";
import * as Util from "../../../util/Util";
import { TranslateProviderManager } from "./TranslateProviderManager";
import { ClientManager } from "../../../ClientManager";

const events = require("events");

export class GenerateCoverageButton extends TranslateButton {
    public eventEmitter = new events.EventEmitter();
    public static translationDoneId: string = "TDONE";

    constructor(protected _extensionName: string, clientManager: ClientManager) {
        super(LanguageId.coverage, _extensionName, clientManager);
    }
    // Override
    protected async translate(_uri: Uri, wsFolder: WorkspaceFolder) {
        for await (const p of TranslateProviderManager.getProviders(this._language)) {
            if (Util.match(p.selector, wsFolder.uri)) {
                try {
                    // Get save location for coverage files
                    const saveUri = this.createSaveDir(
                        true,
                        Uri.joinPath(Util.generatedDataPath(wsFolder), this._language, this._language)
                    );

                    // Perform translation to generate coverage files
                    p.provider
                        .doTranslation(saveUri, wsFolder.uri, { storeAllTranslations: "true", allowSingleFileTranslation: "false" })
                        .then(() => {
                            this.eventEmitter.emit(GenerateCoverageButton.translationDoneId, {
                                uri: saveUri,
                                wsFolder: wsFolder,
                            } as GeneratedCoverage);
                        });
                } catch (e) {
                    const message = `${this._language} translate provider failed with message: ${e}`;
                    window.showWarningMessage(message);
                    console.warn(message);
                }
            }
        }
    }
}

export type GeneratedCoverage = {
    uri: Uri;
    wsFolder: WorkspaceFolder;
};

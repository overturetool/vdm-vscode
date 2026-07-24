// SPDX-License-Identifier: GPL-3.0-or-later

import * as Fs from "fs-extra";
import * as util from "../../../util/Util";
import { commands, QuickPickItem, Uri, ViewColumn, window, workspace, WorkspaceConfiguration, WorkspaceFolder } from "vscode";
import { Disposable } from "vscode-languageclient";
import { TranslateProviderManager } from "./TranslateProviderManager";
import { createDirectorySync, isDir } from "../../../util/DirectoriesUtil";
import { ClientManager } from "../../../ClientManager";
import { guessDialect, VdmDialect } from "../../../util/DialectUtil";

interface QuickPickLanguageItem extends QuickPickItem {
    languageId: string;
}

export class GenericTranslateHandler implements Disposable {
    protected _commandDisposable: Disposable;

    constructor(
        protected _extensionName: string,
        private readonly clientManager: ClientManager,
    ) {
        this._commandDisposable = commands.registerCommand(
            `${_extensionName}.translate`,
            async (uri: Uri) => this.handleTranslate(uri),
            this,
        );
    }

    private async handleTranslate(uri: Uri): Promise<void> {
        const wsFolder: WorkspaceFolder | undefined = workspace.getWorkspaceFolder(uri);
        if (!wsFolder) {
            throw Error(`Cannot find workspace folder for Uri: ${uri.toString()}`);
        }

        if (!this.clientManager.get(wsFolder)) {
            await this.clientManager.launchClientForWorkspace(wsFolder);
        }

        const candidates: { languageId: string; selector: any; provider: any; description?: string }[] = [];
        for (const languageId of TranslateProviderManager.getRegisteredLanguages()) {
            for (const entry of TranslateProviderManager.getProviders(languageId) ?? []) {
                if (util.match(entry.selector, uri)) {
                    candidates.push({ languageId, selector: entry.selector, provider: entry.provider, description: entry.description });
                }
            }
        }

        if (candidates.length === 0) {
            const choice = await window.showInformationMessage(
                "No translations available for this file/folder. This can happen if the relevant plugin is disabled or not installed.",
                "Manage VDMJ Plugins...",
            );
            if (choice === "Manage VDMJ Plugins...") {
                commands.executeCommand("vdm-vscode.managePlugins", uri);
            }
            return;
        }

        const HINT_ITEM: QuickPickLanguageItem = {
            label: "$(gear) Manage VDMJ Plugins...",
            description: "Don't see what you're looking for? Enable more translation plugins here.",
            languageId: "__manage_plugins__",
        };

        let chosen = candidates[0];

        const picked = await window.showQuickPick<QuickPickLanguageItem>(
            [
                ...candidates.map((c) => ({
                    label: c.languageId,
                    description: c.description,
                    languageId: c.languageId,
                })),
                HINT_ITEM,
            ],
            { placeHolder: "Choose a translation..." },
        );
        if (!picked) {
            return;
        }
        if (picked.languageId === "__manage_plugins__") {
            commands.executeCommand("vdm-vscode.managePlugins", uri);
            return;
        }
        chosen = candidates.find((c) => c.languageId === picked.languageId)!;

        await this.translate(chosen.languageId, chosen.provider, uri, wsFolder);
    }

    protected async translate(language: string, provider: any, uri: Uri, wsFolder: WorkspaceFolder): Promise<void> {
        if (language === "vdm2uml" && isDir(uri.fsPath)) {
            const dialect = await guessDialect(wsFolder);
            if (dialect === VdmDialect.VDMSL) {
                window.showInformationMessage("Translate to UML is not supported for VDM-SL projects.");
                return;
            }
        }

        const translateConfig = workspace.getConfiguration([this._extensionName, "translate", "general"].join("."), wsFolder);
        const timestamped = translateConfig?.get("storeAllTranslations", false);
        const allowSingleFile = translateConfig?.get("allowSingleFileTranslation", true);

        if (!allowSingleFile) {
            uri = wsFolder.uri;
        }

        try {
            const saveUri = this.createSaveDir(timestamped, Uri.joinPath(util.generatedDataPath(wsFolder), language));
            const languageConfig = workspace.getConfiguration([this._extensionName, "translate", language].join("."), wsFolder);

            provider.doTranslation(saveUri, uri, this.getOptions(languageConfig, uri)).then(async (mainFileUri: Uri) => {
                if (!isDir(mainFileUri.fsPath)) {
                    const doc = await workspace.openTextDocument(mainFileUri);
                    window.showTextDocument(doc.uri, { viewColumn: ViewColumn.Beside, preserveFocus: true });
                }
            });
        } catch (e) {
            const message = `${language} translate provider failed with message: ${e}`;
            window.showWarningMessage(message);
            console.warn(message);
        }
    }

    protected createSaveDir(timestamped: boolean, location: Uri): Uri {
        const saveLocation = createDirectorySync(location, timestamped);
        Fs.removeSync(saveLocation.fsPath);
        Fs.ensureDirSync(saveLocation.fsPath);
        return saveLocation;
    }

    private getOptions(config: WorkspaceConfiguration, uri: Uri): any {
        let options: Record<string, any> = {};
        Object.keys(config).forEach((key) => {
            if (typeof config[key] !== "function") {
                options[key] = config[key];
            }
        });
        const headersConfig: string = options["headers"] ?? "auto";
        options["headers"] = headersConfig === "always" ? true : headersConfig === "never" ? false : !isDir(uri.fsPath);
        return options;
    }

    dispose(): void {
        this._commandDisposable.dispose();
    }
}

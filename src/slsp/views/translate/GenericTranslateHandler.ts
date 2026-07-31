// SPDX-License-Identifier: GPL-3.0-or-later

import * as Fs from "fs-extra";
import * as util from "../../../util/Util";
import {
    commands,
    extensions,
    QuickPickItem,
    TabInputText,
    Uri,
    ViewColumn,
    window,
    workspace,
    WorkspaceConfiguration,
    WorkspaceFolder,
} from "vscode";
import { Disposable } from "vscode-languageclient";
import { TranslateProviderManager } from "./TranslateProviderManager";
import { createDirectorySync, isDir } from "../../../util/DirectoriesUtil";
import { ClientManager } from "../../../ClientManager";
import { guessDialect, VdmDialect } from "../../../util/DialectUtil";
import { exec } from "child_process";

const PLANTUML_EXTENSIONS: { id: string; previewCommand: string }[] = [
    { id: "jebbs.plantuml", previewCommand: "plantuml.preview" },
    { id: "Mebrahtom.plantumlpreviewer", previewCommand: "extension.pumlpreviewer" },
];

interface QuickPickLanguageItem extends QuickPickItem {
    languageId: string;
}

function checkGraphvizInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
        exec("dot -V", (error) => resolve(!error));
    });
}

function graphvizInstallHint(): string {
    switch (process.platform) {
        case "darwin":
            return "brew install graphviz (or 'sudo port install graphviz' for MacPorts)";
        case "linux":
            return "sudo apt install graphviz (or your distro package manager equivalent)";
        case "win32":
            return "download an installer from https://graphviz.org/download/, or run 'choco install graphviz'";
        default:
            return "install it from https://graphviz.org/download/";
    }
}

async function warnMissingGraphviz(): Promise<void> {
    if (workspace.getConfiguration("vdm-vscode").get("translate.suppressGraphvizPrompt", false)) {
        return;
    }
    if (await checkGraphvizInstalled()) {
        return;
    }

    const choice = await window.showWarningMessage(
        `Previewing UML diagrams requires Graphviz ("dot") on your system, which wasn't found. Install it with: ${graphvizInstallHint()}`,
        "Don't show again",
    );
    if (choice === "Don't show again") {
        workspace.getConfiguration("vdm-vscode").update("translate.suppressGraphvizPrompt", true, true);
    }
}

async function waitForPlantUmlExtension(timeoutMs: number): Promise<{ id: string; previewCommand: string } | undefined> {
    const immediate = findInstalledPlantUmlExtension();
    if (immediate) {
        return immediate;
    }

    return new Promise((resolve) => {
        const sub = extensions.onDidChange(() => {
            const found = findInstalledPlantUmlExtension();
            if (found) {
                clearTimeout(timer);
                sub.dispose();
                resolve(found);
            }
        });
        const timer = setTimeout(() => {
            sub.dispose();
            resolve(undefined);
        }, timeoutMs);
    });
}

async function openWithPreview(fileUri: Uri, plantUml: { id: string; previewCommand: string }): Promise<void> {
    const doc = await workspace.openTextDocument(fileUri);
    await window.showTextDocument(doc.uri, { viewColumn: ViewColumn.Beside, preserveFocus: false });

    await warnMissingGraphviz();
    await commands.executeCommand(plantUml.previewCommand);

    const rawTab = window.tabGroups.all
        .flatMap((group) => group.tabs)
        .find((tab) => tab.input instanceof TabInputText && tab.input.uri.toString() === doc.uri.toString());
    if (rawTab) {
        await window.tabGroups.close(rawTab);
    }
}

function findInstalledPlantUmlExtension(): { id: string; previewCommand: string } | undefined {
    return PLANTUML_EXTENSIONS.find((e) => extensions.getExtension(e.id));
}

async function suggestPlantUmlExtension(outputDir: Uri, fileToPreview?: Uri): Promise<void> {
    if (!directoryContainsPuml(outputDir)) {
        return;
    }
    if (findInstalledPlantUmlExtension()) {
        return;
    }

    const choice = await window.showInformationMessage(
        "This translation produced a PlantUML (.puml) file. Install the PlantUML extension to preview the rendered diagram?",
        "Install",
        "Don't ask again",
    );

    if (choice === "Install") {
        await commands.executeCommand("workbench.extensions.installExtension", "jebbs.plantuml");
        const plantUml = await waitForPlantUmlExtension(5000);
        if (plantUml && fileToPreview) {
            await openWithPreview(fileToPreview, plantUml);
        } else if (!plantUml) {
            window.showInformationMessage("PlantUML installed. You may need to reload VS Code before previewing.");
        }
    } else if (choice === "Don't ask again") {
        workspace.getConfiguration("vdm-vscode").update("translate.suppressPlantUmlPrompt", true, true);
    }
}

function directoryContainsPuml(dirUri: Uri): boolean {
    try {
        return Fs.readdirSync(dirUri.fsPath).some((f) => f.endsWith(".puml"));
    } catch {
        return false;
    }
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

        const LANGUAGE_INPUT_EXTENSION: Record<string, string> = {
            uml2vdm: ".puml",
        };

        const candidates: { languageId: string; selector: any; provider: any; description?: string }[] = [];
        for (const languageId of TranslateProviderManager.getRegisteredLanguages()) {
            const requiredExt = LANGUAGE_INPUT_EXTENSION[languageId];
            if (requiredExt && !uri.fsPath.endsWith(requiredExt)) {
                continue;
            }
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
                let fileToOpen: Uri | undefined = isDir(mainFileUri.fsPath) ? undefined : mainFileUri;

                if (isDir(mainFileUri.fsPath)) {
                    const filesInDir = Fs.readdirSync(mainFileUri.fsPath);
                    if (filesInDir.length === 1) {
                        fileToOpen = Uri.joinPath(mainFileUri, filesInDir[0]);
                    }
                }

                if (fileToOpen) {
                    const doc = await workspace.openTextDocument(fileToOpen);
                    const isPuml = fileToOpen.fsPath.endsWith(".puml");
                    const plantUml = isPuml ? findInstalledPlantUmlExtension() : undefined;

                    await window.showTextDocument(doc.uri, { viewColumn: ViewColumn.Beside, preserveFocus: !(isPuml && plantUml) });

                    if (plantUml) {
                        await warnMissingGraphviz();
                        await commands.executeCommand(plantUml.previewCommand);

                        const rawTab = window.tabGroups.all
                            .flatMap((group) => group.tabs)
                            .find((tab) => tab.input instanceof TabInputText && tab.input.uri.toString() === doc.uri.toString());
                        if (rawTab) {
                            await window.tabGroups.close(rawTab);
                        }
                    }
                }

                if (!workspace.getConfiguration("vdm-vscode").get("translate.suppressPlantUmlPrompt", false)) {
                    suggestPlantUmlExtension(mainFileUri, fileToOpen);
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

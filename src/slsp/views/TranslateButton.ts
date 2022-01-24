// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from "fs-extra";
import * as util from "../../Util";
import * as LanguageId from "../../LanguageId";
import {
    DecorationOptions,
    Uri,
    ViewColumn,
    window,
    workspace,
    WorkspaceFolder,
    Range,
    commands,
    ExtensionContext,
    WorkspaceConfiguration,
} from "vscode";
import { Disposable, DocumentSelector } from "vscode-languageclient";

export interface TranslateProvider {
    provideTranslation(saveUri: Uri, rootUri?: Uri, options?: any): Thenable<Uri>;
}

export class TranslateButton {
    private static _providers: Map<string, { selector: DocumentSelector; provider: TranslateProvider }[]> = new Map();

    private _context: ExtensionContext;
    private _commandDisposable: Disposable;
    private _language: string;

    constructor(context: ExtensionContext, language: string) {
        this._context = context;
        this._language = language;
        this._commandDisposable = commands.registerCommand(`vdm-vscode.translate.${this._language}`, this.onTranslate, this);
    }

    public static registerTranslateProvider(documentSelector: DocumentSelector, provider: TranslateProvider, language: string): Disposable {
        let providers = this._providers.get(language) || [];
        providers.push({ selector: documentSelector, provider: provider });
        this._providers.set(language, providers);

        commands.executeCommand("setContext", `vdm-vscode.translate.${language}`, true);

        return {
            dispose: () => {
                let langProviders = this._providers.get(language).filter((p) => p.selector != documentSelector || p.provider != provider);
                this._providers.set(language, langProviders);
                if (langProviders.length == 0) commands.executeCommand("setContext", `vdm-vscode.translate.${language}`, false);
            },
        };
    }

    protected async onTranslate(uri: Uri) {
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

        // Get options
        const options = this.getOptions(translateConfig);

        for await (const p of TranslateButton._providers.get(this._language)) {
            if (util.match(p.selector, uri)) {
                try {
                    // Get save location for the translation
                    const saveUri = this.createSaveLocation(wsFolder, timestamped);

                    // Perform translations
                    const mainFileUri = await p.provider.provideTranslation(saveUri, uri, options);

                    // TODO move to function and move coverage stuff somewhere else
                    // Check if a directory has been returned
                    if (!util.isDir(mainFileUri.fsPath)) {
                        if (this._language == LanguageId.coverage) {
                            // Open the main file in the translation
                            let doc = await workspace.openTextDocument(Uri.parse(uri.toString()));

                            const decorationType = window.createTextEditorDecorationType({
                                backgroundColor: "#0080FF80",
                                border: "2px solid black",
                            });

                            let ranges = getCovtblFileRanges(mainFileUri.fsPath);

                            // Show the file
                            window.showTextDocument(doc.uri).then((editor) => editor.setDecorations(decorationType, ranges));
                        } else {
                            // Open the main file in the translation
                            let doc = await workspace.openTextDocument(mainFileUri);

                            // Show the file
                            window.showTextDocument(doc.uri, { viewColumn: ViewColumn.Beside, preserveFocus: true });
                        }
                    }
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
        let saveLocation = Uri.joinPath(wsFolder.uri, ".generated", this._language);
        saveLocation = util.createDirectorySync(saveLocation, timestamped);

        // Make sure the directory is empty
        fs.emptyDirSync(saveLocation.fsPath);

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

// TODO move somewhere else
function getCovtblFileRanges(fsPath: string): DecorationOptions[] {
    let ranges: DecorationOptions[] = [];

    try {
        // read contents of the file
        const data = fs.readFileSync(fsPath, { encoding: "utf8" });

        // split the contents by new line
        const lines = data.split(/\r?\n/);

        // iterate over each coverage region
        lines.forEach((line) => {
            if (line.length > 0) {
                // Lines follow "ln c1-c2+ct"
                let lnsplit = line.split(" ");
                let c1split = lnsplit[1].split("-");
                let c2split = c1split[1].split("=");
                //
                let ln = parseInt(lnsplit[0]);
                let c1 = parseInt(c1split[0]);
                let c2 = parseInt(c2split[0]);

                let range = new Range(ln - 1, c1 - 1, ln - 1, c2);

                ranges.push({ range });
            }
        });
    } catch (err) {
        console.error(err);
    }

    return ranges;
}

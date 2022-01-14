// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from "fs-extra"
import * as util from "./Util"
import * as LanguageId from "./LanguageId"
import { commands, DecorationOptions, Uri, ViewColumn, window, workspace, WorkspaceFolder, Range } from "vscode";
import { ClientCapabilities, Disposable, InitializeParams, ServerCapabilities, StaticFeature, WorkDoneProgressOptions } from "vscode-languageclient";
import { TranslateClientCapabilities, TranslateInitializeParams, TranslateParams, TranslateRequest, TranslateServerCapabilities } from "./protocol/translate.slsp";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";

export class TranslateFeature implements StaticFeature {
    private static _clients: number = 0;
    private static _disposables: Disposable[] = [];
    private _supportWorkDone: boolean = false;
    private _languages: string[];
    private _clientName: string;

    constructor(
        private _client: SpecificationLanguageClient) {
        ++TranslateFeature._clients;
        this._clientName = this._client.name;
    }

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        capabilities.experimental = capabilities.experimental || {};
        let translateCapabilities = capabilities as TranslateClientCapabilities;
        translateCapabilities.experimental.translateProvider = true;
    }
    initialize(capabilities: ServerCapabilities): void {
        let translateCapabilities = (capabilities as TranslateServerCapabilities).experimental.translateProvider;

        // Not supported
        if (!translateCapabilities || typeof translateCapabilities == "boolean")
            return;

        // Check if support work done progress
        if (WorkDoneProgressOptions.hasWorkDoneProgress(translateCapabilities))
            this._supportWorkDone = translateCapabilities.workDoneProgress

        // Initialize for each lanuage
        let languageIds = translateCapabilities.languageId
        this._languages = typeof languageIds == "string" ? [languageIds] : languageIds;

        this._languages.forEach(async language => {
            let commandName = `${this._clientName}.translate.${language}`

            // Only register commands for the ones that the server says it can
            let existingCommands = await commands.getCommands();
            if (!existingCommands.includes(commandName)) {
                // Register command
                let disposable = commands.registerCommand(commandName, inputUri => this.translate(inputUri, language));
                TranslateFeature._disposables.push(disposable);

                // Show button
                commands.executeCommand('setContext', commandName, true);    // commands.executeCommand('setContext', 'tr-' + this.language + '-show-button', true);
                TranslateFeature._disposables.push({ dispose: () => commands.executeCommand('setContext', commandName, false) })
            }
        })
    }
    dispose(): void {
        --TranslateFeature._clients;
        if (TranslateFeature._clients == 0) {
            for (let disposable of TranslateFeature._disposables)
                disposable.dispose()
        }
    }


    private translate(uri: Uri, language: string) {
        if (!util.belongsToClient(uri, this._client) || !this._languages.includes(language))
            return;

        let client = this._client;
        let wsFolder = workspace.getWorkspaceFolder(uri);

        window.setStatusBarMessage(`Generating ${language}`, new Promise(async (resolve, reject) => {
            // Check timestamp setting
            const translateConfig = workspace.getConfiguration(
                [this._clientName, 'translate', 'general'].join('.'),
                wsFolder.uri
            );
            let saveLocation = util.joinUriPath(client.projectSavedDataUri, language);
            util.createDirectory(saveLocation, translateConfig?.get("storeAllTranslations")).then(
                async (saveUri): Promise<void> => {
                    try {
                        // Make sure the directory is empty
                        fs.emptyDirSync(saveUri.fsPath);

                        // Setup message parameters
                        let params: TranslateParams = {
                            languageId: language,
                            saveUri: saveUri.toString()
                        };

                        // If it not the workspace folder add the uri. 
                        if (translateConfig?.allowSingleFileTranslation && uri.toString() != wsFolder.uri.toString())
                            params.uri = uri.toString();

                        // Add options based on configuration settings
                        params = this.addOptions(params, wsFolder, language);

                        // Send request
                        const response = await client.sendRequest(TranslateRequest.type, params);

                        // Check if a directory has been returned
                        if (!util.isDir(Uri.parse(response.uri).fsPath)) {
                            if (language == LanguageId.coverage) {
                                // Open the main file in the translation
                                let doc = await workspace.openTextDocument(Uri.parse(uri.toString()));

                                const decorationType = window.createTextEditorDecorationType({
                                    backgroundColor: '#0080FF80',
                                    border: '2px solid black',
                                })

                                let ranges = getCovtblFileRanges(Uri.parse(response.uri).fsPath)

                                // Show the file
                                window.showTextDocument(doc.uri)
                                    .then((editor) => editor.setDecorations(decorationType, ranges));
                            }
                            else {
                                // Open the main file in the translation
                                let doc = await workspace.openTextDocument(Uri.parse(response.uri));

                                // Show the file
                                window.showTextDocument(doc.uri, { viewColumn: ViewColumn.Beside })
                            }
                        }

                        resolve(`Generation of ${language} succeeded.`);
                        window.showInformationMessage(`Generation of ${language} completed`);
                    }
                    catch (error) {
                        window.showWarningMessage(`Generation of ${language} failed with error: ${error}`);
                        util.writeToLog(client.logPath, `Generation of ${language} failed with error: ${error}`);
                        reject();
                    }
                },
                (reason) => {
                    window.showWarningMessage("Creating timestamped directory failed");
                    util.writeToLog(client.logPath, `Creating timestamped directory failed with error: ${reason}`);
                    reject();
                });
        }));

    }

    private addOptions(params: TranslateParams, wsFolder: WorkspaceFolder, language: string): TranslateParams {
        // Get configurations related to translation
        const config = workspace.getConfiguration(
            [this._clientName, 'translate', language].join('.'),
            wsFolder.uri
        );

        // Add configurations to the command options
        let once = true;
        Object.keys(config).forEach(key => {
            if (typeof config[key] !== 'function') {
                if (once) { params.options = {}; once = false; } // Initialise options only once

                // Add options object to array
                params.options[key] = config[key];
            }
        });

        return params;
    }
}

function getCovtblFileRanges(fsPath: string): DecorationOptions[] {

    let ranges: DecorationOptions[] = [];

    try {
        // read contents of the file
        const data = fs.readFileSync(fsPath, { encoding: 'utf8' });

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

    return ranges
}

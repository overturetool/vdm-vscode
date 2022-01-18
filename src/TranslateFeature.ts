// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from "fs-extra"
import * as util from "./Util"
import * as LanguageId from "./LanguageId"
import { DecorationOptions, Uri, ViewColumn, window, workspace, WorkspaceFolder, Range, Event } from "vscode";
import { ClientCapabilities, Disposable, ServerCapabilities, StaticFeature, WorkDoneProgressOptions } from "vscode-languageclient";
import { TranslateClientCapabilities, TranslateParams, TranslateRequest, TranslateServerCapabilities } from "./protocol/translate.slsp";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";

export class TranslateFeature implements StaticFeature {
    private _listener: Disposable;
    private _supportWorkDone: boolean = false;
    private _clientName: string;

    constructor(
        private _client: SpecificationLanguageClient,
        private _language: string,
        private _onDidRequestTranslate: Event<Uri>) {
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

        // Check server supported languages
        let languageIds = translateCapabilities.languageId
        let languages = typeof languageIds == "string" ? [languageIds] : languageIds;

        // Check for feature's language
        if (languages.includes(this._language))
            this._listener = this._onDidRequestTranslate(event => this.translate(event, this._language));

        // Check if support work done progress
        if (WorkDoneProgressOptions.hasWorkDoneProgress(translateCapabilities))
            this._supportWorkDone = translateCapabilities.workDoneProgress
    }
    dispose(): void {
        if (this._listener) {
            this._listener.dispose()
            this._listener = undefined;
        }
    }

    private translate(uri: Uri, language: string) {
        if (!util.belongsToClient(uri, this._client))
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
                                window.showTextDocument(doc.uri, { viewColumn: ViewColumn.Beside, preserveFocus: true })
                            }
                        }

                        resolve(`Generation of ${language} succeeded.`);
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

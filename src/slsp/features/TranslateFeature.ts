// SPDX-License-Identifier: GPL-3.0-or-later

import * as util from "../../Util";
import { Uri } from "vscode";
import {
    ClientCapabilities,
    Disposable,
    DocumentSelector,
    ServerCapabilities,
    StaticFeature,
    WorkDoneProgressOptions,
} from "vscode-languageclient";
import { TranslateClientCapabilities, TranslateParams, TranslateRequest, TranslateServerCapabilities } from "../protocol/translate";
import { SpecificationLanguageClient } from "../../SpecificationLanguageClient";
import { TranslateButton, TranslateProvider } from "../views/TranslateButton";

export default class TranslateFeature implements StaticFeature {
    private _disposables: Disposable[] = [];
    private _selector: DocumentSelector;
    private _supportWorkDone: boolean = false;

    constructor(private _client: SpecificationLanguageClient, private _language: string) {}

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        capabilities.experimental = capabilities.experimental || {};
        let translateCapabilities = capabilities as TranslateClientCapabilities;
        translateCapabilities.experimental.translateProvider = true;
    }
    initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector | undefined): void {
        let translateCapabilities = (capabilities as TranslateServerCapabilities).experimental.translateProvider;
        this._selector = documentSelector;

        // Not supported
        if (!translateCapabilities || typeof translateCapabilities == "boolean") return;

        // Check server supported languages
        let languageIds = translateCapabilities.languageId;
        let languages = typeof languageIds == "string" ? [languageIds] : languageIds;

        // Check for feature's language
        if (languages.includes(this._language)) {
            let provider: TranslateProvider = {
                provideTranslation: (saveUri: Uri, rootUri?: Uri, options?: any) => this.provideTranslation(saveUri, rootUri, options),
            };
            this._disposables.push(TranslateButton.registerTranslateProvider(this._selector, provider, this._language));
        }

        // Check if support work done progress
        if (WorkDoneProgressOptions.hasWorkDoneProgress(translateCapabilities))
            this._supportWorkDone = translateCapabilities.workDoneProgress;
    }
    dispose(): void {
        while (this._disposables.length) this._disposables.pop().dispose();
    }

    private provideTranslation(saveUri: Uri, rootUri?: Uri, options?: any): Thenable<Uri> {
        return new Promise((resolve, reject) => {
            // Abort if not for this client
            if (!util.match(this._selector, rootUri)) return reject();

            // Setup message parameters
            let params: TranslateParams = {
                languageId: this._language,
                saveUri: this._client.code2ProtocolConverter.asUri(saveUri),
                uri: this._client.code2ProtocolConverter.asUri(rootUri),
                options: options,
            };

            this._client.sendRequest(TranslateRequest.type, params).then(
                (response) => {
                    return resolve(this._client.protocol2CodeConverter.asUri(response.uri));
                },
                (e) => {
                    return reject(`Translation failed with error: ${e}`);
                }
            );
        });
    }
}

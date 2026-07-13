// SPDX-License-Identifier: GPL-3.0-or-later

import * as util from "../../util/Util";
import { Uri } from "vscode";
import { ClientCapabilities, Disposable, DocumentSelector, FeatureState, ServerCapabilities, StaticFeature } from "vscode-languageclient";
import { CoverageClientCapabilities, CoverageParams, CoverageRequest, CoverageServerCapabilities } from "../protocol/Coverage";
import { SpecificationLanguageClient } from "../SpecificationLanguageClient";
import { CoverageProvider, CoverageProviderManager } from "../views/translate/CoverageProviderManager";

export default class CoverageFeature implements StaticFeature {
    private _disposables: Disposable[] = [];
    private _selector: DocumentSelector;

    constructor(private _client: SpecificationLanguageClient) {}

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        capabilities.experimental = capabilities.experimental || {};
        (capabilities as CoverageClientCapabilities).experimental.coverageProvider = true;
    }

    initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector | undefined): void {
        const coverageCapability = (capabilities as CoverageServerCapabilities).experimental?.coverageProvider;
        this._selector = documentSelector;

        if (!coverageCapability) {
            return;
        }

        const provider: CoverageProvider = {
            doCoverage: (saveUri: Uri, rootUri?: Uri, options?: any) => this.provideCoverage(saveUri, rootUri, options),
        };
        this._disposables.push(CoverageProviderManager.registerCoverageProvider(this._selector, provider));
    }

    getState(): FeatureState {
        return { kind: "static" };
    }

    dispose(): void {
        while (this._disposables.length) {
            this._disposables.pop()!.dispose();
        }
    }

    private provideCoverage(saveUri: Uri, rootUri?: Uri, options?: any): Thenable<Uri> {
        return new Promise((resolve, reject) => {
            if (!util.match(this._selector, rootUri)) {
                return reject();
            }

            const params: CoverageParams = {
                saveUri: this._client.code2ProtocolConverter.asUri(saveUri),
                uri: this._client.code2ProtocolConverter.asUri(rootUri),
                options: options,
            };

            this._client.sendRequest(CoverageRequest.type, params).then(
                (response) => resolve(this._client.protocol2CodeConverter.asUri(response.uri)),
                (e) => reject(`Coverage generation failed with error: ${e}`),
            );
        });
    }
}

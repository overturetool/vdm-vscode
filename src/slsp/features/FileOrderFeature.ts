// SPDX-License-Identifier: GPL-3.0-or-later

import { ClientCapabilities, Disposable, DocumentSelector, FeatureState, ServerCapabilities, StaticFeature } from "vscode-languageclient";
import {
    FileOrderClientCapabilities,
    FileOrderParams,
    FileOrderRequest,
    FileOrderResponse,
    FileOrderServerCapabilities,
} from "../protocol/FileOrder";
import { SpecificationLanguageClient } from "../SpecificationLanguageClient";

export interface FileOrderProvider {
    requestFileOrder: (params: FileOrderParams) => Thenable<FileOrderResponse | null>;
}

export default class FileOrderFeature implements StaticFeature {
    private _disposables: Disposable[] = [];
    private static _provider: FileOrderProvider | undefined;

    constructor(private _client: SpecificationLanguageClient) {}

    static getProvider(): FileOrderProvider | undefined {
        return FileOrderFeature._provider;
    }

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        capabilities.experimental = capabilities.experimental || {};
        (capabilities as FileOrderClientCapabilities).experimental.orderingProvider = true;
    }

    initialize(capabilities: ServerCapabilities, _documentSelector: DocumentSelector | undefined): void {
        if (!(capabilities as FileOrderServerCapabilities).experimental?.orderingProvider) {
            return;
        }

        FileOrderFeature._provider = {
            requestFileOrder: (params) => this._client.sendRequest(FileOrderRequest.type, params),
        };
    }

    getState(): FeatureState {
        return { kind: "static" };
    }

    dispose(): void {
        FileOrderFeature._provider = undefined;
        while (this._disposables.length) {
            this._disposables.pop()!.dispose();
        }
    }
}

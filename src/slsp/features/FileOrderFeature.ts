// SPDX-License-Identifier: GPL-3.0-or-later

import { ClientCapabilities, DocumentSelector, FeatureState, ServerCapabilities, StaticFeature } from "vscode-languageclient";
import { FileOrderClientCapabilities } from "../protocol/FileOrder";

export default class FileOrderFeature implements StaticFeature {
    constructor() {}

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        capabilities.experimental = capabilities.experimental || {};
        (capabilities as FileOrderClientCapabilities).experimental.orderingProvider = true;
    }

    initialize(_capabilities: ServerCapabilities, _documentSelector: DocumentSelector | undefined): void {}

    getState(): FeatureState {
        return { kind: "static" };
    }

    dispose(): void {}
}

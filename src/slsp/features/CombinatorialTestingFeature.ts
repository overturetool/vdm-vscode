// SPDX-License-Identifier: GPL-3.0-or-later

import {
    ClientCapabilities,
    DocumentSelector,
    InitializeParams,
    ServerCapabilities,
    StaticFeature,
    WorkDoneProgressOptions,
} from "vscode-languageclient";
import { CombinatorialTestingClientCapabilities, CombinatorialTestingServerCapabilities } from "../protocol/combinatorialTesting";

export class CombinantorialTestingFeature implements StaticFeature {
    private _selector: DocumentSelector;
    public supportsCT: boolean = false;
    public supportsCTWorkDoneProgress: boolean = false;

    fillInitializeParams?: (params: InitializeParams) => void;
    fillClientCapabilities(capabilities: ClientCapabilities): void {
        capabilities.experimental = capabilities.experimental || {};
        let ctCapabilities = capabilities as CombinatorialTestingClientCapabilities;
        ctCapabilities.experimental.combinatorialTesting = true;
    }
    initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector | undefined): void {
        let ctCapabilities = capabilities as CombinatorialTestingServerCapabilities;
        this._selector = documentSelector;

        // If server supports CT
        if (ctCapabilities?.experimental?.combinatorialTestProvider) {
            this.supportsCT = true;

            // Check if support work done progress
            if (WorkDoneProgressOptions.hasWorkDoneProgress(ctCapabilities?.experimental?.combinatorialTestProvider))
                this.supportsCTWorkDoneProgress = ctCapabilities?.experimental?.combinatorialTestProvider.workDoneProgress;
        }
    }
    dispose(): void {
        // Nothing to be done
    }
}

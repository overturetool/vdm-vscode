// SPDX-License-Identifier: GPL-3.0-or-later

import { ClientCapabilities, InitializeParams, ServerCapabilities, StaticFeature, WorkDoneProgressOptions } from "vscode-languageclient";
import { CombinatorialTestingClientCapabilities, CombinatorialTestingServerCapabilities } from "./protocol/combinatorialTesting.slsp";

export class CombinantorialTestingFeature implements StaticFeature {
    public SupportsCT: boolean = false;
    public SupportsCTWorkDoneProgress: boolean = false;

    fillInitializeParams?: (params: InitializeParams) => void;
    fillClientCapabilities(capabilities: ClientCapabilities): void {
        capabilities.experimental = capabilities.experimental || {};
        let ctCapabilities = capabilities as CombinatorialTestingClientCapabilities;
        ctCapabilities.experimental.combinatorialTesting = true;
    }
    initialize(capabilities: ServerCapabilities): void {
        let ctCapabilities = (capabilities as CombinatorialTestingServerCapabilities);

        // If server supports CT
        if (ctCapabilities?.experimental?.combinatorialTestProvider) {
            this.SupportsCT = true;

            // Check if support work done progress
            if (WorkDoneProgressOptions.hasWorkDoneProgress(ctCapabilities?.experimental?.combinatorialTestProvider))
                this.SupportsCTWorkDoneProgress = ctCapabilities?.experimental?.combinatorialTestProvider.workDoneProgress
        }
    }
    dispose(): void {
        // Nothing to be done
    }
}
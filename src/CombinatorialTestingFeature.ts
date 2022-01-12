// SPDX-License-Identifier: GPL-3.0-or-later

import { ClientCapabilities, InitializeParams, ServerCapabilities, StaticFeature, WorkDoneProgressOptions } from "vscode-languageclient";
import { ExperimentalCapabilities } from "./protocol.slsp";

export class CombinantorialTestingFeature implements StaticFeature {
    public SupportsCT: boolean = false;
    public SupportsCTWorkDoneProgress: boolean = false;

    fillInitializeParams?: (params: InitializeParams) => void;
    fillClientCapabilities(capabilities: ClientCapabilities): void {
        if (!capabilities.experimental)
            capabilities.experimental = { combinatorialTesting: true };
        else
            Object.assign(capabilities.experimental, { combinatorialTesting: true });
    }
    initialize(capabilities: ServerCapabilities<ExperimentalCapabilities>): void {
        // If server supports CT
        if (capabilities?.experimental?.combinatorialTestProvider) {
            this.SupportsCT = true;

            // Check if support work done progress
            if (WorkDoneProgressOptions.hasWorkDoneProgress(capabilities?.experimental?.combinatorialTestProvider))
                this.SupportsCTWorkDoneProgress = capabilities?.experimental?.combinatorialTestProvider.workDoneProgress
        }
    }
    dispose(): void {
        // Nothing to be done
    }
}
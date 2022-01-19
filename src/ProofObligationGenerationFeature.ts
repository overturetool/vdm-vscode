// SPDX-License-Identifier: GPL-3.0-or-later

import { window, commands, workspace } from "vscode";
import { StaticFeature, ClientCapabilities, ServerCapabilities } from "vscode-languageclient";
import { ProofObligationPanel } from "./ProofObligationPanel";
import { POGUpdatedNotification, ProofObligationGenerationClientCapabilities, ProofObligationGenerationServerCapabilities } from "./protocol/slsp/proofObligationGeneration";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";

export class ProofObligationGenerationFeature implements StaticFeature {
    constructor(
        private _client: SpecificationLanguageClient) {
    }

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        capabilities.experimental = capabilities.experimental || {};
        let pogCapabilities = capabilities as ProofObligationGenerationClientCapabilities;
        pogCapabilities.experimental.proofObligationGeneration = true;
    }
    initialize(capabilities: ServerCapabilities): void {
        let pogCapabilities = (capabilities as ProofObligationGenerationServerCapabilities);

        // If server supports POG
        if (pogCapabilities?.experimental?.proofObligationProvider) {
            commands.executeCommand("setContext", "pog-show-button", true);
            this.registerPOGUpdatedNotificationHandler();
        }
    }
    dispose(): void {
        // Nothing to be done
    }

    private registerPOGUpdatedNotificationHandler(): void {
        this._client.onNotification(POGUpdatedNotification.type, (params) => {
            let wsFolderUri = this._client.clientOptions.workspaceFolder.uri;
            // Only perform actions if POG View exists and if active editor is on a file from the clients workspace
            if (ProofObligationPanel.currentPanel &&
                (workspace.getWorkspaceFolder(window.activeTextEditor.document.uri).uri.toString() == wsFolderUri.toString())) {
                // If POG is possible
                if (params.successful) {
                    commands.executeCommand("vdm-vscode.updatePOG", wsFolderUri);
                }
                else {
                    // Display warning that POs may be outdated
                    ProofObligationPanel.displayWarning();
                }
            }
        });
    }
}
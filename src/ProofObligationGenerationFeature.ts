// SPDX-License-Identifier: GPL-3.0-or-later

import { window, commands, workspace } from "vscode";
import { StaticFeature, ClientCapabilities, ServerCapabilities, InitializeParams } from "vscode-languageclient";
import { ProofObligationPanel } from "./ProofObligationPanel";
import { ExperimentalServerCapabilities, POGUpdatedNotification } from "./protocol.slsp";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";

export class ProofObligationGenerationFeature implements StaticFeature {
    constructor(
        private _client: SpecificationLanguageClient) {
    }

    fillInitializeParams?: (params: InitializeParams) => void;
    fillClientCapabilities(capabilities: ClientCapabilities): void {
        // Client supports POG
        if (!capabilities.experimental)
            capabilities.experimental = { proofObligationGeneration: true };
        else
            Object.assign(capabilities.experimental, { proofObligationGeneration: true });
    }
    initialize(capabilities: ServerCapabilities<ExperimentalServerCapabilities>): void {
        // If server supports POG
        if (capabilities?.experimental?.proofObligationProvider) {
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
// SPDX-License-Identifier: GPL-3.0-or-later

import * as util from "./Util"
import { window, workspace, Uri } from "vscode";
import { StaticFeature, ClientCapabilities, ServerCapabilities, DocumentSelector, Disposable } from "vscode-languageclient";
import { ProofObligationPanel } from "./ProofObligationPanel";
import { SLSPEvents } from "./slsp/events/SLSPEvents";
import { GeneratePOParams, GeneratePORequest, POGUpdatedNotification, ProofObligationGenerationClientCapabilities, ProofObligationGenerationServerCapabilities } from "./slsp/protocol/proofObligationGeneration";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";

export default class ProofObligationGenerationFeature implements StaticFeature {
    private _listeners: Disposable[] = [];
    private _selector: DocumentSelector;
    private _lastUri: Uri;

    constructor(
        private _client: SpecificationLanguageClient) {
    }

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        capabilities.experimental = capabilities.experimental || {};
        let pogCapabilities = capabilities as ProofObligationGenerationClientCapabilities;
        pogCapabilities.experimental.proofObligationGeneration = true;
    }
    initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector | undefined): void {
        let pogCapabilities = (capabilities as ProofObligationGenerationServerCapabilities);
        this._selector = documentSelector;

        // Not supported
        if (!pogCapabilities?.experimental?.proofObligationProvider)
            return;

        this._listeners.push(SLSPEvents.pog.onDidRequestProofObligationGeneration(this.onDidRequestPOG, this));
        this._listeners.push(this._client.onNotification(POGUpdatedNotification.type, this.onPOGUpdatedNotification));
    }
    dispose(): void {
        this._listeners.forEach(l => l.dispose());
        this._listeners = [];
    }

    private onDidRequestPOG(uri: Uri, revealPOGView: boolean = true) {
        this._lastUri = uri; // Store for automatic update

        // Abort if not for this client
        if (!util.match(this._selector, uri))
            return;

        window.setStatusBarMessage("Running Proof Obligation Generation", 2000);
        const workspaceName = this._client.clientOptions.workspaceFolder?.name;

        // Setup message parameters
        let params: GeneratePOParams = {
            uri: this._client.code2ProtocolConverter.asUri(uri)
        };

        // Send request
        this._client.sendRequest(GeneratePORequest.type, params).then(POs => {
            // Create new view or show existing POG View
            ProofObligationPanel.createOrShowPanel(revealPOGView, workspaceName);
            ProofObligationPanel.currentPanel.displayNewPOS(POs);
        }).catch(e => {
            window.showInformationMessage("Proof obligation generation failed. " + e);
        })
    }

    private onPOGUpdatedNotification: POGUpdatedNotification.HandlerSignature = (params) => {
        let wsFolder = this._client.clientOptions.workspaceFolder;
        // Only perform actions if POG View exists and if active editor is on a file from the clients workspace
        if (ProofObligationPanel.currentPanel &&
            util.isSameWorkspaceFolder(workspace.getWorkspaceFolder(window.activeTextEditor.document.uri), wsFolder)) {

            // If POG is possible
            if (params.successful) {
                // If last uri was in this workspace folder use that (it might be more specific)
                let uri = (this._lastUri && util.isSameWorkspaceFolder(workspace.getWorkspaceFolder(this._lastUri), wsFolder)) ? this._lastUri : wsFolder.uri;
                this.onDidRequestPOG(uri, false);
            }
            else {
                // Display warning that POs may be outdated
                ProofObligationPanel.displayWarning();
            }
        }
    }
}
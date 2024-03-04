// SPDX-License-Identifier: GPL-3.0-or-later

import * as util from "../../util/Util";
import { window, Uri, EventEmitter } from "vscode";
import { StaticFeature, ClientCapabilities, ServerCapabilities, DocumentSelector, Disposable } from "vscode-languageclient";
import { ProofObligationPanel, ProofObligationProvider } from "../views/ProofObligationPanel";
import {
    GeneratePOParams,
    GeneratePORequest,
    POGUpdatedNotification,
    ProofObligation,
    ProofObligationGenerationClientCapabilities,
    ProofObligationGenerationServerCapabilities,
} from "../protocol/ProofObligationGeneration";
import { SpecificationLanguageClient } from "../SpecificationLanguageClient";
import { ProofObligation as CodeProofObligation } from "../views/ProofObligationPanel";

export default class ProofObligationGenerationFeature implements StaticFeature {
    private _onDidChangeProofObligations: EventEmitter<boolean>;
    private _disposables: Disposable[] = [];
    private _selector: DocumentSelector;

    constructor(private _client: SpecificationLanguageClient) {}

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        capabilities.experimental = capabilities.experimental || {};
        let pogCapabilities = capabilities as ProofObligationGenerationClientCapabilities;
        pogCapabilities.experimental.proofObligationGeneration = true;
    }
    initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector | undefined): void {
        let pogCapabilities = capabilities as ProofObligationGenerationServerCapabilities;
        this._selector = documentSelector;

        // Not supported
        if (!pogCapabilities?.experimental?.proofObligationProvider) return;

        this._onDidChangeProofObligations = new EventEmitter<boolean>();
        this._disposables.push(this._client.onNotification(POGUpdatedNotification.type, this.onPOGUpdatedNotification));
        let provider: ProofObligationProvider = {
            provideProofObligations: (uri: Uri) => this.requestPOG(uri),
            onDidChangeProofObligations: this._onDidChangeProofObligations.event,
        };
        this._disposables.push(ProofObligationPanel.registerProofObligationProvider(this._selector, provider));
    }
    dispose(): void {
        this._disposables.forEach((l) => l.dispose());
        this._disposables = [];

        if (this._onDidChangeProofObligations) this._onDidChangeProofObligations.dispose();
    }

    private requestPOG(uri: Uri): Promise<CodeProofObligation[]> {
        return new Promise((resolve, reject) => {
            // Abort if not for this client
            if (!util.match(this._selector, uri)) return reject();

            window.setStatusBarMessage("Running Proof Obligation Generation", 2000);

            // Setup message parameters
            let params: GeneratePOParams = {
                uri: this._client.code2ProtocolConverter.asUri(uri),
            };

            // Send request
            this._client
                .sendRequest(GeneratePORequest.type, params)
                .then((POs) => {
                    return resolve(POs.map((po) => this.asCodeProofObligation(po), this));
                })
                .catch((e) => {
                    return reject("Proof obligation generation failed. " + e);
                });
        });
    }

    private onPOGUpdatedNotification: POGUpdatedNotification.HandlerSignature = (params) => {
        this._onDidChangeProofObligations.fire(params.successful);
    };

    private asCodeProofObligation(po: ProofObligation): CodeProofObligation {
        console.log(po);
        return {
            id: po.id,
            kind: po.kind,
            name: po.name,
            location: this._client.protocol2CodeConverter.asLocation(po.location),
            source: po.source,
            status: po.status,
            provedBy: po.provedBy,
            counterexample: po.counterexample,
            witness: po.witness,
            message: po.message,
        };
    }
}

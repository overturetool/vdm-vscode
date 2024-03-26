// SPDX-License-Identifier: GPL-3.0-or-later

import * as util from "../../util/Util";
import { window, Uri, EventEmitter } from "vscode";
import {
    StaticFeature,
    ClientCapabilities,
    ServerCapabilities,
    DocumentSelector,
    Disposable,
    CancellationToken,
} from "vscode-languageclient";
import { ProofObligationPanel, ProofObligationProvider } from "../views/ProofObligationPanel";
import {
    GeneratePOParams,
    GeneratePORequest,
    POGUpdatedNotification,
    ProofObligation,
    ProofObligationGenerationClientCapabilities,
    ProofObligationGenerationServerCapabilities,
    QuickCheckInfo,
    RunQuickCheckRequest,
    RunQuickCheckRequestParams,
} from "../protocol/ProofObligationGeneration";
import { SpecificationLanguageClient } from "../SpecificationLanguageClient";
import { ProofObligation as CodeProofObligation } from "../views/ProofObligationPanel";
import { mergeDeep, readOptionalConfiguration } from "../../util/PluginConfigurationUtil";

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

        // If the QuickCheck plugin isn't installed or any error occured in loading the plugin, QuickCheck will not be enabled in the client.
        const quickCheckEnabled = pogCapabilities.experimental.proofObligationProvider?.quickCheckProvider ?? false;

        this._onDidChangeProofObligations = new EventEmitter<boolean>();
        this._disposables.push(this._client.onNotification(POGUpdatedNotification.type, this.onPOGUpdatedNotification));
        let provider: ProofObligationProvider = {
            provideProofObligations: (uri: Uri) => this.requestPOG(uri),
            onDidChangeProofObligations: this._onDidChangeProofObligations.event,
            quickCheckProvider: quickCheckEnabled,
            runQuickCheck: (wsFolder: Uri, poIds: number[], token?: CancellationToken) => this.runQuickCheck(wsFolder, poIds, token),
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

    private runQuickCheck(wsFolder: Uri, poIds: number[], cancellationToken?: CancellationToken): Thenable<QuickCheckInfo[]> {
        return new Promise((resolve, reject) => {
            readOptionalConfiguration(wsFolder, "quickcheck.json", (config: RunQuickCheckRequestParams) => {
                const configWithObligations = mergeDeep(config ?? {}, {
                    config: {
                        obligations: poIds,
                    },
                });

                this._client
                    .sendRequest(RunQuickCheckRequest.type, configWithObligations, cancellationToken)
                    .then((qcInfos) => resolve(qcInfos))
                    .catch((e) => reject(`QuickCheck failed. ${e}`));
            });
        });
    }

    private onPOGUpdatedNotification: POGUpdatedNotification.HandlerSignature = (params) => {
        this._onDidChangeProofObligations.fire(params.successful ?? params.quickcheck);
    };

    private asCodeProofObligation(po: ProofObligation): CodeProofObligation {
        return {
            ...po,
            location: this._client.protocol2CodeConverter.asLocation(po.location),
        };
    }
}

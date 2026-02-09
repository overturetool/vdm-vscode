// SPDX-License-Identifier: GPL-3.0-or-later

import * as util from "../../util/Util";
import { window, Uri, EventEmitter, Progress } from "vscode";
import {
    StaticFeature,
    ClientCapabilities,
    ServerCapabilities,
    DocumentSelector,
    Disposable,
    CancellationToken,
    WorkDoneProgress,
    FeatureState,
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
import { mergeDeep, QuickCheckConfig, readOptionalConfiguration } from "../../util/PluginConfigurationUtil";
import { quickcheckConfigSchema } from "../../util/Schemas";

export default class ProofObligationGenerationFeature implements StaticFeature {
    private _onDidChangeProofObligations: EventEmitter<boolean>;
    private _disposables: Disposable[] = [];
    private _selector: DocumentSelector;
    private _generateCalls: number = 0;
    private _progress: number = 0;

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
        if (!pogCapabilities?.experimental?.proofObligationProvider) {
            return;
        }

        // If the QuickCheck plugin isn't installed or any error occured in loading the plugin, QuickCheck will not be enabled in the client.
        const quickCheckEnabled = pogCapabilities.experimental.proofObligationProvider?.quickCheckProvider ?? false;

        this._onDidChangeProofObligations = new EventEmitter<boolean>();
        this._disposables.push(this._client.onNotification(POGUpdatedNotification.type, this.onPOGUpdatedNotification));
        let provider: ProofObligationProvider = {
            provideProofObligations: (
                uri: Uri,
                poIds?: number[],
                progress?: Progress<{ message?: string; increment?: number }>,
                cancellationToken?: CancellationToken,
            ) => this.requestPOG(uri, poIds, progress, cancellationToken),
            onDidChangeProofObligations: this._onDidChangeProofObligations.event,
            quickCheckProvider: quickCheckEnabled,
            runQuickCheck: (
                wsFolder: Uri,
                poIds: number[],
                token?: CancellationToken,
                progress?: Progress<{
                    message?: string;
                    increment?: number;
                }>,
            ) => this.runQuickCheck(wsFolder, poIds, token, progress),
        };
        this._disposables.push(ProofObligationPanel.registerProofObligationProvider(this._selector, provider));
    }
    getState(): FeatureState {
        return { kind: "static" };
    }
    dispose(): void {
        this._disposables.forEach((l) => l.dispose());
        this._disposables = [];

        if (this._onDidChangeProofObligations) {
            this._onDidChangeProofObligations.dispose();
        }
    }

    private requestPOG(
        uri: Uri,
        poIds?: number[],
        progress?: Progress<{ message?: string; increment?: number }>,
        cancellationToken?: CancellationToken,
    ): Promise<CodeProofObligation[]> {
        let workDoneToken = null;
        if (progress) {
            workDoneToken = this.generateToken();
            const progressDisp = this._client.onProgress(WorkDoneProgress.type, workDoneToken, (value) => {
                if (value.kind !== "end" && value?.percentage) {
                    progress.report({ message: `${value.message} - ${value.percentage}%`, increment: value.percentage - this._progress });
                    this._progress = value.percentage;
                }
            });
            this._disposables.push(progressDisp);
        }

        return new Promise((resolve, reject) => {
            // Abort if not for this client
            if (!util.match(this._selector, uri)) return reject();

            window.setStatusBarMessage("Running Proof Obligation Generation", 2000);

            // Setup message parameters
            let params: GeneratePOParams = {
                uri: this._client.code2ProtocolConverter.asUri(uri),
                obligations: poIds,
                workDoneToken: workDoneToken,
            };

            // Send request
            this._client
                .sendRequest(GeneratePORequest.type, params, cancellationToken)
                .then((POs) => {
                    return resolve(POs.map((po) => this.asCodeProofObligation(po), this));
                })
                .catch((e) => {
                    return reject("Proof obligation generation failed. " + e);
                });
        });
    }

    private runQuickCheck(
        wsFolder: Uri,
        poIds: number[],
        cancellationToken?: CancellationToken,
        progress?: Progress<{
            message?: string;
            increment?: number;
        }>,
    ): Thenable<QuickCheckInfo[]> {
        let workDoneToken = null;
        if (progress) {
            workDoneToken = this.generateToken();
            const progressDisp = this._client.onProgress(WorkDoneProgress.type, workDoneToken, (value) => {
                if (value.kind !== "end" && value?.percentage) {
                    progress.report({ message: `${value.message} - ${value.percentage}%`, increment: value.percentage - this._progress });
                    this._progress = value.percentage;
                }
            });
            this._disposables.push(progressDisp);
        }

        return new Promise((resolve, reject) => {
            readOptionalConfiguration(wsFolder, "quickcheck.json", quickcheckConfigSchema, (config: RunQuickCheckRequestParams) => {
                const calculatedConfig: QuickCheckConfig & { workDoneToken: string } = {
                    config: {
                        obligations: poIds,
                    },
                    workDoneToken: workDoneToken,
                };
                const configWithObligations: QuickCheckConfig = mergeDeep(calculatedConfig, config);

                this._client
                    .sendRequest(RunQuickCheckRequest.type, configWithObligations, cancellationToken)
                    .then((qcInfos) => resolve(qcInfos))
                    .catch((e) => reject(`QuickCheck failed. ${e}`));
            });
        });
    }

    private generateToken() {
        return "ProofObligationGenerationToken-" + Date.now().toString() + (this._generateCalls++).toString();
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

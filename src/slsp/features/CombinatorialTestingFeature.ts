// SPDX-License-Identifier: GPL-3.0-or-later

import { Disposable, EventEmitter, Progress } from "vscode";
import {
    CancellationToken,
    ClientCapabilities,
    DocumentSelector,
    InitializeParams,
    LSPErrorCodes,
    Protocol2CodeConverter,
    ServerCapabilities,
    StaticFeature,
    WorkDoneProgress,
    WorkDoneProgressOptions,
} from "vscode-languageclient";
import { SpecificationLanguageClient } from "../SpecificationLanguageClient";
import * as protocol from "../protocol/CombinatorialTesting";
import { CombinatorialTestProvider, CTViewDataStorage } from "../views/combinatorialTesting/CTViewDataStorage";
import * as code from "../views/combinatorialTesting/CTDataTypes";

export class CombinantorialTestingFeature implements StaticFeature {
    private _disposables: Disposable[] = [];
    private _cancelToken: CancellationToken;
    private _supportWorkDone: boolean = false;
    private _progress: number = 0;
    private _onDidGetPartialResult: EventEmitter<code.TestCase[]>;
    private _p2c: CTProtocol2CodeConverter;
    private _generateCalls: number = 0;

    constructor(private _client: SpecificationLanguageClient) {
        this._p2c = new CTProtocol2CodeConverter(this._client);
    }

    fillInitializeParams: (params: InitializeParams) => void;
    fillClientCapabilities(capabilities: ClientCapabilities): void {
        capabilities.experimental = capabilities.experimental || {};
        let ctCapabilities = capabilities as protocol.CombinatorialTestingClientCapabilities;
        ctCapabilities.experimental.combinatorialTesting = true;
    }
    initialize(capabilities: ServerCapabilities, _documentSelector: DocumentSelector | undefined): void {
        let ctCapabilities = capabilities as protocol.CombinatorialTestingServerCapabilities;

        // Not supported
        if (!ctCapabilities?.experimental?.combinatorialTestProvider) return;

        // Check if support work done progress
        if (WorkDoneProgressOptions.hasWorkDoneProgress(ctCapabilities?.experimental?.combinatorialTestProvider))
            this._supportWorkDone = ctCapabilities?.experimental?.combinatorialTestProvider.workDoneProgress;

        this._onDidGetPartialResult = new EventEmitter<code.TestCase[]>();
        let provider: CombinatorialTestProvider = {
            onDidGetPartialResult: this._onDidGetPartialResult.event,
            provideTraceInfo: () => {
                return new Promise(async (resolve, reject) => {
                    try {
                        let CTSymbols = await this._client.sendRequest(protocol.CTTracesRequest.type, {});
                        return resolve(this._p2c.asTraceGroupInfoArray(CTSymbols));
                    } catch (e) {
                        return reject(e);
                    }
                });
            },
            provideNumberOfTests: (traceName) => {
                return new Promise(async (resolve, reject) => {
                    try {
                        // Setup message parameters
                        let params: protocol.CTGenerateParams = { name: traceName };

                        // Send request
                        let res = await this._client.sendRequest(protocol.CTGenerateRequest.type, params);
                        return resolve(res.numberOfTests);
                    } catch (e) {
                        if (e?.code == LSPErrorCodes.ContentModified) {
                            reject(new code.OutOfSyncError());
                        } else {
                            return reject(e?.message);
                        }
                    }
                });
            },
            provideExecutionResults: (traceName, options, cancellationToken, progress) => {
                return new Promise(async (resolve, reject) => {
                    // Check if already running an execution
                    if (this._cancelToken) return reject("An execution is already running");
                    this._cancelToken = cancellationToken;

                    try {
                        // Setup message parameters
                        let params: protocol.CTExecuteParams = {
                            name: traceName,
                            filter: options.filter,
                            range: options.range,
                        };

                        // Setup partial result handler
                        if (options.asPartial) {
                            let partialResultToken = this.generateToken();
                            params.partialResultToken = partialResultToken;
                            var partialResultHandlerDisposable = this._client.onProgress(
                                protocol.CTExecuteRequest.resultType,
                                partialResultToken,
                                (tests) => this._onDidGetPartialResult.fire(this._p2c.asTestCaseArray(tests))
                            );
                        }

                        // Setup work done progress handler
                        if (this._supportWorkDone && progress != undefined) {
                            this._progress = 0;
                            let workDoneTokenToken = this.generateToken();
                            params.workDoneToken = workDoneTokenToken;
                            var workDoneProgressHandlerDisposable = this._client.onProgress(
                                WorkDoneProgress.type,
                                workDoneTokenToken,
                                (value) => this.handleExecuteWorkDoneProgress(value, progress)
                            );
                        }

                        // Send request
                        const tests = await this._client.sendRequest(protocol.CTExecuteRequest.type, params, this._cancelToken);

                        // If not using progress token, update test results
                        if (tests != null) resolve(this._p2c.asTestCaseArray(tests));
                        else resolve(null);
                    } catch (e) {
                        if (e?.code == LSPErrorCodes.RequestCancelled) {
                            if (e?.data != null) resolve(this._p2c.asTestCaseArray(e.data));
                            else resolve(null);
                        } else if (e?.code == LSPErrorCodes.ContentModified) {
                            reject(new code.OutOfSyncError(e.message));
                        } else {
                            reject(`Execute request failed: ${e}`);
                        }
                    } finally {
                        // Clean-up
                        partialResultHandlerDisposable?.dispose();
                        partialResultHandlerDisposable = undefined;
                        workDoneProgressHandlerDisposable?.dispose();
                        workDoneProgressHandlerDisposable = undefined;
                        this._cancelToken = undefined;
                    }
                });
            },
        };
        this._disposables.push(CTViewDataStorage.registerTestProvider(this._client.clientOptions.workspaceFolder, provider));
    }

    dispose(): void {
        while (this._disposables.length) this._disposables.pop().dispose();
    }

    private generateToken(): string {
        return "CombinatorialTestToken-" + Date.now().toString() + (this._generateCalls++).toString();
    }

    private handleExecuteWorkDoneProgress(value: any, progress: Progress<{ message?: string; increment?: number }>) {
        if (value?.percentage != undefined) {
            progress.report({ message: `${value.message} - ${value.percentage}%`, increment: value.percentage - this._progress });
            this._progress = value.percentage;
        }
    }
}

class CTProtocol2CodeConverter {
    private _converter: Protocol2CodeConverter;
    constructor(client: SpecificationLanguageClient) {
        this._converter = client.protocol2CodeConverter;
    }
    asTraceGroupInfoArray(protocol: protocol.CTSymbol[]): code.TraceGroupInfo[] {
        return [].concat(protocol.map((symbol) => this.asTraceGroupInfo(symbol)));
    }

    asTraceGroupInfo(protocol: protocol.CTSymbol): code.TraceGroupInfo {
        return {
            name: protocol.name,
            traces: this.asTraceInfoArray(protocol.traces),
        };
    }

    asTraceInfoArray(protocol: protocol.CTTrace[]): code.TraceInfo[] {
        return [].concat(protocol.map((trace) => this.asTraceInfo(trace)));
    }

    asTraceInfo(protocol: protocol.CTTrace): code.TraceInfo {
        return {
            name: protocol.name,
            location: this._converter.asLocation(protocol.location),
            verdict: protocol.verdict,
        };
    }

    asTestCaseArray(protocol: protocol.CTTestCase[]): code.TestCase[] {
        return [].concat(protocol.map((testCase) => this.asTestCase(testCase)));
    }

    asTestCase(protocol: protocol.CTTestCase): code.TestCase {
        return {
            id: protocol.id,
            verdict: protocol.verdict,
            sequence: this.asTestResultArray(protocol.sequence),
        };
    }

    asTestResultArray(protocol: protocol.CTResultPair[]): code.TestResult[] {
        return [].concat(protocol.map((result) => this.asTestResult(result)));
    }

    asTestResult(protocol: protocol.CTResultPair): code.TestResult {
        return {
            case: protocol.case,
            result: protocol.result,
        };
    }
}

// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from "fs-extra";
import * as util from "../../../Util";
import { CancellationToken, Disposable, Event, Progress, Uri, WorkspaceFolder } from "vscode";
import { VerdictKind, CTFilterOption, NumberRange } from "../../protocol/combinatorialTesting";
import * as Types from "./CTDataTypes";

export interface CombinatorialTestProvider {
    provideTraceInfo(): Thenable<Types.TraceGroupInfo[]>;
    provideNumberOfTests(traceName: string): Thenable<number>;
    provideExecutionResults(
        traceName: string,
        options?: { asPartial?: boolean; filter?: CTFilterOption[]; range?: NumberRange },
        cancellationToken?: CancellationToken,
        progress?: Progress<{ message?: string; increment?: number }>
    ): Thenable<Types.TestCase[] | null>;
    onDidGetPartialResult?: Event<Types.TestCase[]>;
}

export class CTViewDataStorage {
    private readonly _name: string = "CT Data Provider";
    private _traceGroups: Types.TraceGroup[] = [];
    private _currentWsFolder: WorkspaceFolder;
    private _usingPartialResult: boolean = false;

    public get storageLocation(): Uri {
        return Uri.joinPath(this._currentWsFolder?.uri, ".generated", "Combinatorial Testing");
    }

    public get workspaceFolders(): WorkspaceFolder[] {
        return CTViewDataStorage.getProvideableWorkspaceFolders();
    }

    private saveCTs(): Promise<void> {
        return new Promise(async (resolve, reject) => {
            this._traceGroups.forEach((group) => {
                // Create save location
                let saveUri = Uri.joinPath(this.storageLocation, `${group.name}.json`);

                // Ensure that path exists
                fs.ensureFile(saveUri.fsPath) //util.ensureDirectoryExistence(savePath);
                    .then(() => {
                        // Convert data into JSON
                        let json = JSON.stringify(group);

                        // Asynchronouse save
                        fs.writeFile(saveUri.fsPath, json).catch((e) => {
                            console.warn(`[${this._name}] save could not write to file: ${e}`);
                            return reject(e);
                        });

                        return resolve();
                    })
                    .catch((e) => {
                        console.warn(`[${this._name}] could not create save location: ${e}`);
                        return reject(e);
                    });
            });
        });
    }

    private loadCTs(): Promise<Types.TraceGroup[]> {
        return new Promise(async (resolve, reject) => {
            let traceGroups: Types.TraceGroup[] = [];

            fs.access(this.storageLocation.fsPath, fs.constants.F_OK | fs.constants.R_OK)
                .then(() => {
                    fs.readdir(this.storageLocation.fsPath, { withFileTypes: true })
                        .then((entries) => {
                            // Go through files in the folder and read content
                            entries.forEach((entry: fs.Dirent) => {
                                if (entry.isFile && entry.name.includes(".json")) {
                                    let fileUri = Uri.joinPath(this.storageLocation, entry.name);
                                    try {
                                        // let ctFile = fs.readFileSync(savePath + path.sep + entry.name).toString();
                                        let ctFile = fs.readFileSync(fileUri.fsPath).toString();
                                        traceGroups.push(JSON.parse(ctFile));
                                    } catch (e) {
                                        console.warn(`[${this._name}] Could not read file: ${e}`);
                                        return reject(e);
                                    }
                                }
                            });
                            console.log(`[${this._name}] Save data loaded`);
                            return resolve(traceGroups);
                        })
                        .catch((e) => {
                            console.warn(`[${this._name}] Could not read save directory: ${e}`);
                            return reject(e);
                        });
                })
                .catch((e) => {
                    if (e.code === "ENOENT") {
                        console.log(`[${this._name}] No saved data found`);
                        return resolve(traceGroups);
                    } else {
                        console.warn(`[${this._name}] Could not access save directory: ${e}`);
                        return reject(e);
                    }
                });
        });
    }

    private resetTraceToLength(length: number, trace: Types.Trace): Types.Trace {
        let shortest = length < trace.testCases.length ? length : trace.testCases.length;

        for (let i = trace.testCases.length; i > length; --i) trace.testCases.pop();
        for (let i = trace.testCases.length; i < length; ++i) trace.testCases.push({ id: i + 1, verdict: null, sequence: [] });

        // Reset verdict and results on e test.
        for (let i = 1; i <= shortest; ++i) {
            let testCase = trace.testCases[i - 1];
            testCase.verdict = null;
            testCase.sequence = [];
        }

        return trace;
    }

    private storeTests(traceName: string, tests: Types.TestCase[]) {
        let existingTestCases: Types.TestCase[] = this.getTrace(traceName).testCases;

        if (this._usingPartialResult) {
            tests.forEach((test) => {
                try {
                    existingTestCases[test.id - 1] = test;
                } catch (e) {
                    console.warn(`[${this._name}] storeTest could not find index: ${test.id - 1}`);
                }
            });
        } else {
            existingTestCases = tests;
        }
    }

    public async updateTraceGroups(wsFolder: WorkspaceFolder): Promise<Types.TraceGroup[]> {
        // Changed workspace?
        if (!util.isSameWorkspaceFolder(this._currentWsFolder, wsFolder)) {
            this._currentWsFolder = wsFolder;
            this._traceGroups = await this.loadCTs();
        }

        // Get provider
        let provider = CTViewDataStorage.getProvider(wsFolder);
        if (!provider) {
            console.info(`[${this._name}] No provider available for workspace: ${wsFolder.name}`);
            return Promise.reject("Could not find provider");
        }

        // Get trace groups
        let traceGroupInfo = await provider.provideTraceInfo();

        // Update local groups based on provided
        this._traceGroups = traceGroupInfo.map((providedGroupInfo) => {
            let localGroup = this._traceGroups.find((ct) => ct.name == providedGroupInfo.name);

            // Map TraceGroupInfo to TraceGroup type and return
            if (!localGroup) {
                return {
                    name: providedGroupInfo.name,
                    traces: providedGroupInfo.traces.map((trace) => {
                        return { name: trace.name, location: trace.location, verdict: trace.verdict, testCases: [] };
                    }),
                };
            }

            // Update all traces with information from provider
            localGroup.traces = providedGroupInfo.traces.map((trace) => {
                let localTrace = localGroup.traces.find((t) => t.name == trace.name);
                // Map TraceInfo to Trace type and return
                if (!localTrace)
                    return {
                        name: trace.name,
                        location: trace.location,
                        verdict: trace.verdict,
                        testCases: [],
                    };

                // Update local trace location as it can be changed
                localTrace.location = trace.location;

                return localTrace;
            });

            return localGroup;
        });

        return Promise.resolve(this._traceGroups);
    }

    public async updateTrace(traceName: string): Promise<Types.Trace> {
        return new Promise(async (resolve, reject) => {
            // Find existing trace
            let returnTrace: Types.Trace = this.getTrace(traceName);

            try {
                // Request generate from server
                const provider = CTViewDataStorage.getProvider(this._currentWsFolder);
                const numberOfTests = await provider.provideNumberOfTests(traceName);

                if (typeof numberOfTests != "number") return reject(numberOfTests);

                // Reset trace
                returnTrace.verdict = null;
                this.resetTraceToLength(numberOfTests, returnTrace);

                // Store trace
                let localGroup = this._traceGroups.find((group) => group.traces.find((trace) => trace.name == traceName));
                localGroup.traces[localGroup.traces.findIndex((trace) => trace.name == traceName)] = returnTrace;

                return resolve(returnTrace);
            } catch (e) {
                console.info(`[${this._name}] Update trace failed: ${e}`);
                return reject(e);
            }
        });
    }

    public async updateTests(
        traceName: string,
        range: NumberRange,
        cancellationToken?: CancellationToken,
        progress?: Progress<{ message?: string; increment?: number }>,
        filter?: CTFilterOption[]
    ): Promise<Types.TestCase[]> {
        return new Promise(async (resolve, reject) => {
            // Find provider
            const provider = CTViewDataStorage.getProvider(this._currentWsFolder);
            if (!provider) return reject(`Could not find provider for workspace ${this._currentWsFolder}`);

            // Use partial result?
            let disposable: Disposable;
            if (provider.onDidGetPartialResult != undefined) {
                this._usingPartialResult = true;
                disposable = provider.onDidGetPartialResult((tests) => {
                    this.storeTests(traceName, tests);
                }, this);
            }
            try {
                const res = await provider.provideExecutionResults(
                    traceName,
                    {
                        asPartial: this._usingPartialResult,
                        filter: filter,
                        range: range,
                    },
                    cancellationToken,
                    progress
                );

                // Did use partial result?
                if (res == null) {
                    this._usingPartialResult = false;
                } else {
                    this.storeTests(traceName, res);
                }

                // Set verdict for trace
                let trace = this.getTrace(traceName);
                if (trace) {
                    if (trace.testCases.some((tc) => tc.verdict == VerdictKind.Failed)) trace.verdict = VerdictKind.Failed;
                    else if (trace.testCases.every((tc) => tc.verdict != null)) trace.verdict = VerdictKind.Passed;
                    else trace.verdict = null;
                }

                // Save and return
                this.saveCTs();
                return resolve(this.getTestCases(traceName, range));
            } catch (e) {
                console.info(`[${this._name}] Update tests failed: ${e}`);
                return reject(e);
            } finally {
                disposable?.dispose();
            }
        });
    }

    public getTraceGroupNames(): string[] {
        return this._traceGroups.map((ct) => ct.name);
    }

    public getTraces(groupName: string): Types.Trace[] {
        return this._traceGroups.find((ct) => ct.name == groupName).traces;
    }

    public getTrace(traceName: string): Types.Trace {
        return [].concat(...this._traceGroups.map((symbol) => symbol.traces)).find((trace) => trace.name == traceName);
    }

    public getNumberOftests(traceName: string): number {
        return this.getTrace(traceName).testCases.length;
    }

    public getTestCase(traceName: string, id: number): Types.TestCase {
        return this.getTrace(traceName).testCases.find((test) => test.id == id);
    }

    public getTestCases(traceName: string, testIdRange?: NumberRange): Types.TestCase[] {
        let trace: Types.Trace = this.getTrace(traceName);
        if (testIdRange) {
            return Types.Trace.getTestCases(trace.testCases, testIdRange);
        } else {
            return trace.testCases;
        }
    }

    public getTestResults(testId: number, trace: string): Types.TestResult[] {
        return []
            .concat(...this._traceGroups.map((g) => g.traces))
            .find((t) => t.name == trace)
            .testCases.find((testCase) => testCase.id == testId).sequence;
    }

    public getVerdict(tests: Types.TestCase[]): VerdictKind {
        let verdict = tests ? VerdictKind.Passed : null;
        for (let k = 0; k < tests.length; k++) {
            if (tests[k].verdict == null) {
                verdict = null;
                break;
            }
            if (tests[k].verdict == VerdictKind.Failed) {
                verdict = VerdictKind.Failed;
                break;
            }
        }
        return verdict;
    }

    public reset() {
        this._currentWsFolder = undefined;
        this._traceGroups = [];
    }
}

export namespace CTViewDataStorage {
    let testProviders: Map<WorkspaceFolder, CombinatorialTestProvider> = new Map();

    export function registerTestProvider(wsFolder: WorkspaceFolder, provider: CombinatorialTestProvider): Disposable {
        // Check if a provider already exists for the workspace, if so it will be overwritten
        if (testProviders.get(wsFolder)) console.info(`[CT Storage] Overwriting provider for workspace folder: ${wsFolder.name}`);

        // Set provider for workspace
        testProviders.set(wsFolder, provider);

        // Return a disposeable that removes the provider from the array of available providers.
        return {
            dispose: () => {
                if (testProviders.get(wsFolder) == provider) testProviders.delete(wsFolder);
            },
        };
    }

    export function getProvider(wsFolder: WorkspaceFolder): CombinatorialTestProvider {
        return testProviders.get(wsFolder);
    }

    export function getProvideableWorkspaceFolders(): WorkspaceFolder[] {
        let wsFolders: WorkspaceFolder[] = [];
        for (const wsFolder of testProviders.keys()) {
            wsFolders.push(wsFolder);
        }
        return wsFolders;
    }
}

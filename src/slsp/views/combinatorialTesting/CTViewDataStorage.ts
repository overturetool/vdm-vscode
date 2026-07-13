/* eslint-disable eqeqeq */
// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from "fs-extra";
import { CancellationToken, Disposable, Event, Progress, Uri, WorkspaceFolder } from "vscode";
import { CTFilterOption, NumberRange } from "../../protocol/CombinatorialTesting";
import * as Types from "./CTDataTypes";
import { isSameWorkspaceFolder } from "../../../util/WorkspaceFoldersUtil";
import { generatedDataPath } from "../../../util/Util";

export interface CombinatorialTestProvider {
    provideTraceInfo(): Thenable<Types.TraceGroupInfo[]>;
    provideNumberOfTests(traceName: string): Thenable<number>;
    provideExecutionResults(
        traceName: string,
        options?: { asPartial?: boolean; filter?: CTFilterOption[]; range?: NumberRange },
        cancellationToken?: CancellationToken,
        progress?: Progress<{ message?: string; increment?: number }>,
    ): Thenable<Types.TestCase[] | null>;
    onDidGetPartialResult?: Event<Types.TestCase[]>;
}

export class CTViewDataStorage {
    private readonly _name: string = "CT Data Storage";
    private _traceGroups: Types.TraceGroup[] = [];
    private _currentWsFolder?: WorkspaceFolder;
    private _usingPartialResult: boolean = false;

    public get storageLocation(): Uri {
        if (!this._currentWsFolder) {
            throw new Error(`[${this._name}] No workspace folder is currently selected`);
        }
        return Uri.joinPath(generatedDataPath(this._currentWsFolder), "Combinatorial Testing");
    }

    public get workspaceFolders(): WorkspaceFolder[] {
        return CTViewDataStorage.getProvidableWorkspaceFolders();
    }

    private saveCTs(): Promise<void> {
        return new Promise(async (resolve, reject) => {
            this._traceGroups.forEach((group) => {
                // Create save location
                let saveUri = Uri.joinPath(this.storageLocation, `${group.name}.json`);

                // Ensure that path exists
                fs.ensureFile(saveUri.fsPath)
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

            // Acces the save directory
            fs.access(this.storageLocation.fsPath, fs.constants.F_OK | fs.constants.R_OK)
                .then(() => {
                    // Read the save directory
                    fs.readdir(this.storageLocation.fsPath, { withFileTypes: true })
                        .then((entries) => {
                            // Go through files in the folder and read content
                            entries.forEach((entry: fs.Dirent) => {
                                // Make sure the file is a save file
                                if (entry.isFile() && entry.name.includes(".json")) {
                                    // Get the location of the file
                                    let fileUri = Uri.joinPath(this.storageLocation, entry.name);
                                    try {
                                        // Read the file and add it to the storage
                                        let fileContent = fs.readFileSync(fileUri.fsPath).toString();
                                        traceGroups.push(JSON.parse(fileContent));
                                    } catch (e) {
                                        // Error while reading the file
                                        console.warn(`[${this._name}] Could not read file: ${e}`);
                                        return reject(e);
                                    }
                                }
                            });

                            // All files has been read, return loaded data
                            console.log(`[${this._name}] Save data loaded`);
                            return resolve(traceGroups);
                        })
                        .catch((e) => {
                            // Error while reading the directory
                            console.warn(`[${this._name}] Could not read save directory: ${e}`);
                            return reject(e);
                        });
                })
                .catch((e) => {
                    // Error while accessing the save directory
                    if (e.code === "ENOENT") {
                        // The save directory does not exist
                        console.log(`[${this._name}] No saved data found`);
                        return resolve(traceGroups);
                    } else {
                        // Unkown error
                        console.warn(`[${this._name}] Could not access save directory: ${e}`);
                        return reject(e);
                    }
                });
        });
    }

    // Reset a trace to a specific length
    private resetTraceToLength(length: number, trace: Types.Trace): Types.Trace {
        let shortest = length < trace.testCases.length ? length : trace.testCases.length;

        // Shorten trace test storage if needed
        for (let i = trace.testCases.length; i > length; --i) {
            trace.testCases.pop();
        }

        // Extend trace test storage if needed
        for (let i = trace.testCases.length; i < length; ++i) {
            trace.testCases.push({ id: i + 1, verdict: null, sequence: [] });
        }

        // Reset verdict and results on each test
        for (let i = 0; i < shortest; ++i) {
            let testCase = trace.testCases[i];
            testCase.verdict = null;
            testCase.sequence = [];
        }

        return trace;
    }

    private requireTrace(traceName: string): Types.Trace {
        const trace = this.getTrace(traceName);
        if (!trace) {
            throw new Types.OutOfSyncError(`Trace not found: ${traceName}`);
        }
        return trace;
    }

    // Stores an array of tests
    private storeTests(traceName: string, tests: Types.TestCase[]) {
        const trace = this.requireTrace(traceName);

        if (this._usingPartialResult) {
            // Add each test to the existing tests
            tests.forEach((test) => {
                try {
                    // Tests start at id=1, thus e.g. test 12 is stored at index 11
                    trace.testCases[test.id - 1] = test;
                } catch (e) {
                    // Warn if a storage location does not exist for the test
                    console.warn(`[${this._name}] storeTest could not find index: ${test.id - 1}`);
                }
            });
        } else {
            // Overwrite all the tests of the trace with the incomming
            trace.testCases = tests;
        }
    }

    public async updateTraceGroups(wsFolder: WorkspaceFolder): Promise<Types.TraceGroup[]> {
        if (!this._currentWsFolder || !isSameWorkspaceFolder(this._currentWsFolder, wsFolder)) {
            // Workspace has changed, load data for the workspace
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

            // Map TraceGroupInfo to TraceGroup type
            if (!localGroup) {
                return {
                    name: providedGroupInfo.name,
                    traces: providedGroupInfo.traces.map((trace) => {
                        return { name: trace.name, location: trace.location, verdict: trace.verdict, testCases: [] };
                    }),
                };
            } else {
                const group = localGroup;

                // Update all traces with information from provider
                group.traces = providedGroupInfo.traces.map((trace) => {
                    let localTrace = group.traces.find((t) => t.name == trace.name);

                    // Map TraceInfo to Trace type
                    if (!localTrace) {
                        localTrace = {
                            name: trace.name,
                            location: trace.location,
                            verdict: trace.verdict,
                            testCases: [],
                        };
                    } else {
                        // Update local trace location as it might have been changed
                        localTrace.location = trace.location;
                    }
                    return localTrace;
                });
                return group;
            }
        });

        return Promise.resolve(this._traceGroups);
    }

    public async updateTrace(traceName: string): Promise<Types.Trace> {
        return new Promise(async (resolve, reject) => {
            try {
                // Find existing trace
                const returnTrace = this.requireTrace(traceName);

                const wsFolder = this._currentWsFolder;
                if (!wsFolder) {
                    return reject(`[${this._name}] No workspace folder selected`);
                }

                // Request generate from server
                const provider = CTViewDataStorage.getProvider(wsFolder);
                if (!provider) {
                    return reject(`Could not find provider for workspace ${wsFolder.name}`);
                }
                const numberOfTests = await provider.provideNumberOfTests(traceName);

                if (typeof numberOfTests != "number") {
                    return reject(numberOfTests);
                }

                // Reset trace
                returnTrace.verdict = null;
                this.resetTraceToLength(numberOfTests, returnTrace);

                // Store trace
                const localGroup = this._traceGroups.find((group) => group.traces.some((trace) => trace.name == traceName));
                if (!localGroup) {
                    return reject(`[${this._name}] Could not find trace group containing trace: ${traceName}`);
                }
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
        filter?: CTFilterOption[],
    ): Promise<Types.TestCase[]> {
        return new Promise(async (resolve, reject) => {
            const wsFolder = this._currentWsFolder;
            if (!wsFolder) {
                return reject(`[${this._name}] No workspace folder selected`);
            }

            // Find provider
            const provider = CTViewDataStorage.getProvider(wsFolder);
            if (!provider) {
                return reject(`Could not find provider for workspace ${wsFolder.name}`);
            }

            // Use partial result?
            let eventHandler: Disposable | undefined;
            if (provider.onDidGetPartialResult != undefined) {
                this._usingPartialResult = true;

                // When partial results arrive store them in the data storage
                eventHandler = provider.onDidGetPartialResult((tests) => {
                    this.storeTests(traceName, tests);
                }, this);
            }

            // Get the execution results from the provider
            try {
                const res = await provider.provideExecutionResults(
                    traceName,
                    {
                        asPartial: this._usingPartialResult,
                        filter: filter,
                        range: range,
                    },
                    cancellationToken,
                    progress,
                );

                // Clear partial result control variable
                this._usingPartialResult = false;

                // Store tests if any arrived (happens if partial result is not used)
                if (res) {
                    this.storeTests(traceName, res);
                }

                // Set verdict for trace
                let trace = this.getTrace(traceName);
                if (trace) {
                    trace.verdict = Types.util.determineVerdict(trace.testCases);
                }

                // Save and return
                this.saveCTs();
                return resolve(this.getTestCases(traceName, range));
            } catch (e) {
                // Error during update of tests
                console.info(`[${this._name}] Update tests failed: ${e}`);
                return reject(e);
            } finally {
                // Remove event handler if one has been assigned
                eventHandler?.dispose();
            }
        });
    }

    // Reset the storage
    public reset() {
        this._currentWsFolder = undefined;
        this._traceGroups = [];
    }

    //* Functions for getting data from the storage //
    public getTraceGroupNames(): string[] {
        return this._traceGroups.map((ct) => ct.name);
    }

    public getTraces(groupName: string): Types.Trace[] {
        const group = this._traceGroups.find((ct) => ct.name == groupName);
        if (!group) {
            console.warn(`[${this._name}] getTraces could not find group: ${groupName}`);
            return [];
        }
        return group.traces;
    }

    public getTrace(traceName: string): Types.Trace | undefined {
        return this._traceGroups.flatMap((group) => group.traces).find((trace) => trace.name == traceName);
    }

    public getNumberOftests(traceName: string): number {
        return this.requireTrace(traceName).testCases.length;
    }

    public getTestCase(traceName: string, id: number): Types.TestCase {
        const testCase = this.requireTrace(traceName).testCases.find((test) => test.id == id);
        if (!testCase) {
            throw new Types.OutOfSyncError(`Test case not found: ${traceName} #${id}`);
        }
        return testCase;
    }

    public getTestCases(traceName: string, testIdRange?: NumberRange): Types.TestCase[] {
        let trace: Types.Trace = this.requireTrace(traceName);
        if (testIdRange) {
            return Types.util.getTestCases(trace.testCases, testIdRange);
        } else {
            return trace.testCases;
        }
    }

    public getTestResults(traceName: string, id: number): Types.TestResult[] {
        return this.getTestCase(traceName, id).sequence;
    }
}

export namespace CTViewDataStorage {
    let testProviders: Map<WorkspaceFolder, CombinatorialTestProvider> = new Map();

    export function registerTestProvider(wsFolder: WorkspaceFolder, provider: CombinatorialTestProvider): Disposable {
        // Check if a provider already exists for the workspace, if so it will be overwritten
        if (testProviders.get(wsFolder)) {
            console.info(`[CT Storage] Overwriting provider for workspace folder: ${wsFolder.name}`);
        }

        // Set provider for workspace
        testProviders.set(wsFolder, provider);

        // Return a disposeable that removes the provider from the array of available providers.
        return {
            dispose: () => {
                if (testProviders.get(wsFolder) == provider) {
                    testProviders.delete(wsFolder);
                }
            },
        };
    }

    export function getProvider(wsFolder: WorkspaceFolder): CombinatorialTestProvider | undefined {
        return testProviders.get(wsFolder);
    }

    export function getProvidableWorkspaceFolders(): WorkspaceFolder[] {
        let wsFolders: WorkspaceFolder[] = [];
        for (const wsFolder of testProviders.keys()) {
            wsFolders.push(wsFolder);
        }
        return wsFolders;
    }
}

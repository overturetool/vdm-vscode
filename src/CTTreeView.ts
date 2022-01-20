// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from 'fs';
import * as vscode from 'vscode';
import { commands, ExtensionContext, ProgressLocation, Uri, window, workspace } from "vscode";
import { CTDataProvider, TestViewElement, TreeItemType } from "./CTDataProvider";
import { CTTestCase, CTSymbol, NumberRange, VerdictKind } from "./slsp/protocol/combinatorialTesting";
import { CTResultElement, CTResultDataProvider } from './CTResultDataProvider';
import path = require('path');
import { ErrorCodes, Location, LSPErrorCodes, Protocol2CodeConverter } from 'vscode-languageclient';
import * as util from "./Util"
import { CTHandler } from './CTHandler';
import { createConverter } from 'vscode-languageclient/lib/common/protocolConverter';

export class CTTreeView {
    private _p2cConverter: Protocol2CodeConverter = createConverter(undefined, undefined);
    private _testView: vscode.TreeView<TestViewElement>;
    private _resultView: vscode.TreeView<CTResultElement>;
    public currentTraceName: string;
    private _combinatorialTests: completeCT[] = [];
    private _testProvider: CTDataProvider;
    private _resultProvider: CTResultDataProvider;
    private _executeCanceled: boolean = false;
    private _numberOfUpdatedTests: number = 0;
    private _executingTests: boolean = false;
    private _currentlyExecutingTrace: traceWithTestResults;
    private _isExecutingTestGroup = false;
    private _timeoutRef: NodeJS.Timeout;
    private _isRebuildingTraceOutline: boolean = false;
    public uiUpdateIntervalMS = 1000;

    constructor(
        private _ctHandler: CTHandler,
        private _context: ExtensionContext,
        private _canFilter: boolean = false
    ) {

        this._testProvider = new CTDataProvider(this, this._context);
        this._resultProvider = new CTResultDataProvider();

        // Create test view
        let testview_options: vscode.TreeViewOptions<TestViewElement> = {
            treeDataProvider: this._testProvider,
            showCollapseAll: true
        }
        this._testView = window.createTreeView('vdm-ctView', testview_options);
        this._context.subscriptions.push(this._testView);

        // Create results view
        let resultview_options: vscode.TreeViewOptions<CTResultElement> = {
            treeDataProvider: this._resultProvider,
            showCollapseAll: true
        }
        this._resultView = window.createTreeView('vdm-ctResultView', resultview_options);
        this._context.subscriptions.push(this._resultView);

        // Register view behavior
        this._context.subscriptions.push(this._testView.onDidExpandElement(e => this.onDidExpandElement(e.element)));
        this._context.subscriptions.push(this._testView.onDidCollapseElement(e => this.onDidCollapseElement(e.element)));
        this._context.subscriptions.push(this._testView.onDidChangeSelection(e => this.onDidChangeSelection(e.selection[0])));

        // Set button behavior
        this.setButtonsAndContext(this._canFilter);

        // Show view
        vscode.commands.executeCommand('setContext', 'vdm-ct-show-view', true);
    }

    public getSymbolNames(): string[] {
        return this._combinatorialTests.map(ct => ct.symbolName);
    }

    public getTraces(symbolName: string): traceWithTestResults[] {
        return this._combinatorialTests.find(ct => ct.symbolName == symbolName).traces;
    }

    public getNumberOftests(traceName: string): number {
        return [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(trace => trace.name == traceName).testCases.length;
    }

    public getTestResults(testIdRange: NumberRange, traceName: string): CTTestCase[] {
        let traces = [].concat(...this._combinatorialTests.map(symbol => symbol.traces));
        let traceWithResult = traces.find(trace => trace.name == traceName);
        return traceWithResult.testCases.slice(testIdRange.start - 1, testIdRange.end);
    }

    public saveCTs() {
        this._combinatorialTests.forEach(ct => {
            // Create full path
            let savePath = util.joinUriPath(this._ctHandler.currentClient.dataStoragePath, "Combinatorial Testing", `${ct.symbolName}.json`).fsPath;

            // Ensure that path exists
            util.ensureDirectoryExistence(savePath)

            // Convert data into JSON
            let json = JSON.stringify(ct);

            // Asynchronouse save
            fs.writeFile(savePath, json, (err) => {
                if (err) throw err;
            })
        });
    }

    private async loadCTs(): Promise<completeCT[]> {
        return new Promise(async (resolve, reject) => {
            let completeCTs: completeCT[] = [];

            // Create full path
            let savePath = util.joinUriPath(this._ctHandler.currentClient.dataStoragePath, "Combinatorial Testing").fsPath;
            fs.access(savePath, fs.constants.F_OK | fs.constants.R_OK, (accessErr) => {
                if (!accessErr) {
                    fs.readdir(savePath, { withFileTypes: true }, (dirErr, files) => {
                        if (!dirErr) {
                            // Go through files in the folder and read content
                            files.forEach(f => {
                                let file: fs.Dirent = f;
                                if (file.isFile && file.name.includes(".json")) {
                                    let ctFile = fs.readFileSync(savePath + path.sep + file.name).toString();
                                    try {
                                        completeCTs.push(JSON.parse(ctFile));
                                    }
                                    catch (err) {
                                        return reject(err);
                                    }
                                }
                            });
                            return resolve(completeCTs);
                        }
                        return reject(dirErr);
                    });
                }
                if (accessErr.code === 'ENOENT')
                    return resolve(completeCTs);
                return reject(accessErr);
            });
        })
    }

    private testExecutionFinished() {
        if (!this._executingTests)
            return;

        //Stop the UI update timer and its immediate
        clearInterval(this._timeoutRef);

        this._executingTests = false;

        // Remove tests not updated by the server
        if (!this._isExecutingTestGroup && !this._executeCanceled && this._currentlyExecutingTrace.testCases.length > this._numberOfUpdatedTests)
            this._currentlyExecutingTrace.testCases.splice(this._numberOfUpdatedTests, this._currentlyExecutingTrace.testCases.length - this._numberOfUpdatedTests)

        this._numberOfUpdatedTests = 0;

        // Set verdict for trace     
        if (this._currentlyExecutingTrace != undefined) {
            if (this._currentlyExecutingTrace.testCases.some(tc => tc.verdict == VerdictKind.Failed))
                this._currentlyExecutingTrace.verdict = VerdictKind.Failed;
            else if (this._currentlyExecutingTrace.testCases.every(tc => tc.verdict != null))
                this._currentlyExecutingTrace.verdict = VerdictKind.Passed;
            else
                this._currentlyExecutingTrace.verdict = null;
        }
        // Rebuild entire tree view to rebuild any group views within the remaining range of executed test cases and to rebuild the trace to show its verdict
        this._testProvider.rebuildViewFromElement();
    }

    public async addNewTestResults(traceName: string, testCases: CTTestCase[]) {
        if (this._currentlyExecutingTrace.name != traceName)
            return;

        this._numberOfUpdatedTests = testCases[testCases.length - 1].id;
        // Update test results for tests in the trace
        for (let i = 0; i < testCases.length; i++) {
            // Update existing test case results
            let newTestCase = testCases[i];
            if (newTestCase.id <= this._currentlyExecutingTrace.testCases.length) {
                let oldTestCase: CTTestCase = this._currentlyExecutingTrace.testCases[newTestCase.id - 1];
                oldTestCase.sequence = newTestCase.sequence;
                oldTestCase.verdict = newTestCase.verdict;
            }
            //Add new test case with results
            else
                this._currentlyExecutingTrace.testCases.push(newTestCase);
        }
        // Handle if user has executed all test groups manually.
        if (this._isExecutingTestGroup && testCases[testCases.length - 1].id == this._currentlyExecutingTrace.testCases[this._currentlyExecutingTrace.testCases.length - 1].id) {
            this.testExecutionFinished();
            this._isExecutingTestGroup = false;
            return;
        }
    }

    private setButtonsAndContext(canFilter: boolean) {
        ///// Show options ///////
        if (canFilter) {
            vscode.commands.executeCommand('setContext', 'vdm-ct-show-filter-button', true);
            vscode.commands.executeCommand('setContext', 'vdm-ct-show-set-execute-filter-button', true);
        }
        this.showCancelButton(false);
        this.showTreeFilterButton(true);

        ///// Command registration //////
        if (canFilter) {
            this.registerCommand("vdm-vscode.ctFilteredExecute", (e) => this.execute(e, true));
        }
        this.registerCommand("vdm-vscode.ctRebuildOutline", () => this.ctRebuildOutline());
        this.registerCommand("vdm-vscode.ctFullExecute", () => this.ctFullExecute());
        this.registerCommand("vdm-vscode.ctExecute", (e) => this.execute(e, false));
        this.registerCommand("vdm-vscode.ctGenerate", (e) => this.ctGenerate(e));
        this.registerCommand("vdm-vscode.ctEnableTreeFilter", () => this.ctTreeFilter(true));
        this.registerCommand("vdm-vscode.ctDisableTreeFilter", () => this.ctTreeFilter(false));
        this.registerCommand("vdm-vscode.ctSendToInterpreter", (e) => this.ctSendToInterpreter(e));
        this.registerCommand("vdm-vscode.goToTrace", (e) => this.ctGoToTrace(e));
    }

    private showCancelButton(show: boolean) {
        vscode.commands.executeCommand('setContext', 'vdm-ct-show-run-buttons', !show);
        vscode.commands.executeCommand('setContext', 'vdm-ct-show-cancel-button', show);
    }

    private showTreeFilterButton(show: boolean) {
        vscode.commands.executeCommand('setContext', 'vdm-ct-show-enable-filter-button', show);
        vscode.commands.executeCommand('setContext', 'vdm-ct-show-disable-filter-button', !show);
    }

    private async ctRebuildOutline(useCurrentClient: boolean = false) {
        if (this._isRebuildingTraceOutline)
            return;

        this._isRebuildingTraceOutline = true;
        let clientName: string = this._ctHandler.currentClientName;

        // Prompt user to chose a specification for CT. This also changes the client-server connection.
        // Skip if using current client
        let didSelect: boolean;
        if (!useCurrentClient || this._ctHandler.currentClient == undefined)
            didSelect = await this._ctHandler.showAvailableSpecsForCT();

        if (!didSelect || this._ctHandler.currentClient == undefined) {
            this._isRebuildingTraceOutline = false;
            return;
        }

        //Change viewname
        this._testView.title = this._ctHandler.currentClientName;

        //Verify if the user changed the specification and thus the client.
        let clientChanged: boolean = clientName !== this._ctHandler.currentClientName;

        // Display progress
        window.withProgress({
            location: ProgressLocation.Notification,
            title: `Generating trace outline for ${this._ctHandler.currentClientName}`,
            cancellable: false
        }, async (progress, token) => {
            try {
                let requestedTraces = await this._ctHandler.requestTraces() ?? [];
                if (requestedTraces.length > 0) {
                    if (!clientChanged && this._testProvider.getRoots().length > 0) {
                        // Filter existing trace symbols so they matches servers
                        this._combinatorialTests = this.matchLocalSymbolsToServerSymbols(requestedTraces, this._combinatorialTests);
                    }
                    else {
                        await this.loadCTs().catch(reason => {
                            window.showWarningMessage("Failed to load existing CTs from files");
                            console.error("Failed to load existing CTs from files: " + reason);
                            return Promise.resolve([])
                        }).then(completeCTs => {
                            // Filter loaded trace symbols so they matches servers
                            this._combinatorialTests = this.matchLocalSymbolsToServerSymbols(requestedTraces, completeCTs);
                        });
                    }
                }
                else {
                    this._combinatorialTests = [];
                }

                // Inform user if no traces were found
                if (this._combinatorialTests.length == 0) {
                    window.showInformationMessage(`No trace found in ${this._ctHandler.currentClientName}`);
                }

                // Notify tree view of data update
                if (this._combinatorialTests) {
                    this._testProvider.rebuildViewFromElement();
                }

                // Reset test sequence view
                if (this._resultProvider.getTestSequenceResults().length > 0) {
                    this._resultProvider.setTestSequenceResults([]);
                }

            }
            catch (error) {
                console.error("Failed to generate trace outline: " + error);
                window.showWarningMessage("Failed to generate trace outline");
            }
            finally {
                this._isRebuildingTraceOutline = false;
            }
        });
    }

    private matchLocalSymbolsToServerSymbols(serverSymbols: CTSymbol[], localSymbols: completeCT[]): completeCT[] {
        return serverSymbols.map(serverSymbol => {
            let localSymbol = localSymbols.find(ct => ct.symbolName == serverSymbol.name);

            // Map server CTSymbol to completeCT type and return
            if (!localSymbol)
                return { symbolName: serverSymbol.name, traces: serverSymbol.traces.map(trace => { return { name: trace.name, location: trace.location, verdict: trace.verdict, testCases: [] } }) };

            // Update all traces with information from server
            localSymbol.traces = serverSymbol.traces.map(serverTrace => {
                let localTrace = localSymbol.traces.find(t => t.name == serverTrace.name);
                // Map CTTrace to traceWithTestResults type and return
                if (!localTrace)
                    return { name: serverTrace.name, location: serverTrace.location, verdict: serverTrace.verdict, testCases: [] };

                // Update local trace location as it can be changed
                localTrace.location = serverTrace.location

                return localTrace;
            });

            return localSymbol;
        });
    }

    private async ctFullExecute() {
        // Make sure we are up-to-date
        await this.ctRebuildOutline(true);

        // Run Execute on all traces of all symbols
        for (const symbol of this._testProvider.getRoots()) {
            for (const trace of await this._testProvider.getChildren(symbol)) {
                await this.ctGenerate(trace);
                await this.execute(trace, false);

                if (this._executeCanceled)
                    return;
            }
        }
    }

    private async ctGenerate(traceViewElement: TestViewElement) {
        if (traceViewElement.type != TreeItemType.Trace)
            return;

        // Set status bar
        let statusBarMessage = window.setStatusBarMessage(`Generating test cases for ${traceViewElement.label}`);

        // Setup loading window
        return window.withProgress({
            location: ProgressLocation.Notification,
            title: `Running test generation for ${traceViewElement.label}`,
            cancellable: false
        }, (progress, token) => {
            token.onCancellationRequested(() => {
                console.info(`User canceled the test generation for ${traceViewElement.label}`);
            });

            // Make the generate request
            return new Promise<void>(async (resolve) => {
                try {
                    await this.generate(traceViewElement);
                } catch (error) {
                    if (error?.code == LSPErrorCodes.ContentModified) {
                        // Symbol out-of-sync -> rebuild
                        this.ctRebuildOutline();
                    }
                } finally {
                    // Remove status bar message
                    statusBarMessage.dispose();

                    // Resolve action
                    resolve();
                }
            });
        });
    }

    private async generate(traceViewElement: TestViewElement) {
        if (traceViewElement.type != TreeItemType.Trace)
            return;

        let traceWithTestResults: traceWithTestResults = [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(trace => trace.name == traceViewElement.label);

        try {
            // Request generate from server
            const numberOfTests = await this._ctHandler.requestGenerate(traceViewElement.label);

            // Reset trace verdict
            traceWithTestResults.verdict = null;

            // Check if number of tests from server matches local number of tests
            if (traceWithTestResults.testCases.length != numberOfTests) {
                traceWithTestResults.testCases = [];
                // Instatiate testcases for traces.
                for (let i = 1; i <= numberOfTests; i++)
                    traceWithTestResults.testCases.push({ id: i, verdict: null, sequence: [] });
            }
            else
                // reset verdict and results on each test.
                [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(trace => trace.name == traceViewElement.label).testCases.forEach(testCase => {
                    testCase.verdict = null;
                    testCase.sequence = [];
                });

            this._testProvider.rebuildViewFromElement(traceViewElement.getParent());
        } catch (error) {
            if (error?.code == LSPErrorCodes.ContentModified) {
                // Symbol out-of-sync
                this.ctRebuildOutline();
            }
            console.error("CT Test Generation failed: " + error);
            window.showWarningMessage("CT Test Generation failed: " + error);
        }
    }

    private async ctTreeFilter(enable: boolean) {
        let filtering = ["Passed", "Failed", "Inconclusive", "Filtered"]; // each type of filters that the user can choose
        let conversion: VerdictKind[] = [];
        // prompt user for which type of CT they want to display (only if enable == true)
        if (enable) {
            let selectedFilters = await window.showQuickPick(filtering, {
                placeHolder: 'Choose result types to show',
                canPickMany: true,
            })
            // If non are selected, abort filtering
            if (selectedFilters === undefined || selectedFilters.length == 0) return
            // If all are selected remove filtering
            if (selectedFilters.length == filtering.length) enable = false
            // transform the selectedFilters(string []) in conversion(VerdictKind[]) to be able to use it in the function filterTree below
            for (let i = 0; i <= filtering.length; i++) {
                if (selectedFilters.includes(filtering[i])) {
                    conversion.push(i + 1)
                }
            }
        }

        // Change button 
        this.showTreeFilterButton(!enable)

        // Set in testProvider
        this._testProvider.filterTree(enable, conversion)
    }

    private async ctSendToInterpreter(testViewElement: TestViewElement) {
        let traceName = testViewElement.getParent().getParent().label;
        let testId = Number(testViewElement.label);
        this._ctHandler.sendToInterpreter(traceName, testId);
    }

    private async ctGoToTrace(traceViewElement: TestViewElement) {
        if (traceViewElement.type != TreeItemType.Trace)
            return;

        let traceLocation: Location = [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(trace => trace.name == traceViewElement.label).location;
        if (!traceLocation)
            return;

        // Find path of trace
        let path = Uri.parse(traceLocation.uri.toString()).path;

        // Open the specification file containing the trace
        let doc = await workspace.openTextDocument(path);

        // Show the file
        window.showTextDocument(doc.uri, { selection: this._p2cConverter.asRange(traceLocation.range), viewColumn: 1 })
    }

    private onDidExpandElement(viewElement: TestViewElement) {
        this._testProvider.handleElementExpanded(viewElement);

        // if (viewElement.type == TreeItemType.Trace && viewElement.getChildren().length < 1 || (this._currentlyExecutingTrace.name == viewElement.label && this._currentlyExecutingTrace.testCases.length < 1))
        //     this.ctGenerate(viewElement);

        if (viewElement.type == TreeItemType.TestGroup)
            this._testProvider.rebuildViewFromElement(viewElement);
    }

    private onDidCollapseElement(viewElement: TestViewElement) {
        this._testProvider.handleElementCollapsed(viewElement);
    }

    private onDidChangeSelection(viewElement: TestViewElement) {
        if (viewElement.type == TreeItemType.Test)
            // Get the trace label name from the view items grandparent and find the corresponding trace in _combinatorialTests and set/show the test sequence in the result view
            this._resultProvider.setTestSequenceResults([].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(trace => trace.name == viewElement.getParent().getParent().label).testCases.find(testResult => testResult.id + "" == viewElement.label).sequence);
    }

    private updateUI() {
        this._testProvider.rebuildViewFromElement([].concat(...this._testProvider.getRoots().map(symbolViewElement => symbolViewElement.getChildren())).find(traceViewElement => traceViewElement.label == this._currentlyExecutingTrace.name));
    }

    private async execute(viewElement: TestViewElement, filter: boolean) {
        if (viewElement.type != TreeItemType.Trace && viewElement.type != TreeItemType.TestGroup)
            throw new Error("CT Execute called on invalid element")

        // Reset canceled
        this._executeCanceled = false;

        // Set status bar
        let statusBarMessage = window.setStatusBarMessage('Executing test cases');

        // Setup loading window
        return window.withProgress({
            location: ProgressLocation.Notification,
            title: "Executing tests",
            cancellable: true
        }, (progress, token) => {
            token.onCancellationRequested(() => {
                this._ctHandler.cancelExecution();
            });

            // Do the execute request
            return new Promise<void>(async (resolve, reject) => {
                try {
                    this.showCancelButton(true);
                    //Start a timer to update the UI periodically - this timer is cleared in the finished function
                    this._timeoutRef = setInterval(() => this.updateUI(), this.uiUpdateIntervalMS);
                    this._executingTests = true;
                    if (viewElement.type == TreeItemType.Trace) {
                        this._isExecutingTestGroup = false;
                        // Reference the trace view item for which tests are being executed
                        this._currentlyExecutingTrace = [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(trace => trace.name == viewElement.label);

                        // Create range
                        let lastTestGroup = viewElement.getChildren()[viewElement.getChildren().length - 1];
                        let strRange: string[] = lastTestGroup?.description.toString().split('-');
                        let range: NumberRange;
                        if (strRange != undefined)
                            range = { end: Number(strRange[1]) };

                        // If running a filtered execution mark it as a group execution to prevent change to the number of tests
                        if (filter)
                            this._isExecutingTestGroup = true;

                        // Request execute
                        await this._ctHandler.requestExecute(viewElement.label, filter, range, progress)
                    }
                    else if (viewElement.type == TreeItemType.TestGroup) {
                        this._isExecutingTestGroup = true;
                        // Reference the trace view item for which tests are being executed
                        this._currentlyExecutingTrace = [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(trace => trace.name == viewElement.getParent().label);

                        // Find range from group description
                        let strRange: string[] = viewElement.description.toString().split('-');
                        let range: NumberRange = {
                            start: Number(strRange[0]),
                            end: Number(strRange[1])
                        };

                        // Request execute with range
                        await this._ctHandler.requestExecute(viewElement.getParent().label, false, range, progress)
                    }
                    // Resole the request
                    resolve();

                } catch (error) {
                    if (error?.code == LSPErrorCodes.RequestCancelled) {
                        this._executeCanceled = true;
                        resolve();
                    }
                    else if (error?.code == LSPErrorCodes.ContentModified) {
                        if (viewElement.type == TreeItemType.Trace) {
                            if (error?.message.includes("not found")) {
                                // Trace not found -> Symbol out-of-sync
                                this.ctRebuildOutline();
                            }
                            else {
                                // Possibly just Trace out-of-sync -> try to generate it again
                                this.ctGenerate(viewElement);
                            }
                        }
                        else {
                            // Possibly just Trace out-of-sync -> try to generate it again
                            this.ctGenerate(viewElement.getParent());
                        }
                        resolve();
                    }
                    else if (error?.code == ErrorCodes.ParseError) {
                        window.showWarningMessage("CT Execute failed: " + error);
                        resolve();
                    }
                    else
                        reject(error)
                } finally {
                    // Handle that execution of tests has finished
                    this.testExecutionFinished();
                    this.showCancelButton(false);
                    this.saveCTs();

                    // Remove status bar message
                    statusBarMessage.dispose();
                }
            });
        });
    }

    private registerCommand = (command: string, callback: (...args: any[]) => any) => {
        let disposable = commands.registerCommand(command, callback)
        this._context.subscriptions.push(disposable);
        return disposable;
    };
}

interface completeCT {
    symbolName: string,
    traces: traceWithTestResults[]
}

interface traceWithTestResults {
    /**
     * Fully qualified name of the trace.
     */
    name: string;
    /**
     * Location in the source code of the trace.
     */
    location: Location;
    /**
     * An optional combined verdict of all the tests from the trace.
     */
    verdict?: VerdictKind;
    /**
     * Test case information.
     */
    testCases: CTTestCase[]
}

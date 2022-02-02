// SPDX-License-Identifier: GPL-3.0-or-later

import {
    Disposable,
    TreeView,
    commands,
    ExtensionContext,
    window,
    WorkspaceFolder,
    ProgressLocation,
    CancellationTokenSource,
    workspace,
} from "vscode";
import CTTestTreeDataProvider from "./CTTestTreeDataProvider";
import { CTResultTreeDataProvider } from "./CTResultTreeDataProvider";
import { CTViewDataStorage } from "./CTViewDataStorage";
import { CTTreeItem, TestGroupItem, TestItem, TraceItem } from "./CTTreeItems";
import * as Types from "./CTDataTypes";
import { CTFilterOption, NumberRange, VerdictKind } from "../../protocol/combinatorialTesting";

enum state {
    idle,
    buildingOutline,
    generatingTests,
    executingTestGroup,
    executingTestTrace,
}

export interface CTExecuteFilterHandler {
    setFilter(): void;
    getFilter(): CTFilterOption[];
}

export interface CTInterpreterHandler {
    sendToInterpreter(trace: string, test: number, folder?: WorkspaceFolder | undefined): void;
}

export class CombinatorialTestingView implements Disposable {
    private readonly _uiUpdateIntervalMS = 1000;
    private _disposables: Disposable[] = [];
    private _dataStorage: CTViewDataStorage;

    // View related
    private _testProvider: CTTestTreeDataProvider;
    private _testView: TreeView<CTTreeItem>;
    private _resultProvider: CTResultTreeDataProvider;
    private _resultView: TreeView<CTTreeItem>;

    // Control variables
    private _timeoutRef: NodeJS.Timeout;
    private _currentWsFolder: WorkspaceFolder;
    private _currentlyExecutingTrace: TraceItem;
    private _cancelToken: CancellationTokenSource;
    private _executeCanceled: boolean = false;

    private _state: state = state.idle;
    private get state(): state {
        return this._state;
    }
    private set state(newState: state) {
        this._state = newState;
        commands.executeCommand("setContext", "vdm-vscode.ct.idle-state", newState == state.idle);
    }

    constructor(
        context: ExtensionContext,
        private _filterHandler?: CTExecuteFilterHandler,
        private _interpreterHandler?: CTInterpreterHandler
    ) {
        this.state = state.idle;

        // Create data provider
        this._dataStorage = new CTViewDataStorage();

        // Create test view
        let groupSize = workspace.getConfiguration("vdm-vscode.combinatorialTesting").get("groupSize", 300);
        this._testProvider = new CTTestTreeDataProvider(this._dataStorage, context, groupSize);
        this._testView = window.createTreeView("vdm-vscode.ct.testView", {
            treeDataProvider: this._testProvider,
            showCollapseAll: true,
            canSelectMany: false,
        });
        this._disposables.push(this._testView.onDidExpandElement((e) => this._testProvider.setExpanded(e.element)));
        this._disposables.push(this._testView.onDidCollapseElement((e) => this._testProvider.setCollapsed(e.element)));
        this._disposables.push(
            this._testView.onDidChangeSelection((e) => {
                let item = e.selection[0];
                if (TestItem.is(item)) {
                    let testItem = item as TestItem;
                    this._resultProvider.updateTestResults(testItem.idNumber, testItem.trace.name);
                }
            })
        );

        // Create results view
        this._resultProvider = new CTResultTreeDataProvider(this._dataStorage);
        this._resultView = window.createTreeView("vdm-vscode.ct.resultView", {
            treeDataProvider: this._resultProvider,
            showCollapseAll: true,
            canSelectMany: false,
        });

        // Set button behavior
        this.setButtonsAndContext();

        // Show view
        commands.executeCommand("setContext", "vdm-vscode.ct.show", true);
    }

    private registerCommand = (command: string, callback: (...args: any[]) => any) => {
        let disposable = commands.registerCommand(command, callback);
        this._disposables.push(disposable);
        return disposable;
    };

    private setButtonsAndContext() {
        let canFilter = this._filterHandler != undefined;
        let canInterpret = this._interpreterHandler != undefined;

        ///// Show options /////
        commands.executeCommand("setContext", "vdm-vscode.ct.show-execute-filter-button", canFilter);
        commands.executeCommand("setContext", "vdm-vscode.ct.show-interpret-button", canInterpret);
        this.showCancelButton(false);
        this.showTreeFilterButton(true);

        ///// Command registration /////
        if (canFilter) {
            this.registerCommand("vdm-vscode.ct.setExecuteFilter", () => this._filterHandler.setFilter());
            this.registerCommand("vdm-vscode.ct.filteredExecute", (e) => this.execute(e, true));
        }
        if (canInterpret) {
            this.registerCommand("vdm-vscode.ct.sendToInterpreter", (e) => this.sendToInterpreter(e));
        }
        this.registerCommand("vdm-vscode.ct.rebuildOutline", () => this.rebuildOutline());
        this.registerCommand("vdm-vscode.ct.generate", (e) => this.generateTests(e));
        this.registerCommand("vdm-vscode.ct.fullExecute", () => this.fullExecute());
        this.registerCommand("vdm-vscode.ct.execute", (e) => this.execute(e));
        this.registerCommand("vdm-vscode.ct.enableVerdictFilter", () => this.treeVerdictFilter(true));
        this.registerCommand("vdm-vscode.ct.disableVerdictFilter", () => this.treeVerdictFilter(false));
        this.registerCommand("vdm-vscode.ct.goToTrace", (e) => this.goToTrace(e));
        this.registerCommand("vdm-vscode.ct.cancel", () => this._cancelToken?.cancel());
        this.registerCommand("vdm-vscode.ct.selectWorkspaceFolder", () => this.selectWorkspaceFolder());
        this.registerCommand("vdm-vscode.ct.clearView", () => this.clearView());

        ///// Configuration change handler /////
        workspace.onDidChangeConfiguration(
            (e) => {
                if (e.affectsConfiguration("vdm-vscode.combinatorialTesting")) {
                    this._testProvider.groupSize = workspace
                        .getConfiguration("vdm-vscode.combinatorialTesting")
                        .get("groupSize", this._testProvider.groupSize);
                    this._testProvider.rebuildViewFromElement();
                }
            },
            this,
            this._disposables
        );
    }

    private showCancelButton(show: boolean) {
        commands.executeCommand("setContext", "vdm-vscode.ct.show-cancel-button", show);
    }

    private showTreeFilterButton(show: boolean) {
        commands.executeCommand("setContext", "vdm-vscode.ct.show-verdict-filter-button", show);
    }

    private async rebuildOutline(): Promise<void> {
        // Manage state
        if (this.state != state.idle) return console.info(`[CT View] Rebuild Outline not possible while in state ${state[this.state]}`);
        this.state = state.buildingOutline;

        // Prompt user to chose a specification for CT.
        // Skip if using current workspace
        let wsFolder: WorkspaceFolder = this._currentWsFolder || (await this.selectWorkspaceFolder());
        if (!wsFolder) {
            this.state = state.idle;
            return console.info(`[CT View] Rebuild Outline canceled, did not find a workspacefolder`);
        }

        //Change viewname
        this._testView.title = this._currentWsFolder.name;

        // Display progress
        await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: `Generating trace outline for ${this._currentWsFolder.name}`,
                cancellable: false,
            },
            async (progress, token) => {
                try {
                    let traceGroups = await this._dataStorage.updateTraceGroups(this._currentWsFolder);

                    // Inform user if no traces were found
                    if (traceGroups.length == 0)
                        window.showInformationMessage(`No traces found for the workspace ${this._currentWsFolder.name}`);

                    // Notify tree view of data update
                    if (traceGroups) this._testProvider.rebuildViewFromElement();

                    // Reset test sequence view
                    this._resultProvider.reset();
                } catch (error) {
                    console.error("[CT View] Failed to generate trace outline: " + error);
                    window.showWarningMessage("Failed to generate trace outline");
                } finally {
                    this.state = state.idle;
                }
            }
        );
    }

    private async generateTests(treeItem: CTTreeItem, silent: boolean = false) {
        // Validate indput type
        if (!TraceItem.is(treeItem)) return console.info(`[CT View] Generate tests not possible while in state ${state[this.state]}`);
        let traceItem = treeItem as TraceItem;

        // Manage state
        if (this.state != state.idle) return console.info(`[CT View] Generate tests not possible while in state ${state[this.state]}`);
        this.state = state.generatingTests;

        // Set status bar
        let statusBarMessage = window.setStatusBarMessage(`Generating test cases for ${traceItem.label}`);

        // Setup generate process
        let generateFunc = async () => {
            try {
                // Make the generate request
                let trace = await this._dataStorage.updateTrace(traceItem.name);
                this._testProvider.rebuildViewFromElement(traceItem.getParent());
            } catch (e) {
                if (Types.OutOfSyncError.is(e)) {
                    this.state = state.idle;
                    this.rebuildOutline();
                    console.info(`[CT View] Test outline out of sync - rebuilding`);
                } else {
                    console.error(`[CT View] Failed to generate tests: ${e}`);
                    window.showWarningMessage("Failed to generate tests");
                }
            } finally {
                // Remove status bar message
                statusBarMessage.dispose();
            }
            this.state = state.idle;
        };

        // Call the function
        if (silent) await generateFunc();
        else
            await window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: `Running test generation for ${traceItem.label}`,
                    cancellable: false,
                },
                generateFunc
            );
    }

    private async execute(treeItem: CTTreeItem, filter: boolean = false) {
        // Validate input type
        if (treeItem == undefined || (!TraceItem.is(treeItem) && !TestGroupItem.is(treeItem)))
            return console.info(`[CT View] Execute only possible for Trace or Test Group items`);

        // Manage state
        if (this.state != state.idle) return console.info(`[CT View] Execute not possible while in state ${state[this.state]}`);
        this.state = TraceItem.is(treeItem) ? state.executingTestTrace : state.executingTestGroup;

        // Set status bar
        let statusBarMessage = window.setStatusBarMessage("Executing test cases");

        // Generate cancel token
        this._cancelToken = new CancellationTokenSource();
        this._cancelToken.token.onCancellationRequested(() => {
            this._executeCanceled = true;
            this.showCancelButton(false);
        });
        this._executeCanceled = false;
        this.showCancelButton(true);

        // Setup loading window
        await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: "Executing tests",
                cancellable: true,
            },
            async (progress, token) => {
                token.onCancellationRequested(() => this._cancelToken.cancel());

                // Do the execute request
                try {
                    // Set execution range
                    let range: NumberRange;
                    if (this.state == state.executingTestTrace) {
                        let traceItem = treeItem as TraceItem;
                        this._currentlyExecutingTrace = traceItem;

                        // Missing info about the trace?
                        if (!traceItem.numberOfTests) {
                            this.state = state.idle;
                            await this.generateTests(traceItem, true);
                            this.state = state.executingTestTrace;
                            range = { end: this._dataStorage.getNumberOftests(traceItem.name) };
                        } else {
                            range = { end: traceItem.numberOfTests };
                        }
                    } else if (this.state == state.executingTestGroup) {
                        let testGroupItem = treeItem as TestGroupItem;
                        this._currentlyExecutingTrace = testGroupItem.getParent();
                        range = testGroupItem.range;
                    }

                    // Start a timer to update the UI periodically - this timer is cleared in the finished function
                    this._timeoutRef = setInterval(
                        () => this._testProvider.rebuildViewFromElement(this._currentlyExecutingTrace),
                        this._uiUpdateIntervalMS
                    );

                    // Update the tests
                    await this._dataStorage.updateTests(
                        this._currentlyExecutingTrace.name,
                        range,
                        this._cancelToken.token,
                        progress,
                        filter ? this._filterHandler.getFilter() : null
                    );

                    // Update view
                    this._testProvider.rebuildViewFromElement(
                        this.state == state.executingTestTrace ? null : this._currentlyExecutingTrace
                    );
                } catch (e) {
                    if (Types.OutOfSyncError.is(e)) {
                        let err = e as Types.OutOfSyncError;
                        let traceItem = this.state == state.executingTestTrace ? treeItem : treeItem.getParent();
                        console.info(`[CT View] Tests out of sync - rebuilding`);

                        // Try to rebuild
                        this.state = state.idle;
                        if (err.message.includes("not found")) {
                            // Trace not found -> group out-of-sync
                            this.rebuildOutline();
                        } else {
                            // Trace out-of-sync -> try to generate it again
                            this.generateTests(traceItem);
                        }
                    } else {
                        console.error(`[CT View] Failed to execute tests: ${e}`);
                        window.showWarningMessage("Failed to execute tests");
                    }
                } finally {
                    // Handle that execution of tests has finished
                    clearInterval(this._timeoutRef);

                    // Remove status bar message
                    statusBarMessage.dispose();

                    // Remove cancel token
                    this._cancelToken?.dispose();
                    this._cancelToken = undefined;
                    this.showCancelButton(false);
                }
                this.state = state.idle;
            }
        );
    }

    private async fullExecute() {
        if (this.state != state.idle) return console.info(`[CT View] Full Execute not possible while in state ${state[this.state]}`);

        // Make sure we are up-to-date
        await this.rebuildOutline();

        // Run Execute on all traces of all symbols
        for await (const group of await this._testProvider.getChildren()) {
            for await (const trace of await this._testProvider.getChildren(group)) {
                await this.generateTests(trace, true);
                await this.execute(trace, false);
                if (this._executeCanceled) return;
            }
        }
    }

    private async sendToInterpreter(treeItem: CTTreeItem) {
        if (!TestItem.is(treeItem)) return;
        let testItem = treeItem as TestItem;

        this._interpreterHandler.sendToInterpreter(testItem.trace.name, testItem.idNumber, this._currentWsFolder);
    }

    private async treeVerdictFilter(enable: boolean) {
        let filtering = ["Passed", "Failed", "Inconclusive", "Filtered"]; // each type of filters that the user can choose
        let conversion: VerdictKind[] = [];
        // prompt user for which type of CT they want to display (only if enable == true)
        if (enable) {
            let selectedFilters = await window.showQuickPick(filtering, {
                placeHolder: "Choose result types to show",
                canPickMany: true,
            });
            // If non are selected, abort filtering
            if (selectedFilters === undefined || selectedFilters.length == 0) return;
            // If all are selected remove filtering
            if (selectedFilters.length == filtering.length) enable = false;
            // transform the selectedFilters(string []) in conversion(VerdictKind[]) to be able to use it in the function filterTree below
            for (let i = 0; i <= filtering.length; i++) {
                if (selectedFilters.includes(filtering[i])) {
                    conversion.push(i + 1);
                }
            }
        }

        // Change button
        this.showTreeFilterButton(!enable);

        // Set in testProvider
        this._testProvider.filterTree(enable, conversion);
    }

    private goToTrace(treeItem: CTTreeItem) {
        if (!TraceItem.is(treeItem)) return;
        let traceItem = treeItem as TraceItem;

        // Find trace that test belongs to
        let trace = this._dataStorage.getTrace(traceItem.name);

        // Show the file
        window.showTextDocument(trace.location.uri, { selection: trace.location.range });
    }

    private async selectWorkspaceFolder(): Promise<WorkspaceFolder> {
        if (this.state != state.idle) {
            console.info(`[CT View] Select workspace not possible while in state ${state[this.state]}`);
            return;
        }

        let wsFolder: WorkspaceFolder;
        let wsFolders = this._dataStorage.workspaceFolders;
        if (wsFolders.length == 0) window.showInformationMessage("No workspace folders available");
        else if (wsFolders.length == 1) wsFolder = wsFolders[0];
        else {
            let fName = await window.showQuickPick(
                wsFolders.map((f) => f.name),
                { canPickMany: false, title: "Select workspace folder" }
            );
            if (fName) wsFolder = wsFolders.find((f) => f.name == fName);
        }
        if (wsFolder && this._currentWsFolder != wsFolder) {
            this._currentWsFolder = wsFolder;
            if (this.state == state.idle) this.rebuildOutline();
        }

        return wsFolder;
    }

    private clearView() {
        if (this.state != state.idle) return console.info(`[CT View] Clear view not possible while in state ${state[this.state]}`);

        this._currentWsFolder = undefined;
        this._testView.title = "Tests";
        this._testProvider.reset();
        this._resultProvider.reset();
    }

    dispose() {
        while (this._disposables.length) this._disposables.pop().dispose();
        if (this._testView) this._testView.dispose();
        if (this._resultView) this._resultView.dispose();
        if (this._timeoutRef) this._timeoutRef.unref();
        if (this._cancelToken) this._cancelToken.dispose();
    }
}

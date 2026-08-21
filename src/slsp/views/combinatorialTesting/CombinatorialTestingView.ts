// SPDX-License-Identifier: GPL-3.0-or-later
/* eslint-disable eqeqeq */

import { Disposable, TreeView, commands, window, WorkspaceFolder, ProgressLocation, CancellationTokenSource, workspace } from "vscode";
import CTTestTreeDataProvider from "./CTTestTreeDataProvider";
import CTResultTreeDataProvider from "./CTResultTreeDataProvider";
import { CTViewDataStorage } from "./CTViewDataStorage";
import { CTTreeItem, TestGroupItem, TestItem, TraceItem } from "./CTTreeItems";
import * as Types from "./CTDataTypes";
import { CTFilterOption, NumberRange, VerdictKind } from "../../protocol/CombinatorialTesting";
import { ClientManager } from "../../../ClientManager";
import { VdmDialect } from "../../../util/DialectUtil";

// eslint-disable-next-line @typescript-eslint/naming-convention
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
    private _timeoutRef?: NodeJS.Timeout;
    private _currentWsFolder?: WorkspaceFolder;
    private _currentlyExecutingTrace?: TraceItem;
    private _cancelToken?: CancellationTokenSource;
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
        private _clientManager: ClientManager,
        private _knownVdmFolders: Map<WorkspaceFolder, VdmDialect>,
        private _filterHandler?: CTExecuteFilterHandler,
        private _interpreterHandler?: CTInterpreterHandler,
    ) {
        this.state = state.idle;

        // Create data provider
        this._dataStorage = new CTViewDataStorage();

        // Create results view
        this._resultProvider = new CTResultTreeDataProvider(this._dataStorage);
        this._resultView = window.createTreeView("vdm-vscode.ct.resultView", {
            treeDataProvider: this._resultProvider,
            showCollapseAll: true,
            canSelectMany: false,
        });

        // Create test view
        let groupSize = workspace.getConfiguration("vdm-vscode.combinatorialTesting").get("groupSize", 300);
        this._testProvider = new CTTestTreeDataProvider(this._dataStorage, groupSize);
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
            }),
        );

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

        //* Show options /////
        commands.executeCommand("setContext", "vdm-vscode.ct.show-execute-filter-button", canFilter);
        commands.executeCommand("setContext", "vdm-vscode.ct.show-interpret-button", canInterpret);
        this.showCancelButton(false);
        this.showTreeFilterButton(true);

        //* Command registration /////
        if (canFilter) {
            this.registerCommand("vdm-vscode.ct.setExecuteFilter", () => this._filterHandler!.setFilter());
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
        this.registerCommand("vdm-vscode.ct.generateOutline", () => this.generateOutline());
        this.registerCommand("vdm-vscode.ct.clearView", () => this.clearView());

        //* Configuration change handler /////
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
            this._disposables,
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
        if (this.state != state.idle) {
            return console.info(`[CT View] Rebuild Outline not possible while in state ${state[this.state]}`);
        }
        this.state = state.buildingOutline;

        // Prompt user to chose a specification for CT.
        // Skip if using current workspace
        const wsFolder: WorkspaceFolder | undefined = this._currentWsFolder || (await this.generateOutline());
        if (!wsFolder) {
            this.state = state.idle;
            return console.info(`[CT View] Rebuild Outline canceled, did not find a workspacefolder`);
        }
        this._currentWsFolder = wsFolder;

        //Change viewname
        this._testView.title = wsFolder.name;

        // Display progress
        await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: `Generating trace outline for ${wsFolder.name}`,
                cancellable: false,
            },
            async (_progress, _token) => {
                try {
                    // Update data storage
                    let traceGroups = await this._dataStorage.updateTraceGroups(wsFolder);

                    // Inform user if no traces were found
                    if (traceGroups.length == 0) {
                        window.showInformationMessage(`No traces found for the workspace ${wsFolder.name}`);
                    }

                    // Notify tree view of data update
                    if (traceGroups) {
                        this._testProvider.rebuildViewFromElement();
                    }

                    // Reset test sequence view
                    this._resultProvider.reset();
                } catch (error) {
                    console.error("[CT View] Failed to generate trace outline: " + error);
                    window.showWarningMessage("Failed to generate trace outline: " + error);
                } finally {
                    this.state = state.idle;
                }
            },
        );
    }

    private async generateTests(treeItem: CTTreeItem, silent: boolean = false): Promise<boolean> {
        // Validate indput type
        if (!TraceItem.is(treeItem)) {
            console.info(`[CT View] Generate tests not possible while in state ${state[this.state]}`);
            return false;
        }
        let traceItem = treeItem as TraceItem;

        // Manage state
        if (this.state != state.idle) {
            console.info(`[CT View] Generate tests not possible while in state ${state[this.state]}`);
            return false;
        }
        this.state = state.generatingTests;

        // Set status bar
        let statusBarMessage = window.setStatusBarMessage(`Generating test cases for ${traceItem.label}`);

        let success = true;

        // Setup generate process
        let generateFunc = async () => {
            try {
                // Update the data storage and the view
                await this._dataStorage.updateTrace(traceItem.name);
                this._testProvider.rebuildViewFromElement();
            } catch (e) {
                // If out of sync, try to recover
                if (Types.OutOfSyncError.is(e)) {
                    this.state = state.idle;
                    this.rebuildOutline();
                    console.info(`[CT View] Test outline out of sync - rebuilding`);
                } else {
                    console.error(`[CT View] Failed to generate tests for ${traceItem.label}: ${e}`);
                    window.showErrorMessage(`Failed to generate tests for ${traceItem.label}: ${e}`);
                    success = false;
                }
            } finally {
                // Remove status bar message
                statusBarMessage.dispose();
            }
            this.state = state.idle;
        };

        // Call the function
        if (silent) {
            await generateFunc();
        } else {
            await window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: `Running test generation for ${traceItem.label}`,
                    cancellable: false,
                },
                generateFunc,
            );
        }

        return success;
    }

    private async execute(treeItem: CTTreeItem, filter: boolean = false) {
        // Validate input type
        if (treeItem == undefined || (!TraceItem.is(treeItem) && !TestGroupItem.is(treeItem))) {
            return console.info(`[CT View] Execute only possible for Trace or Test Group items`);
        }

        // Manage state
        if (this.state != state.idle) {
            return console.info(`[CT View] Execute not possible while in state ${state[this.state]}`);
        }
        this.state = TraceItem.is(treeItem) ? state.executingTestTrace : state.executingTestGroup;

        // Set status bar
        let statusBarMessage = window.setStatusBarMessage("Executing test cases");

        // Generate cancel token
        this._cancelToken = new CancellationTokenSource();
        const cancelToken = this._cancelToken;
        cancelToken.token.onCancellationRequested(() => {
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
                token.onCancellationRequested(() => cancelToken.cancel());

                // Do the execute request
                try {
                    // Set execution range
                    let range: NumberRange;
                    if (this.state == state.executingTestTrace) {
                        let traceItem = treeItem as TraceItem;
                        this._currentlyExecutingTrace = traceItem;

                        // Missing info about the trace?
                        if (!traceItem.numberOfTests) {
                            // Generate the tests for the trace
                            this.state = state.idle;
                            const generated = await this.generateTests(traceItem, true);
                            if (!generated) {
                                return;
                            }
                            this.state = state.executingTestTrace;
                            range = { end: this._dataStorage.getNumberOftests(traceItem.name) };
                        } else {
                            range = { end: traceItem.numberOfTests };
                        }
                    } else {
                        let testGroupItem = treeItem as TestGroupItem;
                        this._currentlyExecutingTrace = testGroupItem.getParent();
                        range = testGroupItem.range;
                    }

                    const currentlyExecutingTrace = this._currentlyExecutingTrace;

                    // Start a timer to update the UI periodically - this timer is cleared in the finished function
                    this._timeoutRef = setInterval(
                        () => this._testProvider.rebuildViewFromElement(currentlyExecutingTrace),
                        this._uiUpdateIntervalMS,
                    );

                    // Update the data storage
                    await this._dataStorage.updateTests(
                        currentlyExecutingTrace.name,
                        range,
                        cancelToken.token,
                        progress,
                        filter && this._filterHandler ? this._filterHandler.getFilter() : undefined,
                    );

                    // Update view
                    this._testProvider.rebuildViewFromElement(this.state == state.executingTestTrace ? undefined : currentlyExecutingTrace);

                    // Reset state
                    this.state = state.idle;
                } catch (e) {
                    // If out of sync, try to recover
                    if (Types.OutOfSyncError.is(e)) {
                        let err = e as Types.OutOfSyncError;
                        let traceItem = this.state == state.executingTestTrace ? treeItem : treeItem.getParent();
                        console.info(`[CT View] Tests out of sync - rebuilding`);

                        // Try to rebuild
                        this.state = state.idle;
                        if (err.message.includes("not found")) {
                            // Trace not found -> group out-of-sync
                            this.rebuildOutline();
                        } else if (traceItem) {
                            // Trace out-of-sync -> try to generate it again
                            this.generateTests(traceItem);
                        }
                    } else {
                        console.error(`[CT View] Failed to execute tests: ${e}`);
                        window.showErrorMessage(`Failed to execute tests: ${e}`);
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
            },
        );
    }

    private async fullExecute() {
        // Manage state
        if (this.state != state.idle) {
            return console.info(`[CT View] Full Execute not possible while in state ${state[this.state]}`);
        }

        // Make sure we are up-to-date
        await this.rebuildOutline();

        // Run Execute on all traces of all trace groups
        for (const group of await this._testProvider.getChildren()) {
            for (const trace of await this._testProvider.getChildren(group)) {
                const generated = await this.generateTests(trace, true);
                if (!generated) {
                    continue;
                }
                await this.execute(trace, false);
                if (this._executeCanceled) {
                    return;
                }
            }
        }
    }

    private async sendToInterpreter(treeItem: CTTreeItem) {
        // Validate input type
        if (!TestItem.is(treeItem)) {
            return;
        }
        let testItem = treeItem as TestItem;

        // Use the handler to send to interpreter
        this._interpreterHandler!.sendToInterpreter(testItem.trace.name, testItem.idNumber, this._currentWsFolder);
    }

    private async treeVerdictFilter(enable: boolean) {
        let filterItems = ["Passed", "Failed", "Inconclusive", "Filtered"]; // each type of filters that the user can choose
        let choices: VerdictKind[] = [];

        // Prompt user for which type of CT they want to display (only if enable == true)
        if (enable) {
            let selectedFilters = await window.showQuickPick(filterItems, {
                placeHolder: "Choose result verdicts to show",
                canPickMany: true,
            });

            // If non are selected, abort filtering
            if (selectedFilters === undefined || selectedFilters.length == 0) {
                return;
            }

            // If all are selected remove filtering
            if (selectedFilters.length == filterItems.length) {
                enable = false;
            }

            // Transform the the selection to be able to use it in the function filterTree below
            for (let i = 0; i < filterItems.length; i++) {
                if (selectedFilters.includes(filterItems[i])) {
                    choices.push(i + 1);
                }
            }
        }

        // Change button
        this.showTreeFilterButton(!enable);

        // Set in testProvider
        this._testProvider.filterByVerdict(enable, choices);
    }

    private goToTrace(treeItem: CTTreeItem) {
        // Validate input type
        if (!TraceItem.is(treeItem)) {
            return;
        }
        let traceItem = treeItem as TraceItem;

        // Find trace that test belongs to
        let trace = this._dataStorage.getTrace(traceItem.name);
        if (!trace) {
            console.warn(`[CT View] goToTrace could not find trace: ${traceItem.name}`);
            return;
        }

        // Show the file
        window.showTextDocument(trace.location.uri, { selection: trace.location.range });
    }

    private async resolveWorkspaceFolder(preferActive: boolean): Promise<WorkspaceFolder | undefined> {
        // Manage state
        if (this.state != state.idle) {
            console.info(`[CT View] Select workspace not possible while in state ${state[this.state]}`);
            return undefined;
        }

        if (this._knownVdmFolders.size == 0) {
            window.showInformationMessage("[CT View] Unable to find any workspace folders containing files that the extension can handle");
            return undefined;
        }

        let wsFolder: WorkspaceFolder | undefined;

        // Try the active editor's workspace folder first
        if (preferActive) {
            const activeUri = window.activeTextEditor?.document?.uri;
            const activeWsFolder = activeUri ? workspace.getWorkspaceFolder(activeUri) : undefined;
            if (activeWsFolder && this._knownVdmFolders.has(activeWsFolder)) {
                wsFolder = activeWsFolder;
            }
        }

        // Fall back to prompting the user if there is no active editor,
        // or if the caller explicitly wants a picker (preferActive == false)
        if (!wsFolder) {
            const folders = workspace.workspaceFolders;
            if (folders && folders.length > 1) {
                const pickedName = await window.showQuickPick(
                    Array.from(this._knownVdmFolders.keys()).map((key) => key.name),
                    { canPickMany: false, title: "Select workspace folder" },
                );
                wsFolder = pickedName ? Array.from(this._knownVdmFolders.keys()).find((key) => key.name == pickedName) : undefined;
            } else if (folders && folders.length === 1) {
                wsFolder = folders[0];
            }
        }

        if (wsFolder) {
            if (!this._dataStorage.workspaceFolders.find((wsfWithProvider) => wsfWithProvider.uri == wsFolder!.uri)) {
                if (this._clientManager.has(wsFolder)) {
                    console.info(
                        "[CT View] Select workspace not possible as the langiage server does not seem to support combinatorial testing",
                    );
                } else {
                    await this._clientManager.launchClientForWorkspace(wsFolder);
                }
            }
        }

        if (wsFolder && this._currentWsFolder != wsFolder) {
            this._currentWsFolder = wsFolder;
            if (this.state == state.idle) {
                this.rebuildOutline();
            }
        }

        return wsFolder;
    }

    private async selectWorkspaceFolder(): Promise<WorkspaceFolder | undefined> {
        return this.resolveWorkspaceFolder(false);
    }

    private async generateOutline(): Promise<WorkspaceFolder | undefined> {
        return this.resolveWorkspaceFolder(true);
    }

    private clearView() {
        // Only allowed while idle
        if (this.state != state.idle) {
            return console.info(`[CT View] Clear view not possible while in state ${state[this.state]}`);
        }

        // Reset control variables and views
        this._currentWsFolder = undefined;
        this._testView.title = "Tests";
        this._testProvider.reset();
        this._resultProvider.reset();
    }

    dispose() {
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
        if (this._testView) {
            this._testView.dispose();
        }
        if (this._resultView) {
            this._resultView.dispose();
        }
        if (this._timeoutRef) {
            this._timeoutRef.unref();
        }
        if (this._cancelToken) {
            this._cancelToken.dispose();
        }
    }
}

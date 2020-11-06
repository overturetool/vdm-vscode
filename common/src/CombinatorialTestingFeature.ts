import * as fs from 'fs';
import * as vscode from 'vscode';
import * as Util from "./Util"
import { commands, ExtensionContext, ProgressLocation, Uri, window, window as Window, workspace } from "vscode";
import { CancellationTokenSource, ClientCapabilities, ErrorCodes, ProgressType, ServerCapabilities, StaticFeature, WorkDoneProgress, WorkDoneProgressBegin, WorkDoneProgressEnd, WorkDoneProgressOptions, WorkDoneProgressReport} from "vscode-languageclient";
import { CTDataProvider, TestViewElement, TreeItemType } from "./CTDataProvider";
import * as protocol2code from 'vscode-languageclient/lib/protocolConverter';
import { ExperimentalCapabilities, CTTestCase, CTTrace, CTSymbol, CTFilterOption, CTTracesParameters, CTTracesRequest, CTGenerateParameters, CTGenerateRequest, CTExecuteParameters, CTExecuteRequest, NumberRange, VerdictKind} from "./protocol.lspx";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import { CTResultElement, CTResultDataProvider } from './CTResultDataProvider';
import path = require('path');

export class CombinantorialTestingFeature implements StaticFeature {
    private _ctTreeView : CTTreeView;
    private _cancelToken: CancellationTokenSource;
    private _generateCalls : number = 0;
    private _supportWorkDone = false;
    private _progress: number = 0;

    constructor(
        private _client: SpecificationLanguageClient, 
        private _context: ExtensionContext, 
        private _filterHandler?: CTFilterHandler, 
        private _interpreterHandler?: CTInterpreterHandler) {}
    
    fillClientCapabilities(capabilities: ClientCapabilities): void {
        if(!capabilities.experimental)
            capabilities.experimental = { combinatorialTesting: true };
        else
            Object.assign(capabilities.experimental, {combinatorialTesting: true});
    }

    initialize(capabilities: ServerCapabilities<ExperimentalCapabilities>): void {
        // If server supports CT
        if (capabilities?.experimental?.combinatorialTestProvider) {
            // Check if support work done progress
            if (WorkDoneProgressOptions.hasWorkDoneProgress(capabilities?.experimental?.combinatorialTestProvider))
                this._supportWorkDone = capabilities?.experimental?.combinatorialTestProvider.workDoneProgress

            // Register data provider and view
            this._ctTreeView = new CTTreeView(this, this._context, true);

            // Set filter
            if (this._filterHandler)
                this.registerCommand('extension.ctSetFilter', () => this._filterHandler.setCTFilter());

            this.registerCommand('extension.ctCancel', () => this.cancelExecution());
        }
    }

    private registerCommand = (command: string, callback: (...args: any[]) => any) => {
        let disposable = commands.registerCommand(command, callback)
        this._context.subscriptions.push(disposable);
        return disposable;
    };

    public async requestTraces(uri?: Uri) : Promise<CTSymbol[]>{
        Window.setStatusBarMessage('Requesting Combinatorial Test Trace Overview', 2000);

        try {
            // Setup message parameters
            let params: CTTracesParameters = {};
            if (uri)
                params.uri = uri.toString();

            // Send request
            const symbols = await this._client.sendRequest(CTTracesRequest.type, params);
            return symbols;
        }
        catch (err) {
            Window.showInformationMessage("Combinatorial Test - trace request failed. " + err);
        }
    }

    public async requestGenerate(name: string) : Promise<number> {
        try {
            // Setup message parameters
            let params: CTGenerateParameters = {name: name};

            // Send request
            const res = await this._client.sendRequest(CTGenerateRequest.type, params);
            return res.numberOfTests;
        }
        catch (err) {
            Window.showInformationMessage("Combinatorial Test - generation request failed: " + err);
        }
    }

    public async requestExecute(name: string, filtered: boolean = false, range?: NumberRange, progress?: vscode.Progress<{ message?: string; increment?: number }>){
        // Check if already running an execution
        if (this._cancelToken){
            Window.showInformationMessage("Combinatorial Test - execute request failed: An execution is already running");
            return;
        }

        // Generate cancel token
        this._cancelToken = new CancellationTokenSource();
        this._context.subscriptions.push(this._cancelToken);

        try {
            // Setup message parameters
            let params: CTExecuteParameters = {name: name};
            if (filtered){
                params.filter = await this._filterHandler.getCTFilter();
            }
            if (range)
                params.range = range;

            // Setup partial result handler
            let partialResultToken = this.generateToken();
            params.partialResultToken = partialResultToken
            var partialResultHandlerDisposable = this._client.onProgress(CTExecuteRequest.resultType, partialResultToken, (tests) => this.handleExecutePartialResult(tests, name));

            // Setup work done  progress handler
            if (this._supportWorkDone){
                this._progress = 0;
                let workDoneTokenToken = this.generateToken();
                params.workDoneToken = workDoneTokenToken;
                var workDoneProgressHandlerDisposable = this._client.onProgress(WorkDoneProgress.type, workDoneTokenToken, (value) => this.handleExecuteWorkDoneProgress(value, progress));
            }

            // Send request
            this._ctTreeView.showCancelButton(true);
            const tests = await this._client.sendRequest(CTExecuteRequest.type, params, this._cancelToken.token);

            // If not using progress token, update test results
            if (tests != null)
                this._ctTreeView.addNewTestResults(name, tests)
        }
        catch (err) {
            if (err?.code == ErrorCodes.RequestCancelled){
                if (err?.data != null){
                    this._ctTreeView.addNewTestResults(name, err.data);
                }
                throw err;
            }
            else {
                Window.showInformationMessage("Combinatorial Test - execute request failed: " + err);
            }
        }
        finally{
            this._ctTreeView.saveCTs();
            this._ctTreeView.testExecutionFinished();

            // Clean-up
            this._cancelToken.dispose();
            this._cancelToken = undefined;
            partialResultHandlerDisposable?.dispose();
            workDoneProgressHandlerDisposable?.dispose();
            this._ctTreeView.showCancelButton(false);
        }
    } 

    cancelExecution(){
        this._cancelToken?.cancel();
    }

    sendToInterpreter(trace: string, test:number){
        this._interpreterHandler.sendToInterpreter(trace,test);
    }

    private handleExecutePartialResult(tests: CTTestCase[], trace: string){
        if (tests)
            this._ctTreeView.addNewTestResults(trace, tests);
        else
            Window.showInformationMessage("CT Received Progress without any tests");
    }

    private handleExecuteWorkDoneProgress(value: any, progress: vscode.Progress<{ message?: string; increment?: number }>){
        if (value?.percentage != undefined){
            progress.report({message: value.message, increment: (value.percentage - this._progress)})
            this._progress = value.percentage
        }
            
    }


    private generateToken() : string {
        return "CombinatorialTestToken-"+Date.now().toString()+(this._generateCalls++).toString();
    }
}

export interface CTFilterHandler {
    setCTFilter(): void;
    getCTFilter(): CTFilterOption[];
}

export interface CTInterpreterHandler {
    sendToInterpreter(trace : string, test : number): void;
}

export class CTTreeView {
    private _testView: vscode.TreeView<TestViewElement>;
    private _resultView: vscode.TreeView<CTResultElement>;
    public currentTraceName: string;
    private _combinatorialTests: completeCT[] = [];
    private readonly _savePath: Uri;
    private _testProvider: CTDataProvider;
    private _resultProvider: CTResultDataProvider;
    private _currentlyExecutingTraceViewItem: TestViewElement;
    private _testCaseBatchRange: NumberRange = {start: 0, end: 0};
    private _batchSizeModifier: number = 0.2;

    constructor(
        private _ctFeature: CombinantorialTestingFeature, 
        private _context:ExtensionContext, 
        canFilter: boolean = false
        ){

        this._testProvider = new CTDataProvider(this, this._context);
        this._resultProvider = new CTResultDataProvider();

        // Set save path and load cts     // TODO correct this when implementing workspaces
        this._savePath = Uri.joinPath(workspace.workspaceFolders[0].uri, ".generated", "Combinatorial Testing");

        // Create test view
        let testview_options : vscode.TreeViewOptions<TestViewElement> = {
            treeDataProvider: this._testProvider, 
            showCollapseAll: true
        }
        this._testView = Window.createTreeView('ctView', testview_options)
        this._context.subscriptions.push(this._testView);

        // Create results view
        let resultview_options : vscode.TreeViewOptions<CTResultElement> = {
            treeDataProvider: this._resultProvider, 
            showCollapseAll: true
        }
        this._resultView = Window.createTreeView('ctResultView', resultview_options)
        this._context.subscriptions.push(this._resultView);

        // Register view behavior
        this._context.subscriptions.push(this._testView.onDidExpandElement(  e => this.onDidExpandElement(e.element)));
        this._context.subscriptions.push(this._testView.onDidCollapseElement(e => this.onDidCollapseElement(e.element)));
        this._context.subscriptions.push(this._testView.onDidChangeSelection(e => this.onDidChangeSelection(e.selection[0])));

        // Set button behavior
        this.setButtonsAndContext(canFilter);

        // Show view
        vscode.commands.executeCommand( 'setContext', 'vdm-ct-show-view', true );
    }

    public getSymbolNames(): string[]{
        return this._combinatorialTests.map(ct => ct.symbolName);
    }

    public getTraces(symbolName: string): CTTrace[]{
        return this._combinatorialTests.find(ct => ct.symbolName == symbolName).traces.map(twr => twr.trace);
    }

    public getNumberOftests(traceName: string): number {
        return [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(twr => twr.trace.name == traceName).testCases.length;
    }

    public getTestResults(range: NumberRange, traceName: string): CTTestCase[]{
        let traces = [].concat(...this._combinatorialTests.map(symbol => symbol.traces));
        let traceWithResult = traces.find(twr => twr.trace.name == traceName);
        return traceWithResult.testCases.slice(range.start, range.end);
    }

    public saveCTs() {            
        this._combinatorialTests.forEach(ct => {
            // Create full path
            let path = Uri.joinPath(this._savePath, ct.symbolName+".json").fsPath;

            // Ensure that path exists
            Util.ensureDirectoryExistence(path)
        
            // Convert data into JSON
            let json = JSON.stringify(ct);

            // Asynchronouse save
            fs.writeFile(path, json, (err) => {
                if (err) throw err;
                console.log('Write call finished');
            })
        });                   
    }

    private async loadCTs() : Promise<completeCT[]>{
        return new Promise(async (resolve, reject) => {
            // Asynchroniouse read of filepath
            let completeCTs: completeCT[] = [];
            if (!fs.existsSync(this._savePath.fsPath))
                return resolve(completeCTs);
            let files = fs.readdirSync(this._savePath.fsPath, {withFileTypes: true});

            files.forEach(f => {
                let file:fs.Dirent = f;
                if(file.isFile && file.name.includes(".json"))
                {
                    let ctFile = fs.readFileSync(this._savePath.fsPath + path.sep + file.name).toString();
                    try{
                        completeCTs.push(JSON.parse(ctFile));
                    }
                    catch(err)
                    {
                        reject(err);
                        throw err;
                    }
                }
            });
            resolve(completeCTs);
        })
    }

    public testExecutionFinished()
    {     
        this._testCaseBatchRange.end = 0;
        this._testCaseBatchRange.start = 0;

        // Set the trace verdicts
        let traceWithFinishedTestExecution: traceWithTestResults = [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(twr => twr.trace.name == this._currentlyExecutingTraceViewItem.label);
        if(traceWithFinishedTestExecution.testCases.some(tc => !tc.verdict))
            traceWithFinishedTestExecution.trace.verdict = null;
        else if(traceWithFinishedTestExecution.testCases.some(tc => tc.verdict != VerdictKind.Failed))
            traceWithFinishedTestExecution.trace.verdict = VerdictKind.Passed;
        else
            traceWithFinishedTestExecution.trace.verdict = VerdictKind.Failed;
        
        // This rebuilds any group views within the remaining range of executed test cases and rebuild the trace to show the verdict
        this._testProvider.rebuildViewFromElement(this._testProvider.getRoots().find(symbolElement => symbolElement.getChildren().some(c => c.label == traceWithFinishedTestExecution.trace.name)));
    }

    public async addNewTestResults(traceName: string, testCases: CTTestCase[]){
        let traceWithResult: traceWithTestResults = [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(twr => twr.trace.name == traceName);
        // Update test results for tests in the trace
        for(let i = 0; i < testCases.length; i++)
        {
            let oldTestCase: CTTestCase = traceWithResult.testCases.find(tc => tc.id == testCases[i].id);
            oldTestCase.sequence = testCases[i].sequence;
            oldTestCase.verdict = testCases[i].verdict;
        }
        // Handle if user has executed all test groups manually.
        if(testCases[testCases.length-1].id == traceWithResult.testCases[traceWithResult.testCases.length].id)
        {
            this.testExecutionFinished();
        }

        // Update batch size
        this._testCaseBatchRange.end = testCases[testCases.length-1].id;

        // Generate groups for the trace if they are not generated yet and reference the first group to get its group size.
        let group = this._currentlyExecutingTraceViewItem.getChildren()[0];
        if(!group)
            group = (await this._testProvider.getChildren(this._currentlyExecutingTraceViewItem))[0];
        let groupSizeRange: number[] = group.description.toString().split('-').map(str => parseInt(str));

        // Return if batch size isn't big enough to warrent a view update.
        if(this._testCaseBatchRange.end - this._testCaseBatchRange.start < (groupSizeRange[1] - groupSizeRange[0]) * this._batchSizeModifier)
            return;

        // Set the new start test number of the _testCaseBatchRange and rebuild expanded test group views effected by the changed data.
        this._testCaseBatchRange.start = testCases[testCases.length-1].id;
        this.rebuildExpandedGroupViewsInRange(this._testCaseBatchRange.start, this._testCaseBatchRange.end);
    }

    rebuildExpandedGroupViewsInRange(start: number, end: number){
        // Find the group element(s) that should update its view.
        this._currentlyExecutingTraceViewItem.getChildren().forEach(ge => {
            // Get group range from the groups label.
            let numberRange : number[] = ge.description.toString().split('-').map(str => parseInt(str));
            // Notify of data changes for the group view if batch range is within group range.
            if(numberRange[0] <= end && numberRange[1] >= start)
                // Function only rebuilds group view if it is expanded.
                this._testProvider.rebuildViewElementIfExpanded(ge);
        });
    }
     
    setButtonsAndContext(canFilter: boolean){
        ///// Show options ///////
        if (canFilter){
            vscode.commands.executeCommand( 'setContext', 'vdm-ct-show-filter-button', true );
            vscode.commands.executeCommand( 'setContext', 'vdm-ct-show-set-execute-filter-button', true );
        }
        this.showCancelButton(false);

        ///// Command registration //////
        if(canFilter) {
            this.registerCommand("extension.ctFilteredExecute", (e) => this.ctFilteredExecute(e));
        }
        this.registerCommand("extension.ctRebuildOutline",      () => this.ctRebuildOutline());
        this.registerCommand("extension.ctFullExecute",         ()  => this.ctFullExecute());
        this.registerCommand("extension.ctExecute",             (e) => this.ctExecute(e));
        this.registerCommand("extension.ctGenerate",            (e) => this.ctGenerate(e));
        this.registerCommand("extension.toggleFilteringForTestGroups",      ()  => this._testProvider.toggleFilteringForTestGroups());
        this.registerCommand("extension.ctSendToInterpreter",   (e) => this.ctSendToInterpreter(e));
        this.registerCommand("extension.goToTrace",   (e) => this.ctGoToTrace(e));
    }

    showCancelButton(show: boolean) {
        vscode.commands.executeCommand('setContext', 'vdm-ct-show-run-buttons', !show);
        vscode.commands.executeCommand('setContext', 'vdm-ct-show-cancel-button', show);
        if(!show)
            this._testProvider.rebuildViewFromElement();
    }
    
    async ctGoToTrace(viewElement:TestViewElement) {

        if(viewElement.type != TreeItemType.Trace)
            return;

        let trace: CTTrace = [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(twr => twr.trace.name == viewElement.label).trace;
        if(!trace)
            return;

        // Find path of trace
        let path = Uri.parse(trace.location.uri.toString()).path;

        // Open the specification file containing the trace
        let doc = await workspace.openTextDocument(path);
        
        // Show the file
        window.showTextDocument(doc.uri, { selection: protocol2code.createConverter().asRange(trace.location.range) , viewColumn: 1 })
    }

    async ctFilteredExecute(viewElement: TestViewElement) {
        this.execute(viewElement, true)
    }

    async ctRebuildOutline() {
        if(this._testProvider.getRoots().length > 0)
            this._combinatorialTests = this.filterSymbols((await this._ctFeature.requestTraces()), this._combinatorialTests);
            
        else
        {
            await Promise.all([this.loadCTs().catch(r => Promise.resolve<completeCT[]>([{symbolName: "", traces: []}])), this._ctFeature.requestTraces()]).then(res =>
                {
                    // Filter loaded data so it matches servers
                    this._combinatorialTests = this.filterSymbols(res[1], res[0]);
                });
        }          

        // Notify tree view of data update
        this._testProvider.rebuildViewFromElement();
    }

    private filterSymbols(trueSymbols:CTSymbol[], symbolsToFilter:completeCT[]): completeCT[] {
        return trueSymbols.map(serverSymbol => {
            let localCT = symbolsToFilter.find(ct => ct.symbolName == serverSymbol.name)
            if(!localCT)
                return {symbolName: serverSymbol.name, traces: serverSymbol.traces.map(trace => {return {trace: trace, testCases: []}})};
            
            localCT.traces = serverSymbol.traces.map(serverTrace => {
                let traceIndex = localCT.traces.findIndex(t => t.trace.name == serverTrace.name);
                if(traceIndex != -1)
                    return localCT.traces[traceIndex];
                else
                    return {trace: serverTrace, testCases: []}
            });               
            return localCT;
        });
    }

    async ctFullExecute() {
        let cancled: boolean = false;

        // Run Execute on all traces of all symbols
        for (const symbol of await this._testProvider.getChildren()) {
            for (const trace of await this._testProvider.getChildren(symbol)) {
                await this.ctGenerate(trace)
                await this.execute(trace, false).catch(() => {cancled = true});
                if (cancled){
                    return;
                }
            }
        }    
    }

    async ctExecute(viewElement: TestViewElement) {
        this.execute(viewElement, false);
    }

    async ctGenerate(viewElement: TestViewElement) {
        // Set status bar
        let statusBarMessage = Window.setStatusBarMessage('Generating test cases');

        // Setup loading window
        return window.withProgress({
            location: {viewId: "ctView"},
            title: "Running test generation",
            cancellable: false
        }, (progress, token) => {
            token.onCancellationRequested(() => {
                console.log("User canceled the test generation");
            });

            // Do the generate request
            return new Promise(async resolve => {
                // Request generate from server
                const numberOfTests = await this._ctFeature.requestGenerate(viewElement.label);
                
                // Check if number of tests from server matches local number of tests
                let traceWithTestResults: traceWithTestResults = [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(twr => twr.trace.name == viewElement.label);
                traceWithTestResults.trace.verdict = null;
                if(traceWithTestResults.testCases.length != numberOfTests)
                {
                    traceWithTestResults.testCases = [];
                    // Instatiate testcases for traces.
                    for(let i = 1; i <= numberOfTests; i++)
                        traceWithTestResults.testCases.push({id: i, verdict: null, sequence: []});
                }
                else
                    // reset verdict and results on each test.
                    [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(twr => twr.trace.name == viewElement.label).testCases.forEach(testCase => {
                        testCase.verdict = null;
                        testCase.sequence = [];
                    });            
        
                this._testProvider.rebuildViewFromElement(viewElement.getParent()); 
                
                // Remove status bar message
                statusBarMessage.dispose();

                // Resolve action
                resolve();
            });
        });
    }

    ctSendToInterpreter(e: TestViewElement): void {
        let trace = e.getParent().getParent().label;
        let test = Number(e.label);
        this._ctFeature.sendToInterpreter(trace, test);
    }

    onDidExpandElement(viewElement : TestViewElement){
        if (viewElement.type == TreeItemType.Trace && viewElement.getChildren().length < 1)
            this.ctGenerate(viewElement);
        
        if (viewElement.type == TreeItemType.TestGroup)
            this._testProvider.rebuildViewFromElement(viewElement);

        this._testProvider.handleElementExpanded(viewElement);
    }   

    onDidCollapseElement(viewElement : TestViewElement){
        this._testProvider.handleElementCollapsed(viewElement);
    }

    onDidChangeSelection(viewElement : TestViewElement){
        if(viewElement.type == TreeItemType.Test)
            // Get the trace label name from the view items grandparent and find the corresponding trace in _combinatorialTests and set/show the test sequence in the result view
            this._resultProvider.setTestSequenceResults([].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(twr => twr.trace.name == viewElement.getParent().getParent().label).testCases.find(testResult => testResult.id+"" == viewElement.label).sequence);     
    }

    private async execute(viewElement: TestViewElement, filter: boolean){
        if (viewElement.type != TreeItemType.Trace && viewElement.type != TreeItemType.TestGroup)
            throw new Error("CT Execute called on invalid element")

        // Set status bar
        let statusBarMessage = Window.setStatusBarMessage('Executing test cases');

        // Setup loading window
        return window.withProgress({
            location: ProgressLocation.Notification,
            title: "Running test generation",
            cancellable: true
        }, (progress, token) => {
            token.onCancellationRequested(() => {
                console.log("User canceled the test execution");
                this._ctFeature.cancelExecution();
            });

            // Do the execute request
            return new Promise(async (resolve, reject) => {
                try {
                    if (viewElement.type == TreeItemType.Trace){
                        // Reference the trace view item for which tests are being executed
                        this._currentlyExecutingTraceViewItem = viewElement;

                        // Check if we have generated first
                        if (viewElement.getChildren().length < 1)
                            await this.ctGenerate(viewElement);

                        // Request execute
                        await this._ctFeature.requestExecute(viewElement.label, filter, undefined, progress)
                    }
                    else if (viewElement.type == TreeItemType.TestGroup){
                        // Reference the trace view item for which tests are being executed
                        this._currentlyExecutingTraceViewItem = viewElement.getParent();

                        // Find range from group description
                        let strRange : string[] = viewElement.description.toString().split('-');
                        let range : NumberRange = {
                            start: Number(strRange[0]),
                            end: Number(strRange[1])
                        };
            
                        // Request execute with range
                        await this._ctFeature.requestExecute(viewElement.getParent().label, filter, range)
                    }

                    // Resolve action
                    resolve();

                } catch(error) {
                    reject(error)
                } finally {
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

interface completeCT{
    symbolName: string,
    traces: traceWithTestResults[]
}

interface traceWithTestResults{
    trace: CTTrace,
    testCases: CTTestCase[]
}

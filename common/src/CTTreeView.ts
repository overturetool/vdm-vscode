import * as fs from 'fs';
import * as vscode from 'vscode';
import * as Util from "./Util"
import { commands, ExtensionContext, ProgressLocation, Uri, window, window as Window, workspace } from "vscode";
import { CTDataProvider, TestViewElement, TreeItemType } from "./CTDataProvider";
import * as protocol2code from 'vscode-languageclient/lib/protocolConverter';
import { CTTestCase, CTTrace, CTSymbol, NumberRange, VerdictKind} from "./protocol.lspx";
import { CTResultElement, CTResultDataProvider } from './CTResultDataProvider';
import path = require('path');
import { CombinantorialTestingFeature } from './CombinatorialTestingFeature';
import {extensionLanguage} from './extension'

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
    private _batchSizeModifier: number = 1;

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
        this._testView = Window.createTreeView(extensionLanguage+'-ctView', testview_options);
        this._context.subscriptions.push(this._testView);

        // Create results view
        let resultview_options : vscode.TreeViewOptions<CTResultElement> = {
            treeDataProvider: this._resultProvider, 
            showCollapseAll: true
        }
        this._resultView = Window.createTreeView(extensionLanguage+'-ctResultView', resultview_options);
        this._context.subscriptions.push(this._resultView);

        // Register view behavior
        this._context.subscriptions.push(this._testView.onDidExpandElement(  e => this.onDidExpandElement(e.element)));
        this._context.subscriptions.push(this._testView.onDidCollapseElement(e => this.onDidCollapseElement(e.element)));
        this._context.subscriptions.push(this._testView.onDidChangeSelection(e => this.onDidChangeSelection(e.selection[0])));

        // Set button behavior
        this.setButtonsAndContext(canFilter);

        // Show view
        vscode.commands.executeCommand( 'setContext', extensionLanguage+'-ct-show-view', true );
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

    public getTestResults(testIdRange: NumberRange, traceName: string): CTTestCase[]{
        let traces = [].concat(...this._combinatorialTests.map(symbol => symbol.traces));
        let traceWithResult = traces.find(twr => twr.trace.name == traceName);
        return traceWithResult.testCases.slice(testIdRange.start-1, testIdRange.end);
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
        
        // This uses the symbol view element to rebuild any group views within the remaining range of executed test cases and to rebuild the trace to show its verdict
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
        if(testCases[testCases.length-1].id == traceWithResult.testCases[traceWithResult.testCases.length-1].id)
            this.testExecutionFinished();

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

        // Set the new start test number of the _testCaseBatchRange
        this._testCaseBatchRange.start = testCases[testCases.length-1].id;

        // Rebuild the trace view to update verdict for the group and its tests
        this._testProvider.rebuildViewElementIfExpanded(this._currentlyExecutingTraceViewItem);
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
            await Promise.all([this.loadCTs().catch(() => Promise.resolve<completeCT[]>([{symbolName: "", traces: []}])), this._ctFeature.requestTraces()]).then(res =>
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
        // Run Execute on all traces of all symbols
        for (const symbol of this._testProvider.getRoots()) {
            for (const trace of symbol.getChildren()) {
                await this.ctGenerate(trace);
                await this.execute(trace, false).catch(() => {return;});
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
        this._testProvider.handleElementExpanded(viewElement);
        if (viewElement.type == TreeItemType.Trace && viewElement.getChildren().length < 1)
            this.ctGenerate(viewElement);
        
        if (viewElement.type == TreeItemType.TestGroup)
            this._testProvider.rebuildViewFromElement(viewElement);
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

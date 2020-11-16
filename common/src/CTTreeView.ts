import * as fs from 'fs';
import * as vscode from 'vscode';
import * as Util from "./Util"
import { commands, ExtensionContext, ProgressLocation, Uri, window, window as Window, workspace } from "vscode";
import { CTDataProvider, TestViewElement, TreeItemType } from "./CTDataProvider";
import * as protocol2code from 'vscode-languageclient/lib/protocolConverter';
import { CTTestCase, CTSymbol, NumberRange, VerdictKind} from "./protocol.lspx";
import { CTResultElement, CTResultDataProvider } from './CTResultDataProvider';
import path = require('path');
import { CombinantorialTestingFeature } from './CombinatorialTestingFeature';
import {extensionLanguage} from './extension'
import { ErrorCodes, Location } from 'vscode-languageclient';

export class CTTreeView {
    private _testView: vscode.TreeView<TestViewElement>;
    private _resultView: vscode.TreeView<CTResultElement>;
    public currentTraceName: string;
    private _combinatorialTests: completeCT[] = [];
    private readonly _savePath: Uri;
    private _testProvider: CTDataProvider;
    private _resultProvider: CTResultDataProvider;
    private _testCaseBatchRange: NumberRange = {start: 0, end: 0};
    private _executeCanceled: boolean = false;
    private _numberOfUpdatedTests: number = 0;
    private _executingTests: boolean = false;
    public batchSizeModifier = 4;
    private _currentlyExecutingTrace: traceWithTestResults;
    private _isExecutingTestGroup = false;

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
        vscode.commands.executeCommand('setContext', extensionLanguage+'-ct-show-view', true);
    }

    public getSymbolNames(): string[]{
        return this._combinatorialTests.map(ct => ct.symbolName);
    }

    public getTraces(symbolName: string): traceWithTestResults[]{
        return this._combinatorialTests.find(ct => ct.symbolName == symbolName).traces;
    }

    public getNumberOftests(traceName: string): number {
        return [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(trace => trace.name == traceName).testCases.length;
    }

    public getTestResults(testIdRange: NumberRange, traceName: string): CTTestCase[]{
        let traces = [].concat(...this._combinatorialTests.map(symbol => symbol.traces));
        let traceWithResult = traces.find(trace => trace.name == traceName);
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
            
            // Go through files in the folder and read content
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

    private testExecutionFinished()
    {   
        if(!this._executingTests)
            return;
        this._executingTests = false;  
        this._testCaseBatchRange.end = 0;
        this._testCaseBatchRange.start = 0;
        
        // Remove tests not updated by the server
        if(!this._isExecutingTestGroup && !this._executeCanceled && this._currentlyExecutingTrace.testCases.length > this._numberOfUpdatedTests)
            this._currentlyExecutingTrace.testCases.splice(this._numberOfUpdatedTests, this._currentlyExecutingTrace.testCases.length - this._numberOfUpdatedTests)

        this._numberOfUpdatedTests = 0;

        // Set verdict for trace     
        if (this._currentlyExecutingTrace != undefined) {
            if(this._currentlyExecutingTrace.testCases.some(tc => tc.verdict == VerdictKind.Failed))
                this._currentlyExecutingTrace.verdict = VerdictKind.Failed;
            else if(this._currentlyExecutingTrace.testCases.every(tc => tc.verdict != null))
                this._currentlyExecutingTrace.verdict = VerdictKind.Passed;
            else
                this._currentlyExecutingTrace.verdict = null;
        }
        // Rebuild entire tree view to rebuild any group views within the remaining range of executed test cases and to rebuild the trace to show its verdict
        this._testProvider.rebuildViewFromElement();
    }

    public async addNewTestResults(traceName: string, testCases: CTTestCase[]){
        if(this._currentlyExecutingTrace.name != traceName)
            return;

        this._numberOfUpdatedTests = testCases[testCases.length-1].id;
        // Update test results for tests in the trace
        for(let i = 0; i < testCases.length; i++)
        {
            // Update existing test case results
            let oldTestCase: CTTestCase = this._currentlyExecutingTrace.testCases.find(tc => tc.id == testCases[i].id);
            if(oldTestCase)
            {
                oldTestCase.sequence = testCases[i].sequence;
                oldTestCase.verdict = testCases[i].verdict;
            }
            //Add new test case with results
            else
                this._currentlyExecutingTrace.testCases.push(testCases[i]);
        }
        // Handle if user has executed all test groups manually.
        if(this._isExecutingTestGroup && testCases[testCases.length-1].id == this._currentlyExecutingTrace.testCases[this._currentlyExecutingTrace.testCases.length-1].id){
            this.testExecutionFinished();
            this._isExecutingTestGroup = false;
            return;
        }

        // Update batch size
        this._testCaseBatchRange.end = testCases[testCases.length-1].id;

        // Return if batch size isn't big enough to warrent a view update.
        if(this._testCaseBatchRange.end - this._testCaseBatchRange.start < this._testProvider.groupSize * this.batchSizeModifier)
            return;

        // Set the new start test number of the _testCaseBatchRange
        this._testCaseBatchRange.start = testCases[testCases.length-1].id;

        // Rebuild the trace view to update verdict for the group and its tests
        this._testProvider.rebuildViewFromElement([].concat(...this._testProvider.getRoots().map(symbolViewElement => symbolViewElement.getChildren())).find(traceViewElement => traceViewElement.label == this._currentlyExecutingTrace.name));
    }
     
    private setButtonsAndContext(canFilter: boolean){
        ///// Show options ///////
        if (canFilter){
            vscode.commands.executeCommand( 'setContext', 'vdm-ct-show-filter-button', true );
            vscode.commands.executeCommand( 'setContext', 'vdm-ct-show-set-execute-filter-button', true );
        }
        this.showCancelButton(false);
        this.showTreeFilterButton(true);

        ///// Command registration //////
        if(canFilter) {
            this.registerCommand("extension.ctFilteredExecute", (e) => this.execute(e, true));
        }
        this.registerCommand("extension.ctRebuildOutline",      ()  => this.ctRebuildOutline());
        this.registerCommand("extension.ctFullExecute",         ()  => this.ctFullExecute());
        this.registerCommand("extension.ctExecute",             (e) => this.execute(e, false));
        this.registerCommand("extension.ctGenerate",            (e) => this.ctGenerate(e));
        this.registerCommand("extension.ctEnableTreeFilter",    ()  => this.ctTreeFilter(true));
        this.registerCommand("extension.ctDisableTreeFilter",   ()  => this.ctTreeFilter(false));
        this.registerCommand("extension.ctSendToInterpreter",   (e) => this.ctSendToInterpreter(e));
        this.registerCommand("extension.goToTrace",   (e) => this.ctGoToTrace(e));
    }

    private showCancelButton(show: boolean) {
        vscode.commands.executeCommand('setContext', 'vdm-ct-show-run-buttons', !show);
        vscode.commands.executeCommand('setContext', 'vdm-ct-show-cancel-button', show);
    }

    private showTreeFilterButton(show: boolean) {
        vscode.commands.executeCommand('setContext', 'vdm-ct-show-enable-filter-button', show);
        vscode.commands.executeCommand('setContext', 'vdm-ct-show-disable-filter-button', !show);
    }

    private async ctRebuildOutline() {
        if(this._testProvider.getRoots().length > 0){
            let res = await this._ctFeature.requestTraces();
            if (res != null)
                this._combinatorialTests = this.matchLocalSymbolsToServerSymbols(res, this._combinatorialTests);
        }
        else
        {
            await Promise.all([this.loadCTs().catch(() => Promise.resolve<completeCT[]>([{symbolName: "", traces: []}])), this._ctFeature.requestTraces()]).then(res =>
                {
                    // Filter loaded data so it matches servers
                    this._combinatorialTests = this.matchLocalSymbolsToServerSymbols(res[1], res[0]);
                });
        }          

        // Notify tree view of data update
        this._testProvider.rebuildViewFromElement();
    }

    private matchLocalSymbolsToServerSymbols(serverSymbols:CTSymbol[], localSymbols:completeCT[]): completeCT[] {
        return serverSymbols.map(serverSymbol => {
            let localSymbol = localSymbols.find(ct => ct.symbolName == serverSymbol.name);
            
            // Map server CTSymbol to completeCT type and return
            if(!localSymbol)
                return {symbolName: serverSymbol.name, traces: serverSymbol.traces.map(trace => {return {name: trace.name, location: trace.location, verdict: trace.verdict, testCases: []}})};

            // Update all traces with information from server
            localSymbol.traces = serverSymbol.traces.map(serverTrace => {
                let localTrace = localSymbol.traces.find(t => t.name == serverTrace.name);
                // Map CTTrace to traceWithTestResults type and return
                if(!localTrace)
                return {name: serverTrace.name, location: serverTrace.location, verdict: serverTrace.verdict, testCases: []};
                
                // Update local trace location as it can be changed
                localTrace.location = serverTrace.location

                return localTrace;
            });

            return localSymbol;
        });
    }

    private async ctFullExecute() {
        // Make sure we are up-to-date
        await this.ctRebuildOutline();

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
        if(traceViewElement.type != TreeItemType.Trace)
            return;
            
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
            
            // Make the generate request
            return new Promise(async (resolve) => {
                try {
                    await this.generate(traceViewElement);
                } catch(error) {
                    if (error?.code == ErrorCodes.ContentModified){
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

    private async generate(traceViewElement: TestViewElement){
        if(traceViewElement.type != TreeItemType.Trace)
            return;

        let traceWithTestResults: traceWithTestResults = [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(trace => trace.name == traceViewElement.label);
        // Request generate from server
        const numberOfTests = await this._ctFeature.requestGenerate(traceViewElement.label);
            
        // Reset trace verdict
        traceWithTestResults.verdict = null;

        // Check if number of tests from server matches local number of tests
        if(traceWithTestResults.testCases.length != numberOfTests)
        {
            traceWithTestResults.testCases = [];
            // Instatiate testcases for traces.
            for(let i = 1; i <= numberOfTests; i++)
                traceWithTestResults.testCases.push({id: i, verdict: null, sequence: []});
        }
        else
            // reset verdict and results on each test.
            [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(trace => trace.name == traceViewElement.label).testCases.forEach(testCase => {
                testCase.verdict = null;
                testCase.sequence = [];
            });            

        this._testProvider.rebuildViewFromElement(traceViewElement.getParent()); 
    }

    private async ctTreeFilter(enable:boolean){
        // Change button 
        this.showTreeFilterButton(!enable)

        // Set in testProvider
        this._testProvider.filterTree(enable)
    }
    
    private async ctSendToInterpreter(testViewElement: TestViewElement) {
        let traceName = testViewElement.getParent().getParent().label;
        let testId = Number(testViewElement.label);
        this._ctFeature.sendToInterpreter(traceName, testId);
    }

    private async ctGoToTrace(traceViewElement:TestViewElement) {
        if(traceViewElement.type != TreeItemType.Trace)
            return;

        let traceLocation: Location = [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(trace => trace.name == traceViewElement.label).location;
        if(!traceLocation)
            return;

        // Find path of trace
        let path = Uri.parse(traceLocation.uri.toString()).path;

        // Open the specification file containing the trace
        let doc = await workspace.openTextDocument(path);
        
        // Show the file
        window.showTextDocument(doc.uri, { selection: protocol2code.createConverter().asRange(traceLocation.range) , viewColumn: 1 })
    }

    private onDidExpandElement(viewElement : TestViewElement){
        this._testProvider.handleElementExpanded(viewElement);
        
        if (viewElement.type == TreeItemType.Trace && viewElement.getChildren().length < 1)
            this.ctGenerate(viewElement);
        
        if (viewElement.type == TreeItemType.TestGroup)
            this._testProvider.rebuildViewFromElement(viewElement);
    }   

    private onDidCollapseElement(viewElement : TestViewElement){
        this._testProvider.handleElementCollapsed(viewElement);
    }

    private onDidChangeSelection(viewElement : TestViewElement){
        if(viewElement.type == TreeItemType.Test)
            // Get the trace label name from the view items grandparent and find the corresponding trace in _combinatorialTests and set/show the test sequence in the result view
            this._resultProvider.setTestSequenceResults([].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(trace => trace.name == viewElement.getParent().getParent().label).testCases.find(testResult => testResult.id+"" == viewElement.label).sequence);     
    }

    private async execute(viewElement: TestViewElement, filter: boolean){
        if (viewElement.type != TreeItemType.Trace && viewElement.type != TreeItemType.TestGroup)
            throw new Error("CT Execute called on invalid element")

        // Reset canceled
        this._executeCanceled = false;

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
                    this.showCancelButton(true);
         
                    this._executingTests = true;
                    if (viewElement.type == TreeItemType.Trace){
                        this._isExecutingTestGroup = false;
                        // Reference the trace view item for which tests are being executed
                        this._currentlyExecutingTrace = [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(trace => trace.name == viewElement.label);

                        // Create range
                        let lastTestGroup = viewElement.getChildren()[viewElement.getChildren().length-1];
                        let strRange : string[] = lastTestGroup?.description.toString().split('-');
                        let range : NumberRange;
                        if (strRange != undefined)
                            range = {end: Number(strRange[1])};

                        // Request execute
                        await this._ctFeature.requestExecute(viewElement.label, filter, range, progress)
                    }
                    else if (viewElement.type == TreeItemType.TestGroup){
                        this._isExecutingTestGroup = true;
                        // Reference the trace view item for which tests are being executed
                        this._currentlyExecutingTrace = [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(trace => trace.name == viewElement.getParent().label);

                        // Find range from group description
                        let strRange : string[] = viewElement.description.toString().split('-');
                        let range : NumberRange = {
                            start: Number(strRange[0]),
                            end: Number(strRange[1])
                        };
            
                        // Request execute with range
                        await this._ctFeature.requestExecute(viewElement.getParent().label, false, range)
                    }
                    // Resole the request
                    resolve();

                } catch(error) {
                    if (error?.code == ErrorCodes.RequestCancelled){
                        this._executeCanceled = true;
                        resolve();
                    }
                    else if (error?.code == ErrorCodes.ContentModified){
                        if (viewElement.type == TreeItemType.TestGroup){
                            // Possibly just Trace out-of-sync -> try to generate it again
                            this.ctGenerate(viewElement.getParent());
                        }
                        else {
                            // Symbol out-of-sync
                            this.ctRebuildOutline();
                        }
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

interface completeCT{
    symbolName: string,
    traces: traceWithTestResults[]
}

interface traceWithTestResults{
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

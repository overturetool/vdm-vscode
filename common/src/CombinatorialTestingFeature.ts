import * as fs from 'fs';
import * as vscode from 'vscode';
import * as Util from "./Util"
import { commands, ExtensionContext, ProgressLocation, Uri, window, window as Window, workspace } from "vscode";
import { CancellationTokenSource, ClientCapabilities, ErrorCodes, ServerCapabilities, StaticFeature} from "vscode-languageclient";
import { CTDataProvider, CTElement, CTtreeItemType } from "./CTDataProvider";
import * as protocol2code from 'vscode-languageclient/lib/protocolConverter';
import { ExperimentalCapabilities, CTTestCase, CTTrace, CTSymbol, CTFilterOption, CTTracesParameters, CTTracesRequest, CTGenerateParameters, CTGenerateRequest, CTExecuteParameters, CTExecuteRequest, NumberRange} from "./protocol.lspx";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import { CTResultElement, CTResultDataProvider } from './CTResultDataProvider';
import path = require('path');

export class CombinantorialTestingFeature implements StaticFeature {
    private _client: SpecificationLanguageClient;
    private _context: ExtensionContext;
    private _ctDataprovider: CTDataProvider;
    private _ctTreeView : CTTreeView;
    private _ctResultDataprovider: CTResultDataProvider;
    private _cancelToken: CancellationTokenSource;
    private _generateCalls : number = 0;

    constructor(client: SpecificationLanguageClient, context: ExtensionContext, private _filterHandler?: CTFilterHandler) {
        this._client = client;
        this._context = context;
    }
    
    fillClientCapabilities(capabilities: ClientCapabilities): void {
        if(!capabilities.experimental)
            capabilities.experimental = { combinatorialTesting: true };
        else
            Object.assign(capabilities.experimental, {combinatorialTesting: true});
    }

    initialize(capabilities: ServerCapabilities<ExperimentalCapabilities>): void {
        // If server supports CT
        if (capabilities?.experimental?.combinatorialTestProvider) { 
            // Register data provider and view
            this._ctDataprovider = new CTDataProvider();
            this._ctResultDataprovider = new CTResultDataProvider();
            this._ctTreeView = new CTTreeView(this, this._context, this._ctDataprovider, this._ctResultDataprovider, true);

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
            // TODO Add loading information message
            const res = await this._client.sendRequest(CTGenerateRequest.type, params);
            return res.numberOfTests;
        }
        catch (err) {
            Window.showInformationMessage("Combinatorial Test - generation request failed: " + err);
        }
    }

    public async requestExecute(name: string, filtered: boolean = false, range?: NumberRange){
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

            // Send request
            this._ctTreeView.showCancelButton(true);
            const tests = await this._client.sendRequest(CTExecuteRequest.type, params, this._cancelToken.token);

            // If not using progress token, update test results
            if (tests != null)
                this._ctTreeView.setTestResults(name, tests)
        }
        catch (err) {
            if (err?.code == ErrorCodes.RequestCancelled){
                if (err?.data != null){
                    this._ctTreeView.setTestResults(name, err.data);
                }
            }
            else {
                Window.showInformationMessage("Combinatorial Test - execute request failed: " + err);
            }
        }

        // Clean-up
        this._cancelToken.dispose();
        this._cancelToken = undefined;
        partialResultHandlerDisposable?.dispose();
        this._ctTreeView.showCancelButton(false);
    } 

    cancelExecution(){
        this._cancelToken?.cancel();
    }

    private handleExecutePartialResult(tests: CTTestCase[], trace: string){
        if (tests)
            this._ctTreeView.setTestResults(trace, tests);
        else
            Window.showInformationMessage("CT Received Progress without any tests");
    }

    private generateToken() : string {
        return "CombinatorialTestToken-"+Date.now().toString()+(this._generateCalls++).toString();
    }
}

export interface CTFilterHandler {
    setCTFilter() : void;
    getCTFilter() : CTFilterOption[];
}

class CTTreeView {
    private _testView: vscode.TreeView<CTElement>;
    private _resultView: vscode.TreeView<CTResultElement>;
    public currentTraceName: string;
    private _combinatorialTests: completeCT[] = [];
    private readonly _savePath: Uri;

    constructor(
        private _ctFeature: CombinantorialTestingFeature, 
        private _context:ExtensionContext, 
        private _testProvider: CTDataProvider, 
        private readonly _resultProvider: CTResultDataProvider, 
        canFilter: boolean = false
        ){
        // Set save path and load cts
        this._savePath = Uri.joinPath(Uri.parse(this._context.extensionPath), ".generated", "Combinatorial Testing");
        this.loadCTs().then(cts => {
            this._combinatorialTests = cts;
        }).catch(() => {}); // TODO display message if there was an error loading cts from file.

        // Create test view
        let testview_options : vscode.TreeViewOptions<CTElement> = {
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
        this._context.subscriptions.push(this._testView.onDidExpandElement(e => this.onDidExpandElement(e.element)));
        this._context.subscriptions.push(this._testView.onDidCollapseElement(e => this.onDidCollapseElement()));
        this._context.subscriptions.push(this._testView.onDidChangeSelection(e => this.onDidChangeSelection(e.selection[0])));

        // Set button behavior
        this.setButtonsAndContext(canFilter);

        // Show view
        vscode.commands.executeCommand( 'setContext', 'vdm-ct-show-view', true );
    }

    private saveCTs() {            
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
            let files = fs.readdirSync(this._savePath.fsPath, {withFileTypes: true});
            let completeCTs: completeCT[] = [];
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

    public setTestResults(traceName: string, testCases: CTTestCase[]){
        let traceWithResult = [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(twr => twr.trace.name == traceName);

        // Update test results for trace
        for(let i = 0; i < testCases.length; i++)
        {
            let newTestCase: CTTestCase = testCases[i];
            let oldTestCase: CTTestCase = traceWithResult.testCases.find(tc => tc.id == newTestCase.id);
            oldTestCase.sequence = newTestCase.sequence;
            oldTestCase.verdict = newTestCase.verdict;
        }
    
        // Pass a new test batch to ct data provider to update test verdicts
        this._testProvider.updateTestVerdicts(testCases, traceName);
        this.saveCTs();
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
        this.registerCommand("extension.ctViewTreeFilter",      ()  => this.ctViewTreeFilter());
        this.registerCommand("extension.ctSendToInterpreter",   (e) => this.ctSendToInterpreter());
        this.registerCommand("extension.goToTrace",   (e) => this.ctGoToTrace(e));
    }

    showCancelButton(show: boolean) {
        vscode.commands.executeCommand('setContext', 'vdm-ct-show-run-buttons', !show);
        vscode.commands.executeCommand('setContext', 'vdm-ct-show-cancel-button', show);
    }
    
    async ctGoToTrace(e:CTElement) {

        if(e.type != CTtreeItemType.Trace)
            return;

        let trace: CTTrace = [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(twr => twr.trace.name == e.label).trace;
        if(!trace)
            return;

        // Find path of trace
        let path = Uri.parse(trace.location.uri.toString()).path;

        // Open the specification file containing the trace
        let doc = await workspace.openTextDocument(path);
        
        // Show the file
        window.showTextDocument(doc.uri, { selection: protocol2code.createConverter().asRange(trace.location.range) , viewColumn: 1 })
    }

    async ctFilteredExecute(e: CTElement) {
        this.execute(e, true)
    }

    async ctRebuildOutline() {
        const symbols = await this._ctFeature.requestTraces();

        // Pass CTSymbols to ct data provider to build the tree outline
        this._testProvider.updateOutline(symbols);

        // Check if existing outline matches servers
        let traceOutlines = symbols.map(symbol => {return {symbolName: symbol.name, traces: symbol.traces.map(trace => {return {trace: trace, testCases: []}})}});
        if(!this.ctOutlinesMatch(traceOutlines, this._combinatorialTests))
            this._combinatorialTests = traceOutlines;
    }

    private ctOutlinesMatch(ctSymbols1:completeCT[], ctSymbols2:completeCT[]): boolean{
        if(ctSymbols1.length != ctSymbols2.length)
            return false;
        
        for(let i = 0; i < ctSymbols1.length; i++)
        {
            let traces1 = ctSymbols1[i].traces;
            let traces2 = ctSymbols2[i].traces;
            if(traces1.length != traces2.length)
                return false;
            
            for(let l = 0; l < traces1.length; l++)
            {
                let trace1 = traces1[l];
                let trace2 = traces2[l];
                if(trace1.trace.name != trace2.trace.name)
                    return false;
            }
        }
        return true;
    }

    async ctFullExecute() {
        // TODO Maybe switch symbol for a "cancel" symbol and include another command?

        // Run Execute on all traces of all symbols
        await this._testProvider.getSymbols().forEach(async symbol => {
            await symbol.getChildren().forEach(async trace => {
                await this.ctExecute(trace);
            })
        })
    }

    async ctExecute(e: CTElement) {
        this.execute(e, false);
    }

    async ctGenerate(viewElement: CTElement) {
        // Set status bar
        let statusBarMessage = Window.setStatusBarMessage('Generating test cases');

        // Setup loading window
        window.withProgress({
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
                const num = await this._ctFeature.requestGenerate(viewElement.label);
                
                // Check if number of tests from server matches local number of tests
                let traceWithTestResults: traceWithTestResults = [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(twr => twr.trace.name == viewElement.label);
                if(!traceWithTestResults || traceWithTestResults.testCases.length != num)
                    // Instatiate testcases for traces.
                    for(let i = 1; i <= num; i++)
                        traceWithTestResults.testCases.push({id: i, verdict: null, sequence: []});
        

                // Pass the number of tests to ct data provider to add them to the tree
                this._testProvider.setNumberOfTests(num, viewElement.label);

                // Set test verdicts - "n/a" if these have just been generated above.
                this._testProvider.updateTestVerdicts(traceWithTestResults.testCases, traceWithTestResults.trace.name);      
                
                // Remove status bar message
                statusBarMessage.dispose();

                // Resolve action
                resolve();
            });
        });
    }

    ctViewTreeFilter(): void {
        // TODO View the two filtering options and select one
        throw new Error('Method not implemented.');
    }

    ctSendToInterpreter(): void {
        throw new Error('Method not implemented.');
    }

    onDidExpandElement(e : CTElement){
        if (e.type == CTtreeItemType.Trace){
            // TODO Load tests from file and 

            if (e.getChildren().length < 1){
                this.ctGenerate(e);
            }
        }        
    }

    onDidCollapseElement(){
        // Currently no intended behavior
    }

    onDidChangeSelection(viewElement : CTElement){
        // Keep track of the current selected trace
        if(viewElement.type == CTtreeItemType.Trace)
            this.currentTraceName = viewElement.label;

        // Guard access to the test view
        if(viewElement.type == CTtreeItemType.Test){
            // Get the trace label name from the view items grandparent and find the corresponding trace in _combinatorialTests
            let traceWithTestResults: traceWithTestResults = [].concat(...this._combinatorialTests.map(symbol => symbol.traces)).find(twr => twr.trace.name == viewElement.getParent().getParent().label);

            // Set and show the test sequence in the test view
            this._resultProvider.setTestSequenceResults(traceWithTestResults.testCases.find(testResult => testResult.id+"" == viewElement.label).sequence);
        }
    }

    async selectTraceName() : Promise<string> {
        return new Promise<string>(async resolve => {
            let traces = this._testProvider.getTraceNames();
            let res : string;
            if (traces.length < 1)
                Window.showInformationMessage("Request failed: No traces available")
            else {
                await Window.showQuickPick(traces, {canPickMany: false}).then(trace => res = trace)
            }
            resolve(res)
        });
    }

    private async execute(e: CTElement, filter: boolean){
        if (e.type != CTtreeItemType.Trace && e.type != CTtreeItemType.TestGroup)
            throw new Error("CT Execute called on invalid element")

        // Set status bar
        let statusBarMessage = Window.setStatusBarMessage('Executing test cases');

        // Setup loading window
        window.withProgress({
            location: ProgressLocation.Notification,
            title: "Running test generation",
            cancellable: true
        }, (progress, token) => {
            token.onCancellationRequested(() => {
                console.log("User canceled the test execution");
                this._ctFeature.cancelExecution();
            });

            // Do the execute request
            return new Promise(async resolve => {
                if (e.type == CTtreeItemType.Trace){
                    // Check if we have generated first
                    if (e.getChildren().length < 1) {
                        await this.ctGenerate(e);
                    }
        
                    // Request execute
                    await this._ctFeature.requestExecute(e.label, filter)
                }
                else if (e.type == CTtreeItemType.TestGroup){
                    // Find range from group description
                    let strRange : string[] = e.description.toString().split('-');
                    let range : NumberRange = {
                        start: Number(strRange[0]),
                        end: Number(strRange[1])
                    };
        
                    // Request execute with range
                    await this._ctFeature.requestExecute(e.getParent().label, filter, range)
                }
                
                // Remove status bar message
                statusBarMessage.dispose();

                // Resolve action
                resolve();
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

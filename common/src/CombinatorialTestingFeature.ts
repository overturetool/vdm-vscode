import * as fs from 'fs';
import * as vscode from 'vscode';
import * as Util from "./Util"
import { commands, Disposable, ExtensionContext, Uri, window, window as Window, workspace } from "vscode";
import { ClientCapabilities, Location, Position, Range, ServerCapabilities, StaticFeature, Trace} from "vscode-languageclient";
import { CTDataProvider, CTElement, CTtreeItemType } from "./CTDataProvider";
import * as protocol2code from 'vscode-languageclient/lib/protocolConverter';
import { ExperimentalCapabilities, CTTestCase, VerdictKind, CTTrace, CTSymbol, CTFilterOption, CTResultPair, CTTracesParameters, CTTracesRequest, CTGenerateParameters, CTGenerateRequest, CTExecuteParameters, CTExecuteRequest, NumberRange} from "./protocol.lspx";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import { CTResultElement, CTResultDataProvider } from './CTResultDataProvider';

export class CombinantorialTestingFeature implements StaticFeature {
    private _client: SpecificationLanguageClient;
    private _context: ExtensionContext;
    private _ctDataprovider: CTDataProvider;
    private _ctTreeView : CTTreeView;
    private _ctResultDataprovider: CTResultDataProvider;

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
        Window.setStatusBarMessage('Generating test cases', 2000); // TODO match time with request time

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
        Window.setStatusBarMessage('Executing test cases', 2000); // TODO match time with request time

        try {
            // Setup message parameters
            let params: CTExecuteParameters = {name: name};
            if (filtered){
                this._filterHandler.setCTFilter();
                params.filter = await this._filterHandler.getCTFilter();
            }
            if (range)
                params.range = range;
            

            // Send request
            // TODO Add loading information message
            let traceName = this._ctTreeView.currentTraceName;
            const tests = await this._client.sendRequest(CTExecuteRequest.type, params);
            this._ctTreeView.setTestResults(traceName, tests)
            
            // Pass a new test batch to ct data provider to update test verdicts
            this._ctDataprovider.updateTestVerdicts(tests, name);
        }
        catch (err) {
            Window.showInformationMessage("Combinatorial Test - generation request failed: " + err);
        }
    } 
}

export interface CTFilterHandler {
    setCTFilter() : void;
    getCTFilter() : Promise<CTFilterOption[]>;
}

class CTTreeView {
    private _testView: vscode.TreeView<CTElement>;
    private _resultView: vscode.TreeView<CTResultElement>;
    public currentTraceName: string;
    private _ctSymbols: CTSymbol[] = [];
    private _testResults: traceWithTestResults[] = []; // Maps a trace label to test results of a test sequence

    constructor(
        private _ctFeature: CombinantorialTestingFeature, 
        private _context:ExtensionContext, 
        private _testProvider: CTDataProvider, 
        private readonly _resultProvider: CTResultDataProvider, 
        canFilter: boolean = false
        ){

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
        this._context.subscriptions.push(this._testView.onDidCollapseElement(e => this.onDidCollapseElement(e.element)));
        this._context.subscriptions.push(this._testView.onDidChangeSelection(e => this.onDidChangeSelection(e.selection[0])));

        // Set button behavior
        this.setButtonsAndContext(canFilter);

        // Show view
        vscode.commands.executeCommand( 'setContext', 'vdm-ct-show-view', true );
    }

    private saveCTs(saveUri: Uri) {
        // Get workspace folder from save uri
        let workspaceFolder = vscode.workspace.getWorkspaceFolder(saveUri);

        this._ctSymbols.forEach(symbol => {            
            // Create full path
            let savePath = Uri.joinPath(workspaceFolder.uri, ".generated", "Combinatorial_Testing", symbol.name+".json").fsPath;

            // Ensure that path exists
            Util.ensureDirectoryExistence(savePath)
            
            // Add test and test results
            symbol.traces.forEach(t => {
                let tracesWithTestResults = [];
                // if(this._testResults.find(tr => tr))
                // {
                //     let test = this._testResults.get(t.name)
                //     t.test = 
                // }

            });

            // Convert data into JSON
            let json = JSON.stringify(symbol);

            // Asynchronouse save
            fs.writeFile(savePath, json, (err) => {
                if (err) throw err;
                console.log('Write call finished');
            })
        });       
    }

    private saveSymbols(saveUri: Uri) {
        // Get workspace folder from save uri
        let workspaceFolder = vscode.workspace.getWorkspaceFolder(saveUri);

        // Create full path
        let savePath = Uri.joinPath(workspaceFolder.uri, ".generated", "Combinatorial_Testing", "ctSymbols.json").fsPath;

        // Ensure that path exists
        Util.ensureDirectoryExistence(savePath)

        // Convert data into JSON
        let json = JSON.stringify(this._ctSymbols);

        // Asynchronouse save
        fs.writeFile(savePath, json, (err) => {
            if (err) throw err;
            console.log('Write call finished');
        })       
    }


    private async loadCT(filepath : string) : Promise<CTSymbol>{
        return new Promise(async (resolve, reject) => {
            // Asynchroniouse read of filepath
            fs.readFile(filepath, (err, data) => {
                if (err) {
                    reject(err);
                    throw err;
                }

                // Convert JSON to CTSymbol
                let ctsym : CTSymbol = JSON.parse(data.toString());
                return resolve(ctsym)
            });
        })
    }

    public setTestResults(traceName: string, testCases: CTTestCase[]){
        let oldTraceWithResults = this._testResults.find(twr => twr.trace.name == traceName);
        let trace;
        this._ctSymbols.some(symbol => symbol.traces.some(tr => {
            if(tr.name == traceName)
            {
                trace == tr;
                return true;
            }
            else
                return false;
            }));
        if(!oldTraceWithResults){     
            this._testResults.push({trace: trace, cases: testCases});
        }
        else
        {
            testCases.forEach(newTc => {
                let oldTc = oldTraceWithResults.cases.find(tc => tc.id == newTc.id);
                if(oldTc)
                    oldTc = oldTc;
                else
                    oldTraceWithResults.cases.push(newTc);
            });
        }
    }

    setButtonsAndContext(canFilter: boolean){
        ///// Show options ///////
        if (canFilter){
            vscode.commands.executeCommand( 'setContext', 'vdm-ct-show-filter-button', true );
            vscode.commands.executeCommand( 'setContext', 'vdm-ct-show-set-execute-filter-button', true );
        }

        ///// Command registration //////
        if(canFilter) {
            this.registerCommand("extension.ctFilteredExecute", (e) => this.ctFilteredExecute(e));
        }
        this.registerCommand("extension.ctRebuildOutline",      () => this.ctRebuildOutline());
        this.registerCommand("extension.ctFullExecute",         ()  => this.ctFullExecute());
        this.registerCommand("extension.ctExecute",             (e) => this.ctExecute(e));
        this.registerCommand("extension.ctGenerate",            (e) => this.ctGenerate(e));
        this.registerCommand("extension.ctViewTreeFilter",      ()  => this.ctViewTreeFilter());
        this.registerCommand("extension.ctSendToInterpreter",   (e) => this.ctSendToInterpreter(e));
        this.registerCommand("extension.goToTrace",   (e) => this.ctGoToTrace(e));
    }
    async ctGoToTrace(e:CTElement): Promise<any> {
        if(e.type != CTtreeItemType.Trace)
            return;

        let trace: CTTrace = [].concat(...this._ctSymbols.map(symbol => symbol.traces)).find(t => t.name = e.label);
        if(!trace)
            return;

        // Find path of trace
        let path = Uri.parse(trace.location.uri.toString()).path;

        // Open the specification file containing the trace
        let doc = await workspace.openTextDocument(path);
        
        // Show the file
        window.showTextDocument(doc.uri, { selection: protocol2code.createConverter().asRange(trace.location.range) , viewColumn: 1 })
    }

    async ctFilteredExecute(e: CTElement): Promise<void>  {
        throw new Error('Method not implemented.');
    }

    async ctRebuildOutline(): Promise<void> {
        const symbols = await this._ctFeature.requestTraces();

        // Pass CTSymbols to ct data provider to build the tree outline
        this._testProvider.updateOutline(symbols);

        // Keep traces for later lookup and save functionality
        this._ctSymbols = symbols;

        // TODO maybe do a check on loaded files here?
    }

    async ctFullExecute(): Promise<void> {
        // TODO Maybe switch symbol for a "cancel" symbol and include another command?

        // Run Execute on all traces of all symbols
        await this._testProvider.getSymbols().forEach(async symbol => {
            await symbol.getChildren().forEach(async trace => {
                await this.ctExecute(trace);
            })
        })
    }

    async ctExecute(e: CTElement): Promise<void> {
        if (e.type == CTtreeItemType.TestGroup){

        }
        else if (e.type == CTtreeItemType.Trace){

        }
        else {
            throw new Error("CT Execute called on invalid element")
        }
    }

    async ctGenerate(e: CTElement): Promise<void> {
        // Request generate from server
        const num = await this._ctFeature.requestGenerate(e.label);
        
        // Pass the number of tests to ct data provider to add them to the tree
        this._testProvider.setNumberOfTests(num, e.label);

        // TODO maybe do a check on loaded files here?
    }

    ctViewTreeFilter(): void {
        // TODO View the two filtering options and select one
        throw new Error('Method not implemented.');
    }

    ctSendToInterpreter(e: CTElement): void {
        throw new Error('Method not implemented.');
    }

    onDidExpandElement(e : CTElement){
        if (e.type == CTtreeItemType.CTSymbol){
            // TODO Load traces from file if possible
        }
        else if (e.type == CTtreeItemType.Trace){
            // TODO Load tests from file and 

            if (e.getChildren().length < 1){

            }
        }      
    }

    onDidCollapseElement(e : CTElement){
        // Currently no intended behavior
    }

    onDidChangeSelection(e : CTElement){
        // Keep track of the current selected trace
        if(e.type == CTtreeItemType.Trace)
            this.currentTraceName = e.label;

        // Guard access to the test view
        let testResults = this._testResults.find(tr => tr.trace.name == e.getParent().label);
        if(e.type != CTtreeItemType.Test || !testResults)
            return;

        // Set and show the test sequence in the test view
        this._resultProvider.setTestSequenceResults(testResults.cases.find(testResult => testResult.id+"" == e.label).sequence);
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
    cases: CTTestCase[]
}

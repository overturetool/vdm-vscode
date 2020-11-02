import * as fs from 'fs';
import * as vscode from 'vscode';
import * as Util from "./Util"
import { commands, Disposable, ExtensionContext, Uri, window as Window } from "vscode";
import { ClientCapabilities, Location, Position, Range, ServerCapabilities, StaticFeature} from "vscode-languageclient";
import { CTDataProvider, CTElement, treeItemType } from "./CTTreeDataProvider";

import { ExperimentalCapabilities, CTTestCase, VerdictKind, CTTrace, CTSymbol, CTFilterOption, CTResultPair, CTTracesParameters, CTTracesRequest, CTGenerateParameters, CTGenerateRequest, CTExecuteParameters, CTExecuteRequest, NumberRange} from "./protocol.lspx";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";

export class CombinantorialTestingFeature implements StaticFeature {
    private _client: SpecificationLanguageClient;
    private _context: ExtensionContext;
    private _ctDataprovider: CTDataProvider;
    private _ctTreeView : CTTreeView;

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
            this._ctTreeView = new CTTreeView(this, this._context, this._ctDataprovider, (this._filterHandler != undefined));

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

    

    private saveCT(ctsym: CTSymbol, saveUri: Uri) { // FIXME This needs to be changed, as the Trace type no longer include the TestCase's
        // Get workspace folder from save uri
        let workspaceFolder = vscode.workspace.getWorkspaceFolder(saveUri)

        // Create full path
        let savePath = Uri.joinPath(workspaceFolder.uri, ".generated", "Combinatorial_Testing", ctsym.name+".json").fsPath;

        // Ensure that path exists
        Util.ensureDirectoryExistence(savePath)
        
        // Convert data into JSON
        let data = JSON.stringify(ctsym);

        // Asynchronouse save
        fs.writeFile(savePath, data, (err) => {
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

    public async requestTraces(uri?: Uri){
        Window.setStatusBarMessage('Requesting Combinatorial Test Trace Overview', 2000);

        try {
            // Setup message parameters
            let params: CTTracesParameters = {};
            if (uri)
                params.uri = uri.toString();

            // Send request
            const symbols = await this._client.sendRequest(CTTracesRequest.type, params);
            
            // Pass CTSymbols to ct data provider to build the tree outline
            this._ctDataprovider.updateOutline(symbols);
        }
        catch (err) {
            Window.showInformationMessage("Combinatorial Test - trace request failed. " + err);
        }
    }

    public async requestGenerate(name: string){
        Window.setStatusBarMessage('Generating test cases', 2000); // TODO match time with request time

        try {
            // Setup message parameters
            let params: CTGenerateParameters = {name: name};

            // Send request
            // TODO Add loading information message
            const res = await this._client.sendRequest(CTGenerateRequest.type, params);
            
            // Pass the number of tests to ct data provider to add them to the tree
            this._ctDataprovider.setNumberOfTests(res.numberOfTests, name);
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
            const tests = await this._client.sendRequest(CTExecuteRequest.type, params);
            
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
    private _context: ExtensionContext;
    private _view: vscode.TreeView<CTElement>;
    private _provider: CTDataProvider;
    private _ctFeature: CombinantorialTestingFeature; // TODO Maybe do this another way

    constructor(ctFeature: CombinantorialTestingFeature, context:ExtensionContext, provider: CTDataProvider, canFilter: boolean = false){
        this._ctFeature = ctFeature;
        this._context = context;
        this._provider = provider;

        // Create view
        let options : vscode.TreeViewOptions<CTElement> = {
            treeDataProvider: this._provider, 
            showCollapseAll: true
        }
        this._view = Window.createTreeView('ctView', options)
        this._context.subscriptions.push(this._view);

        // Register view behavior
        this._context.subscriptions.push(this._view.onDidExpandElement(e => this.onDidExpandElement(e.element)));
        this._context.subscriptions.push(this._view.onDidCollapseElement(e => this.onDidCollapseElement(e.element)));
        this._context.subscriptions.push(this._view.onDidChangeSelection(e => this.onDidChangeSelection(e.selection[0])));

        // Set button behavior
        this.setButtonsAndContext(canFilter);

        // Show view
        vscode.commands.executeCommand( 'setContext', 'vdm-ct-show-view', true );

    }

    setButtonsAndContext(canFilter: boolean){
        ///// Show options ///////
        if (canFilter){
            vscode.commands.executeCommand( 'setContext', 'vdm-ct-show-filter-button', true );
            vscode.commands.executeCommand( 'setContext', 'vdm-ct-show-set-execute-filter-button', true );
        }

        ///// Command registration //////
        if(canFilter) {
            this.registerCommand("extension.ctFilteredExecute",     (e) => this.ctFilteredExecute(e));
        }
        this.registerCommand("extension.ctRebuildOutline",      (e) => this.ctRebuildOutline(e));
        this.registerCommand("extension.ctFullExecute",         ()  => this.ctFullExecute());
        this.registerCommand("extension.ctExecute",             (e) => this.ctExecute(e));
        this.registerCommand("extension.ctGenerate",            (e) => this.ctGenerate(e));
        this.registerCommand("extension.ctViewTreeFilter",      ()  => this.ctViewTreeFilter());
        this.registerCommand("extension.ctSendToInterpreter",   (e) => this.ctSendToInterpreter(e)); //TODO how do we pass the correct test here?
    }
    ctFilteredExecute(e: any): any {
        throw new Error('Method not implemented.');
    }
    ctRebuildOutline(e: any): any {
        this._ctFeature.requestTraces();
    }
    ctFullExecute(): any {
        throw new Error('Method not implemented.');
    }
    ctExecute(e: any): any {
        throw new Error('Method not implemented.');
    }
    ctGenerate(e: any): any {
        throw new Error('Method not implemented.');
    }
    ctViewTreeFilter(): any {
        throw new Error('Method not implemented.');
    }
    ctSendToInterpreter(e: any): any {
        throw new Error('Method not implemented.');
    }

    onDidExpandElement(e : CTElement){
        if (e.type == treeItemType.CTSymbol){
            // TODO Load traces from file if possible
        }
        else if (e.type == treeItemType.Trace){
        }

        
    }

    onDidCollapseElement(e : CTElement){
        // Currently no intended behavior
    }

    onDidChangeSelection(e : CTElement){
        // TODO For test case, view the test sequence
    }

    async selectTraceName() : Promise<string> {
        return new Promise<string>(async resolve => {
            let traces = this._provider.getTraceNames();
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
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as Util from "./Util"
import { commands, Disposable, ExtensionContext, Uri, window, workspace } from "vscode";
import { ClientCapabilities, Location, Position, Range, ServerCapabilities, StaticFeature} from "vscode-languageclient";
import { CTDataProvider } from "./CTTreeDataProvider";

import { ExperimentalCapabilities, CTTestCase, VerdictKind, CTTrace, CTSymbol, CTFilterOption, CTResultPair, CTTracesParameters, CTTracesRequest, CTGenerateParameters, CTGenerateRequest, CTExecuteParameters, CTExecuteRequest, NumberRange} from "./protocol.lspx";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import { VdmjCTFilterHandler } from "./VdmjCTFilterHandler";

export class CombinantorialTestingFeature implements StaticFeature {
    private _client: SpecificationLanguageClient;
    private _context: ExtensionContext;
    private _runCTDisp: Disposable;
    private _lastUri: Uri;
    private _ctDataprovider: CTDataProvider;

    constructor(client: SpecificationLanguageClient, context: ExtensionContext, private _filterHandler?: CTFilterHandler) {
        this._client = client;
        this._context = context;
        this._ctDataprovider = new CTDataProvider();
    }
    
    fillClientCapabilities(capabilities: ClientCapabilities): void {
        if(!capabilities.experimental)
            capabilities.experimental = { combinatorialTesting: true };
        else
            Object.assign(capabilities.experimental, {combinatorialTesting: true});
    }

    initialize(capabilities: ServerCapabilities<ExperimentalCapabilities>): void {
        // If server supports CT
        // if (capabilities?.experimental?.combinatorialTestingProvider) { // TODO insert when available
            // Register data provider for CT View
            window.registerTreeDataProvider('combinatorialTests', this._ctDataprovider);


            this.registerCommand('extension.setCTFilter', () => this._filterHandler.setCTFilter())

            // TODO Remove
            this.registerCommand('extension.saveCT', () => {
                let case1 : CTResultPair = {case: "seq1", result: "1"}
                let case2 : CTResultPair = {case: "seq2", result: "2"}
                let case3 : CTResultPair = {case: "seq3", result: "3"}
                let case4 : CTResultPair = {case: "seq4", result: "4"}
        
                let res1: CTTestCase = {id: 1, verdict: VerdictKind.Passed, sequence: [case1,case2]}
                let res2: CTTestCase = {id: 2, verdict: VerdictKind.Failed, sequence: [case3]}
                let res3: CTTestCase = {id: 3, verdict: VerdictKind.Filtered, sequence: [case4]}
                
                let loc1: Location = {uri: "uri/location/1", range: Range.create(Position.create(1,0),Position.create(1,1))}
                let loc2: Location = {uri: "uri/location/2", range: Range.create(Position.create(2,0),Position.create(2,1))}
        
                let trace1: CTTrace = {name: "trace1", verdict: VerdictKind.Passed, location: loc1}
                let trace2: CTTrace = {name: "trace2", verdict: VerdictKind.Failed, location: loc2}
        
                let ctsym = {name: "classA", traces:[trace1, trace2]}
                
                this.saveCT(ctsym, vscode.workspace?.workspaceFolders[0].uri)
                
            });

            // TODO Remove
            let filepath = Uri.joinPath( vscode.workspace?.workspaceFolders[0].uri, ".generated", "Combinatorial_Testing", "classA"+".json").fsPath;
            this.registerCommand('extension.loadCT', () => this.loadCT(filepath));
        
        	if(this._filterHandler)
            {
                this.registerCommand('extension.setCTFilter', () => this._filterHandler.setCTFilter());
                this.registerCommand("extension.filteredCTexecution", () => {this.requestExecute("test", true)}); //TODO how do we pass the correct trace name here?
            }

            this.registerCommand("extension.generateCTOutline",     () => this.requestTraces());
            this.registerCommand("extension.generateCTsForTrace",   () => this.requestGenerate());
            this.registerCommand("extension.executeCTsForTrace",    () => this.requestExecute("DEFAULT`Test2")); //TODO how do we pass the correct trace name here?

            this.registerCommand("extension.sendToInterpreter",     () => this.sendToInterpreter("test")); //TODO how do we pass the correct test here?
            this.registerCommand("extension.filterPassedCTs",       () => this._ctDataprovider.filterPassedTests());
            this.registerCommand("extension.filterInconclusiveCTs", () => this._ctDataprovider.filterInconclusiveTests());


        // TODO Further command registration needed here: extension.SendToInterpreter, extension.fullEvaluation, extension.filteredEvaluation
        // } // TODO insert when available
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

    private async sendToInterpreter(test?){

    }

    private async requestTraces(uri?: Uri){
        window.setStatusBarMessage('Requesting Combinatorial Test Trace Overview', 2000);

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
            window.showInformationMessage("Combinatorial Test - trace request failed. " + err);
        }
    }

    private async requestGenerate(name?: string){
        window.setStatusBarMessage('Generating test cases', 2000); // TODO match time with request time

        try {
            // Prompt user selection of trace if non was specified
            if (name == undefined){
                name = await this.uiSelectTrace();
            }

            // If user did exit the selection abort request
            if (name == undefined)
                return;

            // Setup message parameters
            let params: CTGenerateParameters = {name: name};

            // Send request
            // TODO Add loading information message
            const res = await this._client.sendRequest(CTGenerateRequest.type, params);
            
            // Pass the number of tests to ct data provider to add them to the tree
            this._ctDataprovider.setNumberOfTests(res.numberOfTests, name);
        }
        catch (err) {
            window.showInformationMessage("Combinatorial Test - generation request failed: " + err);
        }
    }

    private async requestExecute(name: string, filtered: boolean = false, range?: NumberRange){
        window.setStatusBarMessage('Executing test cases', 2000); // TODO match time with request time

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
            window.showInformationMessage("Combinatorial Test - generation request failed: " + err);
        }
    } 

    private async uiSelectTrace() : Promise<string> {
        return new Promise<string>(async resolve => {
            let traces = this._ctDataprovider.getTraceNames();
            let res : string;
            if (traces.length < 1)
                window.showInformationMessage("Request failed: No traces available")
            else {
                await window.showQuickPick(traces, {canPickMany: false}).then(trace => res = trace)
            }
            resolve(res)
        });
    }
}

export interface CTFilterHandler {
    setCTFilter() : void;
    getCTFilter() : Promise<CTFilterOption[]>;
}

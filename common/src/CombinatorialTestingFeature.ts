import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as Util from "./Util"
import { commands, Disposable, ExtensionContext, Uri, window, workspace } from "vscode";
import { ClientCapabilities, Location, Position, Range, ServerCapabilities, StaticFeature} from "vscode-languageclient";
import { CTDataProvider } from "./CTTreeDataProvider";
import { CombinatorialTestPanel } from "./CombinatorialTestPanel";
import { ExperimentalCapabilities, CTTestCase, VerdictKind, CTTrace, CTSymbol, CTFilterOption, CTResultPair, CTTracesParameters, CTTracesRequest, CTGenerateParameters, CTGenerateRequest, CTExecuteParameters, CTExecuteRequest, NumberRange} from "./protocol.lspx";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import { VdmjCTFilterHandler } from "./VdmjCTFilterHandler";

export class CombinantorialTestingFeature implements StaticFeature {
    private _client: SpecificationLanguageClient;
    private _context: ExtensionContext;
    private _runCTDisp: Disposable;
    private _lastUri: Uri;
    private _filterHandler: CTFilterHandler;

    constructor(client: SpecificationLanguageClient, context: ExtensionContext) {
        this._client = client;
        this._context = context;
        this._filterHandler = new VdmjCTFilterHandler(); // TODO Maybe make this constructor injection?
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
            this.registerCommand('extension.runCT', (inputUri: Uri) => this.runCT(inputUri));
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
        // } // TODO insert when available

        this.registerCTCommand();     
    } 

    private registerCTCommand()
    {
        //this.registerCommand('extension.runCT', (inputUri: Uri) => this.runCT(inputUri));

        const ctDataprovider = new CTDataProvider(workspace.rootPath);
        window.registerTreeDataProvider('combinatorialTests', ctDataprovider);
    
        commands.registerCommand('combinatorialTests.refreshEntry', () =>
            ctDataprovider.refresh()
        );
    }

    private registerCommand = (command: string, callback: (...args: any[]) => any) => {
        let disposable = commands.registerCommand(command, callback)
        this._context.subscriptions.push(disposable);
        return disposable;
    };

    private async runCT(inputUri: Uri, revealCTView: boolean = true) {
        window.setStatusBarMessage('Running Proof Obligation Generation', 2000);

        let uri = inputUri || window.activeTextEditor?.document.uri;
        let dirUri = Uri.file(uri.fsPath.substring(0,uri.fsPath.lastIndexOf(path.sep)));
        this._lastUri = uri;

        try {
            // Create new view or show existing POG View
            CombinatorialTestPanel.createOrShowPanel(Uri.file(this._context.extensionPath), revealCTView);
            CombinatorialTestPanel.currentPanel.displayTraces();
        }
        catch (error) {
            window.showInformationMessage("Proof obligation generation failed. " + error);
        }
    }

    private saveCT(ctsym: CTSymbol, saveUri: Uri) { // TODO This needs to be changed, as the Trace type no longer include the TestCase's
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

    private async requestTraces(uri?: Uri){
        window.setStatusBarMessage('Requesting Combinatorial Test Trace Overview', 2000);

        try {
            // Setup message parameters
            let params: CTTracesParameters;
            if (uri)
                params.uri = uri.toString();

            // Send request
            const symbols = await this._client.sendRequest(CTTracesRequest.type, params);
            
            // FIXME Send to CT tree data provider 
            // FIXME Open CT view if not already open 
        }
        catch (err) {
            window.showInformationMessage("Combinatorial Test - trace request failed. " + err);
        }
    }

    private async requestGenerate(name: string){
        window.setStatusBarMessage('Generating test cases', 2000); // TODO match time with request time

        try {
            // Setup message parameters
            let params: CTGenerateParameters = {name: name};

            // Send request
            // TODO Add loading information message
            const numberOfTests = await this._client.sendRequest(CTGenerateRequest.type, params);
            
            // FIXME Inform CT tree data provider of number of tests
        }
        catch (err) {
            window.showInformationMessage("Combinatorial Test - generation request failed. " + err);
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
            const numberOfTests = await this._client.sendRequest(CTExecuteRequest.type, params);
            
            // FIXME Inform CT tree data provider of number of tests
        }
        catch (err) {
            window.showInformationMessage("Combinatorial Test - generation request failed. " + err);
        }
    }

    
}

export interface CTFilterHandler {
    setCTFilter() : void;
    getCTFilter() : Promise<CTFilterOption[]>;
}
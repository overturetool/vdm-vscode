import path = require("path");
import { commands, Disposable, ExtensionContext, Uri, window, workspace } from "vscode";
import { CTDataProvider } from "./CTTreeDataProvider";
import { ClientCapabilities, Location, Position, Range, ServerCapabilities, StaticFeature, VersionedTextDocumentIdentifier } from "vscode-languageclient";
import { CombinatorialTestPanel } from "./CombinatorialTestPanel";
import { ExperimentalCapabilities, TestCase, TestResult, VerdictKind, Trace, CTSymbol, ctFilterOption } from "./protocol.lspx";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as fs from 'fs'
import { ClientRequest } from "http";
import * as vscode from 'vscode'
import * as Util from "./Util"
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
        if (capabilities?.experimental?.proofObligationProvider) { //TODO match on CT capability instead
            this.registerCommand('extension.runCT', (inputUri: Uri) => this.runCT(inputUri));
            this.registerCommand('extension.setCTFilter', () => this._filterHandler.setCTFilter())

            // TODO Remove
            this.registerCommand('extension.saveCT', () => {
                let case1 : TestCase = {case: "seq1", result: "1"}
                let case2 : TestCase = {case: "seq2", result: "2"}
                let case3 : TestCase = {case: "seq3", result: "3"}
                let case4 : TestCase = {case: "seq4", result: "4"}
        
                let res1: TestResult = {id: 1, verdict: VerdictKind.Passed, cases: [case1,case2]}
                let res2: TestResult = {id: 2, verdict: VerdictKind.Failed, cases: [case3]}
                let res3: TestResult = {id: 3, verdict: VerdictKind.Filtered, cases: [case4]}
                
                let loc1: Location = {uri: "uri/location/1", range: Range.create(Position.create(1,0),Position.create(1,1))}
                let loc2: Location = {uri: "uri/location/2", range: Range.create(Position.create(2,0),Position.create(2,1))}
        
                let trace1: Trace = {id: 1, name: "trace1", verdict: VerdictKind.Passed, location: loc1, testResults: [res1]}
                let trace2: Trace = {id: 2, name: "trace2", verdict: VerdictKind.Failed, location: loc2, testResults: [res2,res3]}
        
                let ctsym = {name: "classA", traces:[trace1, trace2]}
                
                this.saveCT(ctsym, vscode.workspace?.workspaceFolders[0].uri)
                
            });

            // TODO Remove
            let filepath = Uri.joinPath( vscode.workspace?.workspaceFolders[0].uri, ".generated", "Combinatorial_Testing", "classA"+".json").fsPath;
            this.registerCommand('extension.loadCT', () => this.loadCT(filepath));
        }     
    }

    private registerCTCommand()
    {
        //this.registerCommand('extension.runCT', (inputUri: Uri) => this.runCT(inputUri));
        let treeView = window.createTreeView('combinatorialTests', {
            treeDataProvider: new CTDataProvider(workspace.rootPath)
        });
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

    private saveCT(ctsym: CTSymbol, saveUri: Uri) {
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
}

export interface CTFilterHandler {
    setCTFilter() : void;
    getCTFilter() : ctFilterOption[];
}
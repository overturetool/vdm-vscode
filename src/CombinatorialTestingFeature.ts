import * as vscode from 'vscode';
import { commands, ExtensionContext, Uri, window} from "vscode";
import { CancellationTokenSource, ClientCapabilities, ErrorCodes, ServerCapabilities, StaticFeature, WorkDoneProgress, WorkDoneProgressOptions} from "vscode-languageclient";
import { ExperimentalCapabilities, CTTestCase, CTSymbol, CTFilterOption, CTTracesParameters, CTTracesRequest, CTGenerateParameters, CTGenerateRequest, CTExecuteParameters, CTExecuteRequest, NumberRange} from "./protocol.slsp";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import { CTTreeView } from './CTTreeView';
import * as util from "./Util"
import { resolve } from 'path';
import { rejects } from 'assert';

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

            // Set filter
            if (this._filterHandler)
                this.registerCommand('extension.ctSetFilter', () => this._filterHandler.setCTFilter());
                
            // Register view
            this._ctTreeView = new CTTreeView(this, this._context, !!this._filterHandler, this._client.projectSavedDataPath);

            this.registerCommand('extension.ctCancel', () => this.cancelExecution());
        }
    }

    private registerCommand = (command: string, callback: (...args: any[]) => any) => {
        let disposable = commands.registerCommand(command, callback)
        this._context.subscriptions.push(disposable);
        return disposable;
    };

    public async requestTraces(uri?: Uri) : Promise<CTSymbol[]>{
        let barMessage = window.setStatusBarMessage('Requesting Combinatorial Test Trace Overview');

        try {
            // Setup message parameters
            let params: CTTracesParameters = {};
            if (uri)
                params.uri = uri.toString();

            // Send request
            const symbols = await this._client.sendRequest(CTTracesRequest.type, params);
            barMessage.dispose();
            return symbols;
        }
        catch (err) {
            window.showWarningMessage("Combinatorial Test - trace request failed. " + err);
            barMessage.dispose();
            return null;
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
            // if (err?.code != ErrorCodes.ContentModified) // TODO Insert if we don't want sync errors to show
            util.writeToLog(globalThis.clientLogPath, "CT - generation request failed: " + err);
            throw err;
        }
    }

    public async requestExecute(name: string, filtered: boolean = false, range?: NumberRange, progress?: vscode.Progress<{ message?: string; increment?: number }>){
        // Check if already running an execution
        if (this._cancelToken){
            window.showInformationMessage("Combinatorial Test - execute request failed: An execution is already running");
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
            if (this._supportWorkDone && progress != undefined){
                this._progress = 0;
                let workDoneTokenToken = this.generateToken();
                params.workDoneToken = workDoneTokenToken;
                var workDoneProgressHandlerDisposable = this._client.onProgress(WorkDoneProgress.type, workDoneTokenToken, (value) => this.handleExecuteWorkDoneProgress(value, progress));
            }

            // Send request
            const tests = await this._client.sendRequest(CTExecuteRequest.type, params, this._cancelToken.token);

            // If not using progress token, update test results
            if (tests != null)
                this._ctTreeView.addNewTestResults(name, tests)
        }
        catch (err) {
            if (err?.code == ErrorCodes.RequestCancelled){
                if (err?.data != null)
                    this._ctTreeView.addNewTestResults(name, err.data);
            }
            util.writeToLog(globalThis.clientLogPath, "CT - execute request failed: " + err);
            throw err;
        }
        finally{
            // Clean-up
            this._cancelToken.dispose();
            this._cancelToken = undefined;
            partialResultHandlerDisposable?.dispose();
            workDoneProgressHandlerDisposable?.dispose();
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
            window.showInformationMessage("CT Received Progress without any tests");
    }

    private handleExecuteWorkDoneProgress(value: any, progress: vscode.Progress<{ message?: string; increment?: number }>){
        if (value?.percentage != undefined){
            progress.report({message: `${value.message} - ${value.percentage}%`, increment: (value.percentage - this._progress)})
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


import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProgressLocation, window } from 'vscode';

export class CTDataProvider implements vscode.TreeDataProvider<CTElement> {

    private _onDidChangeTreeData: vscode.EventEmitter<CTElement | undefined> = new vscode.EventEmitter<CTElement | undefined>();
    onDidChangeTreeData: vscode.Event<CTElement> = this._onDidChangeTreeData.event;

    private _tests = new Map<string, CTElement[]>();

    private _traces = new Map<string, CTElement[]>();

    private _symbols = new Map<string, CTElement>();

    constructor(private workspaceRoot: string) {
        let ctSymbols = this.getCTSymbols();
        for(let i = 0; i < ctSymbols.length; i++)
        {
            this._symbols.set(ctSymbols[i].id, ctSymbols[i]);
        }

        for(let l = 0; l < ctSymbols.length; l++)
        {
            this._traces.set(ctSymbols[l].id, this.getTraces(ctSymbols[l]));
        }

        this._traces.forEach((value) => {
            value.forEach(trace => {this._tests.set(trace.id, this.getTests(trace))});
        });
    }

    getTreeItem(element): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CTElement): Thenable<CTElement[]> {
        if(!element)
            return Promise.resolve(Array.from(this._symbols.values()));

        if(element.type == treeItemType.CTSymbol)       
            return Promise.resolve(this._traces.get(element.id));

        if(element.type == treeItemType.Trace)
            return Promise.resolve(this._tests.get(element.id));

        return Promise.resolve([]);
    }

    getTests(traceElement, from = 0, to = 40) : CTElement[] {
        let tests = [];
        while(from < to)
        {
            let test = new CTElement("" + from, treeItemType.Test, vscode.TreeItemCollapsibleState.None);
            test.tooltip = "test case tooltip " + from;
            test.id = traceElement.id + "-" + from;
            tests.push(test);
            from++;
        }
        return tests;
    }

    getTraces(ctElement) : CTElement[] {
        let traceGenIter = 0;
        let traces = [];
        while(traceGenIter < 40)
        {
            let trace = new CTElement("trace " + traceGenIter, treeItemType.Trace, vscode.TreeItemCollapsibleState.Collapsed);
            trace.tooltip = "trace tooltip " + traceGenIter;
            trace.id =  ctElement.id + "-" + traceGenIter;
            traces.push(trace);
            traceGenIter++;
        }
        return traces;
    }

    getCTSymbols() : CTElement[] {       
        let ctSymbolsGenIter = 0;
        let ctSymbols = [];
        while(ctSymbolsGenIter < 5)
        {         
            let ctSymbol = new CTElement("CTSymbol " + ctSymbolsGenIter, treeItemType.CTSymbol, vscode.TreeItemCollapsibleState.Collapsed);
            ctSymbol.tooltip = "CTSymbol tooltip " + ctSymbolsGenIter;
            ctSymbol.id = "" + ctSymbolsGenIter;
            ctSymbols.push(ctSymbol)
            ctSymbolsGenIter++;
        }
        return ctSymbols;
    }

    refresh(): void {
        window.withProgress<CTElement[]>({
            location: ProgressLocation.Notification,
            title: "Test generation progress",
            cancellable: true
        }, (progress, token) => {
            token.onCancellationRequested(() => {
                console.log("User canceled the test generation");
            });
            let iter = this._traces.values();
            let traces = iter.next();
            let trace = traces[0];
            progress.report({ increment: 0 , message: "0%"});
            let tests = this._tests.get(trace.id);
            let batchSize = tests.length/4;
            let arrIter = 0;

            // setTimeout(() => {
            //     progress.report({ increment: 10, message: "10%"});
            //     for(arrIter; arrIter < batchSize; arrIter++)
            //     {
            //         this._tests[arrIter].description = "Passed";
            //     }
            //     this._onDidChangeTreeData.fire(trace);
            // }, 1000);

            // setTimeout(() => {
            //     progress.report({ increment: 40, message: "40%"});
            //     for(arrIter; arrIter < batchSize*2; arrIter++)
            //     {
            //         this._tests[arrIter].description = "Passed";
            //     }
            //     this._onDidChangeTreeData.fire(trace);
            // }, 3000);

            // setTimeout(() => {
            //     progress.report({ increment: 70, message: "70%"});
            //     for(arrIter; arrIter < batchSize*3; arrIter++)
            //     {
            //         this._tests[arrIter].description = "Passed";
            //     }
            //     this._onDidChangeTreeData.fire(trace);
            // }, 5000);

            const p = new Promise<CTElement[]>(resolve => {
                setTimeout(() => {
                    resolve();
                    for(arrIter; arrIter < this._tests.values.length; arrIter++)
                    {
                        tests[arrIter].description = "Passed";
                    }
                    this._onDidChangeTreeData.fire(trace);
                }, 1000);
            });
            return p;
        }); 
    }
}

enum treeItemType
{
    CTSymbol = "ctSymbol",
    Trace = "trace",
    Test = "test"
}

class CTElement extends vscode.TreeItem {
    constructor(
    public readonly label: string,
    public readonly type: treeItemType,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        super.contextValue = type;
    }
}

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProgressLocation, window } from 'vscode';

export class CTDataProvider implements vscode.TreeDataProvider<CTElement> {

    private _onDidChangeTreeData: vscode.EventEmitter<CTElement | undefined> = new vscode.EventEmitter<CTElement | undefined>();
    readonly onDidChangeTreeData: vscode.Event<CTElement | undefined> = this._onDidChangeTreeData.event;

    private _tests = [];

    private _traces = [];

    private _symbols = [];

    constructor(private workspaceRoot: string) {}

    getTreeItem(element): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CTElement): Thenable<CTElement[]> {
        if(!element)
            return Promise.resolve(this.getCTSymbols());

        if(element.type == treeItemType.CTSymbol)
        {
            let traces = this.getTraces(element);
            this._traces.push(traces);
            return Promise.resolve(traces);
        }


        if(element.type == treeItemType.Trace)
            return  window.withProgress<CTElement[]>({
                location: ProgressLocation.Notification,
                title: "Test generation progress",
                cancellable: true
            }, (progress, token) => {
                token.onCancellationRequested(() => {
                    console.log("User canceled the test generation");
                });
    
                progress.report({ increment: 0 , message: "0%"});
    
                setTimeout(() => {
                    progress.report({ increment: 10, message: "10%"});
                }, 1000);
    
                setTimeout(() => {
                    progress.report({ increment: 40, message: "40%"});
                }, 1500);
    
                setTimeout(() => {
                    progress.report({ increment: 70, message: "70%"});
                }, 2000);
    
                const p = new Promise<CTElement[]>(resolve => {
                    setTimeout(() => {
                        let tests = this.getTests(element);
                        this._tests.push(tests);
                        resolve(tests);
                    }, 2500);
                });
                return p;
            }); 

        return Promise.resolve([]);
    }

    getTests(traceElement, from = 0, to = 1000) : CTElement[] {
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

            progress.report({ increment: 0 , message: "0%"});

            setTimeout(() => {
                progress.report({ increment: 10, message: "10%"});
            }, 1000);

            setTimeout(() => {
                progress.report({ increment: 40, message: "40%"});
            }, 1500);

            setTimeout(() => {
                progress.report({ increment: 70, message: "70%"});
            }, 2000);

            const p = new Promise<CTElement[]>(resolve => {
                setTimeout(() => {
                    this._onDidChangeTreeData.fire(this._traces[0]);
                    resolve();
                }, 2500);
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

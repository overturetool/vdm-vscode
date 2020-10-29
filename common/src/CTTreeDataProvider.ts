import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProgressLocation, window } from 'vscode';

export class CTDataProvider implements vscode.TreeDataProvider<CTSymbol | Trace | TestCase> {
    constructor(private workspaceRoot: string) {}

    getTreeItem(element): vscode.TreeItem {
        return element;
    }

    getChildren(element?): Thenable<CTSymbol[] | Trace[] | TestCase[]> {
        if(!element)
            return Promise.resolve(this.getCTSymbols());

        if(element instanceof CTSymbol)
            return Promise.resolve(this.getTraces());

        if(element instanceof Trace)
            return  window.withProgress<TestCase[]>({
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
    
                const p = new Promise<TestCase[]>(resolve => {
                    setTimeout(() => {
                        resolve(this.getTestCases());
                    }, 2500);
                });
                return p;
            });
    

        return Promise.resolve([]);
    }

    getTestCases() : TestCase[] {
        let testResIter = 0;
        let testResults = [];
        while(testResIter < 1000)
        {
            let testResult = new TestCase("" + testResIter, vscode.TreeItemCollapsibleState.None);
            testResult.tooltip = "test case tooltip " + testResIter;
            if(testResIter % 2 == 1)
                testResult.description = "passed";
            else
                testResult.description = "failed";
            testResults.push(testResult);
            testResIter++;
        }

        return testResults;
    }

    getTraces() : Trace[] {
        let traceIter = 0;
        let traces = [];
        while(traceIter < 40)
        {
            let trace = new Trace("trace " + traceIter, vscode.TreeItemCollapsibleState.Collapsed);
            trace.tooltip = "trace tooltip " + traceIter;
            traces.push(trace);
            traceIter++;
        }
        return traces;
    }

    getCTSymbols() : CTSymbol[] {       
        let iter = 0;
        let ctSymbols = []
        while(iter < 5)
        {         
            let ctSymbol = new CTSymbol("CTSymbol " + iter, vscode.TreeItemCollapsibleState.Collapsed);
            ctSymbol.tooltip = "CTSymbol tooltip " + iter;
            ctSymbols.push(ctSymbol)
            iter++;
        }

        return ctSymbols;
    }
}

class CTSymbol extends vscode.TreeItem {
    constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}

class Trace extends vscode.TreeItem {
    constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);        
    }
    contextValue = "trace";
}

class TestCase extends vscode.TreeItem {
    constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
    contextValue = "test";
  }


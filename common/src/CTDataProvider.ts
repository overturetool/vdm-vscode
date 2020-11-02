import { trace } from 'console';
import { Event, EventEmitter, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { CTSymbol, CTTestCase, CTTrace, VerdictKind } from './protocol.lspx';

export class CTDataProvider implements TreeDataProvider<CTElement> {

    private _onDidChangeTreeData: EventEmitter<CTElement | undefined> = new EventEmitter<CTElement | undefined>();
    onDidChangeTreeData: Event<CTElement> = this._onDidChangeTreeData.event;

    private _symbols: CTElement[] = []; // Keep reference to the root objects
    private _groupSize: number = 100;
    private _filterPassedTests: boolean = false;
    private _filterInconclusiveTests: boolean = false;

    constructor(symbols?: CTSymbol[], groupSize?: number) {
        if(symbols)
            this.updateOutline(symbols);
        if(groupSize)
            this._groupSize = groupSize;
    }

    public filterPassedTests(): any
    {
        this._filterPassedTests = this._filterPassedTests ? false : true;
        this._onDidChangeTreeData.fire(null);
    }

    public filterInconclusiveTests(): any
    {
        this._filterInconclusiveTests = this._filterInconclusiveTests ? false : true;
        this._onDidChangeTreeData.fire(null);
    }

    public setNumberOfTests(numberOfTests: number, traceName: string)
    {
        let traceElement: CTElement;

        // Find trace element
        for(let i = 0; i < this._symbols.length; i++)
        {
            traceElement = this._symbols[i].getChildren().find(traceEle => traceEle.label === traceName);
            if(traceElement)
                break;
        }

        if(!traceElement)
            return;

        // Remove old test groupes and their tests
        traceElement.getChildren().splice(0,traceElement.getChildren().length);
        traceElement.description = false;

        // Generate test elements and add to trace in groups
        let testgroupes: CTElement[] = [];
        let groupIterator = -1;
        for(var i = 0; i < numberOfTests; i++)
        {
            if(i % this._groupSize == 0)
            {
                groupIterator++;
                testgroupes.push(new CTElement("test group", treeItemType.TestGroup, TreeItemCollapsibleState.Collapsed, (i+1) + "-" + this._groupSize * (groupIterator+1), traceElement));
            }
            testgroupes[groupIterator].getChildren().push(new CTElement("" + (i+1), CTtreeItemType.Test, TreeItemCollapsibleState.None, "n/a", traceElement));
        }

        // Match desciption of group to number of tests for last group.
        testgroupes[groupIterator].description = ((groupIterator*this._groupSize)+1) + "-" + ((groupIterator*this._groupSize) + (i % this._groupSize));

        // Set the test groups for the trace
        traceElement.setChildren(testgroupes);
        
        // Fire element change event with trace element
        this._onDidChangeTreeData.fire(traceElement);
    }

    public updateTraceVerdict(trace: CTTrace)
    {
        let traceElement: CTElement;

        // Find trace element
        for(let i = 0; i < this._symbols.length; i++)
        {
            traceElement = this._symbols[i].getChildren().find(traceEle => traceEle.label === trace.name);
            if(traceElement)
                break;
        }

        if(!traceElement || !trace.verdict)
            return;

        // Set trace verdict
        traceElement.description = VerdictKind[trace.verdict]
    }

    public updateTestVerdicts(tests: CTTestCase[], traceName: string)
    {
        let traceElement: CTElement;

        // Find trace element
        for(let i = 0; i < this._symbols.length; i++)
        {
            traceElement = this._symbols[i].getChildren().find(traceEle => traceEle.label === traceName);
            if(traceElement)
                break;
        }

        if(!traceElement)
            return; // TODO should probably throw an error here or something to tell that it's not possible

        // Iterate over test groupes and update individual test verdicts
        let groupes = traceElement.getChildren();
        tests.forEach(testCase => {
            for(let groupIter = 0; groupIter < groupes.length; groupIter++)
            {
                let testElement = groupes[groupIter].getChildren().find(testEle => testEle.label === testCase.id + "");
                if(testElement)
                {
                    testElement.description = VerdictKind[testCase.verdict];               
                    break;
                }
            }          
        });

        // Fire element change event with trace element
        this._onDidChangeTreeData.fire(traceElement);
    }

    public updateOutline(ctSymbols: CTSymbol[])
    {
        // Iterate over each ctsymbols traces and convert to CTElement types and replace existing items or add as needed.
        ctSymbols.forEach(ctSymbol => {
            let index = this._symbols.findIndex(s => s.label === ctSymbol.name);
                
            if (index > -1)
                this._symbols[index].updateChildren(ctSymbol.traces.map(t => new CTElement(t.name, CTtreeItemType.Trace, TreeItemCollapsibleState.Collapsed)));

            else
            {
                let ctElement = new CTElement(ctSymbol.name, CTtreeItemType.CTSymbol, TreeItemCollapsibleState.Collapsed); 
                ctElement.setChildren(ctSymbol.traces.map(t => new CTElement(t.name, CTtreeItemType.Trace, TreeItemCollapsibleState.Collapsed, "", ctElement)))  
                this._symbols.push(ctElement);
            }        
        });
        
        // Fire event telling the view that the root (CTSymbols) has changed by passing null
        this._onDidChangeTreeData.fire(null);
    }

    public getSymbols(): CTElement[]{
        return this._symbols;
    }

    public clearOutline()
    {
        this._symbols = [];

        // Fire event telling the view that the CTSymbols (roots) have changed by passing null
        this._onDidChangeTreeData.fire(null);
    }

    getTreeItem(element: CTElement): TreeItem {
        return element;
    }

    getChildren(element?: CTElement): Thenable<CTElement[]> {
        // Handle root query
        if(!element)
            return Promise.resolve(this._symbols);
        
        let elementsToReturn = element.getChildren();

        // Filter passed and/or inconclusive tests if true
        if(this._filterPassedTests)
            elementsToReturn = elementsToReturn.filter(e => e.type != CTtreeItemType.Test || e.description != VerdictKind[VerdictKind.Passed]);
        if(this._filterInconclusiveTests)
            elementsToReturn = elementsToReturn.filter(e => e.type != CTtreeItemType.Test || e.description != VerdictKind[VerdictKind.Inconclusive]);

        return Promise.resolve(elementsToReturn);
    }

    getTraceNames(): string[] {
        let res : string[] = [];
        this._symbols.forEach((symbol) => {
            symbol.getChildren().forEach(trace => res.push(trace.label));
        })
        return res;
    }
}

export enum CTtreeItemType
{
    CTSymbol = "ctSymbol",
    Trace = "trace",
    Test = "test",
    TestGroup = "testgroup"
}

export class CTElement extends TreeItem {
    
    private _children: CTElement[] = [];
    constructor(
    public readonly label: string,
    public readonly type: CTtreeItemType,
    public readonly collapsibleState: TreeItemCollapsibleState,
    description = "",
    private readonly _parent: CTElement = undefined ) {
        super(label, collapsibleState);
        super.contextValue = type;
        if(description === "")
            super.description = false;
        else
            super.description = description;
    }

    public getParent(): CTElement{
        return this._parent;
    }

    public getChildren(): CTElement[]{
        return this._children
    }

    public setChildren(children: CTElement[]){
        this._children = children;
    }

    public updateChildren(children: CTElement[]){
        children.forEach(newChild => {
            let index = this._children.findIndex(oldChild => oldChild.label === newChild.label); 
            if (index > -1)
                this._children[index] = newChild;
            else
                this._children.push(newChild);
        });
    }

    public removeChildren(labels: string[]){
        labels.forEach(label => {
            let index = this._children.findIndex(child => child.label === label); 
            if (index > -1)
                this._children.splice(index,1);    
        });
    }
}

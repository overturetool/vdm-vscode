import { timeStamp, trace } from 'console';
import { performance } from 'perf_hooks';
import { Event, EventEmitter, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { CTTreeView } from './CombinatorialTestingFeature';
import { NumberRange, VerdictKind } from './protocol.lspx';

export class CTDataProvider implements TreeDataProvider<TestViewElement> {

    private _onDidChangeTreeData: EventEmitter<TestViewElement | undefined> = new EventEmitter<TestViewElement | undefined>();
    onDidChangeTreeData: Event<TestViewElement> = this._onDidChangeTreeData.event;

    private _groupSize: number = 1000;
    private _filterPassedTests: boolean = false;
    private _filterInconclusiveTests: boolean = false;
    private _roots: TestViewElement[];

    constructor(
        private _ctView: CTTreeView) {
    }

    public rebuildViewFromElement(viewElement?: TestViewElement)
    {
        this._onDidChangeTreeData.fire(viewElement);
    }

    public filterPassedTests(): any
    {
        this._filterPassedTests = this._filterPassedTests ? false : true;
        this._roots.forEach(symbolElement => {
            symbolElement.getChildren().forEach(traceElement => traceElement.getChildren().forEach(groupElement => {
                this._onDidChangeTreeData.fire(groupElement);
            }))    
        });
    }

    public filterInconclusiveTests(): any
    {
        this._filterInconclusiveTests = this._filterInconclusiveTests ? false : true;
        this._roots.forEach(symbolElement => {
            symbolElement.getChildren().forEach(traceElement => traceElement.getChildren().forEach(groupElement => {
                if(groupElement.collapsibleState == TreeItemCollapsibleState.Expanded)
                this._onDidChangeTreeData.fire(groupElement);
            }))    
        });
    }

    getRoots(): TestViewElement[] {
        return this._roots;
    }

    getTreeItem(element: TestViewElement): TreeItem {
        return element;
    }

    getChildren(element?: TestViewElement): Thenable<TestViewElement[]> {
        // Handle root query
        if(!element){
            let symbolNames = this._ctView.getSymbolNames();
            this._roots = symbolNames.map(symbolName => new TestViewElement(symbolName, TreeItemType.CTSymbol, TreeItemCollapsibleState.Collapsed));
            return Promise.resolve(this._roots);
        }

        if(element.type == TreeItemType.CTSymbol)
        {
            let ctTraces = this._ctView.getTraces(element.label);
            element.setChildren(ctTraces.map(trace => new TestViewElement(trace.name, TreeItemType.Trace, TreeItemCollapsibleState.Collapsed, "", element)));

            return Promise.resolve(element.getChildren());
        }

        if(element.type == TreeItemType.Trace)
        {
            let numberOfTests: number = this._ctView.getNumberOftests(element.label);

            // Generate test groups
            let testGroups: TestViewElement[] = [];
            let iterMax = Math.ceil(numberOfTests/this._groupSize);
            for(let i = 0; i < iterMax; i++)
            {
                testGroups.push(new TestViewElement("test group", TreeItemType.TestGroup, TreeItemCollapsibleState.Collapsed, (1 + i * this._groupSize) + "-" + ((i+1) * this._groupSize), element));
            }
            element.setChildren(testGroups);

            return Promise.resolve(element.getChildren());
        }

        if(element.type == TreeItemType.TestGroup)
        {
            // Generate test views for the group
            let strRange : string[] = element.description.toString().split('-');
            let range: NumberRange = {start: parseInt(strRange[0])-1, end: parseInt(strRange[1])};
            let testsViewElements = this._ctView.getTestResults(range, element.getParent().label).map(testCase => new TestViewElement(testCase.id+"", TreeItemType.Test, TreeItemCollapsibleState.None, testCase.verdict ? VerdictKind[testCase.verdict] : "n/a", element));
            
            if(this._filterPassedTests)
                testsViewElements = testsViewElements.filter(twe => twe.description != VerdictKind[VerdictKind.Passed]);        

            if(this._filterInconclusiveTests)
                testsViewElements = testsViewElements.filter(twe => twe.description != VerdictKind[VerdictKind.Inconclusive]);

            return Promise.resolve(testsViewElements);
        }

        // Handle default
        return Promise.resolve([])
    }
}

export enum TreeItemType
{
    CTSymbol = "ctSymbol",
    Trace = "trace",
    Test = "test",
    TestGroup = "testgroup"
}

export class TestViewElement extends TreeItem {
    private _children: TestViewElement[] = [];
    constructor(
    public readonly label: string,
    public readonly type: TreeItemType,
    public readonly collapsibleState: TreeItemCollapsibleState,
    description = "",
    private readonly _parent: TestViewElement = undefined) {
        super(label, collapsibleState);
        super.contextValue = type;
        if(description === "")
            super.description = false;
        else
            super.description = description;
    }

    public getParent(): TestViewElement {
        return this._parent;
    }

    public getChildren(): TestViewElement[]{
        return this._children;
    }

    public setChildren(testViewElements: TestViewElement[]){
        this._children = testViewElements;
    }
}

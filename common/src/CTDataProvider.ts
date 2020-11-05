import { Event, EventEmitter, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { CTTreeView } from './CombinatorialTestingFeature';
import { NumberRange, VerdictKind } from './protocol.lspx';

export class CTDataProvider implements TreeDataProvider<TestViewElement> {

    private _onDidChangeTreeData: EventEmitter<TestViewElement | undefined> = new EventEmitter<TestViewElement | undefined>();
    onDidChangeTreeData: Event<TestViewElement> = this._onDidChangeTreeData.event;

    private _minGroupSize: number = 100;
    private _maxGroupSize: number = 1000;
    private _groupSizePercentage = 0.1;
    private _roots: TestViewElement[];
    private _currentlyExpandedGroups: TestViewElement[] = [];
    private _cashedGroups: TestViewElement[] = [];
    private _filter: boolean = false;

    constructor(
        private _ctView: CTTreeView) {
    }

    public rebuildViewFromElement(viewElement?: TestViewElement)
    {
        this._onDidChangeTreeData.fire(viewElement);
    }

    public toggleFilteringForTestGroups(): any
    {
        this._filter = this._filter ? false : true;
        this._currentlyExpandedGroups.forEach(group => {
            this._onDidChangeTreeData.fire(group);
        });
    }

    public elementExpanded(element: TestViewElement){
        if(this._currentlyExpandedGroups.indexOf(element) == -1)
            this._currentlyExpandedGroups.push(element);
    }

    public elementCollapsed(element: TestViewElement){
        let elementIndex = this._currentlyExpandedGroups.indexOf(element);
        if(elementIndex != -1)
            this._currentlyExpandedGroups.splice(elementIndex,1);
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
            let percentageSize = numberOfTests * this._groupSizePercentage;
            let groupSize = this._minGroupSize > percentageSize ? this._minGroupSize : percentageSize > this._maxGroupSize ? this._maxGroupSize: percentageSize;
            let groups = Math.ceil(numberOfTests/groupSize);
            for(let i = 0; i < groups; i++)
            {
                testGroups.push(new TestViewElement("test group", TreeItemType.TestGroup, TreeItemCollapsibleState.Collapsed, (1 + i * groupSize) + "-" + (groupSize >= numberOfTests ? numberOfTests + groupSize * i : groupSize * (i+1)), element));
                numberOfTests -= groupSize;
            }
            element.setChildren(testGroups);

            return Promise.resolve(element.getChildren());
        }

        if(element.type == TreeItemType.TestGroup)
        {
            if(this._cashedGroups.indexOf(element) == -1)
                this._cashedGroups.push(element);
            // Generate test views for the group
            let strRange : string[] = element.description.toString().split('-');
            let range: NumberRange = {start: parseInt(strRange[0])-1, end: parseInt(strRange[1])};
            let testsViewElements = this._ctView.getTestResults(range, element.getParent().label).map(testCase => new TestViewElement(testCase.id+"", TreeItemType.Test, TreeItemCollapsibleState.None, testCase.verdict ? VerdictKind[testCase.verdict] : "n/a", element));
            
            if(this._filter)           
                testsViewElements = testsViewElements.filter(twe => twe.description != VerdictKind[VerdictKind.Passed] && twe.description != VerdictKind[VerdictKind.Inconclusive]);

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
    // For checking if a testgroup is filtered
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

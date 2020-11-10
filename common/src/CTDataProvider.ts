import { Event, EventEmitter, ExtensionContext, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { CTTreeView } from './CTTreeView';
import { NumberRange, VerdictKind } from './protocol.lspx';
import { Icons } from './Icons'

export class CTDataProvider implements TreeDataProvider<TestViewElement> {

    private _onDidChangeTreeData: EventEmitter<TestViewElement | undefined> = new EventEmitter<TestViewElement | undefined>();
    public onDidChangeTreeData: Event<TestViewElement> = this._onDidChangeTreeData.event;

    private _onTreeUpdated: EventEmitter<undefined> = new EventEmitter<undefined>();
    public onTreeUpdated: Event<undefined> = this._onTreeUpdated.event;

    public readonly groupSize: number = 300;
    private _roots: TestViewElement[];
    private _filter: boolean = false;
    private _icons: Icons;
    constructor(
        private _ctView: CTTreeView,
        private _context: ExtensionContext) {
            this._icons = new Icons(this._context);
    }

    public rebuildViewFromElement(viewElement?: TestViewElement)
    {   
        this._onDidChangeTreeData.fire(viewElement);
    }

    public filterTree(enable: boolean): any
    {
        this._filter = enable;
        this._roots.forEach(symbol => symbol.getChildren().forEach(trace =>  this.rebuildViewFromElement(trace)));
    }

    public handleElementExpanded(element: TestViewElement){
        element.expandedState = TreeItemCollapsibleState.Expanded;
    }

    public handleElementCollapsed(element: TestViewElement){
        element.expandedState = TreeItemCollapsibleState.Collapsed;
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
            // Build symbols
            let symbolNames = this._ctView.getSymbolNames();
            this._roots = symbolNames.map(symbolName => {
                let newSymbol = new TestViewElement(symbolName, TreeItemType.CTSymbol, TreeItemCollapsibleState.Collapsed);

                let oldSymbolIndex = this._roots.findIndex(symbol => newSymbol.label == symbol.label);
                if(oldSymbolIndex != -1)
                    newSymbol.setChildren(this._roots[oldSymbolIndex].getChildren());

                return newSymbol;
            });

            return Promise.resolve(this._roots);
        }

        if(element.type == TreeItemType.CTSymbol){
            // Build view from symbol
            let ctTraces = this._ctView.getTraces(element.label);
            let oldTraces = element.getChildren();

            // Generate all trace view elements for the symbol
            element.setChildren(ctTraces.map(trace => {
                let traceViewElement = new TestViewElement(trace.name, TreeItemType.Trace, TreeItemCollapsibleState.Collapsed, "", element, this.verdictToIconPath(trace.verdict),trace.verdict);

                let oldTraceIndex = oldTraces.findIndex(t => t.label == trace.name);
                if(oldTraceIndex != -1)
                {
                    traceViewElement.setChildren(oldTraces[oldTraceIndex].getChildren());
                    traceViewElement.expandedState = oldTraces[oldTraceIndex].expandedState;
                }

                return traceViewElement;
            }));

            return Promise.resolve(element.getChildren());
        }

        if(element.type == TreeItemType.Trace){
            // Build view from traces
            let numberOfTests: number = this._ctView.getNumberOftests(element.label);
            let testGroups: TestViewElement[] = [];

            let groups = Math.ceil(numberOfTests/this.groupSize);

            // Generate all test group view elements for the trace
            for(let i = 0; i < groups; i++)
            {
                let testIdRange: NumberRange = {start: (1 + i * this.groupSize), end: (this.groupSize >= numberOfTests ? numberOfTests + this.groupSize * i : this.groupSize * (i+1))};
                let results = this._ctView.getTestResults(testIdRange, element.label);
                let verdict = !results || results.some(tc => tc.verdict == null) ? null : results.some(tc => tc.verdict == VerdictKind.Failed) ? VerdictKind.Failed : VerdictKind.Passed;

                testGroups.push(new TestViewElement(
                    "test group", 
                    TreeItemType.TestGroup, 
                    i < element.getChildren().length ? element.getChildren()[i].expandedState : TreeItemCollapsibleState.Collapsed, 
                    testIdRange.start + "-" + testIdRange.end, 
                    element, 
                    this.verdictToIconPath(verdict),
                    verdict
                ));

                numberOfTests -= this.groupSize;
            }
            element.setChildren(testGroups);

            return Promise.resolve(this.applyFilters(element.getChildren()));
        }

        if(element.type == TreeItemType.TestGroup){
            // Build view from test group
            let strRange : string[] = element.description.toString().split('-');
            let testIdRange: NumberRange = {start: parseInt(strRange[0]), end: parseInt(strRange[1])};

            // Generate all test view elements for the test group
            let testsViewElements = this._ctView.getTestResults(testIdRange, element.getParent().label).map(testCase => 
                new TestViewElement(
                    testCase.id+"", 
                    TreeItemType.Test, 
                    TreeItemCollapsibleState.None, 
                    testCase.verdict ? VerdictKind[testCase.verdict] : "n/a", 
                    element, 
                    this.verdictToIconPath(testCase.verdict),
                    testCase.verdict
                )
            );      
            element.setChildren(testsViewElements);   
            return Promise.resolve(this.applyFilters(element.getChildren()));
        }

        // Handle default
        return Promise.resolve([])
    }

    private verdictToIconPath(verdict: VerdictKind)
    {
        return verdict == VerdictKind.Passed ? this._icons.getIcon("passed.svg") : 
            verdict == VerdictKind.Failed ? this._icons.getIcon("failed.svg") : 
                verdict == VerdictKind.Inconclusive ? this._icons.getIcon("inconclusive.svg") : 
                    verdict == VerdictKind.Filtered ? this._icons.getIcon("filtered.svg") : 
                        null;
    }

    private applyFilters(viewElements: TestViewElement[]): TestViewElement[]
    {         
        return this._filter ? viewElements.filter(viewElement => viewElement.verdict != VerdictKind.Passed && viewElement.verdict != VerdictKind.Inconclusive && viewElement.verdict != VerdictKind.Filtered): viewElements;
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
    public expandedState: TreeItemCollapsibleState;
    constructor(
    public readonly label: string,
    public readonly type: TreeItemType,
    public readonly collapsibleState: TreeItemCollapsibleState,
    public description = "",
    private readonly _parent: TestViewElement = undefined,
    public iconPath = null,
    public verdict: VerdictKind = null) {
        super(label, collapsibleState);
        super.contextValue = type;
        if(description === "")
            super.description = false;
        else
            super.description = description;
        this.expandedState = collapsibleState;
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

// SPDX-License-Identifier: GPL-3.0-or-later

import { Event, EventEmitter, ExtensionContext, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { CTTreeView } from './CTTreeView';
import { NumberRange, VerdictKind } from '../../protocol/combinatorialTesting';
import { Icons } from '../../../Icons'

export class CTDataProvider implements TreeDataProvider<TestViewElement> {

    private _onDidChangeTreeData: EventEmitter<TestViewElement | undefined> = new EventEmitter<TestViewElement | undefined>();
    public onDidChangeTreeData: Event<TestViewElement> = this._onDidChangeTreeData.event;

    private _onTreeUpdated: EventEmitter<undefined> = new EventEmitter<undefined>();
    public onTreeUpdated: Event<undefined> = this._onTreeUpdated.event;

    public readonly groupSize: number = 300;
    private _roots: TestViewElement[];
    private _filter: boolean = false;
    private _icons: Icons;
    private _verdictKindToShow: VerdictKind[]; // variable used to store the filter settings
    constructor(
        private _ctView: CTTreeView,
        private _context: ExtensionContext) {
        this._icons = new Icons(this._context);
    }

    public rebuildViewFromElement(viewElement?: TestViewElement) {
        this._onDidChangeTreeData.fire(viewElement);
    }

    public filterTree(enable: boolean, toShow?: VerdictKind[]): any {
        this._filter = enable;
        this._verdictKindToShow = toShow; // # store the filter settings with the added variable _verdictKindToShow
        this._roots.forEach(symbol => symbol.getChildren().forEach(trace => this.rebuildViewFromElement(trace)));
    }

    public handleElementExpanded(element: TestViewElement) {
        element.expandedState = TreeItemCollapsibleState.Expanded;
    }

    public handleElementCollapsed(element: TestViewElement) {
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
        if (!element) {
            // Build symbols
            let symbolNames = this._ctView.getSymbolNames();
            this._roots = symbolNames.map(symbolName => {
                let newSymbol = new TestViewElement(symbolName, TreeItemType.CTSymbol, TreeItemCollapsibleState.Collapsed);

                let oldSymbolIndex = this._roots.findIndex(symbol => newSymbol.label == symbol.label);
                if (oldSymbolIndex != -1)
                    newSymbol.setChildren(this._roots[oldSymbolIndex].getChildren());

                return newSymbol;
            });

            return Promise.resolve(this._roots);
        }

        if (element.type == TreeItemType.CTSymbol) {
            // Build view from symbol
            let ctTraces = this._ctView.getTraces(element.label);
            let oldTraces = element.getChildren();

            // Generate all trace view elements for the symbol
            element.setChildren(ctTraces.map(trace => {
                let traceViewElement = new TestViewElement(trace.name, TreeItemType.Trace, TreeItemCollapsibleState.Collapsed, "", element, this.verdictToIconPath(trace.verdict), trace.verdict);

                let oldTraceIndex = oldTraces.findIndex(t => t.label == trace.name);
                if (oldTraceIndex != -1) {
                    traceViewElement.setChildren(oldTraces[oldTraceIndex].getChildren());
                    traceViewElement.expandedState = oldTraces[oldTraceIndex].expandedState;
                }

                return traceViewElement;
            }));

            return Promise.resolve(element.getChildren());
        }

        if (element.type == TreeItemType.Trace) {
            // Build view from traces
            let numberOfTests: number = this._ctView.getNumberOftests(element.label);
            let testGroups: TestViewElement[] = [];

            let groups = Math.ceil(numberOfTests / this.groupSize);

            // Generate all test group view elements for the trace
            for (let i = 0; i < groups; i++) {
                let testRange: NumberRange = { start: (1 + i * this.groupSize), end: (this.groupSize >= numberOfTests ? numberOfTests + this.groupSize * i : this.groupSize * (i + 1)) };
                let results = this._ctView.getTestResults(testRange, element.label);
                let resultsLength = results.length;
                let verdict = !results ? null : VerdictKind.Passed;
                let toShow = !this._filter; // variable used to decide if we want to show the group or not
                for (let k = 0; k < resultsLength; k++) {
                    if (!toShow && this._verdictKindToShow.includes(results[k].verdict)) // if we find, in a group, a verdict that corresponds to a _verdictKindToShow(verdict that we want to show) then we can have to show this group (if the group contains at least 1 desired verdict then the group is selected)
                        toShow = true;

                    if (results[k].verdict == null) {
                        verdict = null;
                        break;
                    }
                    if (results[k].verdict == VerdictKind.Failed) {
                        verdict = VerdictKind.Failed;
                        break;
                    }
                }
                if (toShow)
                    testGroups.push(new TestViewElement(
                        "test group",
                        TreeItemType.TestGroup,
                        i < element.getChildren().length ? element.getChildren()[i].expandedState : TreeItemCollapsibleState.Collapsed,
                        testRange.start + "-" + testRange.end,
                        element,
                        this.verdictToIconPath(verdict),
                        verdict
                    ));

                numberOfTests -= this.groupSize;
            }
            element.setChildren(testGroups);

            return Promise.resolve(element.getChildren());
        }

        if (element.type == TreeItemType.TestGroup) {
            // Build view from test group
            let strRange: string[] = element.description.toString().split('-');
            let testRange: NumberRange = { start: parseInt(strRange[0]), end: parseInt(strRange[1]) };

            // Generate all test view elements for the test group

            let testsResults = this._ctView.getTestResults(testRange, element.getParent().label);
            let testsResultsLength = testsResults.length;
            let testsViewElements = [];
            for (let i = 0; i < testsResultsLength; i++) {
                if (!this._filter || this._verdictKindToShow.includes(testsResults[i].verdict)) // filter tests and show only the ones whick correspond to the right verdict
                    testsViewElements.push(new TestViewElement(
                        testsResults[i].id + "",
                        TreeItemType.Test,
                        TreeItemCollapsibleState.None,
                        testsResults[i].verdict ? VerdictKind[testsResults[i].verdict] : "n/a",
                        element,
                        this.verdictToIconPath(testsResults[i].verdict),
                        testsResults[i].verdict
                    ))
            }
            element.setChildren(testsViewElements);
            return Promise.resolve(element.getChildren());
        }

        // Handle default
        return Promise.resolve([])
    }

    private verdictToIconPath(verdict: VerdictKind) {
        return verdict == VerdictKind.Passed ? this._icons.getIcon("passed.svg") :
            verdict == VerdictKind.Failed ? this._icons.getIcon("failed.svg") :
                verdict == VerdictKind.Inconclusive ? this._icons.getIcon("inconclusive.svg") :
                    verdict == VerdictKind.Filtered ? this._icons.getIcon("filtered.svg") :
                        null;
    }
}

export enum TreeItemType {
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
        if (description === "")
            super.description = false;
        else
            super.description = description;
        this.expandedState = collapsibleState;
    }

    public getParent(): TestViewElement {
        return this._parent;
    }

    public getChildren(): TestViewElement[] {
        return this._children;
    }

    public setChildren(testViewElements: TestViewElement[]) {
        this._children = testViewElements;
    }
}

// SPDX-License-Identifier: GPL-3.0-or-later

import { Event, EventEmitter, ExtensionContext, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from "vscode";
import { VerdictKind } from "../../protocol/combinatorialTesting";
import { Icons } from "../../../Icons";
import { CTViewDataStorage } from "./CTViewDataStorage";
import { CTTreeItem, TestGroupItem, TraceGroupItem, TraceItem } from "./CTTreeItems";

const defaultGroupSize = 300;

export default class CTTestTreeDataProvider implements TreeDataProvider<CTTreeItem> {
    // Event to signal that the root has changed, so the view should be updated
    private _onDidChangeTreeData: EventEmitter<CTTreeItem | undefined> = new EventEmitter<CTTreeItem | undefined>();
    public onDidChangeTreeData: Event<CTTreeItem> = this._onDidChangeTreeData.event;

    // Variable used to determine the size of the groups that the test cases are divided into.
    private _groupSize: number;
    public get groupSize(): number {
        return this._groupSize;
    }
    public set groupSize(value: number) {
        this._groupSize = value > 0 ? value : defaultGroupSize;
        this.rebuildViewFromElement();
    }
    private _roots: CTTreeItem[];
    private _filter: boolean = false;
    private _icons: Icons;
    private _verdictKindToShow: VerdictKind[]; // variable used to store the filter settings
    constructor(private _dataStorage: CTViewDataStorage, private _context: ExtensionContext, groupSize: number = defaultGroupSize) {
        this._icons = new Icons(this._context);
        this.groupSize = groupSize;
    }

    rebuildViewFromElement(viewElement?: CTTreeItem) {
        this._onDidChangeTreeData.fire(viewElement);
    }

    filterTree(enable: boolean, toShow?: VerdictKind[]): any {
        this._filter = enable;
        this._verdictKindToShow = toShow; // # store the filter settings with the added variable _verdictKindToShow
        this.rebuildViewFromElement();
    }

    getRoots(): CTTreeItem[] {
        return this._roots;
    }

    getTreeItem(element: CTTreeItem): TreeItem {
        return element as TreeItem;
    }

    getChildren(element?: CTTreeItem): Thenable<CTTreeItem[]> {
        // Handle root query
        if (!element) {
            // Build trace group items
            let groupNames = this._dataStorage.getTraceGroupNames();
            this._roots = groupNames.map((groupName) => {
                let newSymbol = new TraceGroupItem(groupName, TreeItemCollapsibleState.Collapsed);

                let oldSymbolIndex = this._roots.findIndex((symbol) => newSymbol.label == symbol.label);
                if (oldSymbolIndex != -1) newSymbol.setChildren(this._roots[oldSymbolIndex].getChildren());

                return newSymbol;
            });

            return Promise.resolve(this._roots);
        }

        if (TraceGroupItem.is(element)) {
            let traceGroup = element as TraceGroupItem;
            let traces = this._dataStorage.getTraces(traceGroup.name);
            traceGroup.update(traces, (v) => this.verdictToIconPath(v));

            return Promise.resolve(traceGroup.getChildren());
        }

        if (TraceItem.is(element)) {
            let trace = element as TraceItem;
            let traceData = this._dataStorage.getTrace(trace.name);
            trace.update(
                traceData,
                (tests) => this._dataStorage.getVerdict(tests),
                (v) => this.verdictToIconPath(v),
                this.groupSize,
                {
                    enabled: this._filter,
                    showGroup: (tests) => tests.find((test) => this.showVerdict(test.verdict), this) !== undefined,
                }
            );
            return Promise.resolve(trace.getChildren());
        }

        if (TestGroupItem.is(element)) {
            let testGroup = element as TestGroupItem;
            let tests = this._dataStorage.getTestCases(testGroup.getParent().name, testGroup.range);
            let filteredTests = this._filter ? tests.filter((test) => this.showVerdict(test.verdict)) : tests;
            testGroup.update(filteredTests, (v) => this.verdictToIconPath(v));

            return Promise.resolve(testGroup.getChildren());
        }

        // Handle default
        return Promise.resolve([]);
    }

    setCollapsed(element: CTTreeItem): any {
        element.collapsibleState = TreeItemCollapsibleState.Collapsed;
    }

    setExpanded(element: CTTreeItem): any {
        element.collapsibleState = TreeItemCollapsibleState.Expanded;
    }

    reset() {
        this._dataStorage.reset();
        this.rebuildViewFromElement();
    }

    private verdictToIconPath(verdict: VerdictKind): Icons.IconPath {
        return verdict == VerdictKind.Passed
            ? this._icons.getIcon("passed.svg")
            : verdict == VerdictKind.Failed
            ? this._icons.getIcon("failed.svg")
            : verdict == VerdictKind.Inconclusive
            ? this._icons.getIcon("inconclusive.svg")
            : verdict == VerdictKind.Filtered
            ? this._icons.getIcon("filtered.svg")
            : null;
    }

    private showVerdict(verdict: VerdictKind): boolean {
        if (this._filter) {
            if (verdict) return this._verdictKindToShow.includes(verdict);
            else return false;
        } else return true;
    }
}

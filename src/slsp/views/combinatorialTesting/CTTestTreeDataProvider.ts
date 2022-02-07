// SPDX-License-Identifier: GPL-3.0-or-later

import { Event, EventEmitter, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from "vscode";
import { VerdictKind } from "../../protocol/CombinatorialTesting";
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
        let oldSize = this.groupSize;
        this._groupSize = value > 0 ? value : defaultGroupSize;
        if (oldSize != this.groupSize) this.rebuildViewFromElement();
    }
    private _roots: CTTreeItem[];
    private _filter: boolean = false;
    private _verdictKindToShow: VerdictKind[]; // variable used to store the filter settings
    constructor(private _dataStorage: CTViewDataStorage, groupSize: number = defaultGroupSize) {
        this.groupSize = groupSize;
    }

    // Trigger view update ercursively from a specific tree item
    rebuildViewFromElement(viewElement?: CTTreeItem) {
        this._onDidChangeTreeData.fire(viewElement);
    }

    // Enable and disable the verdict filter
    filterByVerdict(enable: boolean, toShow?: VerdictKind[]): any {
        this._filter = enable;
        this._verdictKindToShow = toShow;
        this.rebuildViewFromElement();
    }

    // Returns the roots
    getRoots(): CTTreeItem[] {
        return this._roots;
    }

    // Return the item as TreeItem type
    getTreeItem(item: CTTreeItem): TreeItem {
        return item as TreeItem;
    }

    // Supplies the tree items to the view.
    getChildren(item?: CTTreeItem): Thenable<CTTreeItem[]> {
        // Handle root query
        if (!item) {
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

        // Trace group
        if (TraceGroupItem.is(item)) {
            let traceGroup = item as TraceGroupItem;
            let traces = this._dataStorage.getTraces(traceGroup.name);
            traceGroup.update(traces);

            return Promise.resolve(traceGroup.getChildren());
        }

        // Trace
        if (TraceItem.is(item)) {
            let trace = item as TraceItem;
            let traceData = this._dataStorage.getTrace(trace.name);
            trace.update(traceData, this.groupSize, {
                enabled: this._filter,
                showGroup: (tests) => tests.find((test) => this.showVerdict(test.verdict), this) !== undefined,
            });
            return Promise.resolve(trace.getChildren());
        }

        // Test group
        if (TestGroupItem.is(item)) {
            let testGroup = item as TestGroupItem;
            let tests = this._dataStorage.getTestCases(testGroup.getParent().name, testGroup.range);
            let filteredTests = this._filter ? tests.filter((test) => this.showVerdict(test.verdict)) : tests;
            testGroup.update(filteredTests);

            return Promise.resolve(testGroup.getChildren());
        }

        // Handle default
        return Promise.resolve([]);
    }

    setCollapsed(item: CTTreeItem): any {
        item.collapsibleState = TreeItemCollapsibleState.Collapsed;
    }

    setExpanded(item: CTTreeItem): any {
        item.collapsibleState = TreeItemCollapsibleState.Expanded;
    }

    // Reset/clear the test view
    reset() {
        this._dataStorage.reset();
        this.rebuildViewFromElement();
    }

    private showVerdict(verdict: VerdictKind): boolean {
        if (this._filter) {
            if (verdict) return this._verdictKindToShow.includes(verdict);
            else return false;
        } else return true;
    }
}

// SPDX-License-Identifier: GPL-3.0-or-later

import { Event, EventEmitter, ProviderResult, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from "vscode";
import { CTTreeItem, TestExpressionItem, TestResultItem } from "./CTTreeItems";
import { CTViewDataStorage } from "./CTViewDataStorage";

/**
 * The data provider for the CT Results view, that shows the test sequence for a test case.
 * It is responsible for converting the stored data into TreeItems that can be displayed in the result view.
 */
export default class CTResultTreeDataProvider implements TreeDataProvider<CTTreeItem> {
    // The result items that should be displayed
    private _resultItems: TestExpressionItem[] = [];

    // Event to signal that the root has changed, so the view should be updated
    private _onDidChangeTreeData: EventEmitter<CTTreeItem | undefined> = new EventEmitter<CTTreeItem | undefined>();
    onDidChangeTreeData: Event<CTTreeItem> = this._onDidChangeTreeData.event;

    constructor(private _dataStorage: CTViewDataStorage) {}

    // Return the item as TreeItem type
    getTreeItem(item: CTTreeItem): TreeItem | Thenable<TreeItem> {
        return item as TreeItem;
    }

    // Supplies the tree items to the view. If an item is provided in the argument, we know it is an expression item, so we return the child of that
    getChildren(item?: CTTreeItem): ProviderResult<CTTreeItem[]> {
        if (item) return (item as TestExpressionItem).getChildren();
        return this._resultItems;
    }

    // Update the test results to shown
    public updateTestResults(testId: number, traceName: string) {
        // Get results from storage
        let results = this._dataStorage.getTestResults(traceName, testId);

        // Convert to tree items
        this._resultItems = results.map((result) => {
            let resultItem = new TestResultItem(!result.result ? "n/a" : result.result);
            return new TestExpressionItem(result.case, TreeItemCollapsibleState.Expanded, resultItem);
        });

        // Update View
        this._onDidChangeTreeData.fire(null);
    }

    // Reset/clear the view
    public reset() {
        // Reset items
        this._resultItems = [];

        // Update View
        this._onDidChangeTreeData.fire(null);
    }
}

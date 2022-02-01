// SPDX-License-Identifier: GPL-3.0-or-later

import { Event, EventEmitter, ProviderResult, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from "vscode";
import { CTTreeItem, TestExpressionItem, TestResultItem } from "./CTTreeItems";
import { CTViewDataStorage } from "./CTViewDataStorage";

export class CTResultTreeDataProvider implements TreeDataProvider<CTTreeItem> {
    private _resultItems: TestExpressionItem[] = [];

    private _onDidChangeTreeData: EventEmitter<CTTreeItem | undefined> = new EventEmitter<CTTreeItem | undefined>();
    onDidChangeTreeData: Event<CTTreeItem> = this._onDidChangeTreeData.event;

    constructor(private _dataStorage: CTViewDataStorage) {}

    getTreeItem(item: CTTreeItem): TreeItem | Thenable<TreeItem> {
        return item;
    }

    getChildren(item?: CTTreeItem): ProviderResult<CTTreeItem[]> {
        if (item) return (item as TestExpressionItem).getChildren();
        return this._resultItems;
    }

    public updateTestResults(testId: number, traceName: string) {
        // Get results from storage
        let results = this._dataStorage.getTestResults(testId, traceName);

        // Convert to tree items
        this._resultItems = results.map((result) => {
            let resultItem = new TestResultItem(!result.result ? "n/a" : result.result);
            return new TestExpressionItem(result.case, TreeItemCollapsibleState.Expanded, resultItem);
        });

        // Update View
        this._onDidChangeTreeData.fire(null);
    }

    public reset() {
        // Reset items
        this._resultItems = [];

        // Update View
        this._onDidChangeTreeData.fire(null);
    }
}

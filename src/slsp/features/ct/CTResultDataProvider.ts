// SPDX-License-Identifier: GPL-3.0-or-later

import { Event, EventEmitter, ProviderResult, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from "vscode";
import { CTResultPair } from "../../protocol/combinatorialTesting";

export class CTResultDataProvider implements TreeDataProvider<CTResultElement> {

    private _testSequenceResults: CTResultElement[] = [];

    private _onDidChangeTreeData: EventEmitter<CTResultElement | undefined> = new EventEmitter<CTResultElement | undefined>();
    onDidChangeTreeData: Event<CTResultElement> = this._onDidChangeTreeData.event;

    getTreeItem(element: CTResultElement): TreeItem | Thenable<TreeItem> {
        return element;
    }

    getChildren(element?: CTResultElement): ProviderResult<CTResultElement[]> {
        if (element)
            return element.children;

        return this._testSequenceResults;
    }

    private convertToResultElements(resultPairs: CTResultPair[]): CTResultElement[] {
        return resultPairs.map(rp => new CTResultElement(rp.case, [new CTResultElement(!rp.result ? "n/a" : rp.result, [], TreeItemCollapsibleState.None, "Result")], TreeItemCollapsibleState.Expanded, "Test case"));
    }

    public getTestSequenceResults() {
        return this._testSequenceResults;
    }

    public setTestSequenceResults(resultPairs: CTResultPair[]) {
        if (!resultPairs)
            return;

        this._testSequenceResults = this.convertToResultElements(resultPairs);
        this._onDidChangeTreeData.fire(null);
    }
}

export class CTResultElement extends TreeItem {
    constructor(
        public readonly label: string,
        public children: CTResultElement[],
        public readonly collapsibleState?,
        public tooltip = "") {
        super(label, TreeItemCollapsibleState.None);
    }
}
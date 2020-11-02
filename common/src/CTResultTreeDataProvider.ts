import { Event, EventEmitter, ProviderResult, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from "vscode";
import { CTResultPair } from "./protocol.lspx";

export class CTResultTreeDataProvider implements TreeDataProvider<ResultElement> {

    private _testSequenceResults: CTResultPair[] = [];

    private _onDidChangeTreeData: EventEmitter<ResultElement | undefined> = new EventEmitter<ResultElement | undefined>();
    onDidChangeTreeData: Event<ResultElement> = this._onDidChangeTreeData.event;

    getTreeItem(element: ResultElement): TreeItem | Thenable<TreeItem> {
        return element;
    }

    getChildren(element?: ResultElement): ProviderResult<ResultElement[]> {
        if(element)
            return [];
        
        return this.convertToResultElements(this._testSequenceResults);
    }

    private convertToResultElements(resultPairs: CTResultPair[]): ResultElement[]{
        return resultPairs.map(rs => new ResultElement(rs.case, rs.result));
    }

    public getTestSequenceResults(){
        return this._testSequenceResults;
    }

    public setTestSequenceResults(resultPairs: CTResultPair[]){
        if(!resultPairs)
            return;

        this._testSequenceResults = resultPairs;
        this._onDidChangeTreeData.fire(null);
    }
}

class ResultElement extends TreeItem {

    constructor(
    public readonly label: string,
    description: string | boolean
    ) {
        super(label, TreeItemCollapsibleState.None);
       super.description = description;
    }
}
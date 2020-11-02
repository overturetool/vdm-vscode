import { Event, EventEmitter, ProviderResult, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from "vscode";
import { CTResultPair } from "./protocol.lspx";

export class CTResultTreeDataProvider implements TreeDataProvider<ResultElement> {

    private _resultPairs: CTResultPair[] = [];

    private _onDidChangeTreeData: EventEmitter<ResultElement | undefined> = new EventEmitter<ResultElement | undefined>();
    onDidChangeTreeData: Event<ResultElement> = this._onDidChangeTreeData.event;

    getTreeItem(element: ResultElement): TreeItem | Thenable<TreeItem> {
        return element;
    }

    getChildren(element?: ResultElement): ProviderResult<ResultElement[]> {
        if(element)
            return [];
        
        return this.convertToResultElements(this._resultPairs);
    }

    private convertToResultElements(resultPairs: CTResultPair[]): ResultElement[]{
        return resultPairs.map(rs => new ResultElement(rs.case, rs.result));
    }

    public getResultPairs(){
        return this._resultPairs;
    }

    public setResultPairs(resultPairs: CTResultPair[]){
        if(!resultPairs)
            return;

        this._resultPairs = resultPairs;
        this._onDidChangeTreeData.fire(null);
    }
}

export class ResultElement extends TreeItem {

    constructor(
    public readonly label: string,
    description: string | boolean
    ) {
        super(label, TreeItemCollapsibleState.None);
       super.description = description;
    }
}
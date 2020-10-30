import { CTFilterHandler } from "./CombinatorialTestingFeature";
import { ctFilterOption } from "./protocol.lspx";
import * as vscode from 'vscode'

export class VdmjCTFilterHandler implements CTFilterHandler {
    private _traceReductionTypes = new Map<string, string>([
        ["R","Random"],
        ["NV", "No variables"],
        ["VN", "Variable names"],
        ["VV", "Variable value"]
    ]);
    private _traceReductionTypesReverse = new Map<string, string>();
    private _filterKeyTypes = new Map<string, string>([
        ["reduction", "Trace Reduction Type"],
        ["seed", "Trace Filtering Seed"],
        ["limit", "Subset Limitation (%)"]
    ]);
    private _filterKeyTypesReverse = new Map<string, string>();
    private _filtersDefault = new Map<string, string|boolean|number>([
        ["reduction", "R"],
        ["seed", 999],
        ["limit", 100]
    ]);
    private _filters = new Map<string, string|boolean|number>();

    constructor(){
        this._traceReductionTypes.forEach((v,k) => this._traceReductionTypesReverse.set(v,k))
        this._filterKeyTypes.forEach((v,k) => this._filterKeyTypesReverse.set(v,k))
            
        this.resetFilters();
    }

    setCTFilter() {
        this.showFilterOptions()
    }

    getCTFilter() : ctFilterOption[] {
        let ctFilters : ctFilterOption[] = []
        this._filters.forEach((v,k) => ctFilters.push({key: k, value: v}))
        return ctFilters;
    }

    private resetFilters() {
        this._filtersDefault.forEach((v,k) => this._filters.set(k,v))
    }

    private showFilterOptions() : void {
        let showOptions : string[] = [];
        this._filterKeyTypes.forEach((v,k) => showOptions.push(v + ': ' + (k == "reduction" ? this._traceReductionTypes.get(this._filters.get(k).toString()) : this._filters.get(k))));
        showOptions.push("Reset");
        showOptions.push("OK");

        vscode.window.showQuickPick(showOptions).then(res => {
            if (res == "OK")
                return;
            else if (res == "Reset")
                this.resetFilters()
            else {
                let filterKey = this._filterKeyTypesReverse.get(res.substring(0,res.indexOf(':')));
                if (filterKey == "reduction")
                    this.showReduction();
                else if (filterKey == "seed")
                    this.showSeed();
                else if (filterKey == "limit")
                    this.showLimit();
            }
        })
    }

    private showReduction() {
        let showOptions : string[] = [];
        this._traceReductionTypes.forEach(v => showOptions.push(v))
        vscode.window.showQuickPick(showOptions).then(res => {
            if (res == undefined)
                return;

            for (let [k,v] of this._traceReductionTypes){
                if (v == res){
                    this._filters.set("reduction", k);
                    continue;
                }
            }

            this.showFilterOptions()
        })
    }

    private showSeed() {
        let inputOptions : vscode.InputBoxOptions = {
            prompt: "Set "+this._filterKeyTypes.get("seed"),
            placeHolder: "999",
            // value: "999",
            validateInput: (input) => {
                let num = Number(input);
                if (Number.isNaN(num))
                    return "Invalid input: Not a number"
                
                if (!Number.isInteger(num))
                    return "Invalid input: Not an integer"
               
                if (num > 0)
                    return undefined
                else
                    return "Invalid input: Not a positive integer"
            }
        }
        vscode.window.showInputBox(inputOptions).then(res => {
            if (res == undefined)
                return;

            this._filters.set("seed",res);
            this.showFilterOptions();
        })
    }

    private showLimit() {
        let inputOptions : vscode.InputBoxOptions = {
            prompt: "Set "+this._filterKeyTypes.get("limit"),
            placeHolder: "100",
            // value: "100",
            validateInput: (input) => {
                let num = Number(input);
                if (Number.isNaN(num))
                    return "Invalid input: Not a number"
                
                if (!Number.isInteger(num))
                    return "Invalid input: Not an integer"

                if (1 <= num  && num  <= 100)
                    return undefined
                else
                    return "Invalid input: Not between 1-100"
            }
        }
        vscode.window.showInputBox(inputOptions).then(res => {
            if (res == undefined)
                return;

            this._filters.set("limit",res);
            this.showFilterOptions();
        })
    }
}
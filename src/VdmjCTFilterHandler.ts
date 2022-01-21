// SPDX-License-Identifier: GPL-3.0-or-later

import { CTFilterHandler } from "./slsp/features/CTHandler";
import { CTFilterOption } from "./slsp/protocol/combinatorialTesting";
import * as vscode from 'vscode'

export class VdmjCTFilterHandler implements CTFilterHandler {
    private _traceReductionTypes = new Map<string, string>([
        ["NONE", "None"],
        ["RANDOM", "Random"],
        ["SHAPES_NOVARS", "Shaped (no variables)"],
        ["SHAPES_VARNAMES", "Shaped (variable names)"],
        ["SHAPES_VARVALUES", "Shaped (variable value)"]
    ]);
    private _traceReductionTypesReverse = new Map<string, string>();
    private _filterKeyTypes = new Map<string, string>([
        ["trace reduction type", "Trace Reduction Type"],
        ["trace filtering seed", "Trace Filtering Seed"],
        ["subset limitation", "Subset Limitation (%)"]
    ]);
    private _filterKeyTypesReverse = new Map<string, string>();
    private _filtersDefault = new Map<string, string | boolean | number>([
        ["trace reduction type", "NONE"],
        ["trace filtering seed", 999],
        ["subset limitation", 100]
    ]);
    private _filters = new Map<string, string | boolean | number>();
    private _inSetup: boolean = false;

    constructor() {
        this._traceReductionTypes.forEach((v, k) => this._traceReductionTypesReverse.set(v, k))
        this._filterKeyTypes.forEach((v, k) => this._filterKeyTypesReverse.set(v, k))

        this.resetFilters();
    }

    setCTFilter() {
        this.showFilterOptions();
    }

    getCTFilter(): CTFilterOption[] {
        // Wait for setup to be over
        while (this._inSetup) { }

        // Convert to protocol type
        let ctFilters: CTFilterOption[] = []
        this._filters.forEach((v, k) => ctFilters.push({ key: k, value: v }))
        return (ctFilters);
    }

    private resetFilters() {
        this._filtersDefault.forEach((v, k) => this._filters.set(k, v))
    }

    private showFilterOptions(): void {
        let showOptions: string[] = [];
        this._filterKeyTypes.forEach((v, k) => showOptions.push(v + ': ' + (k == "trace reduction type" ? this._traceReductionTypes.get(this._filters.get(k).toString()) : this._filters.get(k))));
        showOptions.push("Reset");
        showOptions.push("OK");

        this._inSetup = true;
        vscode.window.showQuickPick(showOptions).then(res => {
            if (res == undefined || res == "OK") {  // Exit on 'esc' or 'OK'
                this._inSetup = false;
                return;
            }
            else if (res == "Reset")
                this.resetFilters()
            else {
                let filterKey = this._filterKeyTypesReverse.get(res.substring(0, res.indexOf(':')));
                if (filterKey == "trace reduction type")
                    this.showReduction();
                else if (filterKey == "trace filtering seed")
                    this.showSeed();
                else if (filterKey == "subset limitation")
                    this.showLimit();
            }
        })
    }

    private showReduction() {
        let showOptions: string[] = [];
        this._traceReductionTypes.forEach(v => showOptions.push(v))
        vscode.window.showQuickPick(showOptions).then(res => {
            if (res == undefined)
                return;

            for (let [k, v] of this._traceReductionTypes) {
                if (v == res) {
                    this._filters.set("trace reduction type", k);
                    continue;
                }
            }

            this.showFilterOptions()
        })
    }

    private showSeed() {
        let inputOptions: vscode.InputBoxOptions = {
            prompt: "Set " + this._filterKeyTypes.get("trace filtering seed"),
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

            this._filters.set("trace filtering seed", Number(res));
            this.showFilterOptions();
        })
    }

    private showLimit() {
        let inputOptions: vscode.InputBoxOptions = {
            prompt: "Set " + this._filterKeyTypes.get("subset limitation"),
            placeHolder: "100",
            // value: "100",
            validateInput: (input) => {
                let num = Number(input);
                if (Number.isNaN(num))
                    return "Invalid input: Not a number"

                if (!Number.isInteger(num))
                    return "Invalid input: Not an integer"

                if (1 <= num && num <= 100)
                    return undefined
                else
                    return "Invalid input: Not between 1-100"
            }
        }
        vscode.window.showInputBox(inputOptions).then(res => {
            if (res == undefined)
                return;

            this._filters.set("subset limitation", Number(res));
            this.showFilterOptions();
        })
    }
}
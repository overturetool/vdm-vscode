// SPDX-License-Identifier: GPL-3.0-or-later

import { MarkdownString, ThemeIcon, TreeItem, TreeItemCollapsibleState, TreeItemLabel, Uri } from "vscode";
import { Icons } from "../../../Icons";
import { NumberRange, VerdictKind } from "../../protocol/combinatorialTesting";
import * as Types from "./CTDataTypes";

enum CTTreeItemTypes {
    TraceGroup = "tracegroup",
    Trace = "trace",
    TestGroup = "testgroup",
    Test = "test",
    TestExpression = "testexpression",
    TestResult = "testresult",
}

export abstract class CTTreeItem extends TreeItem {
    protected readonly _parent: CTTreeItem;
    protected _children: CTTreeItem[];

    public readonly contextValue: CTTreeItemTypes;
    public readonly label: string | TreeItemLabel;
    public collapsibleState?: TreeItemCollapsibleState;
    public readonly name: string;

    constructor(label: string | TreeItemLabel, collapsibleState?: TreeItemCollapsibleState, parent?: CTTreeItem) {
        super(label, collapsibleState);
        this._parent = parent;
        this.collapsibleState = collapsibleState || TreeItemCollapsibleState.None;
        this.label = label;
        this.name = label.toString();
    }

    public getParent(): CTTreeItem {
        return this._parent;
    }

    public getChildren(): CTTreeItem[] {
        return this._children;
    }

    public setChildren(items: CTTreeItem[]): void {
        this._children = items;
    }
}

export class CTVerdictTreeItem extends CTTreeItem {
    protected _verdict: VerdictKind;
    public iconPath?: string | Uri | ThemeIcon | { light: string | Uri; dark: string | Uri };

    constructor(
        label: string | TreeItemLabel,
        collapsibleState: TreeItemCollapsibleState,
        parent: CTTreeItem,
        verdict?: VerdictKind,
        icon?: Icons.IconPath
    ) {
        super(label, collapsibleState, parent);
        this.setVerdict(verdict, icon);
    }

    get verdict() {
        return this._verdict;
    }

    setVerdict(verdict: VerdictKind, icon: Icons.IconPath) {
        this._verdict = verdict;
        this.iconPath = icon;
    }
}

export class TraceGroupItem extends CTTreeItem {
    public readonly contextValue: CTTreeItemTypes = CTTreeItemTypes.TraceGroup;

    constructor(label: string | TreeItemLabel, collapsibleState: TreeItemCollapsibleState) {
        super(label, collapsibleState);
        this._children = [];
    }

    update(traces: Types.Trace[], icon: (verdict: VerdictKind) => Icons.IconPath) {
        let oldTraces = this.getChildren();

        this.setChildren(
            traces.map((trace) => {
                let traceViewElement = new TraceItem(
                    trace.name,
                    TreeItemCollapsibleState.Collapsed,
                    this,
                    trace.verdict,
                    icon(trace.verdict)
                );

                let oldTraceIndex = oldTraces.findIndex((t) => t.label == trace.name);
                if (oldTraceIndex != -1) {
                    traceViewElement.setChildren(oldTraces[oldTraceIndex].getChildren());
                    traceViewElement.collapsibleState = oldTraces[oldTraceIndex].collapsibleState;
                }

                return traceViewElement;
            })
        );
    }
}
export namespace TraceGroupItem {
    export function is(value: any): value is TraceGroupItem {
        return typeof value == "object" && typeof value.contextValue == "string" && value.contextValue == CTTreeItemTypes.TraceGroup;
    }
}

export class TraceItem extends CTVerdictTreeItem {
    public readonly contextValue = CTTreeItemTypes.Trace;
    private _numberOfTests: number;

    constructor(
        label: string | TreeItemLabel,
        collapsibleState: TreeItemCollapsibleState,
        parent: TraceGroupItem,
        verdict?: VerdictKind,
        icon?: Icons.IconPath
    ) {
        super(label, collapsibleState, parent, verdict, icon);
        this._children = [];
    }

    get numberOfTests(): number {
        return this._numberOfTests;
    }

    getParent(): TraceGroupItem {
        return this._parent as TraceGroupItem;
    }

    update(
        trace: Types.Trace,
        groupVerdict: (tests: Types.TestCase[]) => VerdictKind,
        getIcon: (verdict: VerdictKind) => Icons.IconPath,
        groupSize: number,
        filter?: { enabled: boolean; showGroup: (tests: Types.TestCase[]) => boolean }
    ) {
        // Set verdict
        this.setVerdict(trace.verdict, getIcon(trace.verdict));

        // Build view from traces
        let tests: Types.TestCase[] = trace.testCases;
        let testGroups: TestGroupItem[] = [];
        this._numberOfTests = tests.length;
        let numGroups = Math.ceil(this._numberOfTests / groupSize);

        // Generate all test group view elements for the trace
        let remainingTests = this._numberOfTests;
        for (let i = 0; i < numGroups; i++) {
            let range: NumberRange = {
                start: 1 + i * groupSize,
                end: groupSize >= remainingTests ? remainingTests + groupSize * i : groupSize * (i + 1),
            };
            let groupTests = Types.Trace.getTestCases(tests, range);

            // Determine verdict
            let verdict = groupVerdict(groupTests);

            // Filter if needed
            if (!filter || !filter.enabled || filter.showGroup(groupTests)) {
                testGroups.push(
                    new TestGroupItem(
                        "test group",
                        i < this.getChildren().length ? this.getChildren()[i].collapsibleState : TreeItemCollapsibleState.Collapsed,
                        this,
                        range,
                        verdict,
                        getIcon(verdict)
                    )
                );
            }

            remainingTests -= groupSize;
        }

        this.setChildren(testGroups);
    }
}
export namespace TraceItem {
    export function is(value: any): value is TraceItem {
        return typeof value == "object" && typeof value.contextValue == "string" && value.contextValue == CTTreeItemTypes.Trace;
    }
}

export class TestGroupItem extends CTVerdictTreeItem {
    public readonly contextValue = CTTreeItemTypes.TestGroup;
    public readonly range: NumberRange;
    public description: string | boolean;

    constructor(
        label: string | TreeItemLabel,
        collapsibleState: TreeItemCollapsibleState,
        parent: TraceItem,
        range: NumberRange,
        verdict?: VerdictKind,
        icon?: Icons.IconPath
    ) {
        super(label, collapsibleState, parent);
        this._children = [];
        this.description = range.start + "-" + range.end;
        this._verdict = verdict;
        this.iconPath = icon;
        this.range = range;
    }

    getParent(): TraceItem {
        return this._parent as TraceItem;
    }

    update(tests: Types.TestCase[], getIcon: (verdict: VerdictKind) => Icons.IconPath) {
        let testItems = [];
        tests.forEach((test) => {
            testItems.push(new TestItem(test.id.toString(), this, test.verdict, getIcon(test.verdict)));
        });

        this.setChildren(testItems);
    }
}
export namespace TestGroupItem {
    export function is(value: any): value is TestGroupItem {
        return typeof value == "object" && typeof value.contextValue == "string" && value.contextValue == CTTreeItemTypes.TestGroup;
    }
}

export class TestItem extends CTVerdictTreeItem {
    public readonly contextValue = CTTreeItemTypes.Test;
    public readonly idNumber: number;

    constructor(label: string | TreeItemLabel, parent: TestGroupItem, verdict?: VerdictKind, icon?: Icons.IconPath) {
        super(label, TreeItemCollapsibleState.None, parent, verdict, icon);
        this.description = verdict ? VerdictKind[verdict] : "n/a";
        this.idNumber = Number(label);
    }

    public get trace() {
        return this.getParent().getParent();
    }

    getParent(): TestGroupItem {
        return this._parent as TestGroupItem;
    }
}
export namespace TestItem {
    export function is(value: any): value is TestItem {
        return typeof value == "object" && typeof value.contextValue == "string" && value.contextValue == CTTreeItemTypes.Test;
    }
}

export class TestExpressionItem extends CTTreeItem {
    public readonly contextValue = CTTreeItemTypes.TestExpression;
    public readonly tooltip: string | MarkdownString = "Test case";

    constructor(label: string | TreeItemLabel, collapsibleState: TreeItemCollapsibleState, result: TestResultItem) {
        super(label, collapsibleState);
        this._children = [result];
    }
}
export namespace TestExpressionItem {
    export function is(value: any): value is TestExpressionItem {
        return typeof value == "object" && typeof value.contextValue == "string" && value.contextValue == CTTreeItemTypes.TestExpression;
    }
}

export class TestResultItem extends CTTreeItem {
    public readonly contextValue = CTTreeItemTypes.TestResult;
    public readonly tooltip: string | MarkdownString = "Result";

    constructor(label: string | TreeItemLabel) {
        super(label, TreeItemCollapsibleState.None);
    }
}
export namespace TestResultItem {
    export function is(value: any): value is TestResultItem {
        return typeof value == "object" && typeof value.contextValue == "string" && value.contextValue == CTTreeItemTypes.TestResult;
    }
}

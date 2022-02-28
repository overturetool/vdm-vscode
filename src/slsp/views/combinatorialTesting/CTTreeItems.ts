// SPDX-License-Identifier: GPL-3.0-or-later

import { MarkdownString, TreeItem, TreeItemCollapsibleState, TreeItemLabel } from "vscode";
import { Icons } from "../../../util/Icons";
import { NumberRange, VerdictKind } from "../../protocol/CombinatorialTesting";
import * as Types from "./CTDataTypes";

// Enum of the differet contextValue
enum CTTreeItemTypes {
    TraceGroup = "tracegroup",
    Trace = "trace",
    TestGroup = "testgroup",
    Test = "test",
    TestExpression = "testexpression",
    TestResult = "testresult",
}

// Base class for the TreeItems in the CT View
export class CTTreeItem extends TreeItem {
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

// Base class for the TreeItems in the CT View that can have a verdict
export class CTVerdictTreeItem extends CTTreeItem {
    protected _verdict: VerdictKind;
    public iconPath?: Icons.IconPath;

    constructor(label: string | TreeItemLabel, collapsibleState: TreeItemCollapsibleState, parent: CTTreeItem, verdict?: VerdictKind) {
        super(label, collapsibleState, parent);
        this.setVerdict(verdict);
    }

    get verdict() {
        return this._verdict;
    }

    setVerdict(verdict: VerdictKind) {
        this._verdict = verdict;
        this.iconPath = Icons.verdictToIconPath(verdict);
    }
}

// Trace Group tree item
export class TraceGroupItem extends CTTreeItem {
    public readonly contextValue: CTTreeItemTypes = CTTreeItemTypes.TraceGroup;

    constructor(label: string | TreeItemLabel, collapsibleState: TreeItemCollapsibleState) {
        super(label, collapsibleState);
        this._children = [];
    }

    update(traces: Types.Trace[]) {
        let oldTraces = this.getChildren();

        // Create trace tree items based on the traces data
        this.setChildren(
            traces.map((trace) => {
                let oldTrace = oldTraces.find((t) => t.label == trace.name);

                // If the old traces contain the trace assign the old children to the new trace item.
                if (oldTrace) {
                    (oldTrace as TraceItem).setVerdict(trace.verdict);
                    return oldTrace;
                } else {
                    return new TraceItem(trace.name, TreeItemCollapsibleState.Collapsed, this, trace.verdict);
                }
            })
        );
    }
}
export namespace TraceGroupItem {
    export function is(value: any): value is TraceGroupItem {
        return typeof value == "object" && typeof value.contextValue == "string" && value.contextValue == CTTreeItemTypes.TraceGroup;
    }
}

// Trace tree item
export class TraceItem extends CTVerdictTreeItem {
    public readonly contextValue = CTTreeItemTypes.Trace;
    private _numberOfTests: number;

    constructor(label: string | TreeItemLabel, collapsibleState: TreeItemCollapsibleState, parent: TraceGroupItem, verdict?: VerdictKind) {
        super(label, collapsibleState, parent, verdict);
        this._children = [];
    }

    get numberOfTests(): number {
        return this._numberOfTests;
    }

    getParent(): TraceGroupItem {
        return this._parent as TraceGroupItem;
    }

    // Update trace and trace groups
    update(trace: Types.Trace, groupSize: number, filter?: { enabled: boolean; showGroup: (tests: Types.TestCase[]) => boolean }) {
        // Set verdict
        this.setVerdict(trace.verdict);

        // Build view from traces
        let tests: Types.TestCase[] = trace.testCases;
        let testGroups: TestGroupItem[] = [];
        this._numberOfTests = tests.length;
        let numGroups = Math.ceil(this._numberOfTests / groupSize);

        // Generate all test group tree items for the trace
        let remainingTests = this._numberOfTests;
        for (let i = 0; i < numGroups; i++) {
            let range: NumberRange = {
                start: 1 + i * groupSize,
                end: groupSize >= remainingTests ? remainingTests + groupSize * i : groupSize * (i + 1),
            };
            let groupTests = Types.util.getTestCases(tests, range);

            // Determine verdict
            let verdict = Types.util.determineVerdict(groupTests);

            // Determine if the test group should be added to the trace or filtered away
            if (!filter || !filter.enabled || filter.showGroup(groupTests)) {
                testGroups.push(
                    // Create test group where the collapsible state is the same as it was for the old group on this index. If no old group it should be collapsed.
                    new TestGroupItem(
                        "test group",
                        i < this.getChildren().length ? this.getChildren()[i].collapsibleState : TreeItemCollapsibleState.Collapsed,
                        this,
                        range,
                        verdict
                    )
                );
            }

            // Update remaining tests counter
            remainingTests -= groupSize;
        }

        // Assign the new test groups
        this.setChildren(testGroups);
    }
}
export namespace TraceItem {
    export function is(value: any): value is TraceItem {
        return typeof value == "object" && typeof value.contextValue == "string" && value.contextValue == CTTreeItemTypes.Trace;
    }
}

// Test Group tree item
export class TestGroupItem extends CTVerdictTreeItem {
    public readonly contextValue = CTTreeItemTypes.TestGroup;
    public readonly range: NumberRange;
    public description: string | boolean;

    constructor(
        label: string | TreeItemLabel,
        collapsibleState: TreeItemCollapsibleState,
        parent: TraceItem,
        range: NumberRange,
        verdict?: VerdictKind
    ) {
        super(label, collapsibleState, parent, verdict);
        this._children = [];
        this.description = range.start + "-" + range.end;
        this.range = range;
    }

    getParent(): TraceItem {
        return this._parent as TraceItem;
    }

    // Update the tests in the test group, by converting the tests to TestItems
    update(tests: Types.TestCase[]) {
        this.setChildren(tests.map((test) => new TestItem(test.id.toString(), this, test.verdict)));
    }
}
export namespace TestGroupItem {
    export function is(value: any): value is TestGroupItem {
        return typeof value == "object" && typeof value.contextValue == "string" && value.contextValue == CTTreeItemTypes.TestGroup;
    }
}

// Test tree item
export class TestItem extends CTVerdictTreeItem {
    public readonly contextValue = CTTreeItemTypes.Test;
    public readonly idNumber: number;

    constructor(label: string | TreeItemLabel, parent: TestGroupItem, verdict?: VerdictKind) {
        super(label, TreeItemCollapsibleState.None, parent, verdict);
        this.description = verdict ? VerdictKind[verdict] : "n/a";
        this.idNumber = Number(label);
    }

    // Get the trace item that the test belongs to
    public get trace(): TraceItem {
        let parent = this.getParent();
        return TraceItem.is(parent) ? parent : parent.getParent();
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

// Test Expression tree item
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

// Test Result tree item
export class TestResultItem extends CTTreeItem {
    public readonly contextValue = CTTreeItemTypes.TestResult;
    public readonly tooltip: string | MarkdownString = "Result";

    constructor(label: string | TreeItemLabel) {
        super(label, TreeItemCollapsibleState.None);
    }

    getParent(): TestExpressionItem {
        return this._parent as TestExpressionItem;
    }
}
export namespace TestResultItem {
    export function is(value: any): value is TestResultItem {
        return typeof value == "object" && typeof value.contextValue == "string" && value.contextValue == CTTreeItemTypes.TestResult;
    }
}

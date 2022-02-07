// SPDX-License-Identifier: GPL-3.0-or-later

import { Location } from "vscode";
import { NumberRange, VerdictKind } from "../../protocol/CombinatorialTesting";

/**
 * The type interfaces in this file describes how the Combinatorial Tests are stored internally in the view.
 * These are not to be confused with the CTTreeItems that describe how the data is shown in the view
 */

export interface TraceGroupInfo {
    name: string;
    traces: TraceInfo[];
}
export interface TraceGroup {
    name: string;
    traces: Trace[];
}
export interface TraceInfo {
    name: string;
    location: Location;
    verdict?: VerdictKind;
}
export interface Trace extends TraceInfo {
    testCases: TestCase[];
}
export interface TestCase {
    id: number;
    verdict: VerdictKind;
    sequence: TestResult[];
}
export interface TestResult {
    case: string;
    result: string | null;
}

// An error that is thrown if there has been changes to a specification that is not reflected in the CT view.
export class OutOfSyncError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = "OutOfSyncError";
    }
}
export namespace OutOfSyncError {
    export function is(value: any): value is OutOfSyncError {
        return typeof value == "object" && typeof value.name == "string" && value.name == "OutOfSyncError";
    }
}

// Util functions for the types
export namespace util {
    export function getTestCases(tests: TestCase[], range: NumberRange): TestCase[] {
        return tests.slice((range?.start || 1) - 1, range?.end || tests.length) || [];
    }

    export function determineVerdict(tests: TestCase[]): VerdictKind {
        if (!tests || tests.length == 0) return null;

        // If the tests contains a failed test, set the trace verdict "Failed"
        if (tests.some((tc) => tc.verdict == VerdictKind.Failed)) return VerdictKind.Failed;
        // If the tests contains a test that has not been executed, set the trace verdict blank
        else if (tests.some((tc) => tc.verdict == null)) return null;
        // If all traces has been executed and non of them are "Failed", set the trace verdict to "Passed"
        else return VerdictKind.Passed;
    }
}

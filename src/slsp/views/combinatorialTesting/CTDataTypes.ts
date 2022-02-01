// SPDX-License-Identifier: GPL-3.0-or-later

import { Location } from "vscode";
import { NumberRange, VerdictKind } from "../../protocol/combinatorialTesting";

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
export namespace Trace {
    export function getTestCases(tests: TestCase[], range: NumberRange): TestCase[] {
        return tests.slice((range?.start || 1) - 1, range?.end || tests.length) || [];
    }
}

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

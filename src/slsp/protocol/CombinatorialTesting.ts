// SPDX-License-Identifier: GPL-3.0-or-later

import {
    CancellationToken,
    HandlerResult,
    integer,
    Location,
    PartialResultParams,
    ProgressType,
    ProtocolRequestType,
    RequestHandler,
    RequestType,
    URI,
    WorkDoneProgressOptions,
    WorkDoneProgressParams,
} from "vscode-languageclient";

export interface CombinatorialTestingClientCapabilities {
    /**
     * The experimental client capabilities.
     */
    experimental: {
        /**
         * The client has support for proof obligation generation.
         */
        combinatorialTesting?: boolean;
    };
}

export interface CombinatorialTestingServerCapabilities {
    /**
     * The experimental server capabilities.
     */
    experimental: {
        /**
         * Capabilities specific to the `slsp/CT/` messages.
         */
        combinatorialTestProvider?: boolean | CombinatorialTestingOptions;
    };
}

/**
 * Options for the combinatorial testing feature.
 */
export interface CombinatorialTestingOptions extends WorkDoneProgressOptions {}

/**
 * The `slsp/CT/traces` request is sent from the client to the server to fetch test traces in a specification.
 */
export namespace CTTracesRequest {
    export const type = new RequestType<CTTracesParams, CTSymbol[] | null, void>("slsp/CT/traces");
    export type HandlerSignature = RequestHandler<CTTracesParams, CTSymbol[] | null, void>;
    export type MiddlewareSignature = (
        params: CTTracesParams,
        token: CancellationToken,
        next: HandlerSignature
    ) => HandlerResult<CTSymbol[] | null, void>;
}

/**
 * The parameters of a `slsp/CT/traces` request.
 */
export interface CTTracesParams {
    /**
     * An optional uri to the file/folder for which Traces should be found.
     */
    uri?: URI;
}

/**
 * Describes a grouping of traces, e.g. a class, classA, may
 * have multiple traces which are all combined in a CTSymbol.
 */
export interface CTSymbol {
    /**
     * Name of Trace group, e.g. "classA".
     */
    name: string;
    /**
     * Traces in the group.
     */
    traces: CTTrace[];
}

/**
 * Overview information about a trace
 */
export interface CTTrace {
    /**
     * Fully qualified name of the trace.
     */
    name: string;
    /**
     * Location in the source code of the trace.
     */
    location: Location;
    /**
     * An optional combined verdict of all the tests from the trace.
     */
    verdict?: VerdictKind;
}

/**
 * Kinds of test case verdicts.
 */
export enum VerdictKind {
    Passed = 1,
    Failed = 2,
    Inconclusive = 3,
    Filtered = 4,
}

/**
 * The `slsp/CT/generate` request is sent from the client to the server to generate the tests of a test trace.
 */
export namespace CTGenerateRequest {
    export const type = new RequestType<CTGenerateParams, CTGenerateResult | null, { code: integer; message: string }>("slsp/CT/generate");
    export type HandlerSignature = RequestHandler<CTGenerateParams, CTGenerateResult[] | null, void>;
    export type MiddlewareSignature = (
        params: CTGenerateParams,
        token: CancellationToken,
        next: HandlerSignature
    ) => HandlerResult<CTGenerateResult | null, void>;
}

/**
 * The parameters of a `slsp/CT/generate` request.
 */
export interface CTGenerateParams extends WorkDoneProgressParams {
    /**
     * Fully qualified name of the trace, which test cases should be
     * generated based on.
     */
    name: string;
}

/**
 * The result of a 'slsp/CT/generate' request
 */
export interface CTGenerateResult {
    /**
     * The number of tests that is generated from the trace.
     */
    numberOfTests: number;
}

/**
 * The `slsp/CT/execute` request is sent from the client to the server to execute the tests of a trace.
 */
export namespace CTExecuteRequest {
    export const method = "slsp/CT/execute";
    export const type = new ProtocolRequestType<CTExecuteParams, CTTestCase[] | null, CTTestCase[], void, void>(method);
    export const resultType = new ProgressType<CTTestCase[]>();
    export type HandlerSignature = RequestHandler<CTExecuteParams, CTTestCase[] | null, void>;
    export type MiddlewareSignature = (
        params: CTExecuteParams,
        token: CancellationToken,
        next: HandlerSignature
    ) => HandlerResult<CTTestCase[] | null, void>;
}

/**
 * The parameters of a `slsp/CT/execute` request.
 */
export interface CTExecuteParams extends WorkDoneProgressParams, PartialResultParams {
    /**
     * Fully qualified name of the trace, which test cases should be
     * executed from.
     */
    name: string;
    /**
     * Optional filters that should be applied to the exectution.
     * If omitted the server should use default settings.
     */
    filter?: CTFilterOption[];
    /**
     * An optional range of tests that should be executed.
     * If omitted all tests for the trace are executed.
     */
    range?: NumberRange;
}

/**
 * Mapping type for filter options for the execution of CTs.
 */
export interface CTFilterOption {
    /**
     * Name of the option. E.g. "reduction", "seed" or "limit".
     */
    key: string;
    /**
     * Value of the option. E.g. "random", 999, 100.
     */
    value: string | number | boolean;
}

/**
 * Describes a range of numbers, e.g. 1-10.
 */
export interface NumberRange {
    /**
     * Start number, if omitted 'end' should be considered as
     * the absolute number of tests that must be returned
     */
    start?: number;
    /**
     * End number, if omitted tests from 'start' to last
     * should be returned.
     */
    end?: number;
}

/**
 * Test case information.
 */
export interface CTTestCase {
    /**
     * ID of the test case.
     */
    id: number;
    /**
     * Test case verdict
     */
    verdict: VerdictKind;
    /**
     * Test case execution sequence and result.
     */
    sequence: CTResultPair[];
}

/**
 * Test sequence result pair.
 */
export interface CTResultPair {
    /**
     * The opration/function that was executed.
     */
    case: string;
    /**
     * The result of the operation/function. Null if no result.
     */
    result: string | null;
}

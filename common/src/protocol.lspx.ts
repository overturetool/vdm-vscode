import { NotificationType, RequestType, Location, PartialResultParams, WorkDoneProgressParams } from "vscode-languageclient";

/**
 * The experimental capabilities that the server can reply.
 */
export interface ExperimentalCapabilities {
	proofObligationProvider?: boolean;
	combinatorialTestingProvider?: boolean;
}

////////////////////// Proof Obligation Generation (POG) /////////////////////////////
/**
 * Parameters describing a Proof Obligation (PO) and meta data.
 */
export interface ProofObligation {
	/**
	 * Unique identifier of the PO.
	 */
	id: number;
	/**
	 * Name of the PO. Array describe the hieracy of the name, e.g. ["classA", "function1"].
	 */
	name: string[];
	/**
	 * Type of the PO.
	 */
	type: string;
	/**
	 * Location where the PO applies.
	 */
	location: Location;
	/**
	 * Source code of the PO. String array can be used to provide visual formatting information, e.g. the PO view can put a "\n\t" between each string in the array.
	 */
	source: string | string[];
	/**
	 * An optinal flag indicating if the PO has been proved.
	 */
	proved?: boolean;
}

/**
 * Parameters for the POG/generate request.
 */
export interface GeneratePOParams {
	/**
	 * Uri to the file/folder for which Proof Obligations should be generated.
	 */
	uri: string;
}

/**
 * POG/generate request and return type.
 */
export namespace GeneratePORequest {
	export const type = new RequestType<GeneratePOParams, ProofObligation[] | null, void, void>('lspx/POG/generate');
}

/**
 * Parameters for the POG/updated request.
 */
export interface POGUpdatedParams {
	/**
	 * Describes the state of the specification. True if POG is possible, False if not, e.g. the specification is not type-correct.
	 */
	successful: boolean;
}

/**
 * POG/updated notification. Sent by the server when there has been a change in the specification.
 */
export namespace POGUpdatedNotification {
	export const type = new NotificationType<POGUpdatedParams>('lspx/POG/updated')
}


////////////////////// Combinatorial Testing (CT) ///////////////////////////////////
/**
 * Describes a range of numbers, e.g. 1-10.
 */
export interface NumberRange {
	start: number;
	end: number;
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
 * Describes a grouping of traces. E.g. a class, classA, may have multiple traces which are all combined in a CTSymbol.
 */
export interface CTSymbol {
	/**
	 * Name of Trace group, e.g. "classA".
	 */
	name: string;
	/**
	 * Traces in the group.
	 */
	traces: Trace[];
}

/**
 * Overview information about a trace
 */
export interface Trace {
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
 * Test case information.
 */
export interface TestCase {
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
 * Kinds of test case verdicts.
 */
export enum VerdictKind {
	Passed = 1,
	Failed = 2,
	Inconclusive = 3,
	Filtered = 4,
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

/**
 * Parameters for the CT/traces request
 */
export interface TracesParameters {
	/**
	 * An optional uri to the file/folder for which Traces should be found.
	 */
	uri?: string;
}

/**
 * CT/traces request and return type.
 */
export namespace TracesRequest {
	export const type = new RequestType<TracesParameters, CTSymbol[] | null, void, void>('lspx/CT/traces');
}

/**
 * Parameters for the CT/generate request
 */
export interface CTGenerateParameters {
	/**
	 * Fully qualified name of the trace, which test cases should be generated based on.
	 */
	name: string;
}

/**
 * CT/generate request and return type.
 */
export namespace CTGenerateRequest {
	export const type = new RequestType<CTGenerateParameters, number | null, void, void>('lspx/CT/generate');
}

/**
 * Parameters for the CT/execute request.
 */
export interface CTExecuteParameters extends WorkDoneProgressParams, PartialResultParams {
	/**
	 * Fully qualified name of the trace, which test cases should be executed from.
	 */
	name: string;
	/**
	 * Optional filters that should be applied to the exectution. If not there the server should use default settings.
	 */
	filter?: CTFilterOption[];
	/**
	 * An optional range of tests that should be executed. If not there all tests for the trace are executed.
	 */
	range?: NumberRange;
}

/**
 * CT/execute request and return type.
 */
export namespace CTExecuteRequest {
	export const type = new RequestType<CTExecuteParameters, TestCase[] | null, void, void>('lspx/CT/execute');
}
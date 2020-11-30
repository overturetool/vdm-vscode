import { NotificationType, RequestType, Location, PartialResultParams, WorkDoneProgressParams, ProgressType, WorkDoneProgressOptions, DocumentUri } from "vscode-languageclient";
import { ProtocolRequestType } from "vscode-languageserver-protocol/lib/messages";
/**
 * The experimental capabilities that the server can reply.
 */
export interface ExperimentalCapabilities {
	/**
	 * Capabilities specific to the `slsp/POG/` messages.
	 */
	proofObligationProvider?: boolean;
	/**
	 * Capabilities specific to the `slsp/CT/` messages.
	 */
	combinatorialTestProvider?: boolean | CombinatorialTestOptions;
	/**
	 * Capabilities specific to the `slsp/translate` message.
	 */
	translateProvider?: boolean;
}

////////////////////// Translate to LaTex /////////////////////////////
/**
 * Parameters for the translate request.
 */
export interface TranslateParams {
	/**
	 * DocumentUri specifying the root of the project to translate.
	 */
	uri?: DocumentUri;
	/**
	 * language id defined by a LanguageKind or a string.
	 */
	language: LanguageKind | string;
	/**
	 * DocumentUri specifying the location of the resulting translation.
	 * This should be an existing empty folder.
	 */
	saveUri: DocumentUri;
}

/**
 * translate request and return type.
 */
export namespace TranslateRequest {
	export const type = new RequestType<TranslateParams, TranslateResponse | null, void, void>('slsp/translate');
}

/**
 * Response to the 'slsp/translate' request
 */
export interface TranslateResponse {
	/**
	 * URI specifying the "main" file of the resulting translation (if multiple files are generated, this is the uri to where "main" is).
	 */
	uri: DocumentUri;
}

/**
 * The kind of a language.
 */
export enum  LanguageKind {
	Latex = 1,
	UML = 2,
    B = 3,
    Z = 4,
    HOL = 5,
    Alloy = 6,
    C = 7,
    Cpp = 8
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
	 * Name of the PO.
	 * Array describe the hieracy of the name, 
	 * e.g. ["classA", "function1"].
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
	 * Source code of the PO. 
	 * String array can be used to provide visual formatting 
	 * information, e.g. the PO view can put a "\n\t" between 
	 * each string in the array.
	 */
	source: string | string[];
	/**
	 * An optional flag indicating if the PO has been proved.
	 */
	proved?: boolean;
}

/**
 * Parameters for the POG/generate request.
 */
export interface GeneratePOParams {
	/**
	 * Uri to the file/folder for which Proof Obligations
	 * should be generated.
	 */
	uri: string;
}

/**
 * POG/generate request and return type.
 */
export namespace GeneratePORequest {
	export const type = new RequestType<GeneratePOParams, ProofObligation[] | null, void, void>('slsp/POG/generate');
}

/**
 * Parameters for the POG/updated request.
 */
export interface POGUpdatedParams {
	/**
	 * Describes the state of the specification. 
	 * True if POG is possible.
	 * False otherwise, e.g. the specification is not type-correct.
	 */
	successful: boolean;
}

/**
 * POG/updated notification. Sent by the server when there has been a change in the specification.
 */
export namespace POGUpdatedNotification {
	export const type = new NotificationType<POGUpdatedParams>('slsp/POG/updated')
}


////////////////////// Combinatorial Testing (CT) ///////////////////////////////////
/**
 * Options for the combinatorial testing feature. 
 */
export interface CombinatorialTestOptions extends WorkDoneProgressOptions {
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
export interface CTTracesParameters {
	/**
	 * An optional uri to the file/folder for which Traces should be found.
	 */
	uri?: string;
}

/**
 * CT/traces request and return type.
 */
export namespace CTTracesRequest {
	export const type = new RequestType<CTTracesParameters, CTSymbol[] | null, void, void>('slsp/CT/traces');
}

/**
 * Parameters for the CT/generate request
 */
export interface CTGenerateParameters 
	extends WorkDoneProgressParams {
	/**
	 * Fully qualified name of the trace, which test cases should be 
	 * generated based on.
	 */
	name: string;
}

/**
 * CT/generate request and return type.
 */
export namespace CTGenerateRequest {
	export const type = new RequestType<CTGenerateParameters, CTGenerateResponse | null, void, void>('slsp/CT/generate');
}

/**
 * Response to the 'slsp/CT/generate' request
 */
export interface CTGenerateResponse {
	/**
	 * The number of tests that is generated from the trace.
	 */
	numberOfTests: number
}

/**
 * Parameters for the CT/execute request.
 */
export interface CTExecuteParameters 
	extends WorkDoneProgressParams, PartialResultParams {
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
 * CT/execute request and return type.
 */
export namespace CTExecuteRequest {
	export const method = 'slsp/CT/execute';
	export const type = new ProtocolRequestType<CTExecuteParameters, CTTestCase[] | null, CTTestCase[], void, void>(method);
	export const resultType = new ProgressType<CTTestCase[]>();
}


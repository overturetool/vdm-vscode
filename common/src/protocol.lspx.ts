import { NotificationType, RequestType, Location } from "vscode-languageclient";

/**
 * The experimental capabilities that the server can reply
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
	 * Location where the PO applies
	 */
	location: Location;
	/**
	 * Source code of the PO. String array can be used to provide visual formatting information, e.g. the PO view can put a "\n\t" between each string in the array 
	 */
    source: string | string[];
    proved?: boolean;
}

/**
 * Parameters for the POG/generate request
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
    successful: boolean
}

/**
 * POG/updated notification. Sent by the server when there has been a change in the specification.
 */
export namespace POGUpdatedNotification {
    export const type = new NotificationType<POGUpdatedParams>('lspx/POG/updated')
}


////////////////////// Combinatorial Testing (CT) ///////////////////////////////////
export interface ctFilterOption {
	key: string,                
	value: string | number | boolean
}


export interface CTSymbol
{
	name: string,
	traces: Trace[]
}

export interface Trace
{
	name: string,
	id: number,
	location: Location | null, 	
	verdict: VerdictKind,
	testResults?: TestResult[]
}

export interface TestResult
{
	id: number,
	verdict: VerdictKind,
	cases: TestCase[]
}

export enum VerdictKind {
	Passed = 1,
	Failed = 2,
	Inconclusive = 3,
	Filtered = 4,	
}

export interface TestCase {
	case: string,
	result: string | null
}

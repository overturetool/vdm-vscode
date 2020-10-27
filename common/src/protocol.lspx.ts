import { Location } from "vscode";
import { NotificationType, RequestType } from "vscode-languageclient";

/**
 * The experimental capabilities that the server can reply
 */
export interface ExperimentalCapabilities {
    proofObligationProvider?: boolean;
    combinatorialTestingProvider: boolean;
}


/**
 * Proof Obligation Generation interfaces and namespaces for extension messages
 */
export interface ProofObligation {
    id: number;
    name: string[];
    type: string;
    location: Location;
    source: string | string[];
    proved?: boolean;
}

export interface GeneratePOParams {
    uri: string;
}

export interface POGUpdatedParams {
    successful: boolean
}

export namespace GeneratePORequest {
    export const type = new RequestType<GeneratePOParams, ProofObligation[] | null, void, void>('lspx/POG/generate');
}

export namespace POGUpdatedNotification {
    export const type = new NotificationType<POGUpdatedParams>('lspx/POG/updated')
}

/**
 * Combinatorial Testing interfaces and namespaces for extension messages
 */

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

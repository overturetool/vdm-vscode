////////////////////////////////////////////// POG messsage extensions //////////////////////////////////////////////////

import { Location } from "vscode";
import { RequestType } from "vscode-languageclient";
import * as lspclient from "vscode-languageclient"

export interface VDMSourceCode {
	source: string;
}

export interface ProofObligationHeader {
	id: number;
	kind: string;
	name: string;
	location: Location;
}

export interface ProofObligation {
	id: number;
	type: string;
	location: Location;
	source: VDMSourceCode;
}

export interface GeneratePOParams {
	uri: string;
	range?: lspclient.Range;
}

export namespace GeneratePORequest {
	export const type = new RequestType<GeneratePOParams, ProofObligationHeader[] | null, void, void>('lspx/POG/generate');
}

export interface RetrievePOParams {
	ids: number[];
}

export namespace RetrievePORequest {
	export const type = new RequestType<RetrievePOParams, ProofObligation[] | null, void, void>('lspx/POG/retrieve');
}


////////////////////////////////////////////// POG messsage extensions //////////////////////////////////////////////////

import { Location, Range } from "vscode";
import { RequestType } from "vscode-languageclient";

export interface LspxParams {
	submethod: string
}

export interface VDMSourceCode {
	source: string;
}

export interface ProofObligationHeader {
	id: number;
	name: string;
	type: string;
}

export interface ProofObligation {
	id: number;
	type: string;
	location: Location;
	source: VDMSourceCode;
}

export interface GeneratePOParams extends LspxParams {
	uri: string;
	range?: Range;
}

export namespace GeneratePORequest {
	export const type = new RequestType<GeneratePOParams, ProofObligationHeader[] | null, void, void>('lspx');
}

export interface RetrievePOParams extends LspxParams {
	ids: number[];
}

export namespace RetrievePORequest {
	export const type = new RequestType<RetrievePOParams, ProofObligation[] | null, void, void>('lspx');
}


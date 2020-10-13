import { Location } from "vscode";
import { RequestType } from "vscode-languageclient";
import * as lspclient from "vscode-languageclient"


////////////////////////////////////////////// POG messsage extensions //////////////////////////////////////////////////
export interface VDMSourceCode {
	source: string;
}

export interface ProofObligation {
	id: number;
	name: string[];
	type: string;
	location: Location;
	source: VDMSourceCode;
	proved?: boolean;
}

export interface GeneratePOParams {
	uri: string;
	range?: lspclient.Range;
}

export namespace GeneratePORequest {
	export const type = new RequestType<GeneratePOParams, ProofObligation[] | null, void, void>('lspx/POG/generate');
}



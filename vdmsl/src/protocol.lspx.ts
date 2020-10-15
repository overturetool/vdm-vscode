import { Location } from "vscode";
import { NotificationType, RequestType } from "vscode-languageclient";
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

export interface POGUpdatedParams {
	uri ?: string, 			// TODO: Remove once nick removes it from the server
	successful : boolean
}

export namespace POGUpdatedNotification {
	export const type = new NotificationType<POGUpdatedParams>('lspx/POG/updated')
}

/**
 * The experimental capabilities that the server can reply
 */
export interface ExperimentalCapabilities {
	proofObligationProvider ?: boolean
}
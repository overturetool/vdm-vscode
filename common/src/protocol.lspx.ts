import { Location } from "vscode";
import { NotificationType, RequestType } from "vscode-languageclient";


////////////////////////////////////////////// POG messsage extensions //////////////////////////////////////////////////

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

export namespace GeneratePORequest {
    export const type = new RequestType<GeneratePOParams, ProofObligation[] | null, void, void>('lspx/POG/generate');
}

export interface POGUpdatedParams {
    successful: boolean
}

export namespace POGUpdatedNotification {
    export const type = new NotificationType<POGUpdatedParams>('lspx/POG/updated')
}

/**
 * The experimental capabilities that the server can reply
 */
export interface ExperimentalCapabilities {
    proofObligationProvider?: boolean
}
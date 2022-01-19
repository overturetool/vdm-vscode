// SPDX-License-Identifier: GPL-3.0-or-later

import { CancellationToken, DocumentUri, HandlerResult, Location, NotificationHandler, NotificationType, RequestHandler, RequestType } from "vscode-languageclient";

export interface ProofObligationGenerationClientCapabilities {
    /**
     * The experimental client capabilities.
     */
    experimental: {
        /**
         * The client has support for proof obligation generation.
         */
        proofObligationGeneration?: boolean;
    }
}
export interface ProofObligationGenerationServerCapabilities {
    /**
     * The experimental server capabilities.
     */
    experimental: {
        /**
         * Capabilities specific to the `slsp/POG/` messages.
         */
        proofObligationProvider?: boolean;
    }
}

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
     * An optional status of the PO, e.g., "Unproved" or "Proved".
     */
    status?: string;
}

/**
 * The `slsp/POG/generate` request is sent from the client to the server to fetch the proof obligations for a specification.
 */
export namespace GeneratePORequest {
    export const type = new RequestType<GeneratePOParams, ProofObligation[] | null, void>('slsp/POG/generate');
    export type HandlerSignature = RequestHandler<GeneratePOParams, ProofObligation[] | null, void>;
    export type MiddlewareSignature = (params: GeneratePOParams, token: CancellationToken, next: HandlerSignature) => HandlerResult<ProofObligation[] | null, void>;
}

/**
 * The parameters of a `slsp/POG/generate` request.
 */
export interface GeneratePOParams {
    /**
     * Uri to the file/folder for which Proof Obligations
     * should be generated.
     */
    uri: DocumentUri;
}

/**
 * The `slsp/POG/updated` notification is sent from the server when there has been a change in the specification.
 */
export namespace POGUpdatedNotification {
    export const type = new NotificationType<POGUpdatedParams>('slsp/POG/updated');
    export type HandlerSignature = NotificationHandler<POGUpdatedParams>;
    export type MiddlewareSignature = (params: POGUpdatedParams, next: HandlerSignature) => void;
}

/**
 * The parameters of a `slsp/POG/updated` notification.
 */
export interface POGUpdatedParams {
    /**
     * Describes the state of the specification. 
     * True if POG is possible.
     * False otherwise, e.g. the specification is not type-correct.
     */
    successful: boolean;
}
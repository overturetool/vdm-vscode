// SPDX-License-Identifier: GPL-3.0-or-later

import {
    CancellationToken,
    DocumentUri,
    HandlerResult,
    Location,
    NotificationHandler,
    NotificationType,
    RequestHandler,
    RequestType,
    RequestType0,
} from "vscode-languageclient";
import { VdmLaunchConfiguration } from "../../handlers/AddRunConfigurationHandler";

export interface ProofObligationGenerationClientCapabilities {
    /**
     * The experimental client capabilities.
     */
    experimental: {
        /**
         * The client has support for proof obligation generation.
         */
        proofObligationGeneration?: boolean;
    };
}
export interface ProofObligationGenerationServerCapabilities {
    /**
     * The experimental server capabilities.
     */
    experimental: {
        /**
         * Capabilities specific to the `slsp/POG/` messages.
         */
        proofObligationProvider?: ProofObligationProviderCapability;
    };
}

interface ProofObligationProviderCapability {
    /**
     * Indicates if the language server is capable of QuickCheck. Is undefined if the capability is not present.
     */
    quickCheckProvider?: boolean;
}

/**
 * Parameters describing a Proof Obligation (PO) and meta data.
 */
export interface ProofObligationLaunchConfiguration extends VdmLaunchConfiguration {
    command: string;
}

export type CounterExampleVariables = Record<string, unknown>;

export interface ProofObligationCounterExample {
    launch: ProofObligationLaunchConfiguration;
    variables: CounterExampleVariables;
}

export type ProofObligationWitness = ProofObligationCounterExample;

export interface ProofObligation extends Omit<QuickCheckInfo, "status" | "id"> {
    /**
     * Unique identifier of the PO.
     */
    id: number;
    /**
     * Type of the PO.
     */
    kind: string;
    /**
     * Name of the PO.
     * Array describe the hieracy of the name,
     * e.g. ["classA", "function1"].
     */
    name: string[];
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

export interface QuickCheckInfo {
    /**
     * Unique identifier of the PO.
     */
    id: number;
    /**
     * An optional status of the PO, e.g., "Unproved" or "Proved".
     */
    status?: string;
    /**
     * The strategy used by QuickCheck to prove the obligation, e.g. "trivial" or "witness".
     */
    provedBy?: string;
    /**
     * Message provided by QuickCheck to provide context to the proof status.
     */
    message?: string;
    /**
     * An example that disproves a proof obligation, i.e. a set of variables that show that the PO fails.
     * Contains a launch command that is runnable in a debug session.
     */
    counterexample: ProofObligationCounterExample;
    /**
     * A witness to a satisfiablity obligation, i.e. a set of variables that show that the PO is satisfiable.
     * Contains a launch command that is runnable in a debug session.
     */
    witness: ProofObligationWitness;
}

/**
 * The `slsp/POG/generate` request is sent from the client to the server to fetch the proof obligations for a specification.
 */
export namespace GeneratePORequest {
    export const type = new RequestType<GeneratePOParams, ProofObligation[] | null, void>("slsp/POG/generate");
    export type HandlerSignature = RequestHandler<GeneratePOParams, ProofObligation[] | null, void>;
    export type MiddlewareSignature = (
        params: GeneratePOParams,
        token: CancellationToken,
        next: HandlerSignature
    ) => HandlerResult<ProofObligation[] | null, void>;
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
    export const type = new NotificationType<POGUpdatedParams>("slsp/POG/updated");
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
    successful?: boolean;
    /**
     * Whether quickcheck was successful.
     * True if POG ran successfully.
     * False otherwise. Not present if quickcheck was not run.
     */
    quickcheck?: boolean;
}

/**
 * The `slsp/POG/quickcheck` request is sent from the client to the server to run the QuickCheck tool on the proof obligations of a specification.
 */
export namespace RunQuickCheckRequest {
    export const type = new RequestType0<QuickCheckInfo[], void>("slsp/POG/quickcheck");
    export type HandlerSignature = RequestHandler<void, QuickCheckInfo[], void>;
    export type MiddlewareSignature = (
        params: void,
        token: CancellationToken,
        next: HandlerSignature
    ) => HandlerResult<QuickCheckInfo[], void>;
}

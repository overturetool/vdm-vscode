// SPDX-License-Identifier: GPL-3.0-or-later

import { RequestType, Location, DocumentUri } from "vscode-languageclient";

/**
 * Parameters for the lemmas request.
 */
interface TPLemmasParams {
    /**
     * The scope of the project files.
     */
    projectUri?: DocumentUri;
}

/**
 * TP/lemmas request and return type.
 */
export namespace TPLemmasRequest {
    export const type = new RequestType<TPLemmasParams, Lemma[] | null, void>("slsp/TP/lemmas");
}

/**
 * Parameters for the begin proof request.
 */
interface TPBeginProofParams {
    /**
     * Name of the lemma that is to be proved.
     */
    name: string;
}

/**
 * TP/beginProof request and return type.
 */
export namespace TPBeginProofRequest {
    export const type = new RequestType<TPBeginProofParams, ProofState | null, void>("slsp/TP/beginProof");
}

/**
 * Parameters for the prove request.
 */
interface TPProveParams {
    /**
     * Name of the lemma that is to be proved.
     * If proof in progress that lemma is assumed.
     */
    name?: string;
}

/**
 * Response to the prove request.
 */
interface TPProveResponse {
    /**
     * Status of the proof.
     */
    status: ProofStatus;
    /**
     * Processing time in milliseconds
     */
    time?: number;
    /**
     * Suggested commands to apply
     */
    command?: string[];
    /**
     * Humans-readable description of:
     * Counter example, proof steps, etc.
     */
    description?: string;
}

/**
 * TP/prove request and return type.
 */
export namespace TPProveRequest {
    export const type = new RequestType<TPProveParams, TPProveResponse | null, void>("slsp/TP/prove");
}

/**
 * TP/getCommands request and return type.
 */
export namespace TPGetCommandsRequest {
    export const type = new RequestType<null, TPCommand[] | null, void>("slsp/TP/getCommands");
}

/**
 * Parameters for the command request.
 */
interface TPCommandParams {
    /**
     * The command and arguments identified by a string.
     */
    command: string;
}

/**
 * Response to the command request.
 */
interface TPCommandResponse {
    /**
     * Description of the result of the command,
     * e.g. accepted, error, no change.
     */
    description: string;
    /**
     * State of the proof after the command.
     */
    state: ProofState;
}

/**
 * TP/command request and return type.
 */
export namespace TPCommandRequest {
    export const type = new RequestType<TPCommandParams, TPCommandResponse | null, void>("slsp/TP/command");
}

/**
 * Parameters for the undo request.
 */
interface TPUndoParams {
    /**
     * Id of the step that must be undone.
     * If empty, undo last step.
     */
    id?: number;
}

/**
 * TP/undo request and return type.
 */
export namespace TPUndoRequest {
    export const type = new RequestType<TPUndoParams, ProofState | null, void>("slsp/TP/undo");
}

/**
 * Type describing the status of a proof
 */
type ProofStatus = "proved" | "disproved" | "untried" | "unfinished" | "timeout" | "unchecked";

/**
 * Parameters describing a Lemma and meta data.
 */
interface Lemma {
    /**
     * Unique name of the lemma.
     */
    name: string;
    /**
     * Name of the theory that the lemma belongs to.
     */
    theory: string;
    /**
     * Identifies the location of the lemma.
     */
    location: Location;
    /**
     * Theorem, Lemma, corollary etc.
     */
    kind: string;
    /**
     * Status of the proof of the lemma
     */
    status: ProofStatus;
}

/**
 * Parameters describing the state of a proof and meta data.
 */
interface ProofState {
    /**
     * Proof step id.
     */
    id: number;
    /**
     * Status of the proof.
     */
    status: ProofStatus | string;
    /**
     * Subgoals, empty if proved.
     */
    subgoals: string[];
    /**
     * Rules used for this step.
     */
    rules?: string[];
}

/**
 * Parameters describing a theorem proving command.
 */
interface TPCommand {
    /**
     * Command name.
     */
    name: string;
    /**
     * Description of the command.
     */
    description: string;
}

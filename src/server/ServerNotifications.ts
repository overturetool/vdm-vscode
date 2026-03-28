// SPDX-License-Identifier: GPL-3.0-or-later

import { NotificationHandler, NotificationType } from "vscode-languageclient";

/**
 * The `slsp/checked` notification is sent from the server when it has parsed/checked the specification.
 * This happens whenever a build is initiated on the server side, e.g. by adding a new file or saving an existing file.
 */
export namespace CompletedParsingNotification {
    export const type = new NotificationType<CompletedParsingParams>("slsp/checked");
    export type HandlerSignature = NotificationHandler<CompletedParsingParams>;
    export type MiddlewareSignature = (params: CompletedParsingParams, next: HandlerSignature) => void;
}

/**
 * The parameters of a `slsp/checked` notification.
 */
export interface CompletedParsingParams {
    /**
     * Describes the state of the parse/check.
     * True if successful.
     * False otherwise, e.g. the parse/check failed.
     */
    successful: boolean;
}

/**
 * The `$/ignoreNextChange` notification is sent from the client to the server to indicate
 * that the next document change at the specified location should be ignored by the server.
 * This is used to trigger a VSCode outline refresh after a typecheck completes, by inserting
 * and immediately removing a space at the end of the file. Since these edits are not real
 * changes to the specification, the server should ignore them.
 * Two notifications are sent: one for the insert and one for the subsequent delete.
 */
export namespace IgnoreNextChangeNotification {
    export const type = new NotificationType<IgnoreNextChangeParams>("$/ignoreNextChange");
}

/**
 * The parameters of a `$/ignoreNextChange` notification.
 */
export interface IgnoreNextChangeParams {
    /** The URI of the document being changed. */
    uri: string;
    /** The range of the change to ignore, matching the range in the corresponding didChange message. */
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    /** The text of the change to ignore. Empty string for a deletion. */
    text: string;
}

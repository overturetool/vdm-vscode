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

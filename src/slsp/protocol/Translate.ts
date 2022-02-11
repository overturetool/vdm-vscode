// SPDX-License-Identifier: GPL-3.0-or-later

import {
    CancellationToken,
    DocumentUri,
    HandlerResult,
    RequestHandler,
    RequestType,
    URI,
    WorkDoneProgressOptions,
    WorkDoneProgressParams,
} from "vscode-languageclient";

export interface TranslateClientCapabilities {
    /**
     * The experimental client capabilities.
     */
    experimental: {
        /**
         * The client has support for translation.
         */
        translateProvider?: boolean;
    };
}
export interface TranslateServerCapabilities {
    /**
     * The experimental server capabilities.
     */
    experimental: {
        /**
         * Capabilities specific to the `slsp/TR` message.
         */
        translateProvider?: boolean | TranslateOptions;
    };
}
/**
 * Options for the translate feature.
 */
export interface TranslateOptions extends WorkDoneProgressOptions {
    languageId: string | string[];
}

/**
 * The `slsp/TR/translate` is sent from the client to the server to translate a document/folder.
 */
export namespace TranslateRequest {
    export const method = "slsp/TR/translate";
    export const type = new RequestType<TranslateParams, TranslateResponse | null, void>("slsp/TR/translate");
    export type HandlerSignature = RequestHandler<TranslateParams, TranslateResponse | null, void>;
    export type MiddlewareSignature = (
        params: TranslateParams,
        token: CancellationToken,
        next: HandlerSignature
    ) => HandlerResult<TranslateResponse | null, void>;
}

/**
 * Parameters for the `slsp/TR/translate` request.
 */
export interface TranslateParams extends WorkDoneProgressParams {
    /**
     * Uri specifying the root of the project to translate.
     */
    uri?: URI;
    /**
     * language id defined by a LanguageKind or a string.
     */
    languageId: string;
    /**
     * Uri specifying the location of the resulting
     * translation.
     * This should be an existing empty folder.
     */
    saveUri: URI;
    /**
     * Options that the command handler should be invoked with.
     */
    options?: any; //TODO make LSPAny[] when LSP 3.17 is released
}

/**
 * Response to the 'slsp/TR/translate' request
 */
export interface TranslateResponse {
    /**
     * URI specifying the "main" file of the resulting translation
     * if multiple files are generated, this is the uri to where
     * "main" is.
     */
    uri: DocumentUri;
}

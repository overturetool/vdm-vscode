// SPDX-License-Identifier: GPL-3.0-or-later

import {
    CancellationToken,
    DocumentUri,
    HandlerResult,
    RequestHandler,
    RequestType,
    URI,
    WorkDoneProgressParams,
} from "vscode-languageclient";

export interface CoverageClientCapabilities {
    experimental: {
        coverageProvider?: boolean;
    };
}

export interface CoverageServerCapabilities {
    experimental: {
        coverageProvider?: boolean;
    };
}

export namespace CoverageRequest {
    export const method = "slsp/TR/coverage";
    export const type = new RequestType<CoverageParams, CoverageResponse | null, void>("slsp/TR/coverage");
    export type HandlerSignature = RequestHandler<CoverageParams, CoverageResponse | null, void>;
    export type MiddlewareSignature = (
        params: CoverageParams,
        token: CancellationToken,
        next: HandlerSignature,
    ) => HandlerResult<CoverageResponse | null, void>;
}

/**
 * Params for slsp/TR/coverage. Same shape as TranslateParams minus languageId,
 * which the server ignores for this method.
 */
export interface CoverageParams extends WorkDoneProgressParams {
    uri?: URI;
    saveUri: URI;
    options?: any;
}

export interface CoverageResponse {
    uri: DocumentUri;
}

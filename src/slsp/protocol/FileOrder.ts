// SPDX-License-Identifier: GPL-3.0-or-later

import { RequestHandler, RequestType, URI } from "vscode-languageclient";

export namespace FileOrderRequest {
    export const method = "slsp/ordering";
    export const type = new RequestType<FileOrderParams, FileOrderResponse | null, void>("slsp/ordering");
    export type HandlerSignature = RequestHandler<FileOrderParams, FileOrderResponse | null, void>;
}

export interface FileOrderParams {
    uri: URI;
}

export interface FileOrderResponse {
    files: string[];
}

export interface FileOrderClientCapabilities {
    experimental: {
        orderingProvider: boolean;
    };
}

export interface FileOrderServerCapabilities {
    experimental?: {
        orderingProvider?: boolean;
    };
}

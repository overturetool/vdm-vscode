// SPDX-License-Identifier: GPL-3.0-or-later

import { RequestHandler0, RequestType0 } from "vscode-languageclient";

export namespace FileOrderRequest {
    export const method = "slsp/ordering";
    export const type = new RequestType0<FileOrderResponse | null, void>("slsp/ordering");
    export type HandlerSignature = RequestHandler0<FileOrderResponse | null, void>;
}

export type FileOrderResponse = string[];

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

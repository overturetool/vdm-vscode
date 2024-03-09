import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ProofObligationsView } from "./proof_obligations/ProofObligationsView";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";

const webViews = {
    ProofObligations: ProofObligationsView,
};

type WebviewKeys = keyof typeof webViews;

export function renderWebview(
    rootId: string,
    webviewName: WebviewKeys,
    vsCodeApi: any,
    nonce: string,
    options: Record<string, unknown>
) {
    const ViewComponent = webViews[webviewName];
    const secureCache = createCache({
        nonce: nonce,
        key: "vdm-vscode",
    });
    const rootDomNode = document.getElementById(rootId);

    if (rootDomNode) {
        const root = createRoot(rootDomNode);

        root.render(
            <StrictMode>
                <CacheProvider value={secureCache}>
                    <ViewComponent vscodeApi={vsCodeApi} {...options} />
                </CacheProvider>
            </StrictMode>
        );
    }
}

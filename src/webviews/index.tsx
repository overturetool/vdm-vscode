import React from 'react';
import ReactDom from 'react-dom';
import { ProofObligationsView } from './components/ProofObligationsView';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';


const webViews = {
    "ProofObligations": ProofObligationsView
}

export function renderWebview(rootId, webviewName, vsCodeApi, nonce: string) {
    const ViewComponent = webViews[webviewName]
    const secureCache = createCache({
        "nonce": nonce,
        "key": "vdm-vscode"
    })
    ReactDom.render(<CacheProvider value={secureCache}><ViewComponent vscodeApi={vsCodeApi}/></CacheProvider>, document.getElementById(rootId));
}
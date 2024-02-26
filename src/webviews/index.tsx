import React from 'react';
import ReactDom from 'react-dom';
import { ProofObligationsView } from './components/ProofObligationsView';


const webViews = {
    "ProofObligations": <ProofObligationsView />
}

export function renderWebview(rootId, webviewName) {
    ReactDom.render(webViews[webviewName], document.getElementById(rootId));
}
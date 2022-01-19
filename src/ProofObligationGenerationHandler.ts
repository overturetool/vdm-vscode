// SPDX-License-Identifier: GPL-3.0-or-later

import { ExtensionContext, Uri, window, workspace } from "vscode";
import { ProofObligationPanel } from "./ProofObligationPanel";
import { GeneratePOParams, GeneratePORequest } from "./protocol/slsp/proofObligationGeneration";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as util from "./Util"

export class ProofObligationGenerationHandler {
    private _lastUri: Uri;

    constructor(
        private _clients: Map<string, SpecificationLanguageClient>,
        private _context: ExtensionContext) {

        util.registerCommand(this._context, "vdm-vscode.runPOG", inputUri => this.run(inputUri));
        util.registerCommand(this._context, "vdm-vscode.updatePOG", inputUri => this.update(inputUri));
    }

    async run(inputUri: Uri, revealPOGView: boolean = true) {
        this._lastUri = inputUri; // Store for automatic update
        window.setStatusBarMessage("Running Proof Obligation Generation", 2000);

        const wsFolder = workspace.getWorkspaceFolder(inputUri);
        const client = this._clients.get(wsFolder.uri.toString());

        try {
            // Setup message parameters
            let params: GeneratePOParams = {
                uri: client.code2ProtocolConverter.asUri(inputUri)
            };

            // Send request
            const pos = await client.sendRequest(GeneratePORequest.type, params);

            // Create new view or show existing POG View
            let workspaceName = (workspace.workspaceFolders.length > 1 ? wsFolder.name : undefined)
            ProofObligationPanel.createOrShowPanel(Uri.file(this._context.extensionPath), revealPOGView, workspaceName);
            ProofObligationPanel.currentPanel.displayNewPOS(pos);
        }
        catch (error) {
            window.showInformationMessage("Proof obligation generation failed. " + error);
        }
    }

    update(inputUri: Uri) {
        if (this._lastUri?.toString().startsWith(inputUri.toString()))
            inputUri = this._lastUri;

        this.run(inputUri, false);
    }
}
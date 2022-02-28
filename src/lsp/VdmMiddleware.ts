// SPDX-License-Identifier: GPL-3.0-or-later

import { ProviderResult, TextDocument, CancellationToken, CodeLens, workspace } from "vscode";
import { Middleware, ProvideCodeLensesSignature } from "vscode-languageclient";

export default class VdmMiddleware implements Middleware {
    provideCodeLenses(
        this: void,
        document: TextDocument,
        token: CancellationToken,
        next: ProvideCodeLensesSignature
    ): ProviderResult<CodeLens[]> {
        // Check if code lenses have been disabled
        const wsFolder = workspace.getWorkspaceFolder(document.uri);
        const config = workspace.getConfiguration("vdm-vscode.codeLenses", wsFolder);
        const enabled = config.get("enabled", true);

        // Do the request
        if (enabled) return next(document, token);
        // Kill the request
        else return [];
    }
}

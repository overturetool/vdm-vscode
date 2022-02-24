// SPDX-License-Identifier: GPL-3.0-or-later

import { ProviderResult, TextDocument, CancellationToken, CodeLens, workspace } from "vscode";
import { ProvideCodeLensesSignature, _Middleware } from "vscode-languageclient";

export function provideCodeLensesMiddleware(
    this: void,
    document: TextDocument,
    token: CancellationToken,
    next: ProvideCodeLensesSignature
): ProviderResult<CodeLens[]> {
    const wsFolder = workspace.getWorkspaceFolder(document.uri);
    const config = workspace.getConfiguration("vdm-vscode.codeLenses", wsFolder);
    const enabled = config.get("enabled", true);
    if (enabled) return next(document, token);
    else return [];
}

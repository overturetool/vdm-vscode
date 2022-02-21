// SPDX-License-Identifier: GPL-3.0-or-later

import { Disposable } from "vscode";
import * as Util from "./Util";

export class AddToClassPathHandler implements Disposable {
    private _disposables: Disposable[] = [];

    constructor() {
        Util.registerCommand(this._disposables, "vdm-vscode.addFoldersToClassPath", () =>
            Util.addToSettingsArray(true, "class path", "vdm-vscode.server", "classPathAdditions")
        );
        Util.registerCommand(this._disposables, "vdm-vscode.addFilesToClassPath", () =>
            Util.addToSettingsArray(false, "class path", "vdm-vscode.server", "classPathAdditions")
        );
    }
    dispose(): void {
        while (this._disposables.length) this._disposables.pop().dispose();
    }
}

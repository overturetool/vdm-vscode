// SPDX-License-Identifier: GPL-3.0-or-later

import AutoDisposable from "../helper/AutoDisposable";
import * as Util from "../util/Util";

export class AddToClassPathHandler extends AutoDisposable {
    constructor() {
        super();
        Util.registerCommand(this._disposables, "vdm-vscode.addFoldersToClassPath", () =>
            Util.addToSettingsArray(true, "class path", "vdm-vscode.server", "classPathAdditions")
        );
        Util.registerCommand(this._disposables, "vdm-vscode.addFilesToClassPath", () =>
            Util.addToSettingsArray(false, "class path", "vdm-vscode.server", "classPathAdditions")
        );
    }
}

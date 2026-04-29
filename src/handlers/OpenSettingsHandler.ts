// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, Disposable } from "vscode";

export class OpenSettingsHandler implements Disposable {
    private readonly disposable: Disposable;

    constructor() {
        this.disposable = commands.registerCommand("vdm-vscode.openSettings", () => {
            commands.executeCommand("workbench.action.openWorkspaceSettings", "@ext:overturetool.vdm-vscode");
        });
    }

    dispose() {
        this.disposable.dispose();
    }
}

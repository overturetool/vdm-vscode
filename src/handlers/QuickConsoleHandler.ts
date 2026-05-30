// SPDX-License-Identifier: GPL-3.0-or-later

import * as Util from "../util/Util";
import { workspace, window } from "vscode";
import { VdmDapSupport } from "../dap/VdmDapSupport";
import { getActiveEditorVdmContext } from "../util/DialectUtil";
import AutoDisposable from "../helper/AutoDisposable";

export class QuickConsoleHandler extends AutoDisposable {
    constructor() {
        super();
        Util.registerCommand(this._disposables, "vdm-vscode.quickConsole", async () => {
            const activeDoc = window.activeTextEditor?.document;
            const wsFolder = activeDoc ? workspace.getWorkspaceFolder(activeDoc.uri) : undefined;

            if (!wsFolder) {
                window.showErrorMessage("No VDM workspace folder found.");
                return;
            }

            const editorContext = await getActiveEditorVdmContext(wsFolder);

            VdmDapSupport.startDebuggerWithCommand(undefined, wsFolder, false, false, editorContext?.moduleName);
        });
    }
}

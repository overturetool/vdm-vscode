// SPDX-License-Identifier: GPL-3.0-or-later

import { WorkspaceFolder } from "vscode";
import { VdmDapSupport as dapSupport } from "../dap/VdmDapSupport";

export class VdmjUmlInterpreterHandler {
    sendToInterpreter(folder: WorkspaceFolder | undefined) {
        let command: string = "vdm2uml ";
        dapSupport.startDebuggerWithCommand(command, folder, true);
    }
}

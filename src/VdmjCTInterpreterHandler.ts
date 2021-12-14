// SPDX-License-Identifier: GPL-3.0-or-later

import { WorkspaceFolder } from "vscode";
import { CTInterpreterHandler } from "./CTHandler";
import { VdmDapSupport as dapSupport } from "./VdmDapSupport"

export class VdmjCTInterpreterHandler implements CTInterpreterHandler {
    sendToInterpreter(trace: string, test: number, folder: WorkspaceFolder | undefined) {
        let command: string = "runtrace " + trace + " " + test.toString();
        dapSupport.startDebuggerWithCommand(command, folder, true);
    }
}
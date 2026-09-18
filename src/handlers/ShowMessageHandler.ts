// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, Disposable, window } from "vscode";
import { ShowMessageParams } from "../slsp/protocol/ShowMessage";

export class ShowMessageHandler implements Disposable {
    private readonly _command: Disposable;

    constructor() {
        this._command = commands.registerCommand("vdm-vscode.showMessage", (params: ShowMessageParams) => this.handle(params));
    }

    private handle(params: ShowMessageParams): void {
        if (!params?.message) {
            return;
        }
        const { message, severity } = params;

        switch (severity) {
            case "error":
                window.showErrorMessage(message);
                break;
            case "warning":
                window.showWarningMessage(message);
                break;
            default:
                window.showInformationMessage(message);
        }
    }

    dispose() {
        this._command.dispose();
    }
}

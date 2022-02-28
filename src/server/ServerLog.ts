// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from "fs-extra";
import { Uri, commands, window } from "vscode";
import AutoDisposable from "../helper/AutoDisposable";

export class ServerLog extends AutoDisposable {
    constructor(private _logFolderUri: Uri) {
        super();
        this._disposables.push(commands.registerCommand("vdm-vscode.openServerLog", this.openServerLog));
        this._disposables.push(commands.registerCommand("vdm-vscode.openServerLogFolder", this.openServerLogFolder));
    }

    get uri(): Uri {
        return this._logFolderUri;
    }

    private openServerLog() {
        if (!fs.existsSync(this._logFolderUri.fsPath)) return window.showErrorMessage("No logs found");

        const logsInFolder: string[] = fs.readdirSync(this._logFolderUri.fsPath).filter((x) => x.endsWith(".log"));

        if (!logsInFolder || logsInFolder.length == 0) return window.showErrorMessage("No logs found");

        if (logsInFolder.length == 1) {
            let uri = Uri.joinPath(this._logFolderUri, logsInFolder[0]);
            window.showTextDocument(uri);
        } else {
            window.showQuickPick(logsInFolder, { title: "select log to open", canPickMany: false }).then((log) => {
                if (log) {
                    let uri = Uri.joinPath(this._logFolderUri, log);
                    window.showTextDocument(uri);
                }
            });
        }
    }

    private openServerLogFolder() {
        fs.ensureDirSync(this._logFolderUri.fsPath);
        commands.executeCommand("revealFileInOS", this._logFolderUri);
    }
}

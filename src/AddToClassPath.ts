// SPDX-License-Identifier: GPL-3.0-or-later

import path = require("path");
import { ExtensionContext } from "vscode";
import * as Util from "./Util"

export class AddToClassPathHandler {
    constructor(
        context: ExtensionContext
    ) {
        Util.registerCommand(context, "vdm-vscode.addFoldersToClassPath", () => Util.addToSettingsArray(true, "class path", "vdm-vscode.server", "classPathAdditions"));
        Util.registerCommand(context, "vdm-vscode.addFilesToClassPath", () => Util.addToSettingsArray(false, "class path", "vdm-vscode.server", "classPathAdditions"));
    }
}



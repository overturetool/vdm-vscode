// SPDX-License-Identifier: GPL-3.0-or-later

import * as ExtensionInfo from "../ExtensionInfo";
import { extensions, Extension } from "vscode";

export function getExtension(): Extension<any> {
    return extensions.getExtension(ExtensionInfo.extensionId);
}

export function getExtensionPath(): string {
    const extension = getExtension();
    return extension.extensionPath;
}

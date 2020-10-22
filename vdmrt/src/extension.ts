import { ExtensionContext } from "vscode";
import * as vdmExtension from "../../common/src/extension"

export async function activate(context: ExtensionContext) {
    return vdmExtension.activate(context, "vdmrt");
}

export function deactivate(): Thenable<void> | undefined {
    return vdmExtension.deactivate();
}

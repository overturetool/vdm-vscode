// SPDX-License-Identifier: GPL-3.0-or-later

import { ConfigurationTarget, Uri, window, workspace, WorkspaceFolder } from "vscode";
import * as Fs from "fs-extra";
import * as Path from "path";
import AutoDisposable from "../helper/AutoDisposable";
import * as Util from "../util/Util";
import { dialectToPrettyFormat, VdmDialect } from "../util/DialectUtil";
import { expectedBinaryName, resolveVDMToolsInstallation } from "../util/VDMToolsUtil";

// Maps a dialect to the key used under the "vdm-vscode.vdmtools.path" setting.
const dialectToConfigKey: Map<VdmDialect, string> = new Map([
    [VdmDialect.VDMPP, "vdmpp"],
    [VdmDialect.VDMSL, "vdmsl"],
]);

/**
 * Registers the "Find File" commands linked from the description of the
 * vdm-vscode.vdmtools.path.* settings. Lets the user browse for either the VDMTools GUI binary
 * directly, or a folder from which the binary is inferred, and validates that the result is a real, executable
 * binary before saving it.
 */
export class SelectVDMToolsPathHandler extends AutoDisposable {
    constructor() {
        super();

        for (const dialect of dialectToConfigKey.keys()) {
            const configKey = dialectToConfigKey.get(dialect);
            Util.registerCommand(this._disposables, `vdm-vscode.selectVDMToolsPath.${configKey}`, () => this._selectPath(dialect));
        }
    }

    private async _selectPath(dialect: VdmDialect): Promise<void> {
        const configKey = dialectToConfigKey.get(dialect);
        const binaryName = expectedBinaryName(dialect);
        const prettyDialect = dialectToPrettyFormat.get(dialect);

        const wsFolder: WorkspaceFolder | undefined =
            (window.activeTextEditor && workspace.getWorkspaceFolder(window.activeTextEditor.document.uri)) ||
            workspace.workspaceFolders?.[0];

        const currentValue = workspace.getConfiguration("vdm-vscode.vdmtools.path", wsFolder?.uri).get<string>(configKey);
        const defaultUri = SelectVDMToolsPathHandler._nearestExistingFolder(currentValue, wsFolder) ?? wsFolder?.uri;

        const selection = await window.showOpenDialog({
            defaultUri,
            canSelectFiles: true,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Select",
            title: `Locate the ${prettyDialect} VDMTools binary ('${binaryName}') or the VDMTools installation folder`,
        });

        if (!selection || !selection.length) {
            return;
        }

        const selectedPath = selection[0].fsPath;
        const resolved = resolveVDMToolsInstallation(selectedPath, dialect);
        if (!resolved) {
            window.showErrorMessage(
                `Could not find an executable '${binaryName}' binary at or under '${selectedPath}'. ` +
                    `Please select the '${binaryName}' binary itself, its containing 'bin' folder, or the root of a VDMTools installation.`,
            );
            return;
        }

        const config = workspace.getConfiguration("vdm-vscode.vdmtools.path", wsFolder?.uri);
        const target = wsFolder ? ConfigurationTarget.WorkspaceFolder : ConfigurationTarget.Global;
        await config.update(configKey, resolved.settingValue, target);

        window.showInformationMessage(`VDMTools path for ${prettyDialect} set to '${resolved.settingValue}'`);
    }

    private static _nearestExistingFolder(configuredValue: string | undefined, wsFolder: WorkspaceFolder | undefined): Uri | undefined {
        if (!configuredValue) {
            return undefined;
        }

        let current = Path.isAbsolute(configuredValue)
            ? configuredValue
            : wsFolder
              ? Path.resolve(wsFolder.uri.fsPath, configuredValue)
              : undefined;
        if (!current) {
            return undefined;
        }

        while (true) {
            if (Fs.existsSync(current)) {
                return Uri.file(Fs.statSync(current).isDirectory() ? current : Path.dirname(current));
            }
            const parent = Path.dirname(current);
            if (parent === current) {
                return undefined;
            }
            current = parent;
        }
    }
}

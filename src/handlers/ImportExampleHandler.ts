// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, extensions, Uri, window, workspace } from "vscode";
import * as util from "../util/Util";
import { Dirent, readdirSync } from "fs";
import { copySync } from "fs-extra";
import * as path from "path";
import { extensionId } from "../ExtensionInfo";
import AutoDisposable from "../helper/AutoDisposable";
import { getDefaultWorkspaceFolderLocation } from "../util/WorkspaceFoldersUtil";
import { dialectToPrettyFormat } from "../util/DialectUtil";

export class AddExampleHandler extends AutoDisposable {
    constructor() {
        super();
        util.registerCommand(this._disposables, "vdm-vscode.importExample", () => this.addExample());
    }

    private async addExample() {
        window.setStatusBarMessage(
            `Adding Example.`,
            new Promise(async (resolve, reject) => {
                const dialectPretty: string = await window.showQuickPick(Array.from(dialectToPrettyFormat.values()), {
                    placeHolder: "Choose dialect",
                    canPickMany: false,
                });

                if (dialectPretty === undefined) return reject(`Empty selection. Add example completed.`);

                // Gather available examples and let user select
                const exaPath = path.resolve(extensions.getExtension(extensionId).extensionPath, "resources", "examples", dialectPretty);

                const exsInFolder: Dirent[] = readdirSync(exaPath, { withFileTypes: true });

                let exsOptions: string[] = exsInFolder.map((x: Dirent) => x.name);

                let selectedExs: string | string[] = await window.showQuickPick(exsOptions, {
                    placeHolder: "Choose example",
                    canPickMany: workspace.workspaceFolders != undefined,
                });

                // None selected
                if (selectedExs === undefined || selectedExs.length == 0) return reject(`Empty selection. Add example completed.`);

                // Make sure selectedExs is an array
                if (typeof selectedExs == "string") selectedExs = [selectedExs];

                // Get save location
                const workspaceFolderLocation = getDefaultWorkspaceFolderLocation();
                const location = await window.showOpenDialog({
                    defaultUri: workspaceFolderLocation,
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: "Select project location",
                    title: `Select Folder that the project${selectedExs.length == 1 ? " " + selectedExs[0] : "s"} should be created within`,
                });

                // None selected
                if (!location || !location.length) {
                    return;
                }

                let workspaceFoldersToAdd: { uri: Uri; name?: string }[] = [];
                for await (const selectedEx of selectedExs) {
                    // Project save location
                    let projectPath = path.resolve(location[0].fsPath, selectedEx);
                    let projectUri = Uri.file(projectPath);

                    // Sync copy
                    try {
                        copySync(path.resolve(exaPath, selectedEx), projectPath);
                    } catch (err) {
                        window.showInformationMessage(`Add example ${selectedEx} failed`);
                        console.log(`Copy example files failed with error: ${err}`);
                    }

                    // Open workspace if non is open
                    if (!workspace.workspaceFolders) {
                        await commands.executeCommand("vscode.openFolder", projectUri);
                        return;
                    } else {
                        workspaceFoldersToAdd.push({ uri: projectUri, name: selectedEx });
                    }
                }

                if (workspace.workspaceFolders) {
                    workspace.updateWorkspaceFolders(
                        workspace.workspaceFolders ? workspace.workspaceFolders.length : 0,
                        null,
                        ...workspaceFoldersToAdd
                    );
                }

                resolve(`Add example completed.`);
            })
        );
    }
}

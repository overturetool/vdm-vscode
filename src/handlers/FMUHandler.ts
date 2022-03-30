// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, extensions, Uri, window, workspace, WorkspaceFolder } from "vscode";
import * as util from "../util/Util";
import * as path from "path";
import { extensionId } from "../ExtensionInfo";
import { recursivePathSearch } from "../util/DirectoriesUtil";
import AutoDisposable from "../helper/AutoDisposable";
import { spawn } from "child_process";

export class FMUHandler extends AutoDisposable {
    private jarPath: string;

    constructor() {
        super();
        this.jarPath = recursivePathSearch(
            path.resolve(extensions.getExtension(extensionId).extensionPath, "resources", "jars", "tools"),
            /fmu-import-export.*jar/i
        );
        if (!this.jarPath) {
            console.log("FMU jar not found - Disable FMU Import/Export features");
            commands.executeCommand("setContext", "vdm-vscode.fmuImport", false);
            commands.executeCommand("setContext", "vdm-vscode.fmuWrpExport", false);
        } else {
            // Activate FMU Import feature
            util.registerCommand(this._disposables, "vdm-vscode.fmuImport", (inputUri: Uri) =>
                this.fmuImport(workspace.getWorkspaceFolder(inputUri))
            );
            commands.executeCommand("setContext", "vdm-vscode.fmuImport", true);
            // Activate FMU Export feature
            util.registerCommand(this._disposables, "vdm-vscode.fmuWrpExport", (inputUri: Uri) =>
                this.fmuWrpExport(workspace.getWorkspaceFolder(inputUri))
            );
            commands.executeCommand("setContext", "vdm-vscode.fmuWrpExport", true);
        }
    }

    private async fmuImport(wsFolder: WorkspaceFolder): Promise<boolean> {
        // Get save location
        const location = await window.showOpenDialog({
            defaultUri: wsFolder.uri,
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { "modelDescription.xml": ["xml"] },
            openLabel: "Select",
            title: `Select ModelDescription.xml file`,
        });

        // None selected
        if (!location || !location.length) {
            return false;
        }

        // Check location[0]
        // Check wsFolder.uri

        window.setStatusBarMessage(
            `Importing ModelDescription.xml.`,
            new Promise(async (resolve, reject) => {
                try {
                    // Invoke the FMU Import -- java -jar fmu-import-export-*.jar --modeldescrption X.modeldescription.xml -root DestFolder

                    let args: string[] = [];

                    let javaPath = util.findJavaExecutable("java");
                    if (!javaPath) {
                        window.showErrorMessage("Java runtime environment not found!");
                        console.log("Java runtime environment not found!");
                        reject();
                    }

                    args.push(...["-jar", this.jarPath]);

                    args.push(...["-modeldescrption", location[0].fsPath]);

                    args.push(...["-root", wsFolder.uri.fsPath]);

                    const outputChannel = window.createOutputChannel(`Creating files`);
                    outputChannel.show(false);

                    const javap = spawn(javaPath, args);

                    javap.stdout.on("data", (data) => {
                        outputChannel.append(data.toString());
                    });

                    javap.stderr.on("data", (data) => {
                        outputChannel.append(data.toString());
                    });

                    javap.on("close", (code) => {
                        if (code != 0) {
                            window.showErrorMessage("Modeldescription.xml Import error!");
                            console.log(`child process exited with code ${code}`);
                            reject();
                        }
                    });

                    resolve(`Modeldescription.xml import completed.`);
                } catch (error) {
                    window.showWarningMessage(`Modeldescription.xml import failed with error: ${error}`);
                    console.log(`Modeldescription.xml import failed with error: ${error}`);
                    reject();
                }
            })
        );
    }

    private async fmuWrpExport(wsFolder: WorkspaceFolder): Promise<boolean> {
        const name = wsFolder.name;
        const folderUri = util.generatedDataPath(wsFolder);

        // Check the above are valid
        // Check wsFolder is valid

        window.setStatusBarMessage(
            `Exporting Wrapper FMU.`,
            new Promise(async (resolve, reject) => {
                try {
                    // Invoke the FMU Import -- java -jar fmu-import-export*.jar  -export  tool  -root modelFolder -output outputFolder -name "ExampleName"

                    let args: string[] = [];

                    let javaPath = util.findJavaExecutable("java");
                    if (!javaPath) {
                        window.showErrorMessage("Java runtime environment not found!");
                        console.log("Java runtime environment not found!");
                        reject();
                    }

                    args.push(...["-jar", this.jarPath]);

                    args.push(...["-v"]);

                    args.push(...["-export", "tool"]);

                    args.push(...["-root", wsFolder.uri.fsPath]);

                    args.push(...["-output", folderUri.fsPath]);

                    args.push(...["-name", name]);

                    const outputChannel = window.createOutputChannel(`Generating Wrapper FMU`);
                    outputChannel.show(true);

                    const javap = spawn(javaPath, args);

                    javap.stdout.on("data", (data) => {
                        outputChannel.append(data.toString());
                    });

                    javap.stderr.on("data", (data) => {
                        outputChannel.append(data.toString());
                    });

                    javap.on("close", (code) => {
                        if (code != 0) {
                            window.showErrorMessage("Exporting Wrapper FMU error!");
                            console.log(`child process exited with code ${code}`);
                            reject();
                        }
                    });

                    resolve(`Exporting Wrapper FMU completed.`);
                } catch (error) {
                    window.showWarningMessage(`Exporting Wrapper FMU failed with error: ${error}`);
                    console.log(`Exporting Wrapper FMU failed with error: ${error}`);
                    reject();
                }
            })
        );
        return false;
    }
}

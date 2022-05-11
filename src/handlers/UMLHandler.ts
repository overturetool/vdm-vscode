// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, extensions, RelativePattern, Uri, window, workspace, WorkspaceFolder } from "vscode";
import * as util from "../util/Util";
import { spawn } from "child_process";
import * as path from "path";
import { extensionId } from "../ExtensionInfo";
import { ClientManager } from "../ClientManager";
import { createDirectory, recursivePathSearch } from "../util/DirectoriesUtil";
import { getDialectFromAlias, guessDialect, pickDialect, vdmDialects } from "../util/DialectUtil";
import AutoDisposable from "../helper/AutoDisposable";

export class UMLHandler extends AutoDisposable {
    private jarPath: string;

    constructor(private readonly clients: ClientManager) {
        super();
        this.jarPath = recursivePathSearch(
            path.resolve(extensions.getExtension(extensionId).extensionPath, "resources", "jars", "tools"),
            /uml2.*jar/i
        );
        if (!this.jarPath) {
            console.log("UML transformation jar not found - Disable UML transformation feature");
            commands.executeCommand("setContext", "vdm-vscode.uml.import", false);
            commands.executeCommand("setContext", "vdm-vscode.uml.export", false);
        } else {
            // Activate UML2VDM import feature
            util.registerCommand(this._disposables, "vdm-vscode.uml.import", (inputUri: Uri) =>
                this.Uml2Vdm(workspace.getWorkspaceFolder(inputUri))
            );
            // Activate VDM2UML export feature
            commands.executeCommand("setContext", "vdm-vscode.uml.import", true);
            util.registerCommand(this._disposables, "vdm-vscode.uml.export", (inputUri: Uri) =>
                 this.Vdm2Uml(workspace.getWorkspaceFolder(inputUri))
            );
            commands.executeCommand("setContext", "vdm-vscode.uml.export", true);
        }
    }

    private async Uml2Vdm(wsFolder: WorkspaceFolder): Promise<boolean> {
        // Get save location
        const location = await window.showOpenDialog({
            defaultUri: wsFolder.uri,
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { "Model": ["uml"] },
            openLabel: "Select",
            title: `Select .uml file`,
        });

        // None selected
        if (!location || !location.length) {
            return false;
        }

        // Check location[0]
        // Check wsFolder.uri

        window.setStatusBarMessage(
            `Importing UML model`,
            new Promise(async (resolve, reject) => {
                try {
                    // Invoke the UML import 
                    // java -cp uml2-*.jar org.overture.core.uml2.Uml2VdmMain -file X.uml

                    let args: string[] = [];

                    let javaPath = util.findJavaExecutable("java");
                    if (!javaPath) {
                        window.showErrorMessage("Java runtime environment not found!");
                        console.log("Java runtime environment not found!");
                        reject();
                    }

                    args.push(...["-cp", this.jarPath, "org.overture.core.uml2.Uml2VdmMain"]);

                    args.push(...["-file", location[0].fsPath]);

                    /* args.push(...["-root", wsFolder.uri.fsPath]); */

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
                            window.showErrorMessage("UML import error!");
                            console.log(`child process exited with code ${code}`);
                            reject();
                        }
                    });

                    resolve(`UML import completed.`);
                } catch (error) {
                    window.showWarningMessage(`UML import failed with error: ${error}`);
                    console.log(`UML import failed with error: ${error}`);
                    reject();
                }
            })
        );
    }

    private async Vdm2Uml(wsFolder: WorkspaceFolder): Promise<boolean> {
        const folderUri = Uri.joinPath(util.generatedDataPath(wsFolder), "generated");
        let dialect: vdmDialects;
        const vdm2UmlDialects = { vdmpp: "pp", vdmrt: "rt" };

        // Check the above are valid
        // Check wsFolder is valid

        window.setStatusBarMessage(
            `Transforming VDM to UML`,
            new Promise(async (resolve, reject) => {
                // Invoke the VDM-to-UML 
                // java -cp uml2-*.jar org.overture.core.uml2.Vdm2UmlMain -pp/-rt -preferasoc -deployoutside -output outputFolder -folder inputFolder

                let client = this.clients.get(wsFolder);
                if (client?.languageId) {
                    dialect = getDialectFromAlias(client.languageId);
                } else {
                    console.log(`No client found for the folder: ${wsFolder.name}`);

                    // Guess dialect
                    await guessDialect(wsFolder)
                        .then((dia: vdmDialects) => (dialect = dia))
                        .catch(async () => {
                            await pickDialect()
                                .then((dia: vdmDialects) => (dialect = dia))
                                .catch(() => {});
                        });
                }

                if (!dialect) {
                    window.showInformationMessage(`UML transformation failed! Unable to resolve VDM dialect for workspace`);
                    return reject();
                }

                createDirectory(folderUri).then(
                    async () => {
                        try {
                            // Invoke java code gen
                            let args: string[] = [];

                            let javaPath = util.findJavaExecutable("java");
                            if (!javaPath) {
                                window.showErrorMessage("Java runtime environment not found!");
                                console.log("Java runtime environment not found!");
                                reject();
                            }

                            args.push(...["-cp", this.jarPath, "org.overture.core.uml2.Vdm2UmlMain", "-" + vdm2UmlDialects[dialect]]);

                            const config = workspace.getConfiguration("vdm-vscode", wsFolder.uri);

                            const preferAssociations = config.get("uml.export.preferAssociations", false);
                            const deployArtifactsOutsideNodes = config.get("uml.export.deployArtifactsOutsideNodes", false);

                            if (preferAssociations) {
                                args.push("-preferasoc");
                            }
                            if (deployArtifactsOutsideNodes) {
                                args.push("-deployoutside");
                            }

                            args.push(...["-output", folderUri.fsPath]);

                            let pattern = new RelativePattern(wsFolder.uri.path, "*." + dialect);
                            let res = await workspace.findFiles(pattern, null);
                            if (res && res.length > 0) {
                                args.push(...["-folder", wsFolder.uri.fsPath]);
                            } else {
                                window.showErrorMessage("Could not find project files!");
                                console.log("Could not find project files!");
                                reject();
                            }

                            const outputChannel = window.createOutputChannel(`UML Transformation`);
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
                                    window.showErrorMessage("UML transformation error!");
                                    console.log(`child process exited with code ${code}`);
                                    reject();
                                }
                            });

                            resolve(`UML transformation completed.`);
                        } catch (error) {
                            window.showWarningMessage(`UML transformationn failed with error: ${error}`);
                            console.log(`UML transformation failed with error: ${error}`);
                            reject();
                        }
                    },
                    (reason) => {
                        window.showWarningMessage("Creating directory for UML model failed");
                        console.log(`Creating directory for UML model failed with error: ${reason}`);
                        reject();
                    }
                );
            })
        );
        return false;
    }
}
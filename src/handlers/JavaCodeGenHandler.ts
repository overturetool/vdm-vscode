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

export class JavaCodeGenHandler extends AutoDisposable {
    private jarPath: string;

    constructor(private readonly clients: ClientManager) {
        super();
        this.jarPath = recursivePathSearch(
            path.resolve(extensions.getExtension(extensionId).extensionPath, "resources", "jars", "tools"),
            /javagen.*jar/i
        );
        if (!this.jarPath) {
            console.log("Code generation jar not found - Disable code generation feature");
            commands.executeCommand("setContext", "vdm-vscode.javaCodeGen", false);
        } else {
            // Activate code generation feature
            util.registerCommand(this._disposables, "vdm-vscode.javaCodeGen", (inputUri: Uri) =>
                this.javaCodeGen(workspace.getWorkspaceFolder(inputUri))
            );
            commands.executeCommand("setContext", "vdm-vscode.javaCodeGen", true);
        }
    }

    private async javaCodeGen(wsFolder: WorkspaceFolder) {
        let dialect: vdmDialects;
        const javaCodeGendialects = { vdmsl: "sl", vdmpp: "pp", vdmrt: "rt" };
        window.setStatusBarMessage(
            `Starting code generation.`,
            new Promise(async (resolve, reject) => {
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
                    window.showInformationMessage(`Code generation failed! Unable to resolve VDM dialect for workspace`);
                    return reject();
                }

                const folderUri = Uri.joinPath(util.generatedDataPath(wsFolder), "java");

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

                            args.push(...["-jar", this.jarPath, "-" + javaCodeGendialects[dialect]]);

                            const config = workspace.getConfiguration("vdm-vscode", wsFolder.uri);

                            const outputPackage = config.get("javaCodeGen.outputPackage", "");
                            const disableCloning = config.get("javaCodeGen.disableCloning", false);
                            const sequencesAsStrings = config.get("javaCodeGen.sequencesAsStrings", true);
                            const concurrency = config.get("javaCodeGen.concurrencyMechanisms", false);
                            const vdmloc = config.get("javaCodeGen.vdmLocationInformation", false);
                            const skipClassesModules = config.get("javaCodeGen.skipClassesModules", "");

                            if (outputPackage) {
                                args.push("-package");
                                args.push(outputPackage);
                            }
                            if (!sequencesAsStrings) {
                                args.push("-nostrings");
                            }
                            if (vdmloc) {
                                args.push("-vdmloc");
                            }
                            if (disableCloning) {
                                args.push("-nocloning");
                            }
                            if (concurrency) {
                                args.push("-concurrency");
                            }
                            if (skipClassesModules) {
                                args.push("-skip");
                                args.push(skipClassesModules);
                            }
                            args.push(...["-output", folderUri.fsPath]);

                            let pattern = new RelativePattern(wsFolder.uri.path, "*." + dialect);
                            let res = await workspace.findFiles(pattern, null);
                            if (res && res.length > 0) {
                                args.push(...res.map((u) => u.fsPath));
                            } else {
                                window.showErrorMessage("Could not find project files!");
                                console.log("Could not find project files!");
                                reject();
                            }

                            const outputChannel = window.createOutputChannel(`Java Code Generation`);
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
                                    window.showErrorMessage("Code generation error!");
                                    console.log(`child process exited with code ${code}`);
                                    reject();
                                }
                            });

                            resolve(`Code  generation completed.`);
                        } catch (error) {
                            window.showWarningMessage(`Code generation failed with error: ${error}`);
                            console.log(`Code generation failed with error: ${error}`);
                            reject();
                        }
                    },
                    (reason) => {
                        window.showWarningMessage("Creating directory for code failed");
                        console.log(`Creating directory for code failed with error: ${reason}`);
                        reject();
                    }
                );
            })
        );
    }
}

// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, ExtensionContext, RelativePattern, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import * as util from "./Util";
import { spawn } from "child_process";
import * as path from "path";

export class JavaCodeGenHandler {
    private jarPath;

    constructor(private readonly clients: Map<string, SpecificationLanguageClient>, private context: ExtensionContext) {
        this.jarPath = util.recursivePathSearch(path.resolve(this.context.extensionPath, "resources", "jars"), /javagen.*jar/i);
        if (!this.jarPath) {
            console.log("Code generation jar not found - Disable code generation feature");
            commands.executeCommand("setContext", "jcg-show-button", false);
        } else {
            // Activate code generation feature
            this.registerCommand((inputUri: Uri) => this.javaCodeGen(workspace.getWorkspaceFolder(inputUri)));
            commands.executeCommand("setContext", "jcg-show-button", true);
        }
    }

    private registerCommand = (callback: (...args: any[]) => any) => {
        let disposable = commands.registerCommand("vdm-vscode.javaCodeGen", callback);
        this.context.subscriptions.push(disposable);
        return disposable;
    };

    private async javaCodeGen(wsFolder: WorkspaceFolder) {
        let dialect = null;
        let dialectext = null;
        const dialects = { vdmsl: "sl", vdmpp: "pp", vdmrt: "rt" };

        window.setStatusBarMessage(
            `Starting code generation.`,
            new Promise(async (resolve, reject) => {
                let client = this.clients.get(wsFolder.uri.toString());
                if (client?.language) {
                    dialect = dialects[client.language];
                    dialectext = client.language;
                } else {
                    console.log(`No client found for the folder: ${wsFolder.name}`);

                    // Guess dialect
                    for (var dp in dialects) {
                        let pattern = new RelativePattern(wsFolder.uri.path, "*." + dp);
                        let res = await workspace.findFiles(pattern, null, 1);
                        if (res.length == 1) {
                            dialect = dialects[dp];
                            dialectext = dp;
                        }
                    }

                    if (!dialect || !dialectext) {
                        // TODO could insert a selection window here so that the user can manually choose the dialect if we can't guess
                        window.showInformationMessage(`Code generation failed! Unable to guess VDM dialect for workspace`);
                        reject();
                        return;
                    }
                }

                let folderUri = util.joinUriPath(wsFolder.uri, ".generated", "java");

                util.createDirectory(folderUri).then(
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

                            args.push(...["-jar", this.jarPath, "-" + dialect]);

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

                            let pattern = new RelativePattern(wsFolder.uri.path, "*." + dialectext);
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

// SPDX-License-Identifier: GPL-3.0-or-later

import * as util from "../util/Util";
import { commands, ConfigurationTarget, debug, DebugConfiguration, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { VdmDebugConfiguration } from "../dap/VdmDapSupport";
import { guessDialect, vdmDialects } from "../util/DialectUtil";
import AutoDisposable from "../helper/AutoDisposable";

type VdmType = string;

interface VdmArgument {
    name: string;
    type: string;
    value?: string;
}

export interface VdmLaunchConfiguration {
    name: string; // The name of the debug session.
    type: string; // The type of the debug session.
    request: string; // The request type of the debug session.
    noDebug: boolean;
    defaultName: string;
}

interface VdmLaunchLensConfiguration {
    name: string;
    defaultName: string;
    type: string;
    request: string;
    noDebug: boolean;
    remoteControl: string | null;
    constructors?: [VdmArgument[]];
    applyName: string;
    applyArgs: VdmArgument[];
    applyTypes?: VdmType[];
}

export class AddRunConfigurationHandler extends AutoDisposable {
    private static readonly lensNameBegin: string = "Lens config:";
    private static showArgumentTypeWarning = true;

    // Argument storage, map from workspacefolder name to arguments
    private lastConfigCtorArgs: Map<string, VdmArgument[]> = new Map();
    private lastConfigApplyArgs: Map<string, VdmArgument[]> = new Map();

    constructor() {
        super();
        commands.executeCommand("setContext", "vdm-vscode.addRunConfiguration", true);
        util.registerCommand(this._disposables, "vdm-vscode.addRunConfiguration", (inputUri: Uri) =>
            this.addRunConfiguration(workspace.getWorkspaceFolder(inputUri))
        );
        util.registerCommand(this._disposables, "vdm-vscode.addLensRunConfiguration", (input: VdmLaunchLensConfiguration) =>
            this.addLensRunConfiguration(input)
        );
    }

    private async addRunConfiguration(wsFolder: WorkspaceFolder) {
        window.setStatusBarMessage(
            `Adding Run Configuration.`,
            new Promise(async (resolve, reject) => {
                let dialect: vdmDialects;
                await guessDialect(wsFolder).then(
                    (result: vdmDialects) => (dialect = result),
                    (error) => {
                        console.info(`[Run Config] Add configuration failed: ${error}`);
                        window.showInformationMessage(`Add run configration failed. Could not guess language`);
                    }
                );
                if (!dialect) return reject();

                // Prompt user for entry point class/module and function/operation
                let selectedClass: string;
                let selectedCommand: string;
                if (dialect == vdmDialects.VDMSL) {
                    selectedClass = await window.showInputBox({
                        prompt: "Input entry point Module",
                        placeHolder: "Module",
                        value: "DEFAULT",
                    });
                } else {
                    selectedClass = await window.showInputBox({
                        prompt: "Input name of the entry Class",
                        placeHolder: "Class(args)",
                    });
                }
                if (selectedClass != undefined) {
                    selectedCommand = await window.showInputBox({
                        prompt: "Input entry point function/operation",
                        placeHolder: "Run(args)",
                    });
                }

                // None selected
                if (selectedClass === undefined || selectedCommand === undefined)
                    return resolve(`Empty selection. Add run configuration completed.`);

                // Make sure class and command has parenthesis
                if (!selectedClass.includes("(") && !selectedClass.includes(")")) selectedClass += "()";
                if (!selectedCommand.includes("(") && !selectedCommand.includes(")")) selectedCommand += "()";

                // Create run configuration
                let className = selectedClass.substring(0, selectedClass.indexOf("("));
                let debugConfiguration: DebugConfiguration = this.buildDebugConfiguration(selectedCommand, className);

                if (dialect == vdmDialects.VDMSL) debugConfiguration.command = `print ${selectedCommand}`;
                else debugConfiguration.command = `print new ${selectedClass}.${selectedCommand}`;

                // Save run configuration
                this.saveRunConfiguration(wsFolder, debugConfiguration);

                // Open launch file
                window.showTextDocument(Uri.joinPath(wsFolder.uri, ".vscode", "launch.json"), { preview: true, preserveFocus: true });
            })
        );
    }

    private async addLensRunConfiguration(input: VdmLaunchLensConfiguration) {
        const wsFolder: WorkspaceFolder = workspace.getWorkspaceFolder(window.activeTextEditor.document.uri);
        if (wsFolder === undefined) {
            window.showInformationMessage("Could not find workspacefolder");
            return;
        }

        window.setStatusBarMessage(
            `Adding Run Configuration`,
            new Promise(async (resolve, reject) => {
                try {
                    // Transfer argument values if possible
                    this.transferArguments(input, wsFolder.name);

                    // Create run configuration
                    let runConfig: VdmDebugConfiguration = {
                        name: `${AddRunConfigurationHandler.lensNameBegin} ${input.noDebug ? "Launch" : "Debug"} ${input.defaultName}\`${
                            input.applyName
                        }`,
                        type: input.type,
                        request: input.request,
                        noDebug: input.noDebug,
                        defaultName: input.defaultName,
                    };

                    // Add remote control
                    if (input.remoteControl) runConfig.remoteControl = input.remoteControl;

                    // Add command
                    if (input.applyName) {
                        // Warn user that types might be unresolved for projects with unsaved files
                        if (
                            AddRunConfigurationHandler.showArgumentTypeWarning &&
                            (input.applyArgs?.length > 0 || input.constructors?.some((c) => c.length > 0)) &&
                            workspace.textDocuments?.some((doc) => doc.isDirty && workspace.getWorkspaceFolder(doc.uri) == wsFolder)
                        ) {
                            window
                                .showInformationMessage(
                                    "Types might be unresolved until all documents have been saved",
                                    "Do not show again"
                                )
                                .then((v) => {
                                    if (v) AddRunConfigurationHandler.showArgumentTypeWarning = false;
                                });
                        }

                        // Command start
                        let command = "p ";

                        // Set class
                        if (input.constructors != undefined) {
                            let cIndex = 0;

                            // If multiple constructors to select from request the user to select one
                            if (input.constructors.length > 1) {
                                await this.requestConstructor(input.defaultName, input.constructors).then(
                                    (i) => {
                                        cIndex = i;
                                    },
                                    () => {
                                        throw new Error("No constructor selected");
                                    }
                                );
                            }

                            // Add class initialisation
                            // TODO: Replace hard-coded empty arrays with appropiate values (When is this triggered?)
                            await this.requestArgumentValues(input.constructors[cIndex], [], input.defaultName, "constructor").then(
                                () => {
                                    command += `new ${this.getCommandString(input.defaultName, input.constructors[cIndex], [])}.`;
                                    this.lastConfigCtorArgs[wsFolder.name] = input.constructors[cIndex];
                                },
                                () => {
                                    throw new Error("Constructor arguments missing");
                                }
                            );
                        }

                        // Add function/operation call to command
                        await this.requestArgumentValues(
                            input.applyArgs,
                            input.applyTypes ?? [],
                            input.applyName,
                            "operation/function"
                        ).then(
                            (types) => {
                                command += this.getCommandString(input.applyName, input.applyArgs, Array.from(types.values()));
                                this.lastConfigApplyArgs[wsFolder.name] = input.applyArgs;
                            },
                            () => {
                                throw new Error("Operation/function arguments missing");
                            }
                        );

                        // Set command
                        runConfig.command = command;
                    }

                    // Save configuration
                    this.saveRunConfiguration(wsFolder, runConfig);

                    // Start debug session with custom debug configurations
                    resolve("Launching");
                    commands.executeCommand("workbench.debug.action.focusRepl");
                    debug.startDebugging(wsFolder, runConfig);
                } catch (e) {
                    reject(e);
                }
            })
        );
    }

    private saveRunConfiguration(wsFolder: WorkspaceFolder, runConf: DebugConfiguration) {
        // Get existing configurations
        const launchConfigurations = workspace.getConfiguration("launch", wsFolder);
        const rawConfigs: DebugConfiguration[] = launchConfigurations.configurations;

        // Only save one configuration with the same name
        let i = rawConfigs.findIndex((c) => c.name == runConf.name || (this.isLensConfig(runConf) && this.isLensConfig(c)));
        if (i >= 0) rawConfigs[i] = runConf;
        else rawConfigs.push(runConf);

        // Update settings file
        launchConfigurations.update("configurations", rawConfigs, ConfigurationTarget.WorkspaceFolder);
    }

    private buildDebugConfiguration(command: string, defaultName: string): VdmLaunchConfiguration {
        return {
            name: `Launch VDM Debug from ${defaultName}\`${command}`, // The name of the debug session.
            type: "vdm", // The type of the debug session.
            request: "launch", // The request type of the debug session.
            noDebug: false,
            defaultName: defaultName,
        };
    }

    private isLensConfig(runConf: DebugConfiguration): boolean {
        return runConf.name.startsWith(AddRunConfigurationHandler.lensNameBegin);
    }

    private async requestArgumentValues(args: VdmArgument[], types: VdmType[], name: string, type: string): Promise<Map<VdmType, string>> {
        const commandString = this.getCommandOutlineString(name, args, types);
        // Request type arguments from user

        const concreteTypes: Map<VdmType, string> = new Map();
        for (let t of types) {
            const concreteType = await window.showInputBox({
                prompt: `Input type for ${type}`,
                title: commandString,
                ignoreFocusOut: true,
                placeHolder: t,
            });

            if (concreteType === undefined) {
                return Promise.reject();
            }

            concreteTypes.set(t, concreteType);
        }

        // Request argument values from user
        for await (let a of args) {
            const resolvedType = concreteTypes.get(a.type) ?? a.type;
            let value = await window.showInputBox({
                prompt: `Input argument for ${type}`,
                title: commandString,
                ignoreFocusOut: true,
                placeHolder: `${a.name}: ${resolvedType}`,
                value: a.value,
            });

            if (value === undefined) {
                return Promise.reject();
            }

            a.value = value;
        }

        return Promise.resolve(concreteTypes);
    }

    private async requestConstructor(className: string, constructors: [VdmArgument[]]): Promise<number> {
        // Create strings of constructors to pick from
        // TODO: Replace hard-coded empty array with appropiate value (When is this triggered?)
        let ctorStrings: string[] = constructors.map((ctor) => this.getCommandOutlineString(className, ctor, []));

        let pick = await window.showQuickPick(ctorStrings, {
            canPickMany: false,
            ignoreFocusOut: false,
            title: "Select constructor",
        });

        if (pick === undefined) return Promise.reject();
        else return Promise.resolve(ctorStrings.indexOf(pick));
    }

    // Transfer the arguments frome the last run configuraiton to 'config'
    private transferArguments(config: VdmLaunchLensConfiguration, wsName: string) {
        // Transfer constructor arguments
        this.lastConfigCtorArgs[wsName]?.forEach((lastArg: VdmArgument) => {
            config.constructors?.forEach((ctor) => {
                ctor.forEach((arg) => {
                    if (lastArg.name == arg.name && lastArg.type == arg.type) arg.value = lastArg.value;
                });
            });
        });

        // Transfer function/operation arguments
        this.lastConfigApplyArgs[wsName]?.forEach((lastArg: VdmArgument) => {
            config.applyArgs.forEach((arg) => {
                if (lastArg.name == arg.name && lastArg.type == arg.type) arg.value = lastArg?.value;
            });
        });
    }

    private getCommandOutlineString(name: string, args: VdmArgument[], typeParameters: VdmType[]): string {
        const argOutlines: string[] = args.map((a) => `${a.name}: ${a.type}`);
        const typeParametersOutline = typeParameters.length === 0 ? "" : `[${typeParameters.join(", ")}]`;
        let command = `${name}${typeParametersOutline}(${argOutlines.join(", ")})`;
        return command;
    }

    private getCommandString(name: string, args: VdmArgument[], types: VdmType[]): string {
        const typeParameters = types.length === 0 ? "" : `[${types.join(", ")}]`;
        let command = `${name}${typeParameters}(${args.map((x) => x.value).join(", ")})`;
        return command;
    }
}

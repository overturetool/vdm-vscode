// SPDX-License-Identifier: GPL-3.0-or-later

import * as util from "../util/Util";
import { commands, ConfigurationTarget, debug, DebugConfiguration, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { VdmDebugConfiguration } from "../dap/VdmDapSupport";
import { guessDialect, VdmDialect } from "../util/DialectUtil";
import AutoDisposable from "../helper/AutoDisposable";

type VdmTypeParameter = string;

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
    applyArgs: VdmArgument[][];
    applyTypes?: VdmTypeParameter[];
    settings: any;
    properties: any;
    params: any;
}

export class AddRunConfigurationHandler extends AutoDisposable {
    private static readonly lensNameBegin: string = "Lens config:";
    private static showArgumentTypeWarning = true;

    // Argument storage, map from workspacefolder name to arguments
    private lastConfigCtorArgs: Map<string, VdmArgument[]> = new Map();
    private lastConfigApplyArgs: Map<string, VdmArgument[][]> = new Map();
    private lastConfigApplyTypes: Map<string, Map<string, Map<VdmTypeParameter, string>>> = new Map();

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

    private getLastApplyType(wsFolder: WorkspaceFolder, name: string, typeName: string) {
        const lastType = this.lastConfigApplyTypes.get(wsFolder.name)?.get(name)?.get(typeName);

        return lastType;
    }

    private setLastApplyType(wsFolder: WorkspaceFolder, name: string, typeName: string, typeValue: string) {
        const wsMap = this.lastConfigApplyTypes.get(wsFolder.name) ?? new Map<string, Map<VdmTypeParameter, string>>();
        const typeMap = wsMap.get(name) ?? new Map<VdmTypeParameter, string>();
        typeMap.set(typeName, typeValue);
        wsMap.set(name, typeMap);
        this.lastConfigApplyTypes.set(wsFolder.name, wsMap);
    }

    private async addRunConfiguration(wsFolder: WorkspaceFolder) {
        window.setStatusBarMessage(
            `Adding Run Configuration.`,
            new Promise(async (resolve, reject) => {
                let dialect: VdmDialect;
                await guessDialect(wsFolder).then(
                    (result: VdmDialect) => (dialect = result),
                    (error) => {
                        console.info(`[Run Config] Add configuration failed: ${error}`);
                        window.showInformationMessage(`Add run configration failed. Could not guess language`);
                    }
                );
                if (!dialect) return reject();

                // Prompt user for entry point class/module and function/operation
                let selectedClass: string;
                let selectedCommand: string;
                if (dialect == VdmDialect.VDMSL) {
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

                if (dialect == VdmDialect.VDMSL) debugConfiguration.command = `print ${selectedCommand}`;
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

                    if (input.settings) {
                        runConfig.settings = input.settings;
                    }

                    if (input.properties) {
                        runConfig.properties = input.properties;
                    }

                    if (input.params) {
                        runConfig.params = input.params;
                    }

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
                            // A constructor cannot be polymorphic, so no type params are ever available
                            await this.requestArguments([input.constructors[cIndex]], [], input.defaultName, wsFolder).then(
                                () => {
                                    command += `new ${this.getCommandString(input.defaultName, [input.constructors[cIndex]], [])}.`;
                                    this.lastConfigCtorArgs.set(wsFolder.name, input.constructors[cIndex]);
                                },
                                () => {
                                    throw new Error("Constructor arguments missing");
                                }
                            );
                        }

                        // Add function/operation call to command
                        await this.requestArguments(input.applyArgs, input.applyTypes ?? [], input.applyName, wsFolder).then(
                            (types) => {
                                command += this.getCommandString(input.applyName, input.applyArgs, Array.from(types.values()));
                                this.lastConfigApplyArgs.set(wsFolder.name, input.applyArgs);

                                Array.from(types.entries()).forEach(([typeParam, resolvedType]) =>
                                    this.setLastApplyType(wsFolder, input.applyName, typeParam, resolvedType)
                                );
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

    private async requestConcreteTypes(
        types: VdmTypeParameter[],
        outlineString: string,
        wsFolder: WorkspaceFolder,
        applyName: string
    ): Promise<Map<VdmTypeParameter, string>> {
        const concreteTypes: Map<VdmTypeParameter, string> = new Map();
        for (const [idx, t] of types.entries()) {
            // concrete types don't need to be resolved
            if (!t.startsWith("@")) {
                concreteTypes.set(idx.toString(), t);
                continue;
            }

            const concreteType = await window.showInputBox({
                prompt: `Enter type for ${t}`,
                title: outlineString,
                ignoreFocusOut: true,
                placeHolder: t,
                value: this.getLastApplyType(wsFolder, applyName, t),
            });

            if (concreteType === undefined) {
                return Promise.reject();
            }

            concreteTypes.set(t, concreteType);
        }

        return Promise.resolve(concreteTypes);
    }

    private async requestArgumentValues(args: VdmArgument[][], outlineString: string): Promise<void> {
        const flattenedArgs = args.flat();

        for await (let a of flattenedArgs) {
            const prefillPostfix = ` - [${a.name}: ${a.type}]`;
            const prefillValue = a.value ? `${a.value}${prefillPostfix}` : null;
            const value = await window.showInputBox({
                prompt: `Enter value for [${a.name}: ${a.type}]`,
                title: outlineString,
                ignoreFocusOut: true,
                placeHolder: `${a.name}: ${a.type}`,
                value: prefillValue,
            });

            if (value === undefined) {
                return Promise.reject();
            }

            a.value = value.replace(prefillPostfix, "");
        }
    }

    private applyTypesToArgs(argLists: VdmArgument[][], types: Map<VdmTypeParameter, string>): VdmArgument[][] {
        return argLists.map((args) => {
            return args.map((a) => {
                const concreteType = types.get(a.type);
                if (concreteType) {
                    a.type = concreteType;
                }

                return a;
            });
        });
    }

    private async requestArguments(
        args: VdmArgument[][],
        types: VdmTypeParameter[],
        name: string,
        wsFolder: WorkspaceFolder
    ): Promise<Map<VdmTypeParameter, string>> {
        const commandString = this.getCommandOutlineString(name, args, types);

        // Request type arguments from user
        const concreteTypes = await this.requestConcreteTypes(types, commandString, wsFolder, name);

        // Request argument values from user - requestArgumentValues modifies args, changing the .value property.
        const typedArgs = this.applyTypesToArgs(args, concreteTypes);
        const commandStringConcrete = this.getCommandOutlineString(name, typedArgs);

        await this.requestArgumentValues(typedArgs, commandStringConcrete);

        return Promise.resolve(concreteTypes);
    }

    private async requestConstructor(className: string, constructors: [VdmArgument[]]): Promise<number> {
        // Create strings of constructors to pick from
        let ctorStrings: string[] = constructors.map((ctor) => this.getCommandOutlineString(className, [ctor]));

        let pick = await window.showQuickPick(ctorStrings, {
            canPickMany: false,
            ignoreFocusOut: false,
            title: "Select constructor",
        });

        if (pick === undefined) {
            return Promise.reject();
        } else {
            return Promise.resolve(ctorStrings.indexOf(pick));
        }
    }

    // Transfer the arguments frome the last run configuraiton to 'config'
    private transferArguments(config: VdmLaunchLensConfiguration, wsName: string) {
        // Transfer constructor arguments
        this.lastConfigCtorArgs.get(wsName)?.forEach((lastArg) => {
            config.constructors?.forEach((ctor) => {
                ctor.forEach((arg) => {
                    arg.value = lastArg.value;
                });
            });
        });

        // Transfer function/operation arguments
        // TODO: Fix the terrible time complexity of this approach
        this.lastConfigApplyArgs.get(wsName)?.forEach((lastArgList) => {
            lastArgList.forEach((lastArg) => {
                config.applyArgs.forEach((argList) => {
                    argList.forEach((arg) => {
                        if (lastArg.name === arg.name && lastArg.type === arg.type && arg.value == null) {
                            arg.value = lastArg?.value;
                        }
                    });
                });
            });
        });
    }

    private getCommandOutlineString(name: string, args: VdmArgument[][], typeParameters: VdmTypeParameter[] = []): string {
        const typeParametersOutline = typeParameters.length === 0 ? "" : `[${typeParameters.join(", ")}]`;
        const argumentLists = args.map((a) => `(${a.map((x) => `${x.name}: ${x.type}`).join(", ")})`).join("");
        let command = `${name}${typeParametersOutline}${argumentLists}`;
        return command;
    }

    private getCommandString(name: string, args: VdmArgument[][], types: VdmTypeParameter[]): string {
        const typeArguments = types.length === 0 ? "" : `[${types.join(", ")}]`;
        const argumentLists = args.map((a) => `(${a.map((x) => x.value).join(", ")})`).join("");
        let command = `${name}${typeArguments}${argumentLists}`;
        return command;
    }
}

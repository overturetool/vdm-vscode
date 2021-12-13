// SPDX-License-Identifier: GPL-3.0-or-later

import * as util from "./Util"
import * as vscode from "vscode"
import { commands, ConfigurationTarget, DebugConfiguration, ExtensionContext, RelativePattern, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import { VdmDebugConfiguration } from "./VdmDapSupport";

interface VdmArgument {
    name: string,
    type: string
}

interface VdmLaunchLensConfiguration {
    name: string,
    defaultName: string,
    type: string,
    request: string
    noDebug: boolean,
    remoteControl: string | null,
    constructors?: [VdmArgument[]]
    applyName: string,
    applyArgs: VdmArgument[]
}

export class AddRunConfigurationHandler {

    constructor(
        private readonly clients: Map<string, SpecificationLanguageClient>,
        private context: ExtensionContext
    ) {
        commands.executeCommand( 'setContext', 'add-runconf-show-button', true );
        this.context = context;
        util.registerCommand(this.context,"vdm-vscode.addRunConfiguration", (inputUri: Uri) => this.addRunConfiguration(workspace.getWorkspaceFolder(inputUri)))
        util.registerCommand(this.context,"vdm-vscode.addLensRunConfiguration", (input: VdmLaunchLensConfiguration) => this.addLensRunConfiguration(input))
        util.registerCommand(this.context,"vdm-vscode.addLensRunConfigurationWarning", () => this.addLensRunConfigurationWarning())
    }

    private async addRunConfiguration(wsFolder: WorkspaceFolder) {
        window.setStatusBarMessage(`Adding Run Configuration.`, new Promise(async (resolve, reject) => {
            let dialect = await this.getDialect(wsFolder);
            if (dialect == null) {
                // TODO could insert a selection window here so that the user can manually choose the dialect if we can't guess
                window.showInformationMessage(`Add run configuration failed! Unable to guess VDM dialect for workspace`); 
                return reject()
            }

            // Prompt user for entry point class/module and function/operation   
            let selectedClass: string;
            let selectedCommand: string;    
            if(dialect == "vdmsl") {
                selectedClass = await window.showInputBox({
                    prompt: "Input entry point Module",
                    placeHolder: "Module",
                    value: "DEFAULT",
                });
            } else {
                selectedClass = await window.showInputBox({
                    prompt: "Input name of the entry Class",
                    placeHolder: "Class"
                });
            }
            if (selectedClass != undefined) {
                selectedCommand = await window.showInputBox({
                    prompt: "Input entry point function/operation",
                    placeHolder: "Run(args)"
                }); 
            }

            // None selected 
            if(selectedClass === undefined || selectedCommand === undefined) return resolve(`Empty selection. Add run configuration completed.`)

            // Check for command arguments
            let selectedCommandArguments: string = ""
            if (selectedCommand.includes("(")){
                selectedCommandArguments = selectedCommand.slice(selectedCommand.indexOf("(")+1,selectedCommand.lastIndexOf(")"));
                selectedCommand = selectedCommand.slice(0,selectedCommand.indexOf("("))
            }

            // Create run configuration
            let debugConfiguration: DebugConfiguration = {
                name: `Launch VDM Debug from ${selectedClass}\`${selectedCommand}(${selectedCommandArguments})`,    // The name of the debug session.
                type: "vdm",               // The type of the debug session.
                request: "launch",         // The request type of the debug session.
                noDebug: false,
                dynamicTypeChecks: true,
                invariantsChecks: true,
                preConditionChecks: true,
                postConditionChecks: true,
                measureChecks: true
            }
            if(dialect == "vdmsl") {
                debugConfiguration.defaultName = `${selectedClass}`,
                debugConfiguration.command = `print ${selectedCommand}(${selectedCommandArguments})`
            } else {
                debugConfiguration.defaultName = null,
                debugConfiguration.command = `print new ${selectedClass}().${selectedCommand}(${selectedCommandArguments})`
            }

            // Save run configuration
            this.saveRunConfiguration(debugConfiguration, wsFolder);

            // Open launch file
            window.showTextDocument(
                Uri.joinPath(wsFolder.uri, ".vscode", "launch.json"),
                {preview: true, preserveFocus: true}
            )
        }));
    }

    private saveRunConfiguration(runConf: DebugConfiguration, wsFolder: WorkspaceFolder) {
        // Get existing configurations
        const launchConfigurations  = workspace.getConfiguration("launch", wsFolder);
        const rawConfigs: DebugConfiguration[] = launchConfigurations.configurations;

        // Only save one configuration with the same name
        let i = rawConfigs.findIndex(c => c.name == runConf.name) 
        if (i >= 0)
            rawConfigs[i] = runConf;
        else
            rawConfigs.push(runConf);
        
        // Update settings file
        launchConfigurations.update("configurations", rawConfigs, ConfigurationTarget.WorkspaceFolder);
    }

    private async getDialect(wsFolder : WorkspaceFolder){
        const dialects = ["vdmsl","vdmpp","vdmrt"];
        let dialect = null;

        let client = this.clients.get(wsFolder.uri.toString());
        if (client) {
            dialect = client.dialect;
        } 
        else {
            console.log(`No client found for the folder: ${wsFolder.name}`);

            // Guess dialect
            for (const d in dialects){
                let pattern = new RelativePattern(wsFolder.uri.path, "*." + d);
                let res = await workspace.findFiles(pattern,null,1); 
                if (res.length == 1) dialect = d;
            } 
        }
        return dialect;
    }

    private async addLensRunConfiguration(input: VdmLaunchLensConfiguration) {
        const wsFolder : WorkspaceFolder = workspace.getWorkspaceFolder(window.activeTextEditor.document.uri);
        if (wsFolder === undefined){
            window.showInformationMessage("Could not find workspacefolder"); 
            return;
        }

        window.setStatusBarMessage(`Adding Run Configuration`, new Promise(async (resolve, reject) => {
            let runConfig : VdmDebugConfiguration = {
                name: "Launch VDM Debug from Code Lens",
                type: input.type,
                request: input.request,
                noDebug: input.noDebug,
            };

            // Add remote control
            if (input.remoteControl)
                runConfig.remoteControl = input.remoteControl
            
            // Add command
            if (input.applyName){
                // Command start
                let command = "p ";

                // Set class and default name
                if (input.constructors === undefined)
                    runConfig.defaultName = input.defaultName
                else {
                    runConfig.defaultName = null;
                    let cIndex = 0;

                    // If multiple constructors to select from request the user to select one
                    if (input.constructors.length > 1) {
                        await this.requestConstructor(input.defaultName, input.constructors).then( 
                            i => {cIndex = i},
                            () => reject
                        )
                    }

                    // Add class initialisation
                    await this.requestArguments(input.constructors[cIndex], "constructor").then(
                        (args) => {command += `new ${input.defaultName}(${args}).`},
                        () => reject
                    )
                }
                
                // Add function/operation call to command
                await this.requestArguments(input.applyArgs, "operation/function").then(
                    (args) => {command += `${input.applyName}(${args})`},
                    () => reject
                )

                // Set command
                runConfig.command = command;
            }

            // Save configuration
            this.saveRunConfiguration(runConfig, wsFolder);
            
            // Start debug session with custom debug configurations
            resolve;
            vscode.debug.startDebugging(wsFolder, runConfig);
        }))
    }

    private async requestArguments(args: VdmArgument[], forEntry: string): Promise<string>{
        return new Promise( async (resolve, reject) => {
            let argString: string = "";

            // Request arguments from user
            for await (const a of args) {
                let arg = await window.showInputBox({
                    prompt: `Input argument for ${forEntry}`,
                    ignoreFocusOut: true,
                    placeHolder: `${a.name} : ${a.type}`
                })

                if (arg === undefined) 
                    return reject;
                else
                    argString += `${arg},`
            }

            // Remove trailing comma
            if (argString.endsWith(",")) 
                argString = argString.slice(0,argString.length-1); 

            resolve(argString);
        })
    }

    private async requestConstructor(className: string, constructors: [VdmArgument[]]): Promise<number>{
        return new Promise( async (resolve, reject) => {
            // Create strings of constructors to pick from
            let ctorStrings: string[] = [];
            constructors.forEach(ctor => {
                let argString = "";
                ctor.forEach(a => argString += `${a.name}:${a.type},`)
                if (argString.endsWith(",")) 
                    argString = argString.slice(0,argString.length-1); 
                ctorStrings.push(`${className}(${argString})`)
            })

            let pick = await window.showQuickPick(ctorStrings,{
                canPickMany: false,
                ignoreFocusOut: false,
                title: "Select constructor"
            });

            if (pick === undefined) 
                return reject;
            else 
                return resolve(ctorStrings.indexOf(pick))
        })
    }

    private addLensRunConfigurationWarning() {
        window.showInformationMessage("Cannot launch until saved")
    }
}

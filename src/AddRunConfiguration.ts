// SPDX-License-Identifier: GPL-3.0-or-later

import * as util from "./Util"
import * as vscode from "vscode"
import { commands, ConfigurationTarget, DebugConfiguration, ExtensionContext, RelativePattern, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";
import { VdmDebugConfiguration } from "./VdmDapSupport";

interface VdmLaunchLensConfiguration {
    name: string,
    defaultName: string,
    type: string,
    request: string
    noDebug: boolean,
    remoteControl: string | null,
    applyName: string,
    applyArgs: {"name": string,"type": string}[]
}

export class AddRunConfigurationHandler {

    constructor(
        private readonly clients: Map<string, SpecificationLanguageClient>,
        private context: ExtensionContext
    ) {
        commands.executeCommand( 'setContext', 'add-runconf-show-button', true );
        this.context = context;
        util.registerCommand(this.context,"vdm-vscode.addRunConfiguration", (inputUri: Uri) => this.addRunConfiguration(workspace.getWorkspaceFolder(inputUri)))
        //util.registerCommand(this.context,"vdm-vscode.addRunConfiguration", (input: VdmLaunchLensConfiguration) => this.addLensRunConfiguration(input)) // TODO delete after testing
        util.registerCommand(this.context,"vdm-vscode.addLensRunConfiguration", (input: VdmLaunchLensConfiguration) => this.addLensRunConfiguration(input))
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
            if(dialect == "SL") {
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

        let i = rawConfigs.findIndex(c => c.name == runConf.name) // Search for configuration with same name
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
                if(res.length == 1) dialect = d;
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

        let runConfig : VdmDebugConfiguration = {
            type: input.type,
            request: input.request,
            name: input.name,
            noDebug: input.noDebug,
            remoteControl: input.remoteControl,
        };
        
        if (input.applyName){
            const dialect = await this.getDialect(wsFolder);

            // Command start
            let command = "p ";
            if (dialect == "vdmsl"){
                runConfig.defaultName = input.defaultName;
                command += `${input.applyName}(`
            }
            else {
                runConfig.defaultName = null,
                command += `new ${input.defaultName}().${input.applyName}(` // TODO Currently assuming to use default consstructor, should be changed
            }

            // Request arguments from user
            for await (const a of input.applyArgs) {
                let arg = await window.showInputBox({
                    prompt: `Input argument`,
                    ignoreFocusOut: true,
                    placeHolder: `${a.name} : ${a.type}`
                })

                if(arg === undefined) 
                    return;
                else
                    command += `${arg},`
            }

            // Command end
            if (command.endsWith(",")) 
                command = command.slice(0,command.length-1); // Remove trailing comma
            command += ")";

            runConfig.command = command;
        }
        
        // Start debug session with custom debug configurations
        vscode.debug.startDebugging(wsFolder, runConfig)
    }
}

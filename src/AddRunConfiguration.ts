// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, ConfigurationTarget, DebugConfiguration, ExtensionContext, RelativePattern, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";

export class AddRunConfigurationHandler {

    constructor(
        private readonly clients: Map<string, SpecificationLanguageClient>,
        private context: ExtensionContext
    ) {
        this.context = context;
        this.registerCommand((inputUri: Uri) => this.addRunConfiguration(workspace.getWorkspaceFolder(inputUri)));
    }

    private registerCommand = (callback: (...args: any[]) => any) => {
        let disposable = commands.registerCommand("vdm-vscode.addRunConfiguration", callback)
        this.context.subscriptions.push(disposable);
        return disposable;
    };

    private async addRunConfiguration(wsFolder: WorkspaceFolder) {

        let dialect = null;
        const dialects = {"vdmsl" : "SL", "vdmpp" : "PP", "vdmrt" : "RT"}

        window.setStatusBarMessage(`Adding Run Configuration.`, new Promise(async (resolve, reject) => {
            let client = this.clients.get(wsFolder.uri.toString());
            if (client) {
                dialect = dialects[client.dialect];
            } else {
                console.log(`No client found for the folder: ${wsFolder.name}`);

                // Guess dialect
                for (var dp in dialects){
                   let pattern = new RelativePattern(wsFolder.uri.path, "*." + dp);
                   let res = await workspace.findFiles(pattern,null,1)
                   if(res.length == 1) dialect = dialects[dp];
                } 

                if(dialect == null) {
                    // TODO could insert a selection window here so that the user can manually choose the dialect if we can't guess
                    window.showInformationMessage(`Add run configuration failed! Unable to guess VDM dialect for workspace`); 
                    return reject();
                }
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
            if(dialect == "SL") {
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
        const launchConfigurations  = workspace.getConfiguration("launch", wsFolder);
        const rawConfigs: DebugConfiguration[] = launchConfigurations.configurations;
        rawConfigs.push(runConf);
        launchConfigurations.update("configurations", rawConfigs, ConfigurationTarget.WorkspaceFolder);
    }
}

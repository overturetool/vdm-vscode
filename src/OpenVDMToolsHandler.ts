// SPDX-License-Identifier: GPL-3.0-or-later

import { Uri, window, workspace, WorkspaceFolder } from "vscode";
import * as Util from "./util/Util";
import AutoDisposable from "./helper/AutoDisposable";
import { ChildProcess, spawn } from "child_process";
import * as Path from "path";
import * as Fs from "fs-extra";
import { guessDialectFromUri, vdmDialectKinds, vdmWorkspaceFilePattern } from "./util/DialectUtil";

export class OpenVDMToolsHandler extends AutoDisposable {
    constructor() {
        super();
        Util.registerCommand(this._disposables, "vdm-vscode.OpenVDMTools", async (inputUri: Uri) => {
            const wsFolder: WorkspaceFolder = workspace.getWorkspaceFolder(inputUri);
            let vdmToolsPath: string = workspace.getConfiguration("vdm-vscode.vdmtools", wsFolder)?.path;
            if (!vdmToolsPath) {
                window.showErrorMessage("No path for VDMTools specified in the settings");
                return;
            }

            // Return if the VDMTools path cannot be resolved
            if (!Fs.existsSync(vdmToolsPath)) {
                // Path could be relative to project
                const absolutePath = Path.resolve(...[wsFolder.uri.fsPath, vdmToolsPath]);
                if (!Fs.existsSync(absolutePath)) {
                    window.showErrorMessage(`Cannot resolve the VDMTools path: '${vdmToolsPath}'`);
                    return;
                } else {
                    vdmToolsPath = absolutePath;
                }
            }
            const dialect: string = await guessDialectFromUri(inputUri);
            if (process.platform === "darwin") {
                if (dialect == vdmDialectKinds.VDMPP) {
                    vdmToolsPath = Path.join(vdmToolsPath, "vppgde.app", "Contents", "MacOS", "vppgde");
                } else if (dialect == vdmDialectKinds.VDMSL) {
                    vdmToolsPath = Path.join(vdmToolsPath, "vdmgde.app", "Contents", "MacOS", "vdmgde");
                } else if (dialect == vdmDialectKinds.VDMRT) {
                    vdmToolsPath = Path.join(vdmToolsPath, "vicegde.app", "Contents", "MacOS", "vicegde");
                }
            } else if (Fs.statSync(vdmToolsPath).isDirectory()) {
                window.showErrorMessage("The VDMTools path should point to the GUI binary");
                return;
            }

            // Build and save the project and options file content used by VDMTools.
            const configHelper: VDMToolsConfigurationHelper = new VDMToolsConfigurationHelper();
            configHelper
                .saveConfiguration(
                    configHelper.buildVDMToolsOptFileContent(wsFolder.name),
                    configHelper.buildVDMToolsPrjFileContent(
                        dialect,
                        (await workspace.findFiles(vdmWorkspaceFilePattern(wsFolder))).map((uri) => uri.fsPath)
                    ),
                    Path.join(Util.generatedDataPath(wsFolder).fsPath, "VDMTools"),
                    wsFolder.name
                )
                .then((projectFilePath: string) => {
                    // Start VDMTools with settings detached and stdio ignore so that the process is decoupled from the parent process.
                    const vdmToolsProc: ChildProcess = spawn(vdmToolsPath, [projectFilePath], {
                        detached: true,
                        stdio: "ignore",
                    });
                    if (vdmToolsProc.pid) {
                        // If started then unref so that closing VSCode does not close VDMTools
                        vdmToolsProc.unref();
                    } else {
                        window.showErrorMessage("Unable to start VDMTools");
                    }
                })
                .catch((err) => {
                    window.showErrorMessage("Failed to save configuration for VDMTools: " + err);
                });
        });
    }
}

// Logic for building the options and project file content is from Overture
class VDMToolsConfigurationHelper {
    // Headers from Overture
    public CONTENT_START: string = "b";
    public CONTENT_DIALECT_PP_RT: string = "k13,ProjectFilePPf3,f";
    public CONTET_DIALECT_SL: string = "k11,ProjectFilef3,f";
    public CONTENT_FILE: string = "e2,m4,filem";

    public buildVDMToolsOptFileContent(projectName: string): string {
        const options: VDMToolOptions = new VDMToolOptions();
        options.JCG_PACKAGE = projectName + ".model";
        let stringToReturn: string = Object.keys(options).reduce((prev, cur) => {
            const value = options[cur] instanceof Boolean ? (options[cur] ? 1 : 0) : options[cur];
            prev += `${cur}:${value}\n`;
            return prev;
        });

        stringToReturn = stringToReturn.substring(0, stringToReturn.length - 1);
        return stringToReturn;
    }

    public buildVDMToolsPrjFileContent(dialect: string, vdmFilesInProject: string[]): string {
        // Append start
        let projFileContent: string = `${this.CONTENT_START}${vdmFilesInProject.length + 3},`;

        // Append dialect
        if (dialect == vdmDialectKinds.VDMPP || dialect == vdmDialectKinds.VDMRT) {
            projFileContent += this.CONTENT_DIALECT_PP_RT;
        } else if (dialect == vdmDialectKinds.VDMSL) {
            projFileContent += this.CONTET_DIALECT_SL;
        }

        // Append number of files
        projFileContent += `${vdmFilesInProject.length},`;

        // Append file paths
        vdmFilesInProject.forEach((filePath) => (projFileContent += `${this.CONTENT_FILE}${filePath.length},${filePath}`));

        return projFileContent;
    }

    public saveConfiguration(optionsContent: string, projFileContent: string, savePath: string, projectName: string): Promise<string> {
        Fs.ensureDirSync(savePath);
        return new Promise<string>((resolve, reject) => {
            const projectFilePath: string = Path.join(savePath, `${projectName}.prj`);
            Fs.writeFile(projectFilePath, projFileContent, (err: NodeJS.ErrnoException) => {
                if (err) {
                    reject("Unable to save VDMTools project file: " + err.message);
                } else {
                    Fs.writeFile(Path.join(savePath, `${projectName}.opt`), optionsContent, (err: NodeJS.ErrnoException) => {
                        if (err) {
                            reject("Unable to save VDMTools options file: " + err.message);
                        } else {
                            resolve(projectFilePath);
                        }
                    });
                }
            });
        });
    }
}

class VDMToolOptions {
    // Default options from Overture
    public FormatVersion = 2;
    public DTC = true;
    public PRE = true;
    public POST = true;
    public INV = true;
    public CONTEXT = false;
    public MAXINSTR = 1000;
    public PRIORITY = 0;
    public PRIMARYALGORITHM = "instruction_number_slice";
    public TASKSWITCH = false;
    public MAXTIME = 1000;
    public TIMEFACTOR = 1;
    public STEPSIZE = 100;
    public JITTERMODE = "Early";
    public DEFAULTCPUCAPACITY = 1000000;
    public DEFAULTVCPUCAPACITY = "INFINITE";
    public LOGARGS = "";
    public PRINT_FORMAT = 1;
    public DEF = "pos";
    public errlevel = 1;
    public SEP = 1;
    public VDMSLMOD = 0;
    public INDEX = 0;
    public PrettyPrint_RTI = false;
    public CG_RTI = false;
    public CG_CHECKPREPOST = true;
    public C_flag = 0;
    public JCG_SKEL = 0;
    public JCG_GENPREPOST = false;
    public JCG_TYPES = false;
    public JCG_SMALLTYPES = false;
    public JCG_LONGS = true;
    public JCG_PACKAGE = "";
    public JCG_CONCUR = false;
    public JCG_CHECKPREPOST = false;
    public JCG_VDMPREFIX = true;
    public JCG_INTERFACES = "";
    public Seed_nondetstmt = -1;
    public j2v_stubsOnly = false;
    public j2v_transforms = false;
}

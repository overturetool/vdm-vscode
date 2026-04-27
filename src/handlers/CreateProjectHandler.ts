// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, extensions, QuickPickItem, Uri, window, workspace } from "vscode";
import * as util from "../util/Util";
import { Dirent, readdirSync, writeFileSync } from "fs";
import { copySync, ensureDirSync, writeJsonSync } from "fs-extra";
import * as path from "path";
import { extensionId } from "../ExtensionInfo";
import AutoDisposable from "../helper/AutoDisposable";
import { getDefaultWorkspaceFolderLocation } from "../util/WorkspaceFoldersUtil";
import { dialectToFileExtensions, dialectToPrettyFormat, VdmDialect } from "../util/DialectUtil";

interface DialectQuickPickItem extends QuickPickItem {
    dialect: VdmDialect;
    prettyDialect: string;
}

type ProjectKind = { type: "blank" } | { type: "template"; templateName: string };

interface TemplateQuickPickItem extends QuickPickItem {
    projectKind: ProjectKind;
}

export class CreateProjectHandler extends AutoDisposable {
    constructor() {
        super();
        util.registerCommand(this._disposables, "vdm-vscode.createProject", () => this.createProject());
    }

    private async createProject(): Promise<void> {
        const dialect = await this.pickDialect();
        if (dialect === undefined) {
            return;
        }

        const projectKind = await this.pickProjectKind(dialect);
        if (projectKind === undefined) {
            return;
        }

        const { parentUri, projectName } = await this.pickLocation();
        if (parentUri === undefined || projectName === undefined) {
            return;
        }

        const projectUri = Uri.joinPath(parentUri, projectName);
        try {
            this.scaffold(projectUri, dialect, projectKind);
        } catch (err) {
            window.showErrorMessage(`Failed to create project: ${err}`);
            return;
        }

        await this.openProject(projectUri);
    }

    private async pickDialect(): Promise<VdmDialect | undefined> {
        const items: DialectQuickPickItem[] = Array.from(dialectToPrettyFormat.entries()).map(([dialect, prettyDialect]) => ({
            label: prettyDialect,
            dialect,
            prettyDialect,
        }));

        const picked = await window.showQuickPick(items, {
            placeHolder: "Choose a VDM dialect",
            canPickMany: false,
        });

        return picked?.dialect;
    }

    private async pickProjectKind(dialect: VdmDialect): Promise<ProjectKind | undefined> {
        const prettyDialect = dialectToPrettyFormat.get(dialect);

        const items: TemplateQuickPickItem[] = [
            {
                label: `Blank ${prettyDialect} project`,
                projectKind: { type: "blank" },
            },
        ];

        const templatesForDialect = this.getTemplatesForDialect(prettyDialect!);
        for (const templateName of templatesForDialect) {
            items.push({
                label: templateName,
                description: "template",
                projectKind: { type: "template", templateName },
            });
        }

        const picked = await window.showQuickPick(items, {
            placeHolder: "Choose a starting point",
            canPickMany: false,
        });

        return picked?.projectKind;
    }

    private getTemplatesForDialect(prettyDialect: string): string[] {
        try {
            const templatesPath = path.resolve(
                extensions.getExtension(extensionId)!.extensionPath,
                "resources",
                "templates",
                prettyDialect,
            );
            const entries: Dirent[] = readdirSync(templatesPath, { withFileTypes: true });
            return entries.filter((e) => e.isDirectory()).map((e) => e.name);
        } catch {
            return [];
        }
    }

    private async pickLocation(): Promise<{ parentUri: Uri | undefined; projectName: string | undefined }> {
        const defaultUri = getDefaultWorkspaceFolderLocation();
        const folderSelection = await window.showOpenDialog({
            defaultUri,
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Select project location",
            title: "Select folder to create the project in",
        });

        if (!folderSelection?.length) {
            return { parentUri: undefined, projectName: undefined };
        }

        const parentUri = folderSelection[0];

        const projectName = await window.showInputBox({
            prompt: "Enter a project name",
            placeHolder: "MyVdmProject",
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return "Project name cannot be empty";
                }
                if (/[\\/:*?"<>|]/.test(value)) {
                    return "Project name contains invalid characters";
                }
                return undefined;
            },
        });

        const projectPath = Uri.joinPath(parentUri, projectName!.trim()).fsPath;
        if (require("fs").existsSync(projectPath)) {
            const overwrite = await window.showWarningMessage(
                `A folder named "${projectName!.trim()}" already exists at this location. Overwrite it?`,
                { modal: true },
                "Overwrite",
            );
            if (overwrite !== "Overwrite") {
                return { parentUri: undefined, projectName: undefined };
            }
        }

        return { parentUri, projectName: projectName?.trim() };
    }

    private scaffold(projectUri: Uri, dialect: VdmDialect, kind: ProjectKind): void {
        const projectPath = projectUri.fsPath;

        if (kind.type === "template") {
            const prettyDialect = dialectToPrettyFormat.get(dialect);
            const templateSrc = path.resolve(
                extensions.getExtension(extensionId)!.extensionPath,
                "resources",
                "templates",
                prettyDialect!,
                kind.templateName,
            );
            copySync(templateSrc, projectPath);
        } else {
            ensureDirSync(projectPath);
            this.writeVscodeFolder(projectUri, dialect, path.basename(projectUri.fsPath));
        }
    }

    private writeVscodeFolder(projectUri: Uri, _dialect: VdmDialect, projectName: string): void {
        const vscodePath = path.join(projectUri.fsPath, ".vscode");
        ensureDirSync(vscodePath);

        const ext = dialectToFileExtensions.get(_dialect)![0];
        const dialectComment: Map<VdmDialect, string> = new Map([
            [VdmDialect.VDMSL, `-- Empty VDM-SL project\n`],
            [VdmDialect.VDMPP, `-- Empty VDM++ project\n`],
            [VdmDialect.VDMRT, `-- Empty VDM-RT project\n`],
        ]);
        writeFileSync(path.join(projectUri.fsPath, `${projectName}.${ext}`), dialectComment.get(_dialect)!);

        writeJsonSync(path.join(vscodePath, "settings.json"), {}, { spaces: 4 });
        writeJsonSync(path.join(vscodePath, "launch.json"), {});
    }

    private async openProject(projectUri: Uri): Promise<void> {
        const workspaceFile = workspace.workspaceFile;
        const folders = workspace.workspaceFolders ?? [];

        if (folders.length === 0) {
            // Nothing open - new window
            await commands.executeCommand("vscode.openFolder", projectUri, true);
        } else if (workspaceFile && !workspaceFile.path.includes("untitled")) {
            // Named .code-workspace is open - offer to add to it
            const workspaceName = path.basename(workspaceFile.fsPath, ".code-workspace");
            const choice = await window.showInformationMessage(
                `Project created successfully. Add it to the current workspace "${workspaceName}", or open it standalone?`,
                { modal: true },
                "Add to workspace",
                "Open in a new window",
            );
            if (choice === undefined) {
                return;
            }
            if (choice === "Add to workspace") {
                workspace.updateWorkspaceFolders(folders.length, null, { uri: projectUri });
            } else {
                await commands.executeCommand("vscode.openFolder", projectUri, true);
            }
        } else {
            // Single folder or untitled multi-root
            const choice = await window.showInformationMessage(
                `Project created successfully. How would you like to open it?`,
                { modal: true },
                "Open in a new window",
                "Add to current workspace",
            );
            if (choice === undefined) {
                return;
            }
            if (choice === "Add to current workspace") {
                workspace.updateWorkspaceFolders(folders.length, null, { uri: projectUri });
            } else {
                await commands.executeCommand("vscode.openFolder", projectUri, true);
            }
        }
    }
}

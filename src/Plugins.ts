// SPDX-License-Identifier: GPL-3.0-or-later

import { workspace, WorkspaceFolder } from "vscode";

export interface PluginSetting {
    name: string;
    classname: string;
    jar: string;
    dialects?: string[];
}

export function getPlugins(wsFolder: WorkspaceFolder, dialect: string): PluginSetting[] {
    const serverConfig = workspace.getConfiguration("vdm-vscode.server", wsFolder);

    const plugins = (serverConfig.get("plugins") as PluginSetting[]) ?? [];
    const pluginsFiltered = plugins.filter((plugin) => {
        if (plugin.dialects) return plugin.dialects.includes(dialect);
        else return true;
    });

    return pluginsFiltered;
}

export function getJvmAdditions(wsFolder: WorkspaceFolder, dialect: string): string {
    const plugins = getPlugins(wsFolder, dialect);

    if (plugins.length > 0) return "-Dlspx.plugins=" + plugins.map((plugin) => plugin.classname).join(";");
    else return undefined;
}

export function getClasspathAdditions(wsFolder: WorkspaceFolder, dialect: string): string[] {
    const plugins = getPlugins(wsFolder, dialect);

    if (plugins.length > 0) return plugins.map((plugin) => plugin.jar);
    else return [];
}

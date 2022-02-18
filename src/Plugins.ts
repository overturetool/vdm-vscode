// SPDX-License-Identifier: GPL-3.0-or-later

import path = require("path");
import * as util from "./Util";
import { extensions, workspace, WorkspaceFolder } from "vscode";
import { extensionId } from "./ExtensionInfo";

export interface PluginSetting {
    name: string;
    classname: string;
    jar: string;
    dialects?: string[];
}

export function getPlugins(wsFolder: WorkspaceFolder, dialect: string): PluginSetting[] {
    // Get the server configurations
    const serverConfig = workspace.getConfiguration("vdm-vscode.server", wsFolder);

    // Get the plugins from setting
    let plugins = (serverConfig.get("plugins") as PluginSetting[]) ?? [];

    // Get include the built-in plugins that are not manually included
    const builtInPlugins = getBuiltInPlugins().filter((pluginA) => !plugins.some((pluginB) => isSamePlugin(pluginA, pluginB)));
    plugins.push(...builtInPlugins);

    // Filter such that we only get the ones for the dialects that they support
    const pluginsFiltered = plugins.filter((plugin) => {
        if (plugin.dialects && plugin.dialects.length > 0) return plugin.dialects.includes(dialect);
        else return true;
    });

    return pluginsFiltered;
}

// Get the jvm arguments for the available plugins
export function getJvmAdditions(wsFolder: WorkspaceFolder, dialect: string): string {
    const plugins = getPlugins(wsFolder, dialect);

    if (plugins.length > 0) return `-Dlspx.plugins=${plugins.map((p) => p.classname).join(";")}`;
    else return undefined;
}

// Get the classpath additions for the available plugins
export function getClasspathAdditions(wsFolder: WorkspaceFolder, dialect: string): string[] {
    const plugins = getPlugins(wsFolder, dialect);

    // If there are some plugin settings, get the jar paths for each plugin
    let result = [];
    if (plugins.length > 0) {
        plugins.forEach((plugin) => {
            let jarPath = plugin.jar;
            if (jarPath && jarPath != "") {
                result.push(jarPath);
            }
        });
    }

    return result;
}

function getBuiltInPlugins(): PluginSetting[] {
    const pluginsPath = path.join(extensions.getExtension(extensionId).extensionUri.fsPath, "resources", "jars", "plugins");
    let result = [];

    // Add vdm2isa plugin
    let vdm2isaJar = util.recursivePathSearch(pluginsPath, /vdm2isa.*jar/i);
    if (vdm2isaJar)
        result.push({
            name: "vdm2isa alpha release",
            classname: "plugins.ISAPluginSL",
            jar: vdm2isaJar,
            dialects: ["vdmsl"],
        });

    return result;
}

function isSamePlugin(a: PluginSetting, b: PluginSetting) {
    if (a.classname == b.classname) return true;
    if (a.name == b.name) return true;
    return false;
}

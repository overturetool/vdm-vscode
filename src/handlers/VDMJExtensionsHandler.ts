import { commands, Uri, window, workspace, WorkspaceFolder, extensions } from "vscode";
import AutoDisposable from "../helper/AutoDisposable";
import * as Util from "../util/Util";
import * as Path from "path";
import * as Fs from "fs-extra";
import { getFilesFromDirRecur } from "../util/DirectoriesUtil";
import { getExtensionPath } from "../util/ExtensionUtil";
import { JarFile } from "../util/JarFile";
import { packageJsonSchema } from "../util/Schemas";

type ExtensionType = "builtin" | "user";

interface ExtensionSource {
    type: ExtensionType;
    jarPath: string;
}

export type LibrarySource = ExtensionSource;
export type PluginSource = ExtensionSource;
export type AnnotationSource = ExtensionSource;

export class VDMJExtensionsHandler extends AutoDisposable {
    private static jarCache: string[] | undefined;

    constructor() {
        super();
        Util.registerCommand(this._disposables, "vdm-vscode.addExtensionJarFolders", () =>
            Util.addToSettingsArray(true, "Extension Search Path", "vdm-vscode.server", "extensionSearchPaths"),
        );
        Util.registerCommand(this._disposables, "vdm-vscode.addExtensionJars", () =>
            Util.addToSettingsArray(false, "Extension Search Path", "vdm-vscode.server", "extensionSearchPaths"),
        );
    }

    // Common
    private static resolveJarPathsFromSettings(jarPaths: string[], resolveFailedPaths: string[], rootUri?: Uri): string[] {
        // Resolve jar paths, flatten directories
        if (this.jarCache) {
            return this.jarCache;
        }

        const visitedJarPaths: Map<string, string> = new Map<string, string>();
        const resolvedJarPaths = jarPaths
            .flatMap((originalPath: string) => {
                let resolvedPath: string = originalPath;
                if (rootUri && !Path.isAbsolute(originalPath)) {
                    // Path should be relative to the project
                    resolvedPath = Path.resolve(...[rootUri.fsPath, originalPath]);
                }
                if (!Fs.existsSync(resolvedPath)) {
                    resolveFailedPaths.push(originalPath);
                    return [];
                }
                return Fs.lstatSync(resolvedPath).isDirectory() ? getFilesFromDirRecur(resolvedPath, "jar") : [resolvedPath];
            })
            .filter((jarPath: string) => {
                const jarName: string = Path.basename(jarPath);
                if (!visitedJarPaths.has(jarName)) {
                    visitedJarPaths.set(jarName, jarPath);
                    return true;
                }
                return false;
            });

        this.jarCache = resolvedJarPaths;
        return resolvedJarPaths;
    }

    private static getUserExtensionSources(wsFolder: WorkspaceFolder): ExtensionSource[] {
        // Get extension jars specified by the user at the folder level setting - if not defined at this level then the "next up" level where it is defined is returned.
        let folderSettings: string[] = (workspace.getConfiguration("vdm-vscode.server", wsFolder.uri)?.get("extensionSearchPaths") ??
            []) as string[];

        // Get extension jars specified by the user at the user or workspace level setting - if the workspace level setting is defined then it is returned instead of the user level setting.
        let userOrWorkspaceSettings: string[] = (workspace.getConfiguration("vdm-vscode.server")?.get("extensionSearchPaths") ??
            []) as string[];
        const resolveFailedPaths: string[] = [];
        const jarPathsFromSettings: string[] = this.resolveJarPathsFromSettings(folderSettings, resolveFailedPaths, wsFolder.uri);

        // Determine if settings are equal, e.g. if the setting is not defined at the folder level.
        if (
            folderSettings.length !== userOrWorkspaceSettings.length ||
            !folderSettings.every((ujp: string) => userOrWorkspaceSettings.find((fjp: string) => fjp === ujp))
        ) {
            // If the settings are not equal then merge them and in case of duplicate jar names the folder level takes precedence over the workspace/user level.
            jarPathsFromSettings.push(
                ...this.resolveJarPathsFromSettings(userOrWorkspaceSettings, resolveFailedPaths).filter((uwsPath: string) => {
                    const existingJarPath: string = jarPathsFromSettings.find(
                        (fsPath: string) => Path.basename(fsPath) === Path.basename(uwsPath),
                    );
                    if (existingJarPath) {
                        return false;
                    }
                    return true;
                }),
            );
        }

        if (resolveFailedPaths.length > 0) {
            const msg: string = `Unable to resolve the following VDM extension jar/folder paths: <${resolveFailedPaths.reduce(
                (prev, curr) => (curr += `> <${prev}`),
            )}>. These can be changed in the settings.`;
            window
                .showInformationMessage(msg, ...["Go to settings"])
                .then(() => commands.executeCommand("workbench.action.openSettings", "vdm-vscode.server.extensionSearchPaths"));
        }

        return jarPathsFromSettings.map((jarPath) => ({
            type: "user",
            jarPath,
        }));
    }

    private static getDefaultExtensionSources(jarPaths: string[], userDefinedExtensionSources: ExtensionSource[]): ExtensionSource[] {
        if (userDefinedExtensionSources.length > 0) {
            // Only keep those paths that have not been overwritten by a user-defined extension
            jarPaths = jarPaths.filter((ijp: string) => {
                const jarName: string = Path.basename(ijp);
                const existingExtensionSource = userDefinedExtensionSources.find((userLib) => Path.basename(userLib.jarPath) === jarName);
                return !existingExtensionSource;
            });
        }

        return jarPaths.map((jarPath) => ({
            type: "builtin",
            jarPath,
        }));
    }

    private static getExtensionExtensionSources(userDefinedExtensionSources: ExtensionSource[]): ExtensionSource[] {
        const jarPaths: string[] = extensions.all
            .reduce((enhancementPaths, ext) => {
                const pj = ext.packageJSON;
                const { success, data } = packageJsonSchema.safeParse(pj);

                if (!success || !data["vdmjEnhancements"]) {
                    return enhancementPaths;
                }

                const resolvedPaths = data["vdmjEnhancements"].map((relPath) => {
                    return Uri.joinPath(ext.extensionUri, relPath).fsPath;
                });

                const newAcc = [...enhancementPaths, ...resolvedPaths];

                return newAcc;
            }, [])
            .filter((ijp: string) => {
                const jarName: string = Path.basename(ijp);
                const existingExtensionSource = userDefinedExtensionSources.find((userLib) => Path.basename(userLib.jarPath) === jarName);
                return !existingExtensionSource;
            });

        return jarPaths.map((jarPath) => ({
            type: "user",
            jarPath,
        }));
    }

    private static async filterExtensionSources<T extends ExtensionSource>(extSources: T[], metaFileTest: string): Promise<T[]> {
        const validSources: T[] = [];

        for (const extSrc of extSources) {
            let jarFile: JarFile;
            try {
                jarFile = await JarFile.open(extSrc.jarPath);
            } catch {
                continue;
            }

            if (!jarFile.fileExists(metaFileTest)) {
                continue;
            }

            validSources.push(extSrc);
        }

        return validSources;
    }

    // Libraries
    public static getIncludedLibrariesFolderPath(wsFolder: WorkspaceFolder): string {
        // Get the standard or high precision path of the included library jars folder
        const libPath: string = Path.resolve(
            getExtensionPath(),
            "resources",
            "jars",
            workspace.getConfiguration("vdm-vscode.server", wsFolder)?.highPrecision ? "vdmj_hp" : ("vdmj" ?? "vdmj"),
            "libs",
        );

        if (!Fs.existsSync(libPath)) {
            console.log("Invalid path for default libraries: " + libPath);
            return undefined;
        }

        return libPath;
    }

    private static async getUserLibrarySources(wsFolder: WorkspaceFolder): Promise<LibrarySource[]> {
        const extensionSources = this.getUserExtensionSources(wsFolder);
        return await this.filterExtensionSources(extensionSources, "META-INF/library.json");
    }

    private static async getExtensionLibrarySources(userDefinedLibrarySources: PluginSource[]): Promise<PluginSource[]> {
        const extensionSources = this.getExtensionExtensionSources(userDefinedLibrarySources);
        return await this.filterExtensionSources(extensionSources, "META-INF/library.json");
    }

    private static getDefaultLibrarySources(wsFolder: WorkspaceFolder, userDefinedLibrarySources: LibrarySource[]): LibrarySource[] {
        const defaultLibrariesPath = this.getIncludedLibrariesFolderPath(wsFolder);

        if (!defaultLibrariesPath) {
            return [];
        }

        let includedJarsPaths: string[] = getFilesFromDirRecur(defaultLibrariesPath, "jar");

        return this.getDefaultExtensionSources(includedJarsPaths, userDefinedLibrarySources);
    }

    public static async getAllLibrarySources(wsFolder: WorkspaceFolder): Promise<LibrarySource[]> {
        const userLibraries = await this.getUserLibrarySources(wsFolder);
        const extensionLibraries = await this.getExtensionLibrarySources(userLibraries);
        const defaultLibraries = this.getDefaultLibrarySources(wsFolder, extensionLibraries);

        return userLibraries.concat(defaultLibraries);
    }

    // Plugins
    public static getIncludedPluginsFolderPath(wsFolder: WorkspaceFolder): string {
        const pluginPath: string = Path.resolve(
            getExtensionPath(),
            "resources",
            "jars",
            workspace.getConfiguration("vdm-vscode.server", wsFolder)?.highPrecision ? "vdmj_hp" : ("vdmj" ?? "vdmj"),
            "plugins",
        );

        if (!Fs.existsSync(pluginPath)) {
            console.log("Invalid path for default plugins: " + pluginPath);
            return undefined;
        }

        return pluginPath;
    }

    public static async getUserPluginSources(wsFolder: WorkspaceFolder): Promise<PluginSource[]> {
        const extensionSources = this.getUserExtensionSources(wsFolder);
        return await this.filterExtensionSources(extensionSources, "META-INF/plugin.json");
    }

    private static async getExtensionPluginSources(userDefinedPluginSources: PluginSource[]): Promise<PluginSource[]> {
        const extensionSources = this.getExtensionExtensionSources(userDefinedPluginSources);
        return await this.filterExtensionSources(extensionSources, "META-INF/plugin.json");
    }

    public static getDefaultPluginSources(wsFolder: WorkspaceFolder, userDefinedPluginSources: PluginSource[]): PluginSource[] {
        const defaultPluginSources = this.getIncludedPluginsFolderPath(wsFolder);

        if (!defaultPluginSources) {
            return [];
        }
        let includedJarsPaths: string[] = getFilesFromDirRecur(defaultPluginSources, "jar");

        return this.getDefaultExtensionSources(includedJarsPaths, userDefinedPluginSources);
    }

    public static async getAllPluginSources(wsFolder: WorkspaceFolder): Promise<PluginSource[]> {
        const userPlugins = await this.getUserPluginSources(wsFolder);
        const extensionPlugins = await this.getExtensionPluginSources(userPlugins);
        const defaultPlugins = this.getDefaultPluginSources(wsFolder, extensionPlugins);

        return userPlugins.concat(defaultPlugins, extensionPlugins);
    }

    // Annotations
    public static getIncludedAnnotationsFolderPath(wsFolder: WorkspaceFolder): string {
        const annotationsPath: string = Path.resolve(
            getExtensionPath(),
            "resources",
            "jars",
            workspace.getConfiguration("vdm-vscode.server", wsFolder)?.highPrecision ? "vdmj_hp" : ("vdmj" ?? "vdmj"),
            "annotations",
        );

        if (!Fs.existsSync(annotationsPath)) {
            console.log("Invalid path for default annotations: " + annotationsPath);
            return undefined;
        }

        return annotationsPath;
    }

    public static async getUserAnnotationsSources(wsFolder: WorkspaceFolder): Promise<AnnotationSource[]> {
        const extensionSources = this.getUserExtensionSources(wsFolder);
        return await this.filterExtensionSources(extensionSources, "META-INF/annotations.json");
    }

    private static async getExtensionAnnotationSources(userDefinedAnnotationSources: AnnotationSource[]): Promise<AnnotationSource[]> {
        const extensionSources = this.getExtensionExtensionSources(userDefinedAnnotationSources);
        return await this.filterExtensionSources(extensionSources, "META-INF/annotations.json");
    }

    public static getDefaultAnnotationSources(
        wsFolder: WorkspaceFolder,
        userDefinedAnnotationSources: AnnotationSource[],
    ): AnnotationSource[] {
        const defaultAnnotationsPath = this.getIncludedAnnotationsFolderPath(wsFolder);

        if (!defaultAnnotationsPath) {
            return [];
        }
        let includedJarsPaths: string[] = getFilesFromDirRecur(defaultAnnotationsPath, "jar");

        return this.getDefaultExtensionSources(includedJarsPaths, userDefinedAnnotationSources);
    }

    public static async getAllAnnotationSources(wsFolder: WorkspaceFolder): Promise<AnnotationSource[]> {
        const userAnnotations = await this.getUserAnnotationsSources(wsFolder);
        const extensionAnnotations = await this.getExtensionAnnotationSources(userAnnotations);
        const defaultAnnotations = this.getDefaultAnnotationSources(wsFolder, extensionAnnotations);

        return userAnnotations.concat(defaultAnnotations, extensionAnnotations);
    }

    public static getExtensionClasspathSources(): String[] {
        return extensions.all.reduce((jarPaths, ext) => {
            const { success, data } = packageJsonSchema.safeParse(ext.packageJSON);
            if (!success || !data["vdmjEnhancements"]) {
                return jarPaths;
            }
            const resolvedPaths = data["vdmjEnhancements"].map((relPath) => Uri.joinPath(ext.extensionUri, relPath).fsPath);
            return [...jarPaths, ...resolvedPaths];
        }, []);
    }
}

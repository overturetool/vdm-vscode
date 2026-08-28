// SPDX-License-Identifier: GPL-3.0-or-later

import * as Fs from "fs-extra";
import * as Path from "path";
import { VdmDialect } from "./DialectUtil";

/**
 * The result of resolving a user-provided path to an actual VDMTools GUI binary.
 */
export interface ResolvedVDMTools {
    /**
     * The value that should be stored in the vdm-vscode.vdmtools.path.* setting.
     */
    settingValue: string;
    /**
     * The concrete executable that would be spawned to launch VDMTools.
     */
    binaryPath: string;
}

/**
 * The expected (platform independent) name of the VDMTools GUI binary for the given dialect.
 */
export function expectedBinaryName(dialect: VdmDialect): string {
    return dialect === VdmDialect.VDMPP ? "vppgde" : "vdmgde";
}

/**
 * Resolves a path picked or typed in by the user to the actual VDMTools GUI binary for the given
 * dialect, returning undefined if no valid binary could be found.
 *
 * The provided path may be:
 * - The binary itself;
 * - A "bin" folder directly containing the binary;
 * - The root of a VDMTools installation containing a "bin" subfolder with the binary;
 * - On macOS: the "<name>.app" bundle, a folder containing it, or the binary inside the bundle.
 */
export function resolveVDMToolsInstallation(selectedPath: string, dialect: VdmDialect): ResolvedVDMTools | undefined {
    if (!selectedPath || !Fs.existsSync(selectedPath)) {
        return undefined;
    }

    const baseName = expectedBinaryName(dialect);

    return process.platform === "darwin" ? resolveDarwin(selectedPath, baseName) : resolveGeneric(selectedPath, baseName);
}

function candidateNames(baseName: string): string[] {
    return process.platform === "win32" ? [`${baseName}.exe`, baseName] : [baseName];
}

function matchesBinaryName(filePath: string, names: string[]): boolean {
    const base = Path.basename(filePath).toLowerCase();
    return names.some((name) => name.toLowerCase() === base);
}

function isExecutableFile(filePath: string): boolean {
    if (!Fs.existsSync(filePath) || !Fs.statSync(filePath).isFile()) {
        return false;
    }
    if (process.platform === "win32") {
        // Windows doesn't use the POSIX execute bit; existence plus the expected file name is enough.
        return true;
    }
    try {
        Fs.accessSync(filePath, Fs.constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

function resolveGeneric(selectedPath: string, baseName: string): ResolvedVDMTools | undefined {
    const names = candidateNames(baseName);
    const stat = Fs.statSync(selectedPath);

    // The user pointed directly at the binary
    if (stat.isFile()) {
        return matchesBinaryName(selectedPath, names) && isExecutableFile(selectedPath)
            ? { settingValue: selectedPath, binaryPath: selectedPath }
            : undefined;
    }

    // The user pointed at a folder
    for (const dir of [selectedPath, Path.join(selectedPath, "bin")]) {
        for (const name of names) {
            const candidate = Path.join(dir, name);
            if (isExecutableFile(candidate)) {
                return { settingValue: candidate, binaryPath: candidate };
            }
        }
    }

    return undefined;
}

function resolveDarwin(selectedPath: string, baseName: string): ResolvedVDMTools | undefined {
    const appName = `${baseName}.app`;
    const binaryInsideApp = (appPath: string) => Path.join(appPath, "Contents", "MacOS", baseName);

    const stat = Fs.statSync(selectedPath);

    // The user pointed directly at the binary inside the bundle
    const bundleSuffix = Path.join(appName, "Contents", "MacOS");
    if (stat.isFile() && Path.basename(selectedPath) === baseName && selectedPath.includes(bundleSuffix)) {
        if (!isExecutableFile(selectedPath)) {
            return undefined;
        }
        const root = selectedPath.slice(0, selectedPath.indexOf(bundleSuffix)).replace(/[\\/]+$/, "");
        return { settingValue: root, binaryPath: selectedPath };
    }

    // The user pointed directly at the ".app" bundle
    if (Path.basename(selectedPath) === appName) {
        const binary = binaryInsideApp(selectedPath);
        return isExecutableFile(binary) ? { settingValue: Path.dirname(selectedPath), binaryPath: binary } : undefined;
    }

    // The user pointed at a folder
    if (stat.isDirectory()) {
        for (const dir of [selectedPath, Path.join(selectedPath, "bin")]) {
            const binary = binaryInsideApp(Path.join(dir, appName));
            if (isExecutableFile(binary)) {
                return { settingValue: dir, binaryPath: binary };
            }
        }
    }

    return undefined;
}

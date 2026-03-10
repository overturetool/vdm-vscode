import { spawn } from "child_process";
import * as AdmZip from "adm-zip";

export function checkJavaVersion(minVersion: number): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
        const proc = spawn("java", ["-version"], { shell: true });
        let output = "";

        proc.stdout.on("data", (d) => (output += d.toString()));
        proc.stderr.on("data", (d) => (output += d.toString()));

        const timeout = setTimeout(() => {
            (proc.kill(), resolve({ success: false, message: `Java check timed out. Please ensure Java ${minVersion}+ is installed.` }));
        }, 5000);

        proc.on("error", () => {
            clearTimeout(timeout);
            resolve({ success: false, message: "Java is not installed or not available on PATH." });
        });

        proc.on("close", (code) => {
            clearTimeout(timeout);
            if (code !== 0) {
                resolve({ success: false, message: "Unable to determine Java version." });
                return;
            }

            const match = output.match(/version "(\d+)(?:\.(\d+))?/);
            if (!match) {
                resolve({ success: false, message: "Unable to parse Java version." });
                return;
            }

            const major = parseInt(match[1]);
            const version = major === 1 ? parseInt(match[2]) : major;
            if (version < minVersion) {
                resolve({
                    success: false,
                    message: `Java ${minVersion}+ required. Found version ${version}.`,
                });
                return;
            }

            resolve({ success: true, message: `Java version ${version} is accessible.` });
        });
    });
}

export function getMinJavaVersion(jarPath: string): number | null {
    try {
        const zip = new AdmZip(jarPath);
        const manifest = zip.getEntry("META-INF/MANIFEST.MF")?.getData().toString("utf-8");
        if (!manifest) {
            return null;
        }

        const match = manifest.match(/Minumum-Java-Version:\s*(\d+)/);
        return match ? parseInt(match[1]) : 11;
    } catch {
        return null;
    }
}

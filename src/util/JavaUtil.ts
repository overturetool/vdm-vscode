import { spawn } from "child_process";

const MIN_JAVA_VERSION = 11;

export function checkJavaVersion(): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
        const proc = spawn("java", ["-version"], { shell: true });
        let output = "";

        proc.stdout.on("data", (d) => (output += d.toString()));
        proc.stderr.on("data", (d) => (output += d.toString()));

        const timeout = setTimeout(() => {
            (proc.kill(),
                resolve({ success: false, message: `Java check timed out. Please ensure Java ${MIN_JAVA_VERSION}+ is installed.` }));
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

            if (version < MIN_JAVA_VERSION) {
                resolve({
                    success: false,
                    message: `Java ${MIN_JAVA_VERSION}+ required. Found version ${version}.`,
                });
                return;
            }

            resolve({ success: true, message: `Java version ${version} is accessible.` });
        });
    });
}

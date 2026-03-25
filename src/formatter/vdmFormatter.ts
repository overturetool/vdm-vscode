import { VdmDialect } from "../util/DialectUtil";

export function formatVDM(text: string, dialect: VdmDialect): string {
    const lines = text.split("\n");
    const INDENT_SIZE = 2;
    const result: string[] = [];
    let indent = 0;

    for (let rawLine of lines) {
        let line = rawLine.trim();

        if (line === "") {
            result.push("");
            continue;
        }

        const lower = line.toLowerCase();
        const sectionKeywords = getSectionKeywords(dialect);

        if (startsWith(lower, ["end"])) {
            indent--;
        }
        if (startsWith(lower, ["else", "elseif"])) {
            indent--;
        }

        indent = Math.max(indent, 0);
        let extraIndent = 0;

        if (startsWith(lower, ["end"]) || startsWith(lower, sectionKeywords)) {
            extraIndent = 0;
        } else {
            extraIndent = isInsideSection(lines, rawLine, sectionKeywords) ? 1 : 0;
        }

        result.push(" ".repeat((indent + extraIndent) * INDENT_SIZE) + normalizeSpacing(line));

        if (startsWith(lower, getOpenKeywords(dialect))) {
            indent++;
        }
        if (lower.endsWith("then")) {
            indent++;
        }
    }

    return result.join("\n");
}

function getOpenKeywords(dialect: VdmDialect): string[] {
    const base = ["if", "let", "cases", "for", "while"];

    if (dialect === "vdmpp") {
        return [...base, "class"];
    }
    if (dialect === "vdmrt") {
        return [...base, "class", "thread", "sync"];
    }

    return base;
}

function getSectionKeywords(dialect: VdmDialect): string[] {
    const base = ["types", "values", "functions", "operations", "state", "traces"];

    if (dialect === "vdmpp") {
        return [...base, "instance variables"];
    }
    if (dialect === "vdmrt") {
        return [...base, "instance variables", "thread", "sync"];
    }

    return base;
}

function startsWith(line: string, keywords: string[]): boolean {
    return keywords.some((k) => line.startsWith(k));
}

function normalizeSpacing(line: string): string {
    return line
        .replace(/\s*:=\s*/g, " := ")
        .replace(/\s*,\s*/g, ", ")
        .replace(/\s+/g, " ");
}

function isInsideSection(lines: string[], currentLine: string, sectionKeywords: string[]): boolean {
    const index = lines.indexOf(currentLine);

    if (index <= 0) {
        return false;
    }

    for (let i = index - 1; i >= 0; i--) {
        const prev = lines[i].trim().toLowerCase();

        if (prev === "") {
            continue;
        }
        if (sectionKeywords.some((k) => prev.startsWith(k))) {
            return true;
        }
        if (prev.startsWith("end")) {
            return false;
        }
    }

    return false;
}

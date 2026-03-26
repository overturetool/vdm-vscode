import * as vscode from "vscode";
import { VdmDialect } from "../util/DialectUtil";

export function formatVDM(text: string, dialect: VdmDialect, options: vscode.FormattingOptions): string {
    const indentStr = options.insertSpaces ? " ".repeat(options.tabSize) : "\t";

    const sectionKeywords = getSectionKeywords(dialect);
    const openKeywords = getOpenKeywords(dialect);

    const crlf = text.includes("\r\n");
    const lines = text.split(/\r?\n/);

    let indent = 0;
    let insideSection = false;
    const result: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();

        if (trimmed === "") {
            result.push("");
            continue;
        }

        const lower = trimmed.toLowerCase();

        if (startsWithAny(lower, sectionKeywords)) {
            insideSection = true;
        }

        if (isEndKeyword(lower)) {
            insideSection = false;
        }

        if (isEndKeyword(lower)) {
            indent--;
        }

        if (startsWithAny(lower, ["else", "elseif"])) {
            indent--;
        }

        indent = Math.max(indent, 0);
        const isSectionKeyword = startsWithAny(lower, sectionKeywords);
        const extraIndent = !isSectionKeyword && !isEndKeyword(lower) && insideSection ? 1 : 0;

        result.push(indentStr.repeat(indent + extraIndent) + normalizeSpacing(trimmed));

        if (startsWithAny(lower, openKeywords)) {
            indent++;
        }
        if (endsWithKeyword(lower, "then")) {
            indent++;
        }
        if (startsWithAny(lower, ["else", "elseif"])) {
            indent++;
        }
    }

    const sep = crlf ? "\r\n" : "\n";
    return result.join(sep);
}

export class VdmFormattingProvider implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        _token: vscode.CancellationToken,
    ): vscode.TextEdit[] {
        const cfg = vscode.workspace.getConfiguration("vdm-vscode.format");
        if (!cfg.get<boolean>("enable", true)) {
            return [];
        }

        const dialect = dialectFromLanguageId(document.languageId);
        if (!dialect) {
            return [];
        }

        const source = document.getText();
        const formatted = formatVDM(source, dialect, options);

        if (formatted === source) {
            return [];
        }

        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(source.length));
        return [vscode.TextEdit.replace(fullRange, formatted)];
    }
}

function getOpenKeywords(dialect: VdmDialect): string[] {
    const base = ["cases", "for", "while"];

    if (dialect === "vdmpp") {
        return [...base, "class"];
    }
    if (dialect === "vdmrt") {
        return [...base, "class", "system"];
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

function startsWithAny(line: string, keywords: string[]): boolean {
    return keywords.some((k) => {
        if (!line.startsWith(k)) {
            return false;
        }
        const after = line[k.length];
        return after === undefined || /\W/.test(after);
    });
}

function endsWithKeyword(line: string, word: string): boolean {
    const code = line.replace(/--.*$/, "").trimEnd();
    if (!code.endsWith(word)) {
        return false;
    }
    const before = code[code.length - word.length - 1];
    return before === undefined || /\s/.test(before);
}

function normalizeSpacing(line: string): string {
    const literals: string[] = [];
    const withoutLiterals = line.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
        literals.push(match);
        return `\x00STR${literals.length - 1}\x00`;
    });

    const commentIdx = withoutLiterals.indexOf("--");
    const code = commentIdx >= 0 ? withoutLiterals.slice(0, commentIdx) : withoutLiterals;
    const comment = commentIdx >= 0 ? withoutLiterals.slice(commentIdx) : "";

    const normalized = code
        .replace(/\s+/g, " ")
        .replace(/\s*:=\s*/g, " := ")
        .replace(/\s*,\s*/g, ", ")
        .replace(/\s+;/g, ";")
        .trimEnd();

    const restored = (normalized + comment).replace(/\x00STR(\d+)\x00/g, (_, idx) => literals[Number(idx)]);
    return restored;
}

function isEndKeyword(line: string): boolean {
    return line === "end" || line.startsWith("end ");
}

function dialectFromLanguageId(languageId: string): VdmDialect | null {
    switch (languageId) {
        case "vdmsl":
            return VdmDialect.VDMSL;
        case "vdmpp":
            return VdmDialect.VDMPP;
        case "vdmrt":
            return VdmDialect.VDMRT;
        default:
            return null;
    }
}

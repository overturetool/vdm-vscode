import { TranslateButton } from "./TranslateButton";
import * as LanguageId from "../../LanguageId";
import { commands, Range, TextDocument, TextEditor, TextEditorDecorationType, Uri, window, workspace, WorkspaceFolder } from "vscode";
import * as Fs from "fs-extra";
import * as Util from "../../Util";
import * as Path from "path";
import { TranslateProviderManager } from "../../TranslateProviderManager";

export class CoverageButtons extends TranslateButton {
    private _displayCoverage: boolean = false;
    // Keep track of decorations applied to the document in focus. Needed to be able to clear the decorations while the document is in focus.
    private _documentUriToDecoratorTypes: UriToDecorations;
    // Keep track of the coverage folder chosen for the workspace, i.e. the latest folder or a user specified one.
    private readonly _workspaceToCoverageFolder: Map<WorkspaceFolder, string> = new Map();
    // This map is a tree-like structure: Workspace folders -> Coverage folders -> Document URIs -> Decorations with ranges.
    // It is needed to keep calculated decorations in memory when switching between documents (possibly across workspaces).
    private readonly _workspaceToCoverageFoldersToDocumentsToDecorationWithRanges: Map<
        WorkspaceFolder,
        Map<string, Map<Uri, Map<TextEditorDecorationType, Range[]>>>
    > = new Map();

    constructor() {
        super(LanguageId.coverage);
        commands.executeCommand("setContext", "vdm-vscode.display.coverage.show", true);

        // When the user switches to a document it needs to be decorated if show coverage is enabled
        workspace.onDidOpenTextDocument(() => {
            // Remove stored decorations from the previous document.
            this._documentUriToDecoratorTypes = undefined;
            if (this._displayCoverage) {
                const textEditor: TextEditor = window.activeTextEditor;
                const coverageFolderForWs = this.getCurrentCoverageFolderForWorkspace(
                    workspace.getWorkspaceFolder(textEditor.document.uri)
                );
                if (coverageFolderForWs) {
                    this.overlayCoverage(textEditor, coverageFolderForWs);
                }
            }
        });

        // Register the display coverage button and its action
        this._commandDisposable = commands.registerCommand(
            "vdm-vscode.display.coverage.show",
            async () => {
                const textEditor = window.activeTextEditor;
                const wsFolder = workspace.getWorkspaceFolder(textEditor.document.uri);
                let coverageFolder: string;
                // If display latest is disabled then prompt user to choose the coverage folder
                if (!workspace.getConfiguration("vdm-vscode.coverage", wsFolder).get("OverlayLatestCoverage")) {
                    const coverageFolders = this.getCoverageFolders(wsFolder);

                    const selectedFolder: string = await window.showQuickPick(
                        coverageFolders.map((folderPath) => Path.basename(folderPath)),
                        {
                            placeHolder: "Choose coverage folder..",
                            canPickMany: false,
                        }
                    );

                    coverageFolder = coverageFolders.find((folderPath) => Path.basename(folderPath) == selectedFolder);
                    // Set the coverage folder for this workspace
                    this._workspaceToCoverageFolder.set(wsFolder, coverageFolder);
                } else {
                    // Else get the latest coverage folder - this also sets the folder for the workspace
                    coverageFolder = this.getCurrentCoverageFolderForWorkspace(wsFolder);
                }

                if (coverageFolder) {
                    this.overlayCoverage(textEditor, coverageFolder);
                }

                this._displayCoverage = true;
                // Hide this button. This also displays the "hide coverage" button.
                commands.executeCommand("setContext", "vdm-vscode.display.coverage.show", false);
            },
            this
        );

        // Register the hide coverage button and its action
        this._commandDisposable = commands.registerCommand(
            "vdm-vscode.display.coverage.hide",
            () => {
                // Remove any coverage decorations that have been applied to the document in focus.
                this._documentUriToDecoratorTypes?.decorations.forEach((deco) => window.activeTextEditor.setDecorations(deco, []));

                this._displayCoverage = false;
                // Show the "display corage" button. This also hides this button.
                commands.executeCommand("setContext", "vdm-vscode.display.coverage.show", true);
            },
            this
        );
    }

    protected async translate(uri: Uri): Promise<void> {
        const wsFolder: WorkspaceFolder = workspace.getWorkspaceFolder(uri);
        if (!wsFolder) throw Error(`Cannot find workspace folder for Uri: ${uri.toString()}`);

        for await (const p of TranslateProviderManager.getProviders(LanguageId.coverage)) {
            if (Util.match(p.selector, wsFolder.uri)) {
                try {
                    // Get save location for coverage files
                    const saveUri = this.createSaveLocation(wsFolder, true);

                    // Perform translation to generate coverage files
                    p.provider
                        .doTranslation(saveUri, wsFolder.uri, { storeAllTranslations: "true", allowSingleFileTranslation: "false" })
                        .then(() => {
                            // If the user wants to use a specific coverage folder then do nothing after "translating".
                            if (!workspace.getConfiguration("vdm-vscode.coverage", wsFolder).get("OverlayLatestCoverage")) return;

                            // The saveUri is the latest coverage folder. Set it for the workspace.
                            this._workspaceToCoverageFolder.set(wsFolder, saveUri.fsPath);

                            // Only display coverage if display coverage is true.
                            if (this._displayCoverage) {
                                this.overlayCoverage(window.activeTextEditor, saveUri.fsPath);
                            }
                        });
                } catch (e) {
                    const message = `${LanguageId.coverage} translate provider failed with message: ${e}`;
                    window.showWarningMessage(message);
                    console.warn(message);
                }
            }
        }
    }

    private getCoverageFolders(wsFolder: WorkspaceFolder): string[] {
        const folderPath = Uri.joinPath(wsFolder.uri, ".generated", LanguageId.coverage).fsPath;
        if (Fs.existsSync(folderPath)) {
            const coverageFolders = Fs.readdirSync(folderPath, { withFileTypes: true })
                ?.filter((dirent) => dirent.isDirectory())
                ?.map((dirent) => Path.resolve(folderPath, dirent.name));
            if (coverageFolders.length > 0) {
                return coverageFolders;
            }
        }

        window.showWarningMessage(`Cannot locate any coverage files.`);
        return [];
    }

    private getCurrentCoverageFolderForWorkspace(wsFolder: WorkspaceFolder): string {
        // First check if there is alrady defined a folder for this workspace, e.g. the latest folder or a user specified folder.
        const savedCoverageFolder: string = this._workspaceToCoverageFolder.get(wsFolder);
        if (savedCoverageFolder) {
            return savedCoverageFolder;
        }

        // If not then search through coverage folders to find the one that was latest created.
        const coverageFolders = this.getCoverageFolders(wsFolder);
        const coverageFolder =
            coverageFolders.length > 0
                ? coverageFolders.reduce((prev: string, cur: string) =>
                      Fs.statSync(prev).birthtime > Fs.statSync(cur).birthtime ? prev : cur
                  )
                : "";
        if (coverageFolder) {
            // Set the coverage folder for this workspace and return it
            this._workspaceToCoverageFolder.set(wsFolder, coverageFolder);
            return coverageFolder;
        }

        // No coverage folders can be located
        window.showInformationMessage(`Cannot find any coverage folder for workspace '${wsFolder.name}'.`);
        return "";
    }

    private async overlayCoverage(textEditor: TextEditor, coverageFolder: string): Promise<void> {
        if (!textEditor) return;

        const coverageDecorations = this.getCoverageDecorationsForDocument(textEditor.document, coverageFolder);

        // Any existing decoration on the document needs to be cleared first.
        this._documentUriToDecoratorTypes?.decorations.forEach((deco) => textEditor.setDecorations(deco, []));

        // Keep a handle to the decorations as the decoration objects are used to remove decorations from the document.
        this._documentUriToDecoratorTypes = { uri: textEditor.document.uri, decorations: Array.from(coverageDecorations.keys()) };

        // Set the new decorations
        coverageDecorations.forEach((ranges, decoType) => textEditor.setDecorations(decoType, ranges));
    }

    private getCoverageDecorationsForDocument(document: TextDocument, coverageFolder: string): Map<TextEditorDecorationType, Range[]> {
        const wsFolder = workspace.getWorkspaceFolder(document.uri);
        let decorationToRange: Map<TextEditorDecorationType, Range[]> = this._workspaceToCoverageFoldersToDocumentsToDecorationWithRanges
            .get(wsFolder)
            ?.get(coverageFolder)
            ?.get(document.uri);

        // Check if the decorations for this document for the chosen coverage folder have already been calculated.
        if (!decorationToRange) {
            // Locate the coverage folder
            const fileName = Fs.readdirSync(coverageFolder, { withFileTypes: true })?.find((dirent) => {
                const dotSplit = dirent.name.split(".");
                const sepSplit = document.fileName.split(Path.sep);
                return dirent.isFile() && sepSplit[sepSplit.length - 1] == `${dotSplit[0]}.${dotSplit[1]}`;
            })?.name;

            // Calculate decorations
            if (fileName) {
                decorationToRange = this.getRangeDecorationFromLineCoverage(
                    this.getCoverageFromCovtblFile(Path.resolve(coverageFolder, fileName))
                );
            } else {
                window.showWarningMessage(`Cannot find coverage file for ${document.fileName}.`);
                return new Map();
            }

            // Keep the calculated decorations in memory. So find the depth at which a key is missing and build the tree from there.
            const existingWorkspace = this._workspaceToCoverageFoldersToDocumentsToDecorationWithRanges.get(wsFolder);

            if (existingWorkspace) {
                const existingCoverageFolder = existingWorkspace.get(coverageFolder);

                if (existingCoverageFolder) {
                    existingCoverageFolder.set(document.uri, decorationToRange);
                } else {
                    existingWorkspace.set(coverageFolder, new Map([[document.uri, decorationToRange]]));
                }
            } else {
                this._workspaceToCoverageFoldersToDocumentsToDecorationWithRanges.set(
                    wsFolder,
                    new Map([[coverageFolder, new Map([[document.uri, decorationToRange]])]])
                );
            }
        }

        return decorationToRange;
    }

    // Lots of the logic is from https://stackoverflow.com/questions/46928277/trying-to-convert-integer-range-to-rgb-color/46929811
    private hitRateToRgba(minHits: number, maxHits: number, hits: number): string {
        // If there is no hits then return a red rgba value
        if (hits == 0) return `rgba(255, 56, 56, 0.2)`;

        // Else compute a "heat map" color with a green hue corresponding to the number of hits
        // Min and max values for opacity (0-1), saturation (0-1), lightness (0-1), hue (0-360) and hue percentage (0-1)
        const minOpa: number = 0.15;
        const maxOpa: number = 0.5;
        const minSat: number = 0.8;
        const maxSat: number = 1;
        const minLight: number = 0.5;
        const maxLight: number = 0.6;
        const minHuePerc: number = 1;
        const maxHuePerc: number = 0;

        // Clamp the hue to be in a narrow green region
        const startHue: number = 120;
        const endHue: number = 110;

        // Calculate opacity, saturation, lightness and hue for the number of hits scaled between max and min hits.
        // Larger amount of hits = more opaque, more saturated, ligther.
        const huePerc =
            (this.scaleNumberWithinRange(minHits, maxHits, minHuePerc, maxHuePerc, hits) * (startHue - endHue) + startHue) / 360;
        const satPerc = this.scaleNumberWithinRange(minHits, maxHits, minSat, maxSat, hits);
        const lightPerc = this.scaleNumberWithinRange(minHits, maxHits, minLight, maxLight, hits);
        const opacityPerc = this.scaleNumberWithinRange(minHits, maxHits, minOpa, maxOpa, hits);
        const rgbVal = this.hslToRgb(huePerc, satPerc, lightPerc);

        return `rgba(${rgbVal[0]},${rgbVal[1]},${rgbVal[2]}, ${opacityPerc})`;
    }

    private scaleNumberWithinRange(mMin: number, mMax: number, rMin: number, rMax: number, m: number): number {
        return ((m - mMin) / (mMax - mMin)) * (rMax - rMin) + rMin;
    }

    private getRangeDecorationFromLineCoverage(coverageRanges: CoverageRange[]): Map<TextEditorDecorationType, Range[]> {
        // Get all hits to later find min and max
        const hits: number[] = coverageRanges.map((coverageRange) => coverageRange.hits);

        const rgbaToRanges: Map<string, Range[]> = new Map();
        // Calculate the rgba value for a given hitrate and add the corresponding character range to the map.
        coverageRanges.forEach((coverageRange) => {
            const rgbaVal = this.hitRateToRgba(Math.min(...hits), Math.max(...hits), coverageRange.hits);
            if (rgbaToRanges.has(rgbaVal)) {
                rgbaToRanges.get(rgbaVal).push(coverageRange.range);
            } else {
                rgbaToRanges.set(rgbaVal, [coverageRange.range]);
            }
        });
        // Return a map from decoration type (from the rgba value) to the ranges for which it applies.
        return new Map<TextEditorDecorationType, Range[]>(
            Array.from(rgbaToRanges).map(
                (entry) =>
                    [
                        window.createTextEditorDecorationType({
                            backgroundColor: entry[0],
                        }),
                        entry[1],
                    ] as [TextEditorDecorationType, Range[]]
            )
        );
    }

    /**
     * Taken from https://stackoverflow.com/questions/2353211/hsl-to-rgb-color-conversion.
     * Assumes h, s, and l are contained in the set [0, 1] and
     * returns r, g, and b in the set [0, 255].
     *
     * @param   {number}  h       The hue
     * @param   {number}  s       The saturation
     * @param   {number}  l       The lightness
     * @return  {Array}           The RGB representation
     */
    private hslToRgb(h: number, s: number, l: number): number[] {
        let r: number, g: number, b: number;

        if (s == 0) {
            r = g = b = l; // achromatic
        } else {
            const hue2rgb = function hue2rgb(p: number, q: number, t: number) {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }

        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    private getCoverageFromCovtblFile(fsPath: string): CoverageRange[] {
        const coverageRanges: CoverageRange[] = [];

        try {
            // Read contents of the file, split by new line and then iterate over each coverage region
            Fs.readFileSync(fsPath, { encoding: "utf8" })
                .split(/\r?\n/)
                .forEach((line) => {
                    if (line.length > 0) {
                        // Lines follow "ln c1-c2+ct"
                        const lnsplit = line.split(" ");
                        const c1split = lnsplit[1].split("-");
                        const c2split = c1split[1].split("=");

                        const ln = Math.abs(parseInt(lnsplit[0]));
                        const c1 = parseInt(c1split[0]);
                        const c2 = parseInt(c2split[0]);
                        const hits = parseInt(c2split[1]);

                        coverageRanges.push({ range: new Range(ln - 1, c1 - 1, ln - 1, c2), hits: hits });
                    }
                });
        } catch (err) {
            console.error(err);
        }

        return coverageRanges;
    }
}

type UriToDecorations = {
    uri: Uri;
    decorations: TextEditorDecorationType[];
};

type CoverageRange = {
    range: Range;
    hits: number;
};

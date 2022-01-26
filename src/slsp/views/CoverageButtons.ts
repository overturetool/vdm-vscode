import { TranslateButton } from "./TranslateButton";
import * as LanguageId from "../../LanguageId";
import { commands, Range, TextEditor, TextEditorDecorationType, Uri, window, workspace, WorkspaceFolder } from "vscode";
import * as Fs from "fs-extra";
import * as Util from "../../Util";
import * as Path from "path";
import { TranslateProviderManager } from "../../TranslateProviderManager";

export class CoverageButtons extends TranslateButton {
    private _displayCoverage: boolean = false;
    private readonly _documentUriToDecoratorTypes: Map<Uri, TextEditorDecorationType[]> = new Map();
    private readonly _workspaceToCoverageFolder: Map<WorkspaceFolder, string> = new Map();
    constructor() {
        super(LanguageId.coverage);
        commands.executeCommand("setContext", "vdm-vscode.display.coverage.show", true);

        workspace.onDidOpenTextDocument(() => {
            if (this._displayCoverage) {
                this.displayCoverage(
                    window.activeTextEditor,
                    this.getCurrentCoverageFolderForWorkspace(workspace.getWorkspaceFolder(window.activeTextEditor.document.uri))
                );
            }
        });

        this._commandDisposable = commands.registerCommand(
            "vdm-vscode.display.coverage.show",
            async () => {
                const textEditor = window.activeTextEditor;
                const wsFolder = workspace.getWorkspaceFolder(textEditor.document.uri);
                let coverageFolder: string;
                // If display latest is disabled then prompt user to choose the coverage folder
                if (!workspace.getConfiguration("vdm-vscode.coverage", wsFolder).get("DisplayLatestCoverage")) {
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
                    // Else get the latest coverage folder
                    coverageFolder = this.getLatestCoverageFolder(wsFolder);
                }

                if (!coverageFolder) {
                    window.showInformationMessage(`Cannot display coverage without coverage files.`);
                } else {
                    this.displayCoverage(textEditor, coverageFolder);
                    this._displayCoverage = true;
                    commands.executeCommand("setContext", "vdm-vscode.display.coverage.show", false);
                }
            },
            this
        );

        this._commandDisposable = commands.registerCommand(
            "vdm-vscode.display.coverage.hide",
            () => {
                this._documentUriToDecoratorTypes
                    .get(window.activeTextEditor.document.uri)
                    ?.forEach((deco) => window.activeTextEditor.setDecorations(deco, []));

                this._displayCoverage = false;
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
                            // Set path from the saveUri for the workspace so that it is easily found
                            this._workspaceToCoverageFolder.set(wsFolder, saveUri.fsPath);
                            // Only display coverage if it is toggled on and the display latest coverage setting is enabled.
                            if (
                                this._displayCoverage &&
                                workspace.getConfiguration("vdm-vscode.coverage", wsFolder).get("DisplayLatestCoverage")
                            ) {
                                this.displayCoverage(window.activeTextEditor, saveUri.fsPath);
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

    private getLatestCoverageFolder(wsFolder: WorkspaceFolder): string {
        // Search through coverage folders to find the one that was created latest.
        const covDirs = this.getCoverageFolders(wsFolder);
        return covDirs.length > 0
            ? covDirs.reduce((prev: string, cur: string) => (Fs.statSync(prev).birthtime > Fs.statSync(cur).birthtime ? prev : cur))
            : "";
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
        // First see if there is any defined folder for this workspace, e.g. the latest folder or a user specified folder.
        const savedCoverageFolder: string = this._workspaceToCoverageFolder.get(wsFolder);
        if (savedCoverageFolder) {
            return savedCoverageFolder;
        }

        // If not then find the latest coverage folder.
        const coverageFolder = this.getLatestCoverageFolder(wsFolder);
        if (coverageFolder) {
            // Set the coverage folder for this workspace
            this._workspaceToCoverageFolder.set(wsFolder, coverageFolder);
            return coverageFolder;
        }

        // No coverage folders can be located
        return "";
    }

    private async displayCoverage(textEditor: TextEditor, coverageFolder: string): Promise<void> {
        if (!coverageFolder || !Fs.existsSync(coverageFolder)) {
            window.showInformationMessage(`Cannot display coverage as coverage file '${coverageFolder}' cannot be found.`);
            return;
        }
        if (!textEditor) return;
        Fs.readdir(coverageFolder, { withFileTypes: true }).then((dirents) => {
            const fileName: string = dirents.find((dirent) => {
                const dotSplit = dirent.name.split(".");
                const sepSplit = textEditor.document.fileName.split(Path.sep);
                return dirent.isFile() && sepSplit[sepSplit.length - 1] == `${dotSplit[0]}.${dotSplit[1]}`;
            })?.name;

            if (fileName) {
                // Compute coverage heatmap
                const heatMapCoverage = this.lineCoverageToRangeDecoration(
                    this.getCoverageFromCovtblFile(Path.resolve(coverageFolder, fileName))
                );
                if (this._documentUriToDecoratorTypes.has(textEditor.document.uri)) {
                    this._documentUriToDecoratorTypes.get(textEditor.document.uri).forEach((deco) => textEditor.setDecorations(deco, []));
                }
                this._documentUriToDecoratorTypes.set(textEditor.document.uri, Array.from(heatMapCoverage.keys()));

                heatMapCoverage.forEach((ranges, decoType) => textEditor.setDecorations(decoType, ranges));
            } else {
                window.showWarningMessage(`Cannot find coverage file for ${textEditor.document.fileName}.`);
            }
        });
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

    private lineCoverageToRangeDecoration(lineCoverages: Map<Number, LineCoverage[]>): Map<TextEditorDecorationType, Range[]> {
        // Get all hits to later find min and max
        const hits: number[] = Array.from(lineCoverages.values())
            .map((coverages) => coverages.map((cov) => cov.hits))
            .reduce((prev, cur) => prev.concat(cur));

        const rgbaToRanges: Map<string, Range[]> = new Map();
        // Calculate the rgba value for a given hitrate and add the corresponding character range to the map.
        Array.from(lineCoverages.values()).forEach((coverages) =>
            coverages.forEach((coverage) => {
                const rgbaVal = this.hitRateToRgba(Math.min(...hits), Math.max(...hits), coverage.hits);
                if (rgbaToRanges.has(rgbaVal)) {
                    rgbaToRanges.get(rgbaVal).push(coverage.range);
                } else {
                    rgbaToRanges.set(rgbaVal, [coverage.range]);
                }
            })
        );
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

    private getCoverageFromCovtblFile(fsPath: string): Map<number, LineCoverage[]> {
        const lineNumberToCoverage: Map<number, LineCoverage[]> = new Map();

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

                        const lineCoverage: LineCoverage = { range: new Range(ln - 1, c1 - 1, ln - 1, c2), hits: hits };

                        // Map line number to coverage
                        if (lineNumberToCoverage.has(ln)) {
                            lineNumberToCoverage.get(ln).push(lineCoverage);
                        } else {
                            lineNumberToCoverage.set(ln, [lineCoverage]);
                        }
                    }
                });
        } catch (err) {
            console.error(err);
        }

        return lineNumberToCoverage;
    }
}

type LineCoverage = {
    range: Range;
    hits: number;
};

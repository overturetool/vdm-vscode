import {
    commands,
    Disposable,
    Range,
    TextDocument,
    TextEditor,
    TextEditorDecorationType,
    Uri,
    window,
    workspace,
    WorkspaceFolder,
} from "vscode";
import * as Fs from "fs-extra";
import * as Path from "path";
import * as LanguageId from "../../LanguageId";
import { GenerateCoverageButton, GeneratedCoverage } from "./GenerateCoverageButton";

export class CoverageOverlay {
    private _visibleEditorsChangedDisposable: Disposable;
    private _disposables: Disposable[] = [];
    private _displayCoverage: boolean = false;
    private _visibleEditors: TextEditor[] = [];
    // Keep track of editors with decorations.
    // Needed to be able to clear the decorations from the document if it is visible.
    private _textEditorToDecoratorTypes: Map<TextEditor, TextEditorDecorationType[]> = new Map();
    // Keep track of the coverage folder chosen for the workspace folder, i.e. the latest folder or a user specified one.
    private _wsFolderToCoverageFolder: Map<WorkspaceFolder, string> = new Map();
    // This map is a tree-like structure: Workspace folders -> Coverage folders -> Document URIs -> Decorations with ranges.
    // It is needed to keep calculated decorations in memory when switching between documents (possibly across workspace folders).
    private readonly _wsFolderToCoverageFoldersToDocumentsToDecorationWithRanges: Map<
        WorkspaceFolder,
        Map<string, Map<Uri, Map<TextEditorDecorationType, Range[]>>>
    > = new Map();

    constructor(eventEmitter: any) {
        eventEmitter.on(GenerateCoverageButton.translationDoneId, (coverage: GeneratedCoverage) =>
            this.handleNewCoverageGenerated(coverage)
        );
        commands.executeCommand("setContext", "vdm-vscode.display.coverage.show", true);

        // Register the show coverage overlay button and its action
        this._disposables.push(
            commands.registerCommand(
                "vdm-vscode.display.coverage.show",
                async () => {
                    this._displayCoverage = true;

                    // When the user switches to a document it needs to be decorated if show coverage is enabled
                    this._visibleEditorsChangedDisposable = window.onDidChangeVisibleTextEditors((visibleEditors: TextEditor[]) => {
                        // Filter for new visible editors
                        const newVisibleEditors: TextEditor[] = visibleEditors.filter(
                            (visibleEditor) => !this._visibleEditors.find((currentVisibleEditors) => currentVisibleEditors == visibleEditor)
                        );

                        // Set visible editors to current visible editors
                        this._visibleEditors = visibleEditors;

                        // Decorate newly visible editors
                        newVisibleEditors.forEach((editor) =>
                            this.getCoverageFolderForWorkspace(workspace.getWorkspaceFolder(editor.document.uri))
                                .then((coverageFolder) => this.overlayCoverage(editor, coverageFolder))
                                .catch((err) => console.log(err))
                        );
                    });

                    // Decorate all visible editors when the user enables coverage overlay
                    // If the user has enabled choosing a coverage folder then await the input befor decorating
                    for (const textEditor of window.visibleTextEditors) {
                        await this.getCoverageFolderForWorkspace(workspace.getWorkspaceFolder(textEditor.document.uri))
                            .then((folder) => this.overlayCoverage(textEditor, folder))
                            .catch((err) => console.log(err));
                        //if (coverageFolder) this.overlayCoverage(textEditor, coverageFolder);
                    }

                    // Hide this button. This also displays the "hide coverage" button.
                    commands.executeCommand("setContext", "vdm-vscode.display.coverage.show", false);
                },
                this
            )
        );

        // Register the hide coverage overlay button and its action
        this._disposables.push(
            commands.registerCommand(
                "vdm-vscode.display.coverage.hide",
                () => {
                    this._displayCoverage = false;

                    // Remove any coverage decorations that have been applied to visible documents.
                    this._textEditorToDecoratorTypes.forEach((decorations, textEditor) =>
                        decorations.forEach((decoration) => textEditor.setDecorations(decoration, []))
                    );

                    // Clear coverage folders for workspace folders
                    this._wsFolderToCoverageFolder = new Map();

                    // Dispose subscription
                    this._visibleEditorsChangedDisposable.dispose();

                    // Show the "display corage" button. This also hides this button.
                    commands.executeCommand("setContext", "vdm-vscode.display.coverage.show", true);
                },
                this
            )
        );

        // Register for configuration changes to handle relevant changes on the fly, i.e. without the user having to disable and enable the coverage overlay.
        workspace.onDidChangeConfiguration(async (event) => {
            // Find the workspace folder(s) affected by the configuration change
            for (const wsFolder of Array.from(this._wsFolderToCoverageFolder.keys())) {
                if (event.affectsConfiguration("vdm-vscode.coverage.OverlayLatestCoverage", wsFolder)) {
                    // Remove workspace folder and associated coverage folder
                    this._wsFolderToCoverageFolder.delete(wsFolder);

                    // Remove any coverage decorations that have been applied to visible documents for the workspace.
                    this._textEditorToDecoratorTypes.forEach((decorations, textEditor) => {
                        if (workspace.getWorkspaceFolder(textEditor.document.uri) == wsFolder)
                            decorations.forEach((decoration) => textEditor.setDecorations(decoration, []));
                    });

                    // Overlay coverage foreach visible text editor for the workspace.
                    // If the user has enabled choosing a coverage folder then await the input befor decorating
                    for (const textEditor of window.visibleTextEditors) {
                        if (workspace.getWorkspaceFolder(textEditor.document.uri) == wsFolder) {
                            const coverageFolder = await this.getCoverageFolderForWorkspace(
                                workspace.getWorkspaceFolder(textEditor.document.uri)
                            );
                            if (coverageFolder) this.overlayCoverage(textEditor, coverageFolder);
                        }
                    }
                }
            }
        });
    }

    private handleNewCoverageGenerated(coverage: GeneratedCoverage) {
        //If the user wants to use a specific coverage folder then do nothing.
        if (!workspace.getConfiguration("vdm-vscode.coverage", coverage.wsFolder).get("OverlayLatestCoverage")) return;

        // The uri is the latest coverage folder. Set it for the workspace folder.
        this._wsFolderToCoverageFolder.set(coverage.wsFolder, coverage.uri.fsPath);

        // Only display coverage if display coverage is true.
        if (this._displayCoverage) {
            window.visibleTextEditors
                .filter((textEditor) => workspace.getWorkspaceFolder(textEditor.document.uri) == coverage.wsFolder)
                .forEach((textEditor) => this.overlayCoverage(textEditor, coverage.uri.fsPath));
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

        return [];
    }

    private async getCoverageFolderForWorkspace(wsFolder: WorkspaceFolder): Promise<string> {
        return new Promise<string>(async (resolve, reject) => {
            // First check if there is alrady defined a coverage folder for this workspace folder, e.g. the latest coverage folder or a user specified folder.
            const savedCoverageFolder: string = this._wsFolderToCoverageFolder.get(wsFolder);
            if (savedCoverageFolder && Fs.existsSync(savedCoverageFolder)) {
                return resolve(savedCoverageFolder);
            }

            let coverageFolder: string;
            const coverageFolders = this.getCoverageFolders(wsFolder);
            if (coverageFolders.length > 0) {
                if (!workspace.getConfiguration("vdm-vscode.coverage", wsFolder).get("OverlayLatestCoverage")) {
                    // If there is no saved folder and the user wants to choose, then prompt the user

                    if (coverageFolders.length > 0) {
                        const selectedFolder: string = await window.showQuickPick(
                            coverageFolders.map((folderPath) => Path.basename(folderPath)),
                            {
                                placeHolder: `Choose coverage source for ${wsFolder.name}`,
                                canPickMany: false,
                            }
                        );

                        coverageFolder = coverageFolders.find((folderPath) => Path.basename(folderPath) == selectedFolder);
                    }
                } else {
                    // If not then search through coverage folders to find the one that was latest created.
                    coverageFolder =
                        coverageFolders.length > 0
                            ? coverageFolders.reduce((prev: string, cur: string) =>
                                  Fs.statSync(prev).birthtime > Fs.statSync(cur).birthtime ? prev : cur
                              )
                            : "";
                }

                if (coverageFolder) {
                    // Set the coverage folder for this workspace folder and return the coverage folder
                    this._wsFolderToCoverageFolder.set(wsFolder, coverageFolder);
                    return resolve(coverageFolder);
                }
            }

            // No coverage folders can be located. Inform the user and suggest to generate the coverage
            const msg = `Cannot find any coverage source for the workspace folder '${wsFolder.name}'.`;
            const btnName = "Generate coverage";
            window.showInformationMessage(msg, ...[btnName]).then((ans) => {
                if (ans == btnName) commands.executeCommand(`vdm-vscode.translate.${LanguageId.coverage}`, wsFolder.uri);
            });
            return reject(msg);
        });
    }

    private overlayCoverage(textEditor: TextEditor, coverageFolder: string) {
        if (!textEditor) return;

        const coverageDecorations = this.getCoverageDecorationsForDocument(textEditor.document, coverageFolder);

        // Any existing decoration on the document needs to be cleared first.
        this._textEditorToDecoratorTypes.get(textEditor)?.forEach((decoration) => textEditor.setDecorations(decoration, []));

        // Keep a handle to the decorations as the decoration objects are used to remove decorations from the document.
        this._textEditorToDecoratorTypes.set(textEditor, Array.from(coverageDecorations.keys()));

        // Set the new decorations
        coverageDecorations.forEach((ranges, decoType) => textEditor.setDecorations(decoType, ranges));
    }

    private getCoverageDecorationsForDocument(document: TextDocument, coverageFolder: string): Map<TextEditorDecorationType, Range[]> {
        const wsFolder = workspace.getWorkspaceFolder(document.uri);

        // If there is no existing decorations then generate them and put them in the "tree"
        const existingWorkspace = this._wsFolderToCoverageFoldersToDocumentsToDecorationWithRanges.get(wsFolder);
        if (existingWorkspace) {
            const existingCoverageFolder = existingWorkspace.get(coverageFolder);

            if (existingCoverageFolder) {
                const existingDecorations = existingCoverageFolder.get(document.uri);

                if (!existingDecorations) {
                    existingCoverageFolder.set(document.uri, this.generateCoverageDecorationsForDocument(document, coverageFolder));
                }
            } else {
                existingWorkspace.set(
                    coverageFolder,
                    new Map([[document.uri, this.generateCoverageDecorationsForDocument(document, coverageFolder)]])
                );
            }
        } else {
            this._wsFolderToCoverageFoldersToDocumentsToDecorationWithRanges.set(
                wsFolder,
                new Map([
                    [coverageFolder, new Map([[document.uri, this.generateCoverageDecorationsForDocument(document, coverageFolder)]])],
                ])
            );
        }

        return this._wsFolderToCoverageFoldersToDocumentsToDecorationWithRanges.get(wsFolder).get(coverageFolder).get(document.uri);
    }

    private generateCoverageDecorationsForDocument(document: TextDocument, coverageFolder: string): Map<TextEditorDecorationType, Range[]> {
        // Locate the coverage folder
        const fileName = Fs.readdirSync(coverageFolder, { withFileTypes: true })?.find((dirent) => {
            const dotSplit = dirent.name.split(".");
            const sepSplit = document.fileName.split(Path.sep);
            return dirent.isFile() && sepSplit[sepSplit.length - 1] == `${dotSplit[0]}.${dotSplit[1]}`;
        })?.name;

        // Calculate decorations
        if (fileName) {
            return this.getDecorationsWithRangesFromLineCoverage(this.getCoverageFromCovtblFile(Path.resolve(coverageFolder, fileName)));
        } else {
            window.showWarningMessage(`Cannot locate coverage file for document '${document.fileName}'.`);
            return new Map();
        }
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

    dispose(): void {
        // Clean up our resources
        this._disposables.forEach((disposable) => disposable.dispose());
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

    private getDecorationsWithRangesFromLineCoverage(coverageRanges: CoverageRange[]): Map<TextEditorDecorationType, Range[]> {
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
}
type CoverageRange = {
    range: Range;
    hits: number;
};

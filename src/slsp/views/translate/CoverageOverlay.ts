/* eslint-disable eqeqeq */
// SPDX-License-Identifier: GPL-3.0-or-later

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
import * as LanguageId from "../../protocol/TranslationLanguageId";
import { GenerateCoverageButton, GeneratedCoverage } from "./GenerateCoverageButton";
import { generatedDataPath } from "../../../util/Util";

export class CoverageOverlay {
    private _visibleEditorsChangedDisposable: Disposable;
    private _disposables: Disposable[] = [];
    private _isDisplayingCoverage: boolean = false;

    // Keep track of visible editors
    private _visibleEditors: TextEditor[] = [];
    // Keep track of the coverage folder chosen for the workspace folder, i.e. the latest folder or a user specified one.
    private _wsFolderToCoverageFolder: Map<WorkspaceFolder, Uri> = new Map();
    // This map is a tree-like structure: Coverage folder -> Document URIs -> Decorations with ranges.
    // It is needed to keep calculated decorations in memory when switching between documents.
    private _coverageFolderToDocumentsToDecorationWithRanges: Map<string, Map<Uri, Map<TextEditorDecorationType, Range[]>>> = new Map();

    constructor(eventEmitter: any, private _languageIdsOfInterest: Set<string>) {
        eventEmitter.on(GenerateCoverageButton.translationDoneId, (coverage: GeneratedCoverage) =>
            this.handleNewCoverageGenerated(coverage)
        );

        // Only display the coverage overlay button if the file type can be handled by the extension.
        window.onDidChangeActiveTextEditor((editor) => {
            const showBtns: boolean = this._languageIdsOfInterest.has(editor?.document?.languageId);
            commands.executeCommand("setContext", "vdm-vscode.coverageOverlay.enable", showBtns ? !this._isDisplayingCoverage : false);
            commands.executeCommand("setContext", "vdm-vscode.coverageOverlay.disable", showBtns ? this._isDisplayingCoverage : false);
        });
        if (window.activeTextEditor) {
            commands.executeCommand(
                "setContext",
                "vdm-vscode.coverageOverlay.enable",
                this._languageIdsOfInterest.has(window.activeTextEditor.document.languageId)
            );
        }

        // Register the show coverage overlay button and its action
        this._disposables.push(
            commands.registerCommand(
                "vdm-vscode.coverageOverlay.enable",
                async () => {
                    this._isDisplayingCoverage = true;
                    // Only look at visible editors with language id of interest
                    window.visibleTextEditors
                        .filter((visibleEditor) => this._languageIdsOfInterest.has(visibleEditor.document.languageId))
                        .forEach((visibleTextEditor) => this._visibleEditors.push(visibleTextEditor));

                    // Decorate all visible editors when the user enables coverage overlay
                    this.overlayCoverageOnTextEditors(this._visibleEditors);

                    // Display the "disable coverage" button.
                    commands.executeCommand("setContext", "vdm-vscode.coverageOverlay.enable", false);
                    commands.executeCommand("setContext", "vdm-vscode.coverageOverlay.disable", true);

                    // When the user switches to a document it needs to be decorated if show coverage is enabled
                    this._visibleEditorsChangedDisposable = window.onDidChangeVisibleTextEditors((visibleEditors: TextEditor[]) => {
                        // Only handle visible text editors with language id of interest
                        const visibleEditorsOfInterest: TextEditor[] = visibleEditors.filter((visibleEditor) =>
                            this._languageIdsOfInterest.has(visibleEditor.document.languageId)
                        );

                        // Find new visible text editors.
                        const newVisibleEditors: TextEditor[] = visibleEditorsOfInterest.filter(
                            (visibleEditor) => !this._visibleEditors.find((currentVisibleEditors) => currentVisibleEditors == visibleEditor)
                        );

                        // Set visible text editors to currently visible text editors
                        this._visibleEditors = visibleEditorsOfInterest;

                        // Decorate new visible text editors
                        this.overlayCoverageOnTextEditors(newVisibleEditors);
                    });
                },
                this
            )
        );

        // Register the disable coverage overlay button and its action
        this._disposables.push(
            commands.registerCommand(
                "vdm-vscode.coverageOverlay.disable",
                () => {
                    this._isDisplayingCoverage = false;

                    // Remove coverage decorations from visible documents foreach workspace.
                    this._wsFolderToCoverageFolder.forEach((covFold, wsFolder) =>
                        this.removeCoverageFromTextEditors(
                            this._visibleEditors.filter((editor) => workspace.getWorkspaceFolder(editor.document.uri) == wsFolder),
                            covFold.fsPath
                        )
                    );

                    // Clear coverage folders for workspace folders
                    this._wsFolderToCoverageFolder = new Map();

                    // Clear visible text editors
                    this._visibleEditors = [];

                    // Dispose subscription as we no longer want to react to changes to visible editors
                    this._visibleEditorsChangedDisposable.dispose();

                    // Show the "enable" button.
                    commands.executeCommand("setContext", "vdm-vscode.coverageOverlay.enable", true);
                    commands.executeCommand("setContext", "vdm-vscode.coverageOverlay.disable", false);
                },
                this
            )
        );

        // Register for configuration changes to handle relevant changes on the fly, i.e. without the user having to disable and enable the coverage overlay.
        workspace.onDidChangeConfiguration(async (event) => {
            // Find the workspace folder(s) affected by the configuration change
            for (const wsFolder of Array.from(this._wsFolderToCoverageFolder.keys()).filter((wsFolder) =>
                event.affectsConfiguration("vdm-vscode.coverage", wsFolder)
            )) {
                // Remove coverage decorations from visible documents for the affected workspace folder
                this.removeCoverageFromTextEditors(
                    this._visibleEditors.filter((editor) => workspace.getWorkspaceFolder(editor.document.uri) == wsFolder),
                    this._wsFolderToCoverageFolder.get(wsFolder).fsPath
                );

                // Remove association betweeen workspace folder and coverage folder
                this._wsFolderToCoverageFolder.delete(wsFolder);

                // Remove all coverage decorations for the workspace
                Array.from(this._coverageFolderToDocumentsToDecorationWithRanges)
                    .filter((coverageFolderToDocuments) => {
                        const relative = Path.relative(wsFolder.uri.fsPath, coverageFolderToDocuments[0]);
                        return relative && !relative.startsWith("..") && !Path.isAbsolute(relative);
                    })
                    .forEach((coverageFolderToDocuments) =>
                        this._coverageFolderToDocumentsToDecorationWithRanges.delete(coverageFolderToDocuments[0])
                    );

                // Overlay coverage decorations for visible documents for the workspace.
                await this.overlayCoverageOnTextEditors(
                    window.visibleTextEditors.filter(
                        (visibleEditor) =>
                            workspace.getWorkspaceFolder(visibleEditor.document.uri) == wsFolder &&
                            this._languageIdsOfInterest.has(visibleEditor.document.languageId)
                    )
                );
            }
        });
    }

    private removeCoverageFromTextEditors(textEditors: ReadonlyArray<TextEditor>, coverageFolder: string) {
        // Remove coverage decorations for visible documents.
        textEditors.forEach((textEditor) =>
            this._coverageFolderToDocumentsToDecorationWithRanges
                .get(coverageFolder)
                .forEach((decorationToRanges) =>
                    Array.from(decorationToRanges.keys()).forEach((decoration) => textEditor.setDecorations(decoration, []))
                )
        );
    }

    private async overlayCoverageOnTextEditors(textEditors: ReadonlyArray<TextEditor>) {
        // Overlay coverage foreach text editor.
        for (const textEditor of textEditors) {
            // If the user has enabled choosing a coverage folder then await the input befor decorating
            const wsFolder = workspace.getWorkspaceFolder(textEditor.document.uri);
            await this.getCoverageFolderForWorkspace(wsFolder)
                .then((coverageFolder) => {
                    // Search for existing calculated coverage decorations for the document.
                    // If there is no existing decorations then generate them.
                    const existingCoverage = this._coverageFolderToDocumentsToDecorationWithRanges.get(coverageFolder.fsPath);
                    if (existingCoverage) {
                        const existingDocumentDecorations = existingCoverage.get(textEditor.document.uri);
                        if (!existingDocumentDecorations) {
                            existingCoverage.set(
                                textEditor.document.uri,
                                this.generateCoverageDecorationsForDocument(textEditor.document, coverageFolder)
                            );
                        }
                    } else {
                        this._coverageFolderToDocumentsToDecorationWithRanges.set(
                            coverageFolder.fsPath,
                            new Map([
                                [textEditor.document.uri, this.generateCoverageDecorationsForDocument(textEditor.document, coverageFolder)],
                            ])
                        );
                    }

                    // Set the decorations
                    this._coverageFolderToDocumentsToDecorationWithRanges
                        .get(coverageFolder.fsPath)
                        .get(textEditor.document.uri)
                        .forEach((ranges, decoType) => textEditor.setDecorations(decoType, ranges));
                })
                .catch((err) => {
                    // No coverage folders can be located. Inform the user and suggest to generate the coverage
                    const btnName = "Generate coverage";
                    window.showInformationMessage(err, ...[btnName]).then((ans) => {
                        if (ans == btnName) {
                            commands.executeCommand(`vdm-vscode.translate.${LanguageId.coverage}`, wsFolder.uri);
                        }
                    });
                    console.log(err);
                });
        }
    }

    private handleNewCoverageGenerated(generatedCoverage: GeneratedCoverage) {
        // If the user wants to use a specific coverage folder then do nothing.
        if (!workspace.getConfiguration("vdm-vscode.coverage", generatedCoverage.wsFolder).get("OverlayLatestCoverage")) {
            return;
        }

        // Only udpate coverage if _displayCoverage is true.
        if (this._isDisplayingCoverage) {
            // Get visible text editors for the workspace with language id of interest
            const textEditors: TextEditor[] = window.visibleTextEditors.filter(
                (visibleEditor) =>
                    workspace.getWorkspaceFolder(visibleEditor.document.uri) == generatedCoverage.wsFolder &&
                    this._languageIdsOfInterest.has(visibleEditor.document.languageId)
            );

            // Remove coverage decorations from text editors
            const selectedCoverageFolder: Uri = this._wsFolderToCoverageFolder.get(generatedCoverage.wsFolder);
            if (selectedCoverageFolder) {
                this.removeCoverageFromTextEditors(textEditors, selectedCoverageFolder.fsPath);
            }

            // The uri is the latest coverage folder. Set it for the workspace folder.
            this._wsFolderToCoverageFolder.set(generatedCoverage.wsFolder, generatedCoverage.uri);

            // Overlay coverage decorations on text editors - this will be calculated from the newly generated coverage
            this.overlayCoverageOnTextEditors(textEditors);
        } else {
            // The uri is the latest coverage folder. Set it for the workspace folder.
            this._wsFolderToCoverageFolder.set(generatedCoverage.wsFolder, generatedCoverage.uri);
        }
    }

    private async getCoverageFolderForWorkspace(wsFolder: WorkspaceFolder): Promise<Uri> {
        return new Promise<Uri>(async (resolve, reject) => {
            // First check if there is alrady defined a coverage folder for this workspace folder, e.g. the latest coverage folder or a user specified folder.
            const savedCoverageFolder: Uri = this._wsFolderToCoverageFolder.get(wsFolder);
            if (savedCoverageFolder && Fs.existsSync(savedCoverageFolder.fsPath)) {
                return resolve(savedCoverageFolder);
            }

            // Get coverage folders
            const folderPath = Uri.joinPath(generatedDataPath(wsFolder), LanguageId.coverage).fsPath;
            const coverageFolders: Uri[] = Fs.existsSync(folderPath)
                ? Fs.readdirSync(folderPath, { withFileTypes: true })
                      ?.filter((dirent) => dirent.isDirectory())
                      ?.map((dirent) => Uri.parse(Path.resolve(folderPath, dirent.name))) ?? []
                : [];

            // Either choose the latest coverage folder or let the user decide.
            let coverageFolder: Uri;
            if (coverageFolders.length > 0) {
                if (!workspace.getConfiguration("vdm-vscode.coverage", wsFolder).get("OverlayLatestCoverage")) {
                    // If there is no saved folder and the user wants to choose, then prompt the user

                    if (coverageFolders.length > 0) {
                        const selectedFolder: string = await window.showQuickPick(
                            coverageFolders.map((folderUri) => Path.basename(folderUri.fsPath)),
                            {
                                placeHolder: `Choose coverage source for ${wsFolder.name}`,
                                canPickMany: false,
                            }
                        );

                        coverageFolder = coverageFolders.find((folderUri) => Path.basename(folderUri.fsPath) == selectedFolder);
                    }
                } else {
                    // Search through coverage folders to find the one that was latest created.
                    coverageFolder = coverageFolders.reduce((prev: Uri, cur: Uri) =>
                        Fs.statSync(prev.fsPath).birthtime > Fs.statSync(cur.fsPath).birthtime ? prev : cur
                    );
                }

                if (coverageFolder) {
                    // Set the coverage folder for this workspace folder and return the coverage folder
                    this._wsFolderToCoverageFolder.set(wsFolder, coverageFolder);
                    return resolve(coverageFolder);
                }
            }

            // No coverage folders can be located.
            const msg = `Cannot find any coverage source for the workspace folder '${wsFolder.name}'.`;
            return reject(msg);
        });
    }

    private generateCoverageDecorationsForDocument(document: TextDocument, coverageFolder: Uri): Map<TextEditorDecorationType, Range[]> {
        // Locate the coverage file for the document
        const fileName = Fs.readdirSync(coverageFolder.fsPath, { withFileTypes: true })?.find((dirent) => {
            const dotSplit = dirent.name.split(".");
            const sepSplit = document.fileName.split(Path.sep);
            return dirent.isFile() && sepSplit[sepSplit.length - 1] == `${dotSplit[0]}.${dotSplit[1]}`;
        })?.name;

        // Calculate decorations
        let errMsg: string = `Cannot locate coverage file for document '${document.fileName}'.`;
        if (fileName) {
            const coverageRanges = this.getCoverageFromCovtblFile(Uri.joinPath(coverageFolder, fileName).fsPath);
            if (coverageRanges.length < 1) {
                errMsg = `Cannot find any coverage ranges in coverage file '${fileName}' for document '${document.fileName}'.`;
            } else {
                return this.getDecorationsWithRangesFromLineCoverage(
                    coverageRanges,
                    workspace.getConfiguration("vdm-vscode.coverage", workspace.getWorkspaceFolder(document.uri)).get("UseHeatmapColouring")
                );
            }
        }

        window.showWarningMessage(errMsg);
        console.log(errMsg);
        return new Map();
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

    // Lots of the logic is from https://stackoverflow.com/questions/46928277/trying-to-convert-integer-range-to-rgb-color/46929811
    private hitRateToHeatMapRgba(minHits: number, maxHits: number, hits: number): string {
        // Compute a "heat map" color with a green hue corresponding to the number of hits
        // Min and max values for opacity (0-1), saturation (0-1), lightness (0-1), hue (0-360) and hue percentage (0-1)
        const minOpa: number = 0.15; //0.15
        const maxOpa: number = 0.45; //0.35
        const minSat: number = 0.7;
        const maxSat: number = 1;
        const minLight: number = 0.45;
        const maxLight: number = 0.55;
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

    private getDecorationsWithRangesFromLineCoverage(
        coverageRanges: CoverageRange[],
        heatMapColouring: boolean
    ): Map<TextEditorDecorationType, Range[]> {
        if (coverageRanges.length < 1) {
            return new Map();
        }
        // Get all non zero hits to later find min and max
        const hits: number[] = coverageRanges
            .map((coverageRange) => coverageRange.hits)
            .filter((elem, index, self) => index === self.indexOf(elem));

        const rgbaToRanges: Map<string, Range[]> = new Map();
        // Calculate the rgba value for a given hitrate and add the corresponding character range to the map.
        coverageRanges.forEach((coverageRange) => {
            // If hits == 0 then red, if heatMapColouring then the number of hits corresponds to slightly different greens.
            // Else if not heatMapColouring or there's only two values then just use the same green.
            const rgbaVal =
                coverageRange.hits == 0
                    ? "rgba(255, 56, 56, 0.3)"
                    : heatMapColouring && hits.length > 2
                    ? this.hitRateToHeatMapRgba(0, Math.max(...hits), coverageRange.hits)
                    : "rgba(49, 217, 43, 0.35)";
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
                if (t < 0) {
                    t += 1;
                }
                if (t > 1) {
                    t -= 1;
                }
                if (t < 1 / 6) {
                    return p + (q - p) * 6 * t;
                }
                if (t < 1 / 2) {
                    return q;
                }
                if (t < 2 / 3) {
                    return p + (q - p) * (2 / 3 - t) * 6;
                }
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

    dispose(): void {
        // Clean up our resources
        this._disposables.forEach((disposable) => disposable.dispose());
    }
}
type CoverageRange = {
    range: Range;
    hits: number;
};

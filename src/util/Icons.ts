// SPDX-License-Identifier: GPL-3.0-or-later

import { extensions, ThemeIcon, Uri } from "vscode";
import { extensionId } from "../ExtensionInfo";
import { VerdictKind } from "../slsp/protocol/CombinatorialTesting";

export namespace Icons {
    export type IconPath = string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon;

    export function getIcon(icon: string): IconPath {
        let extensionUri = extensions.getExtension(extensionId).extensionUri;
        return {
            light: Uri.joinPath(extensionUri, "resources", "icons", icon),
            dark: Uri.joinPath(extensionUri, "resources", "icons", icon),
        };
    }

    export function verdictToIconPath(verdict: VerdictKind): Icons.IconPath {
        return verdict == VerdictKind.Passed
            ? getIcon("passed.svg")
            : verdict == VerdictKind.Failed
            ? getIcon("failed.svg")
            : verdict == VerdictKind.Inconclusive
            ? getIcon("inconclusive.svg")
            : verdict == VerdictKind.Filtered
            ? getIcon("filtered.svg")
            : null;
    }
}

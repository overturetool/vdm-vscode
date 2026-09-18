// SPDX-License-Identifier: GPL-3.0-or-later

export type MessageSeverity = "info" | "warning" | "error";

export interface ShowMessageParams {
    message: string;
    severity: MessageSeverity;
}

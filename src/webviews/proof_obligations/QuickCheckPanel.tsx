import { VSCodeButton, VSCodeDataGrid, VSCodeDataGridCell, VSCodeDataGridRow } from "@vscode/webview-ui-toolkit/react";
import { TableHeader } from "./ProofObligationsTableHeader";
import { FormattedProofObligation } from "./ProofObligationsView";
import { VSCodeAPI } from "../shared.types";
import { MouseEvent } from "react";
import { CounterExampleVariables } from "../../slsp/protocol/ProofObligationGeneration";

interface QuickCheckExampleTableProps {
    variables: Array<[string, string]>;
}

const QuickCheckExampleTable = ({ variables }: QuickCheckExampleTableProps) => {
    if (variables.length === 0) {
        return null;
    }

    return (
        <>
            <VSCodeDataGrid gridTemplateColumns="1fr 1fr" css={{ flexGrow: "1", marginTop: "1em" }}>
                <TableHeader headers={["variable", "value"]} onUpdateSortingState={() => undefined} />
                {variables.map((row) => (
                    <VSCodeDataGridRow key={row[0]}>
                        <VSCodeDataGridCell grid-column="1">{row[0]}</VSCodeDataGridCell>
                        <VSCodeDataGridCell css={{ overflowWrap: "break-word" }} grid-column="2">
                            {row[1]}
                        </VSCodeDataGridCell>
                    </VSCodeDataGridRow>
                ))}
            </VSCodeDataGrid>
        </>
    );
};

export interface QuickCheckPanelProps {
    proofObligation: FormattedProofObligation;
    vscodeApi: VSCodeAPI;
    onClose: (e: MouseEvent) => void;
}

export const QuickCheckPanel = ({ proofObligation, vscodeApi, onClose }: QuickCheckPanelProps) => {
    let provedByMessage = proofObligation.provedBy ? `Proved by: ${proofObligation.provedBy}` : "";

    if (proofObligation.message) {
        provedByMessage = `${provedByMessage} - ${proofObligation.message}`;
    }

    const counterExampleVariables = Object.entries(proofObligation?.counterexample?.variables ?? {}) as Array<[string, string]>;
    const witnessVariables = Object.entries(proofObligation?.witness?.variables ?? {}) as Array<[string, string]>;
    // There will never be both a counterexample and a witness, so the following array is either equal to counterExampleVariables or witnessVariables or []
    const allVariables = [...counterExampleVariables, ...witnessVariables];

    let launchCommand: string | null = null;

    if (proofObligation.counterexample) {
        launchCommand = proofObligation.counterexample.launch.command;
    } else if (proofObligation.witness) {
        launchCommand = proofObligation.witness.launch.command;
    }

    return (
        <div
            css={{
                width: "100%",
                whiteSpace: "pre-wrap",
                backgroundColor: "var(--vscode-textBlockQuote-background)",
                overflow: "scroll",
                padding: "2em",
                boxSizing: "border-box",
                minHeight: "200px",
                maxHeight: "50%",
                "&::-webkit-scrollbar-track": {
                    backgroundColor: "var(--vscode-editor-background)",
                },
            }}
        >
            <div css={{ display: "flex", flexDirection: "row", justifyContent: "flex-start" }}>
                <VSCodeButton
                    css={{ justifySelf: "flex-start", position: "relative", top: "0px" }}
                    appearance="icon"
                    onClick={(e) => {
                        if (onClose) {
                            onClose(e);
                        }
                    }}
                >
                    <span className="codicon codicon-close"></span>
                </VSCodeButton>
                {launchCommand != null ? (
                    <VSCodeButton
                        css={{
                            marginLeft: "auto",
                        }}
                        onClick={() =>
                            vscodeApi.postMessage({
                                command: "debugQCRun",
                                data: launchCommand,
                            })
                        }
                    >
                        Debug example
                        <span slot="start" className="codicon codicon-debug-start"></span>
                    </VSCodeButton>
                ) : null}
            </div>
            <div css={{
                fontSize: "1.2em",
                marginBlock: "0.75em"
            }}>
            Proof obligation #{proofObligation.id}
            </div>

            {provedByMessage}
            <QuickCheckExampleTable variables={allVariables} />
        </div>
    );
};

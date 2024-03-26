import React, { MouseEvent, useState } from "react";
import { FormattedProofObligation, SelectionState } from "./ProofObligationsView";
import { VSCodeButton, VSCodeDataGrid, VSCodeDataGridCell, VSCodeDataGridRow } from "@vscode/webview-ui-toolkit/react";
import { TableHeader, SortingState } from "./ProofObligationsTableHeader";

/**
 *
 * @param proofObligations Proof obligations to sort.
 * @param sortingState Direction and header id to sort by.
 * @returns Proof obligations sorted according to {@link sortingState}.
 */
const sortPOs = (proofObligations: Array<FormattedProofObligation>, sortingState: SortingState<FormattedProofObligation>) => {
    const directionFactor = sortingState.direction === "ascending" ? 1 : -1;
    const sortKey = sortingState.id;

    const _sortedPOs = proofObligations.sort((a, b) => {
        const aVal = a[sortKey] ?? "";
        const bVal = b[sortKey] ?? ""

        if (aVal < bVal) {
            return -1 * directionFactor;
        } else if (aVal > bVal) {
            return directionFactor;
        }

        return 0;
    });

    return _sortedPOs;
};

const hasQuickCheckInfo = (po: FormattedProofObligation): boolean => {
    return po.message !== undefined || po.counterexample !== undefined || po.witness !== undefined || po.provedBy !== undefined;
};

interface QuickCheckButtonProps {
    po: FormattedProofObligation;
    onClick: (e: MouseEvent) => void;
}

const QuickCheckButton = ({ po, onClick }: QuickCheckButtonProps) => {
    if (!hasQuickCheckInfo(po)) {
        return po.status;
    }

    return (
        <button title="Open QuickCheck Panel" onClick={onClick}
            css={{
                background: "none",
                border: "none",
                padding: "0",
                color: "var(--vscode-textLink-foreground)",
                textDecoration: "underline",
                cursor: "pointer",
            }}
        >
            {po.status}
        </button>
    );
};

export interface ProofObligationsTableProps {
    headers: Array<keyof FormattedProofObligation>;
    pos: Array<FormattedProofObligation>;
    onJumpToSource: (po: FormattedProofObligation) => void;
    openPos: Set<FormattedProofObligation["id"]>;
    onClickRow: (po: FormattedProofObligation) => void;
    onOpenQuickCheck: (po: FormattedProofObligation) => void;
    selectionState: SelectionState | null;
}

export const ProofObligationsTable = ({ headers, pos, onJumpToSource, openPos, onClickRow, onOpenQuickCheck, selectionState }: ProofObligationsTableProps) => {
    const [sortingState, setSortingState] = useState<SortingState<FormattedProofObligation>>({
        id: "id",
        direction: "ascending",
    });

    const sortedPOs = sortPOs(pos, sortingState);
    console.log(selectionState);

    return (
        <VSCodeDataGrid gridTemplateColumns="2fr 3fr 8fr 3fr" css={{ flexGrow: "1" }}>
            <TableHeader<FormattedProofObligation> headers={headers} onUpdateSortingState={setSortingState} />
            {sortedPOs.map((row) => (
                <React.Fragment key={`pog-row-${row.id}`}>
                    <VSCodeDataGridRow
                        onClick={() => onClickRow(row)}
                        css={[{ borderTop: "2px solid var(--vscode-textBlockQuote-background)" }, row.id === selectionState?.id && {border: "1px solid var(--vscode-list-focusOutline)"}]}
                    >
                        <VSCodeDataGridCell grid-column="1">
                            <VSCodeButton title="Jump to source"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onJumpToSource(row);
                                }}
                                appearance="icon"
                                css={{ position: "relative", top: "-4px", left: "-8px" }}
                            >
                                <span className="codicon codicon-go-to-file"></span>
                            </VSCodeButton>
                            &nbsp;{row.id}
                        </VSCodeDataGridCell>
                        <VSCodeDataGridCell css={{ overflowWrap: "break-word" }} grid-column="2">
                            {row.kind}
                        </VSCodeDataGridCell>
                        <VSCodeDataGridCell css={{ overflowWrap: "break-word" }} grid-column="3">
                            {row.breakableName}
                        </VSCodeDataGridCell>
                        <VSCodeDataGridCell css={{ overflowWrap: "break-word" }} grid-column="4">
                            <QuickCheckButton onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onOpenQuickCheck(row);
                            }} po={row} />
                        </VSCodeDataGridCell>
                    </VSCodeDataGridRow>
                    {openPos.has(row.id) ? (
                        <div
                            css={{
                                width: "100%",
                                padding: "1em 0.5em",
                                boxSizing: "border-box",
                                whiteSpace: "pre-wrap",
                            }}
                        >
                            {row.source}
                        </div>
                    ) : null}
                </React.Fragment>
            ))}
        </VSCodeDataGrid>
    );
};

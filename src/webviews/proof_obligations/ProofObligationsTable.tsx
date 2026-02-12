import React, { MouseEvent, useEffect, useState } from "react";
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
        const bVal = b[sortKey] ?? "";

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

const buildToolTip = (po: FormattedProofObligation): string => {
    let output = `PO #${po.id}\n\n`;

    if (po.status) {
        output += `Status: ${po.status.toUpperCase()}`;
    }

    if (po.provedBy) {
        output += ` by ${po.provedBy}`;

    }

    output += "\n";

    if (po.message) {
        output += `\nMessage: ${po.message}`;
    }

    return output.trim();
};

export interface ProofObligationsTableMessageProps {
    msg: string;
}

const ProofObligationsTableMessage = ({ msg }: ProofObligationsTableMessageProps) => {
    const [isVisible, setIsVisible] = useState(false);

    // Delay the rendeirng of the component, otherwise the component quickly flashes on the screen before being replaced by the table.
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsVisible(true);
        }, 500);
        return () => clearTimeout(timer);
    }, []);

    return isVisible ? (
        <div css={{ width: "100%", justifyContent: "center", alignItems: "center", display: "flex", flexDirection: "column", flexGrow: 1 }}>
            <span css={{ fontSize: "1.25em", color: "var(--vscode-errorForeground)" }}>{msg}</span>
        </div>
    ) : null;
};

export interface ProofObligationsTableProps {
    headers: Array<keyof FormattedProofObligation>;
    pos: Array<FormattedProofObligation>;
    onJumpToSource: (po: FormattedProofObligation) => void;
    openPos: Set<FormattedProofObligation["id"]>;
    onClickRow: (po: FormattedProofObligation) => void;
    selectionState: SelectionState | null;
    posInvalid: boolean;
}

interface StatusWithTooltipProps {
    po: FormattedProofObligation;
}

const StatusWithToolTip = ({ po }: { po: FormattedProofObligation }) => {
    const [visible, setVisible] = useState(false);
    const showToolTip = hasQuickCheckInfo(po);

    return (
        <div
            css={{ position: "relative", display: "inline-block" }}
            onMouseEnter={() => showToolTip && setVisible(true)}
            onMouseLeave={() => setVisible(false)}
        >
            <span
                css={{
                    color: showToolTip
                        ? "var(--vscode-textLink-foreground)"
                        : "inherit",
                    textDecoration: showToolTip ? "underline" : "none",
                    cursor: showToolTip ? "zoom-in" : "default",
                }}
            >
                {po.status}
            </span>

            {visible && (
                <div
                    css={{
                        position: "absolute",
                        top: "50%",
                        right: "100%",
                        marginRight: "8px",
                        transform: "translateY(-50%)",
                        background: "var(--vscode-editorHoverWidget-background)",
                        color: "var(--vscode-editorHoverWidget-foreground)",
                        border: "1px solid var(--vscode-editorHoverWidget-border)",
                        borderRadius: "6px",
                        padding: "0.75em",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                        whiteSpace: "pre-wrap",
                        zIndex: 1000,
                        minWidth: "280px",
                        maxWidth: "400px",
                        fontSize: "1.15em",
                        lineHeight: "1.4",
                    }}
                >
                    {buildToolTip(po)}
                </div>
            )}
        </div>
    );
};

const formatSource = (source: string | string[]): string => {
    return Array.isArray(source) ? source.join("\n") : source;
}

export const ProofObligationsTable = ({
    headers,
    pos,
    onJumpToSource,
    openPos,
    onClickRow,
    selectionState,
    posInvalid
}: ProofObligationsTableProps) => {
    const [sortingState, setSortingState] = useState<SortingState<FormattedProofObligation>>({
        id: "id",
        direction: "ascending",
    });
    const [copiedId, setCopiedId] = useState<number | null>(null);

    const sortedPOs = sortPOs(pos, sortingState);
    const shouldRenderTable = !((pos.length === 0) && posInvalid)

    return (
        <>
            {shouldRenderTable ? (
                <VSCodeDataGrid gridTemplateColumns="2fr 3fr 8fr 3fr" css={{ flexGrow: "1" }}>
                    <TableHeader<FormattedProofObligation> headers={headers} onUpdateSortingState={setSortingState} />
                    {sortedPOs.map((row) => (
                        <React.Fragment key={`pog-row-${row.id}`}>
                            <VSCodeDataGridRow
                                onClick={() => onClickRow(row)}
                                css={[
                                    { borderTop: "2px solid var(--vscode-textBlockQuote-background)" },
                                    row.id === selectionState?.id && { border: "1px solid var(--vscode-list-focusOutline)" },
                                ]}
                            >
                                <VSCodeDataGridCell grid-column="1">
                                    <VSCodeButton
                                        title="Jump to source"
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
                                <VSCodeDataGridCell css={{ position: "relative", overflow: "visible" }} grid-column="4">
                                    <StatusWithToolTip po={row} />
                                </VSCodeDataGridCell>
                            </VSCodeDataGridRow>
                            {openPos.has(row.id) ? (
                                <div css={{ position: "relative" }}>
                                    <VSCodeButton
                                        appearance="icon"
                                        title="Copy"
                                        css={{ position: "absolute", right: "4px", top: "16px", transition: "transform 0.15s ease", }}
                                        onClick={async () => {
                                            await navigator.clipboard.writeText(formatSource(row.source));
                                            setCopiedId(row.id);
                                            setTimeout(() => setCopiedId(null), 1000);
                                        }}
                                    >
                                        <span
                                            className={`codicon ${
                                                copiedId === row.id ? "codicon-check" : "codicon-copy"
                                            }`}
                                        />
                                    </VSCodeButton>
                                    <pre
                                        css={{
                                            width: "100%",
                                            padding: "1em 0.5em",
                                            boxSizing: "border-box",
                                            whiteSpace: "pre-wrap",
                                            background: "var(--vscode-textBlockQuote-background)",
                                            borderRadius: "4px",
                                            overflowX: "auto",
                                        }}
                                    >
                                        {row.source}
                                    </pre>
                                </div>
                            ) : null}
                        </React.Fragment>
                    ))}
                </VSCodeDataGrid>
            ) : (
                <ProofObligationsTableMessage msg="No Proof Obligations have been generated. Ensure that the specification does not contain any errors."></ProofObligationsTableMessage>
            )}
        </>
    );
};

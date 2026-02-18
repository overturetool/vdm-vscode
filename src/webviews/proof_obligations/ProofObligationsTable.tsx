import React, { useEffect, useRef, useState } from "react";
import { FormattedProofObligation, SelectionState } from "./ProofObligationsView";
import { VSCodeButton, VSCodeDataGrid, VSCodeDataGridCell, VSCodeDataGridRow } from "@vscode/webview-ui-toolkit/react";
import { TableHeader, SortingState } from "./ProofObligationsTableHeader";
import { createPortal } from "react-dom";

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

const prettyFieldName = (name: string): string =>
    name
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (c) => c.toUpperCase());

const buildToolTip = (po: FormattedProofObligation): string => {
    const fields = po.hovers;

    let output = `PO #${po.id}\n\n`;

    fields?.forEach((fieldName) => {
        const value = (po as any)[fieldName];
        if(value !== undefined) {
            output += `${prettyFieldName(fieldName)}: ${value}\n`
        }
    });

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
    onNavigateToLocation: (po: FormattedProofObligation) => void;
    openPos: Set<FormattedProofObligation["id"]>;
    onClickRow: (po: FormattedProofObligation) => void;
    selectionState: SelectionState | null;
    posInvalid: boolean;
}

const StatusWithToolTip = ({
    po,
    onNavigateToLocation
}: {
    po: FormattedProofObligation;
    onNavigateToLocation: () => void;
}) => {
    const [visible, setVisible] = useState(false);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

    const hasLaunch =
        po.counterexample?.launch !== undefined ||
        po.witness?.launch !== undefined;

    const triggerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);//

    const showToolTip = Array.isArray(po.hovers) && po.hovers.length > 0;

    const handleMouseEnter = () => {
        if (!showToolTip || !triggerRef.current) return;

        const rect = triggerRef.current!.getBoundingClientRect();

        const tooltipWidth = 400;

        let top = rect.top;
        let left = rect.left - tooltipWidth - 12;

        setPosition({ top, left });
        setVisible(true);
    };

    const handleMouseLeave = () => {
        setVisible(false);
    };

    useEffect(() => {
        if (!visible || !tooltipRef.current || !position) return;

        const tooltipRect = tooltipRef.current.getBoundingClientRect();

        let newTop = position.top;

        if (tooltipRect.bottom > window.innerHeight - 8)
            newTop -= tooltipRect.bottom - window.innerHeight + 8;

        if (newTop !== position.top)
            setPosition((prev) => prev && { ...prev, top: newTop });
    }, [visible]);

    return (
        <>
            <div
                ref={triggerRef}
                css={{ display: "inline-block" }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                <span
                    onClick={(e) => {
                        if (!hasLaunch) return;
                        e.stopPropagation();
                        onNavigateToLocation();
                    }}
                    css={{
                        color: showToolTip
                            ? "var(--vscode-textLink-foreground)"
                            : "inherit",
                        textDecoration: showToolTip ? "underline" : "none",
                        cursor: hasLaunch ? "pointer" : showToolTip ? "zoom-in" : "default",
                    }}
                >
                    {po.status}
                </span>
            </div>

            {visible && position &&
                createPortal(
                    <div
                        ref={tooltipRef}
                        style={{
                            position: "fixed",
                            top: position.top,
                            left: position.left,
                            background: "var(--vscode-editorHoverWidget-background)",
                            color: "var(--vscode-editorHoverWidget-foreground)",
                            border: "1px solid var(--vscode-editorHoverWidget-border)",
                            borderRadius: "6px",
                            padding: "0.75em",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                            whiteSpace: "pre-wrap",
                            zIndex: 99999,
                            width: "400px",
                            maxHeight: "60vh",
                            overflowY: "auto",
                            fontSize: "1.15em",
                            lineHeight: "1.4",
                            wordBreak: "break-word",
                            pointerEvents: "none",
                        }}
                    >
                        {buildToolTip(po)}
                    </div>,
                    document.body
                )}
        </>
    );
};

const formatSource = (source: string | string[]): string => {
    return Array.isArray(source) ? source.join("\n") : source;
}

export const ProofObligationsTable = ({
    headers,
    pos,
    onJumpToSource,
    onNavigateToLocation,
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
                                    <StatusWithToolTip
                                        po={row}
                                        onNavigateToLocation={() => {
                                            onClickRow(row);
                                            onNavigateToLocation(row);
                                        }}
                                    />
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

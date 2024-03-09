import React, { useState } from "react";
import { VSCodeDataGridCell, VSCodeDataGridRow } from "@vscode/webview-ui-toolkit/react";
import { FormattedProofObligation } from "./ProofObligationsView";

type SortingDirection = "ascending" | "descending";

export interface SortingState<T> {
    id: keyof T;
    direction: SortingDirection;
}

interface HeaderSortingArrowProps {
    direction: SortingDirection;
    hide: boolean;
}

const HeaderSortingArrow = ({ direction, hide }: HeaderSortingArrowProps) => {
    const arrowClass = direction === "ascending" ? "codicon codicon-arrow-small-up" : "codicon codicon-arrow-small-down";
    const visibility = hide ? "hidden" : "visible";

    return <span className={arrowClass} css={{ position: "relative", top: "4px", visibility }}></span>;
};

interface TableHeaderProps<T> {
    headers: (keyof T)[];
    onUpdateSortingState: (newState: SortingState<T>) => void;
    defaultSortingState?: SortingState<T>;
}

export const TableHeader = <T extends unknown>({
    headers,
    onUpdateSortingState,
    defaultSortingState = {
        id: headers[0],
        direction: "ascending",
    },
}: TableHeaderProps<T>) => {
    const [sortingState, setSortingState] = useState<SortingState<T>>(defaultSortingState);

    const handleGridClick = (headerId: keyof T) => {
        let newSortingState: SortingState<T>;

        if (sortingState.id === headerId) {
            // Toggle sorting direction if clicking on the currently sorted header
            // Resets to default sorting state if the direction loops around to "ascending".
            const newDirection = sortingState.direction === "ascending" ? "descending" : "ascending";
            const newHeaderId = newDirection === "ascending" ? headers[0] : headerId;
            newSortingState = {
                id: newHeaderId,
                direction: newDirection,
            };
        } else {
            // By default, when sorting on a new header, the direction is ascending.
            newSortingState = {
                id: headerId,
                direction: "ascending",
            };
        }

        setSortingState(newSortingState);
        onUpdateSortingState(newSortingState);
    };

    return (
        <VSCodeDataGridRow row-type="sticky-header" css={{ zIndex: 1 }}>
            {headers.map((header, idx) => (
                <VSCodeDataGridCell
                    key={`pog-header-${header.toString()}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleGridClick(header);
                    }}
                    cell-type="columnheader"
                    grid-column={`${idx + 1}`}
                >
                    <div>
                        {header.toString()} <HeaderSortingArrow direction={sortingState.direction} hide={sortingState.id !== header} />
                    </div>
                </VSCodeDataGridCell>
            ))}
        </VSCodeDataGridRow>
    );
};

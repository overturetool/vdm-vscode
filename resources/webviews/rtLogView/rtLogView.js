// SPDX-License-Identifier: GPL-3.0-or-later

/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable eqeqeq */
const vscode = acquireVsCodeApi();

// Create view container
const viewContainer = document.createElement("div");
viewContainer.id = "viewContainer";
viewContainer.style.height = "100%";
viewContainer.style.width = "100%";
document.body.appendChild(viewContainer);

// Global const variables
const archViewId = "arch";
const execViewId = "exec";
const initMsg = "init";
const editorSettingsChangedMsg = "editorSettingsChanged";
const logData = { busDeclEvents: [], cpusWithEvents: [] };
const btnColors = {};
const views = [];
const buttons = Array.from(document.getElementsByClassName("button"));
const timeSelector = document.getElementById("timeStamp");

// Global variables
let backgroundColor;
let fontSize;
let declFont;
let diagramFont;
let gridLineWidth;
let eventLineWidth;
let conjectureMarkerWidth;
let eventWrapperHeight;
let themeColors = [];
let fontColor;
let conjectureColor;
let canvasDrawer;
let currentViewId = archViewId;
let selectedTime = 0;

// Handle button press
buttons.forEach((btn) => {
    views.push({ id: btn.id, components: [] });
    btn.onclick = function () {
        // Update the pressed button to "pressed" color and the previous pressed button to "standard" color
        setButtonColors([document.getElementById(currentViewId)], btn);
        // Clear the view container
        viewContainer.innerHTML = "";
        // Check if components for the view has already been generated - the btn id is the view id
        const selectedView = views.find((vc) => vc.id == btn.id);
        if (selectedView.components.length == 0) {
            selectedView.components = buildViewComponents(btn.id, selectedTime);
        }
        // Display the view by appending its components to the view container
        selectedView.components.forEach((item) => viewContainer.appendChild(item));
        currentViewId = btn.id;
    };
});

// Handle time change
timeSelector.onchange = (event) => {
    selectedTime = event.target.value;
    resetViews(currentViewId, selectedTime);
};

// Handle event from extension backend
window.addEventListener("message", (event) => {
    if (event.data.cmd == initMsg) {
        selectedTime = Math.min(...event.data.timeStamps);
        // Initiate a canvas drawer with the data
        canvasDrawer = new ViewGenerator(
            event.data.cpuDecls,
            event.data.busDecls,
            event.data.executionEvents,
            event.data.cpusWithEvents,
            event.data.conjectures
        );
    }
    canvasDrawer.clearViewCache();
    // Always check for changes to font and theme
    updateFontAndColors(event.data.scaleWithFont, event.data.matchTheme);

    // Set button colors
    setButtonColors(
        buttons.filter((btn) => btn.id != currentViewId),
        document.getElementById(currentViewId)
    );

    // A message from the extension backend always results in a rebuild of the canvas
    resetViews(currentViewId, selectedTime);
});

// Load data and build the view
document.body.onload = vscode.postMessage(initMsg);

/**
 * Class and function definitions
 **/

// Class for generation view components
class ViewGenerator {
    execViewData = {};
    cpuViewData = {};

    constructor(cpuDeclEvents, busDeclEvents, executionEvents, cpusWithEvents, conjectures) {
        this.cpuDeclEvents = cpuDeclEvents;
        this.busDeclEvents = busDeclEvents;
        this.executionEvents = executionEvents;
        this.conjectures = conjectures;
        this.cpusWithEvents = cpusWithEvents;
        this.clearViewCache();
    }

    clearViewCache() {
        this.execViewData = {
            declDrawFuncs: [],
            gridDrawFuncs: [],
            gridStartPos_x: undefined,
            eventLength: undefined,
            conjectureTable: undefined,
        };
    }

    generateExecDrawData() {
        const canvas = this.generateEmptyCanvas();
        const cpuDecls = [];
        const busDecls = [];
        let ctx = canvas.getContext("2d");
        this.execViewData.eventLength = this.calculateEventLength(ctx);
        ctx.font = declFont;
        const declTextMetrics = ctx.measureText("Gg");
        const declPadding_y = (declTextMetrics.fontBoundingBoxAscent + declTextMetrics.fontBoundingBoxDescent) * 2;
        const declPadding_x = declPadding_y / 4;

        // Calculate decls placement and push their draw functions
        let widestText = 0;
        let nextDeclPos_y = declPadding_y;
        this.cpuDeclEvents
            .slice()
            .reverse()
            .concat(this.busDeclEvents)
            .forEach((decl) => {
                const txtMetrics = ctx.measureText(decl.name);
                if (txtMetrics.width > widestText) {
                    widestText = txtMetrics.width;
                }

                const txtHeight = txtMetrics.fontBoundingBoxAscent + txtMetrics.fontBoundingBoxDescent;
                const newDecl = {};
                newDecl.id = decl.id;
                newDecl.events = [];
                newDecl.pos_y = nextDeclPos_y - txtHeight / 2 + eventLineWidth;
                newDecl.pos_x = undefined;
                newDecl.name = decl.name;

                if (decl.eventKind == LogEvent.busDecl) {
                    newDecl.fromcpu = undefined;
                    newDecl.tocpu = undefined;
                    busDecls.push(newDecl);
                } else {
                    newDecl.activeThreadsNumb = 0;
                    cpuDecls.push(newDecl);
                }
                const declTextPos_y = nextDeclPos_y;
                this.execViewData.declDrawFuncs.push((ctx) => {
                    ctx.font = declFont;
                    ctx.fillText(decl.name, declPadding_x, declTextPos_y);
                });
                nextDeclPos_y += declPadding_y;
            });

        // Calculate where events should start on the x-axis
        this.execViewData.gridStartPos_x = widestText + declPadding_x * 2;

        // Generate and push draw functions for the diagram
        this.execViewData.gridDrawFuncs = this.generateGridDrawFuncs(
            cpuDecls,
            busDecls,
            this.executionEvents,
            declPadding_y / 2,
            nextDeclPos_y - declPadding_y / 2,
            ctx,
            diagramFont,
            gridLineWidth,
            fontColor,
            eventLineWidth,
            eventWrapperHeight,
            this.execViewData.eventLength
        );

        this.execViewData.conjectureTable = this.generateConjectureTable(this.conjectures);
    }

    generateArchView() {
        const canvas = this.generateEmptyCanvas();

        // Set text style to calculate text sizes
        let ctx = canvas.getContext("2d");
        ctx.font = declFont;

        const txtMeasure = ctx.measureText("Gg");
        const textHeight = txtMeasure.actualBoundingBoxAscent + txtMeasure.actualBoundingBoxDescent;
        const margin = txtMeasure.width;
        const padding = margin / 2;
        const rectBottomPos_y = textHeight + padding * 2 + margin + gridLineWidth;
        const rects = [];
        let maxBusTxtWidth = margin;
        this.busDeclEvents.forEach((busdecl) => {
            // The startig position for the rectangle on the x-axis should be max text width + predefined margin
            const metrics = ctx.measureText(busdecl.name);
            const totalWidth = metrics.width + margin;
            if (totalWidth > maxBusTxtWidth) {
                maxBusTxtWidth = totalWidth;
            }
            // Concat all connections for each rectangle
            busdecl.topo.forEach((id) => {
                const rect = rects.find((rect) => rect.id == id);
                if (rect) {
                    rect.connections += 1;
                } else {
                    rects.push({ id: id, connections: 1, established: 0 });
                }
            });
        });

        // Calculate position for the rectangles and the text inside
        let nextRectPos_x = maxBusTxtWidth;
        this.cpuDeclEvents.forEach((cpud) => {
            const rect = rects.find((rc) => rc.id == cpud.id);
            const minWidth = rect.connections * (margin / 2);
            const txtWidth = ctx.measureText(cpud.name).width;
            rect.text = cpud.name;
            rect.start = nextRectPos_x;
            rect.width = (txtWidth > minWidth ? txtWidth : minWidth) + padding * 2;
            rect.height = textHeight + padding * 2;
            rect.textHeight = textHeight;
            rect.txtStart = nextRectPos_x + (txtWidth > minWidth ? 0 : (minWidth - txtWidth) / 2) + padding;
            nextRectPos_x += rect.width + margin;
            return rect;
        });

        // Resize canvas to fit content
        const busTextPosInc_y = textHeight * 2;
        canvas.height = rectBottomPos_y + busTextPosInc_y * this.busDeclEvents.length + textHeight + margin;
        canvas.width = nextRectPos_x;

        // Get context after resize
        ctx = canvas.getContext("2d");
        ctx.font = declFont;
        ctx.fillStyle = ctx.strokeStyle = fontColor;
        ctx.lineWidth = gridLineWidth;

        // Draw the rectangles and text
        rects.forEach((rect) => {
            ctx.setLineDash(rect.id == 0 ? [2, 2] : []);
            ctx.strokeRect(rect.start, margin, rect.width, rect.height);
            ctx.fillText(rect.text, rect.txtStart, rectBottomPos_y - padding);
        });

        // Draw the connections between rectangles and place the name for each bus
        let nextBusNamePos_y = rectBottomPos_y + busTextPosInc_y;
        for (let i = 0; i < this.busDeclEvents.length; i++) {
            const bus = this.busDeclEvents[i];

            // Setup color and style for the connection line
            ctx.beginPath();
            ctx.fillStyle = ctx.strokeStyle = i < themeColors.length - 1 ? themeColors[i] : fontColor;
            ctx.setLineDash(bus.id == 0 ? [2, 2] : []);

            let startPos_x;
            let endPos_x;
            // Draw outgoing connections
            for (let i = 0; i < bus.topo.length; i++) {
                const cpuId = bus.topo[i];
                const rect = rects.find((rect) => rect.id == cpuId);

                // Make sure that lines are spaced evenly on the rectangle
                const linePos_x = (rect.width / (rect.connections + 1)) * ++rect.established + rect.start;

                // Draw outgoing part of the line
                ctx.moveTo(linePos_x, rectBottomPos_y);
                ctx.lineTo(linePos_x, nextBusNamePos_y);
                ctx.stroke();

                if (i == 0) {
                    startPos_x = linePos_x;
                } else if (i + 1 == bus.topo.length) {
                    endPos_x = linePos_x;
                }
            }

            // Connect outgoing connections
            ctx.moveTo(startPos_x, nextBusNamePos_y);
            ctx.lineTo(endPos_x, nextBusNamePos_y);
            ctx.stroke();

            // Draw the name of the bus
            ctx.fillText(bus.name, margin, nextBusNamePos_y + textHeight / 2);

            // Increment y position for next bus name
            nextBusNamePos_y += busTextPosInc_y;
        }
        return canvas;
    }

    generateExecView(startTime) {
        if (this.execViewData.declDrawFuncs.length == 0) {
            this.generateExecDrawData();
        }
        // Generate diagram canvas
        const diagramCanvas = this.generateEmptyCanvas();
        let gridEndPos_y = 0;
        const eventKinds = new Set();
        let gridPos_x = this.execViewData.gridStartPos_x;
        const gridDrawFuncs = [];
        let prematureEndTime;
        // Only use grid draw funcs from the specified time
        for (let i = 0; i < this.execViewData.gridDrawFuncs.length; i++) {
            const gdfs = this.execViewData.gridDrawFuncs[i];
            if (gdfs.time >= startTime) {
                // A canvas wider than ~65175 cannot be shown in VSCode so break out if this timestamps brings the width of the canvas over that value.
                if (gdfs.drawFuncs.length * this.execViewData.eventLength + gridPos_x > 64000) {
                    prematureEndTime = this.execViewData.gridDrawFuncs[i - 1].time;
                    break;
                }

                gridEndPos_y = gdfs.endPos_y > gridEndPos_y ? gdfs.endPos_y : gridEndPos_y;
                gdfs.eventKinds.forEach((kind) => eventKinds.add(kind));
                gdfs.drawFuncs.forEach((drawFunc) => {
                    const pos_x = gridPos_x;
                    gridPos_x += this.execViewData.eventLength;
                    gridDrawFuncs.push((ctx) => drawFunc(ctx, pos_x));
                });
            }
        }

        // Resize diagram canvas to fit content
        diagramCanvas.width = gridPos_x + this.execViewData.eventLength;
        diagramCanvas.height = gridEndPos_y;
        const diagramCtx = diagramCanvas.getContext("2d");
        diagramCtx.fillStyle = fontColor;
        // Draw visuals on diagram canvas
        this.execViewData.declDrawFuncs.forEach((func) => func(diagramCtx));
        gridDrawFuncs.forEach((func) => func(diagramCtx));

        // Generate the legend canvas
        const legendCanvas = this.generateEmptyCanvas();
        let legendCtx = legendCanvas.getContext("2d");
        legendCtx.font = diagramFont;
        // Generate draw functions for the legend
        const legend = this.generateEventKindsLegend(
            legendCtx,
            diagramFont,
            eventLineWidth,
            gridLineWidth,
            fontColor,
            0,
            this.execViewData.eventLength,
            eventWrapperHeight,
            this.execViewData.eventLength * 0.7,
            Array.from(eventKinds),
            this.conjectures.length > 0
        );
        legendCanvas.width = legend.width;
        legendCanvas.height = legend.endPos_y;
        legendCtx = legendCanvas.getContext("2d");
        legendCtx.fillStyle = fontColor;
        legend.drawFuncs.forEach((func) => func());

        // Container for the diagram
        const mainContainer = document.createElement("div");
        mainContainer.style.overflow = "scroll";

        // Container for the information to be displayed below the diagram
        const secondContainer = document.createElement("div");
        secondContainer.classList.add("secondContainer");

        // Setup container for the legend
        const legendContainer = document.createElement("div");
        legendContainer.style.float = "left";
        legendContainer.style.marginRight = "40px";
        legendContainer.style.marginBottom = "30px";
        const legendHeader = document.createElement("h1");
        legendHeader.textContent = "Legend";
        legendHeader.style.fontSize = `${fontSize * 2}px`;
        legendHeader.style.margin = "";
        legendContainer.appendChild(legendHeader);
        legendContainer.appendChild(legendCanvas);

        // Setup container for the table
        const tableContainer = document.createElement("div");
        tableContainer.style.float = "left";
        const tableHeader = document.createElement("h1");
        tableHeader.textContent = "Validation Conjectures";
        tableHeader.style.fontSize = `${fontSize * 2}px`;
        tableHeader.style.marginBottom = "5px";
        tableContainer.appendChild(tableHeader);
        tableContainer.appendChild(this.execViewData.conjectureTable);

        // Setup containers for the secondary container
        const informationContainer = document.createElement("div");
        informationContainer.appendChild(legendContainer);
        informationContainer.appendChild(tableContainer);

        if (prematureEndTime) {
            // The full diagram cannot be shown. Warn about this
            const warningContainer = document.createElement("div");
            warningContainer.style.marginTop = "0";
            const pElement = document.createElement("p");
            pElement.style.marginTop = "0";
            pElement.classList.add("iswarning");
            pElement.textContent = `*Max diagram size reached! Only displaying events until the time ${prematureEndTime}/${
                this.execViewData.gridDrawFuncs[this.execViewData.gridDrawFuncs.length - 1].time
            }. Choose a later start time to view later events.`;
            warningContainer.appendChild(pElement);
            secondContainer.appendChild(warningContainer);
        }

        // Add containers
        mainContainer.appendChild(diagramCanvas);
        secondContainer.appendChild(informationContainer);

        return [mainContainer, secondContainer];
    }

    generateCpuView(startTime, cpuId) {
        const executionEvents = this.cpusWithEvents.find((cwe) => cwe.id == cpuId).executionEvents;
        const canvas = this.generateEmptyCanvas();
        let ctx = canvas.getContext("2d");
        ctx.font = declFont;
        const txtMetrics = ctx.measureText("Gg");
        const txtHeight = txtMetrics.fontBoundingBoxAscent + txtMetrics.fontBoundingBoxDescent;

        // If there is no execution events just return a canvas with text
        if (executionEvents.length == 0) {
            ctx.font = declFont;
            ctx.fillStyle = fontColor;
            ctx.fillText("No events found", eventLineWidth, txtHeight + eventLineWidth * 2);

            return canvas;
        }

        const eventLength_y = this.calculateEventLength(ctx);
        const drawFuncs = [];
        const yAxisLinesDash = [1, 4];
        const margin = txtMetrics.width;
        const padding = margin / 2;
        ctx.font = diagramFont;
        const axisStart_x = ctx.measureText(executionEvents[executionEvents.length - 1].time).width + padding;
        ctx.font = declFont;
        const rects = [];
        let cpuRectId;
        const traversedEvents = [];
        const threads = [];
        const eventsToDraw = [];
        const rectIdToRectName = [];
        const opActiveEvents = [];

        for (let i = 0; i < executionEvents.length; i++) {
            const event = executionEvents[i];
            // We need to keep track of all OpActive events to later draw correct event arrows
            if (event.eventKind == LogEvent.opActivate) {
                opActiveEvents.unshift(event);
            }
            traversedEvents.push(event);
            const isBusEvent = LogEvent.isBusKind(event.eventKind);
            let opComplete;
            if (!isBusEvent) {
                const thread = LogEvent.threadCreate != event.eventKind ? threads.find((at) => at.id == event.id) : undefined;
                if (thread) {
                    if (LogEvent.threadKill == event.eventKind) {
                        threads.splice(threads.indexOf(thread), 1);
                    } else if (event.eventKind == LogEvent.opActivate) {
                        thread.prevRectIds.push(thread.currentRectId);
                        thread.currentRectId = event.objref;
                    } else if (event.eventKind == LogEvent.opCompleted) {
                        thread.currentRectId = thread.prevRectIds.length > 0 ? thread.prevRectIds.pop() : thread.currentRectId;
                    }
                }

                cpuRectId = thread
                    ? thread.currentRectId
                    : LogEvent.threadKill == event.eventKind
                    ? i == 0
                        ? executionEvents[i].rectId
                        : executionEvents[i - 1].rectId
                    : event.objref;

                if (!thread) {
                    threads.push({ id: event.id, currentRectId: cpuRectId, prevRectIds: [] });
                }
            } else if (event.eventKind == LogEvent.messageCompleted) {
                if (!("opname" in event)) {
                    // Look back through the traversed events
                    for (let ind = traversedEvents.length - 1; ind >= 0; ind--) {
                        const prevEvent = traversedEvents[ind];
                        if (ind - 1 > 0 && prevEvent.eventKind == LogEvent.messageRequest && prevEvent.callthr == event.callthr) {
                            opComplete = {
                                eventKind: LogEvent.opCompleted,
                                id: traversedEvents[ind - 1].id,
                                opname: traversedEvents[ind - 1].opname,
                                objref: traversedEvents[ind - 2].objref,
                                clnm: traversedEvents[ind - 2].clnm,
                                cpunm: traversedEvents[ind - 2].cpunm,
                                async: traversedEvents[ind - 2].async,
                                time: event.time,
                                rectId: traversedEvents[ind - 1].rectId,
                            };
                            event.objref = traversedEvents[ind - 1].rectId;
                            break;
                        }
                    }
                    // The message request that resulted in the message completed event has not been logged.
                    // Look ahead to find the rect to place the op complete event
                    if (!opComplete) {
                        let targetEvent;
                        for (let ind = i; ind < executionEvents.length; ind++) {
                            const nextEvent = executionEvents[ind];
                            if (
                                (nextEvent.eventKind == LogEvent.threadSwapIn ||
                                    nextEvent.eventKind == LogEvent.threadCreate ||
                                    nextEvent.eventKind == LogEvent.opActivate ||
                                    nextEvent.eventKind == LogEvent.opCompleted) &&
                                nextEvent.id == event.callthr
                            ) {
                                targetEvent = nextEvent;
                                break;
                            }
                        }
                        if (targetEvent) {
                            opComplete = {
                                eventKind: LogEvent.opCompleted,
                                id: event.callthr,
                                opname: "",
                                objref: targetEvent.objref,
                                clnm: targetEvent.clnm,
                                cpunm: targetEvent.cpunm,
                                async: undefined,
                                time: event.time,
                                rectId: targetEvent.objref,
                            };
                            event.objref = targetEvent.objref;
                        }
                    }
                }
                if (event.objref) {
                    cpuRectId = event.objref;
                }
            }

            // Associate rectangle id with a rectangle name
            const rectId = isBusEvent ? this.busDeclEvents.find((bde) => bde.id == event.busid).name : cpuRectId;
            if (!rectIdToRectName.find((ritrn) => ritrn.id == rectId)) {
                rectIdToRectName.push({ id: rectId, name: !isBusEvent ? event.clnm + `(${rectId})` : rectId });
            }
            // Associate the event with the rectangle id
            event.rectId = rectId;

            if (event.time >= startTime) {
                // Push events to draw
                eventsToDraw.push(event);
                if (opComplete) {
                    eventsToDraw.push(opComplete);
                }

                // Add rectangle if it doesnt exist.
                let currentRect = rects.find((rect) => rect.rectId == rectId);
                if (!currentRect) {
                    const rectName = rectIdToRectName.find((ritrn) => ritrn.id == rectId).name;
                    ctx.font = declFont;
                    currentRect = {
                        name: rectName,
                        margin: { right: margin, left: margin },
                        width: ctx.measureText(rectName).width + padding * 2,
                        height: txtHeight + padding,
                        textHeight: txtHeight,
                        busId: isBusEvent ? event.busid : undefined,
                        rectId: rectId,
                        pos_x: 0,
                        pos_y: txtHeight + padding + margin * 2,
                    };
                    // Find where to insert the rect. If its a bus rect its busId determines where to place it else its rectid.
                    // The vbus rect should always come first followed by the other bus rects and then by the rest of the rects.
                    let index = 0;
                    for (; index < rects.length; index++) {
                        const rect = rects[index];
                        if (currentRect.busId != undefined) {
                            if (rect.busId == undefined || currentRect.busId < rect.busId) {
                                break;
                            }
                        } else {
                            if (rect.busId == undefined && (currentRect.rectId > rect.rectId || isNaN(currentRect.rectId))) {
                                break;
                            }
                        }
                    }
                    // Insert rect
                    rects.splice(index, 0, currentRect);
                }

                // Calculate the margin that is needed to the right and left side of the rectangle so that opnames does not clash into other visuals.
                if (
                    (LogEvent.isOperationKind(event.eventKind) || (event.eventKind == LogEvent.messageCompleted && "opname" in event)) &&
                    i < executionEvents.length - 1
                ) {
                    //TODO: why doesnt this work as expected??
                    const targetRectIndex = rects.indexOf(
                        rects.find(
                            (rect) =>
                                rect.rectId ==
                                (LogEvent.isBusKind(executionEvents[i + 1].eventKind)
                                    ? this.busDeclEvents.find((bde) => bde.id == executionEvents[i + 1].busid).name
                                    : event.objref)
                        )
                    );
                    const isSelf = targetRectIndex > -1 && rects.indexOf(currentRect) == targetRectIndex;
                    ctx.font = diagramFont;
                    const newMargin = ctx.measureText(event.opname).width - currentRect.width / 2 - (isSelf ? eventLength_y * 1.5 : 0);

                    if (isSelf && currentRect.margin.right < newMargin) {
                        currentRect.margin.right = newMargin;
                    } else if (targetRectIndex > -1) {
                        if (rects.indexOf(currentRect) + 1 == targetRectIndex && newMargin > currentRect.margin.right) {
                            currentRect.margin.right = newMargin;
                        } else if (rects.indexOf(currentRect) - 1 == targetRectIndex && newMargin > currentRect.margin.left) {
                            currentRect.margin.left = newMargin;
                        }
                    }
                }
            }
        }

        // Define where the rectangles end
        const rectsEnd_y = txtHeight + padding + margin;

        // Geneate draw functions for the rectangles and their text
        let diagramEnd_x = axisStart_x;
        for (let i = 0; i < rects.length; i++) {
            const rect = rects[i];
            const rectStartPos_x =
                diagramEnd_x +
                (i == 0 ? 0 : rects[i - 1].margin.right >= rect.margin.left ? 0 : rect.margin.left - rects[i - 1].margin.right);
            drawFuncs.push(() => {
                ctx.font = declFont;
                ctx.fillStyle = fontColor;
                ctx.strokeStyle = fontColor;
                ctx.lineWidth = gridLineWidth;
                ctx.setLineDash(rect.busId == 0 ? [2, 2] : []);
                ctx.strokeRect(rectStartPos_x, margin, rect.width, rect.height);
                ctx.fillText(rect.name, rectStartPos_x + padding, rectsEnd_y - (rect.height - rect.textHeight));
            });

            rect.pos_x = rectStartPos_x + rect.width / 2;
            diagramEnd_x = rectStartPos_x + rect.width + rect.margin.right;
        }

        // Generate draw functions for each event
        let currentTime = -1;
        let lastEventPos_y = 0;
        let currentPos_y = rectsEnd_y + margin;
        const eventKinds = [];
        for (let i = 0; i < eventsToDraw.length; i++) {
            const event = eventsToDraw[i];
            const nextEvent = i < eventsToDraw.length - 1 ? eventsToDraw[i + 1] : undefined;
            const prevEvent = i > 0 ? eventsToDraw[i - 1] : undefined;
            const eventStartPos_y = currentPos_y;
            const eventEndPos_y = eventStartPos_y + eventLength_y;
            const currentRect = rects.find((rect) => rect.rectId == event.rectId);
            rects.forEach((rect) => {
                if (rect.rectId != currentRect.rectId) {
                    drawFuncs.push(() =>
                        this.drawLine(ctx, gridLineWidth, yAxisLinesDash, fontColor, rect.pos_x, eventStartPos_y, rect.pos_x, eventEndPos_y)
                    );
                }
            });

            // Generate draw functions for diagram line along the y-axis
            if (currentTime != event.time) {
                const pos_y = currentPos_y;
                const axisTxt = event.time;
                drawFuncs.push(() => {
                    ctx.font = diagramFont;
                    const txtMeasure = ctx.measureText(axisTxt);
                    this.drawLine(ctx, gridLineWidth, [1, 4], fontColor, axisStart_x, pos_y, diagramEnd_x + margin, pos_y);
                    ctx.fillText(
                        axisTxt,
                        axisStart_x - txtMeasure.width - eventLineWidth,
                        pos_y + (txtMeasure.actualBoundingBoxAscent + txtMeasure.actualBoundingBoxDescent) / 2
                    );
                });

                // Update time
                currentTime = event.time;
            }
            // Generate draw functions for the event
            drawFuncs.push(() => {
                ctx.save();
                ctx.translate(currentRect.pos_x, eventStartPos_y);
                ctx.rotate(Math.PI / 2);

                this.generateEventDrawFuncs(
                    ctx,
                    diagramFont,
                    gridLineWidth,
                    eventLineWidth,
                    eventWrapperHeight,
                    LogEvent.isThreadKind(event.eventKind) ? event.id : LogEvent.kindToAbb(event.eventKind),
                    event.eventKind,
                    0,
                    0,
                    eventLength_y,
                    fontColor,
                    fontColor
                ).forEach((drawFunc) => drawFunc());

                ctx.restore();
            });

            // Generate draw function for the arrow to/from the event
            let eventHasArrowWithTxt = false;

            if (nextEvent) {
                let targetRect = undefined;
                let targetRectId = nextEvent.eventKind == LogEvent.replyRequest ? nextEvent.rectId : undefined;
                if (!targetRectId && !(event.rectId == nextEvent.rectId && LogEvent.isOperationKind(nextEvent.eventKind))) {
                    // Find the target for the event i.e. an event on another rect.
                    targetRect =
                        event.eventKind == LogEvent.opRequest
                            ? eventsToDraw
                                  .slice(i + 1, eventsToDraw.length)
                                  .find(
                                      (eve) =>
                                          (eve.eventKind == LogEvent.opActivate || eve.eventKind == LogEvent.messageRequest) &&
                                          event.objref == eve.objref
                                  )
                            : event.eventKind == LogEvent.opActivate && LogEvent.isOperationKind(nextEvent.eventKind)
                            ? eventsToDraw
                                  .slice(i + 1, eventsToDraw.length)
                                  .find((eve) => eve.eventKind == LogEvent.opCompleted && event.opname == eve.opname)
                            : event.eventKind == LogEvent.opCompleted && nextEvent.eventKind == LogEvent.opCompleted
                            ? (() => {
                                  const prevOaRect = opActiveEvents.find((eve) => eve.opname == nextEvent.opname);
                                  return prevOaRect && prevOaRect.rectId == event.rectId
                                      ? rects.find((rect) => nextEvent.rectId == rect.rectId)
                                      : undefined;
                              }).apply()
                            : undefined;
                    if (targetRect && event.eventKind == LogEvent.opActivate && targetRect.rectId != nextEvent.rectId) {
                        targetRect = undefined;
                    }

                    targetRectId = targetRect ? targetRect.rectId : undefined;
                }

                // If there is a target for the event then draw the arrow
                if ((targetRectId && targetRectId != event.rectId) || event.eventKind == LogEvent.messageCompleted) {
                    const isReplyArrow =
                        !(event.eventKind == LogEvent.messageCompleted && "opname" in event) && event.eventKind != LogEvent.opRequest;

                    const nextRect = rects.find(
                        (rect) => rect.rectId == (targetRectId ? targetRectId : isReplyArrow ? nextEvent.rectId : event.objref)
                    );
                    const arrwEnd_x = (nextRect.pos_x < currentRect.pos_x ? currentRect.pos_x : nextRect.pos_x) - eventWrapperHeight / 2;
                    const arrwStart_x = (nextRect.pos_x < currentRect.pos_x ? nextRect.pos_x : currentRect.pos_x) + eventWrapperHeight / 2;

                    drawFuncs.push(() => {
                        this.drawArrow(
                            ctx,
                            arrwStart_x,
                            eventEndPos_y,
                            arrwEnd_x,
                            eventEndPos_y,
                            3,
                            5,
                            false,
                            gridLineWidth,
                            isReplyArrow ? [5, 2] : undefined,
                            fontColor,
                            nextRect.pos_x < currentRect.pos_x
                        );
                    });

                    // If the arrow is not a reply arrow then draw the opname of the event on the arrow
                    if (!isReplyArrow && nextEvent.eventKind != LogEvent.replyRequest) {
                        eventHasArrowWithTxt = true;
                        drawFuncs.push(() => {
                            ctx.font = diagramFont;
                            const txtWidth = ctx.measureText(event.opname).width;
                            ctx.fillText(
                                event.opname,
                                arrwStart_x + (arrwEnd_x - arrwStart_x - txtWidth) / 2,
                                eventEndPos_y - gridLineWidth - 3
                            );
                        });
                    }
                }
            }

            // Generate draw function for the opname next to the event if needed
            if (
                (prevEvent &&
                    !eventHasArrowWithTxt &&
                    ((event.eventKind == LogEvent.opCompleted && prevEvent.opname != event.opname) ||
                        (LogEvent.isOperationKind(event.eventKind) &&
                            !(LogEvent.isOperationKind(prevEvent.eventKind) && prevEvent.opname == event.opname)))) ||
                (!prevEvent && LogEvent.isOperationKind(event.eventKind))
            ) {
                drawFuncs.push(() => {
                    ctx.font = diagramFont;
                    const txtMeasure = ctx.measureText("Gg");
                    const txtHeight = txtMeasure.actualBoundingBoxAscent + txtMeasure.actualBoundingBoxDescent;
                    const txtStart_x = currentRect.pos_x + eventWrapperHeight + txtHeight;
                    ctx.fillText(event.opname, txtStart_x, eventEndPos_y - (eventLength_y - txtHeight) / 2);
                });
            }

            // Keep track of the highest x-axis value
            if (lastEventPos_y < eventEndPos_y) {
                lastEventPos_y = eventEndPos_y;
            }
            // Keep track of which event types are present so the legend can be generated
            if (!eventKinds.find((eventKind) => eventKind == event.eventKind)) {
                eventKinds.push(event.eventKind);
            }
            currentPos_y = eventEndPos_y;
        }

        // Generate draw functions for diagram lines between rects and the start of the diagram
        rects.forEach((rect) => {
            drawFuncs.push(() =>
                this.drawLine(ctx, gridLineWidth, yAxisLinesDash, fontColor, rect.pos_x, rectsEnd_y, rect.pos_x, rectsEnd_y + margin)
            );
        });

        // Generate draw functions for the legend
        const legend = this.generateEventKindsLegend(
            ctx,
            diagramFont,
            eventLineWidth,
            gridLineWidth,
            fontColor,
            (txtHeight * 2) / 4,
            eventLength_y,
            eventWrapperHeight,
            lastEventPos_y + eventLength_y * 2 + margin,
            eventKinds
        );
        drawFuncs.push(...legend.drawFuncs);

        // Resize canvas to fit content
        canvas.width = diagramEnd_x + margin;
        canvas.height = legend.endPos_y;
        ctx = canvas.getContext("2d");

        // Draw on canvas
        drawFuncs.forEach((drawFunc) => drawFunc());

        return canvas;
    }

    generateGridDrawFuncs(
        cpuDecls,
        busDecls,
        executionEvents,
        gridStartPos_y,
        gridHeight,
        ctx,
        diagramFont,
        gridLineWidth,
        gridLineColor,
        eventLineWidth,
        eventWrapperHeight,
        eventLength_x
    ) {
        // Calculate draw functions for each event for the decls
        let currentBusDecl = undefined;
        let currentTime = -1;
        let prevDecl;
        const conjectureTimestamps = new Set(this.conjectures.flatMap((conj) => [conj.source.time, conj.destination.time]));
        const decls = cpuDecls.concat(busDecls);
        const drawFuncsForTime = [];
        for (let index = 0; index < executionEvents.length; index++) {
            let diagramEnd_y = gridHeight;
            const drawFuncs = [];
            const event = executionEvents[index];
            const eventKind = event.eventKind;
            const isBusEvent = LogEvent.isBusKind(eventKind);
            // Find the current decl
            let currentDecl;
            if (isBusEvent) {
                if (eventKind != LogEvent.messageRequest && eventKind != LogEvent.replyRequest) {
                    currentDecl = currentBusDecl ? currentBusDecl : busDecls.find((busDecl) => busDecl.id == event.busid);
                } else {
                    // Keep track of the current bus decl
                    currentDecl = busDecls.find((busDecl) => busDecl.id == event.busid);
                    currentDecl.tocpu = event.tocpu;
                    currentDecl.fromcpu = event.fromcpu;
                }
                currentBusDecl = currentDecl;
            } else {
                currentDecl = cpuDecls.find((cpu) => cpu.id == event.cpunm);
            }

            currentDecl.isCpuDecl = !isBusEvent;

            // Look back and find the decl for which the message complete is a reply to
            if (index > 1 && executionEvents[index - 1].eventKind == LogEvent.messageCompleted) {
                const events = executionEvents.slice(0, index - 1);
                for (let i = events.length - 1; i >= 0; i--) {
                    const prevEvent = events[i];
                    if (prevEvent.eventKind == LogEvent.messageRequest || prevEvent.eventKind == LogEvent.replyRequest) {
                        if (prevEvent.eventKind == LogEvent.replyRequest && prevEvent.busid == currentBusDecl.id) {
                            const declWithOp = cpuDecls.find((cpuDecl) => cpuDecl.id == prevEvent.tocpu);
                            if (declWithOp && declWithOp.activeThreads) {
                                const activeThread = declWithOp.activeThreads.find((at) => prevEvent.callthr == at.id);
                                if (activeThread) {
                                    activeThread.suspended = false;
                                }
                            }
                        }
                        break;
                    }
                }
            }

            if (eventKind == LogEvent.opRequest && event.async == false && index + 1 < executionEvents.length) {
                if (!currentDecl.activeThreads) {
                    currentDecl.activeThreads = [];
                }
                const activeThread = currentDecl.activeThreads.find((at) => at.id == event.id);
                if (activeThread) {
                    activeThread.suspended = executionEvents[index + 1].eventKind == LogEvent.messageRequest;
                } else {
                    currentDecl.activeThreads.push({
                        eventKind: LogEvent.threadSwapIn,
                        id: event.id,
                        suspended: executionEvents[index + 1].eventKind == LogEvent.messageRequest,
                    });
                }
            } else if (LogEvent.isThreadSwapKind(eventKind)) {
                if (currentDecl.activeThreads) {
                    if (eventKind == LogEvent.threadSwapOut) {
                        currentDecl.activeThreads.splice(
                            currentDecl.activeThreads.indexOf(currentDecl.activeThreads.find((at) => at.id == event.id)),
                            1
                        );
                    } else {
                        currentDecl.activeThreads.push(event);
                    }
                } else {
                    currentDecl.activeThreads =
                        eventKind == LogEvent.threadSwapIn || eventKind == LogEvent.delayedThreadSwapIn ? [event] : [];
                }
            }

            // Generate draw function for the x-axis line
            if (currentTime < event.time) {
                // Add function that draws the visuals for the x-axis line
                ctx.font = diagramFont;
                const txtWidth = ctx.measureText(event.time).width;
                diagramEnd_y = gridHeight + txtWidth + eventLineWidth * 2;
                drawFuncs.push((ctx, startPos_x) => {
                    ctx.font = diagramFont;
                    this.drawLine(ctx, gridLineWidth, [1, 4], gridLineColor, startPos_x, gridStartPos_y, startPos_x, gridHeight);

                    ctx.save();
                    ctx.translate(startPos_x, gridHeight);
                    ctx.rotate(Math.PI / 2);
                    ctx.fillText(event.time, eventLineWidth, 0);
                    ctx.restore();
                });

                // Update time
                currentTime = event.time;
            }

            decls.forEach((decl) => {
                // Generate the draw functions for the line between events
                if (decl != currentDecl) {
                    let color = gridLineColor;
                    let lineDash = [1, 4];
                    let lineWidth = gridLineWidth;
                    const pos_y = decl.pos_y;
                    if (decl.isCpuDecl == true && decl.activeThreads && decl.activeThreads.length > 0) {
                        lineDash = decl.activeThreads.find((at) => at.suspended == true) ? [4, 4] : [];
                        lineWidth = eventLineWidth;
                        color = LogEvent.eventKindToColor.find((ektc) => ektc.kind == LogEvent.opActivate).color;
                    }
                    const constLineDash = lineDash;
                    const constColor = color;
                    drawFuncs.push((ctx, startPos_x) => {
                        const x_end = startPos_x + eventLength_x + gridLineWidth;
                        const x_start = startPos_x;
                        this.drawLine(ctx, lineWidth, constLineDash, constColor, x_start, pos_y, x_end, pos_y);
                    });
                }
            });

            // Generate draw functions for event
            const hasStopLine = !LogEvent.isOperationKind(eventKind);
            const hasStartLine =
                hasStopLine &&
                (!prevDecl || currentDecl.pos_y != prevDecl.pos_y || LogEvent.isOperationKind(executionEvents[index - 1].eventKind));
            drawFuncs.push((ctx, startPos_x) =>
                this.generateEventDrawFuncs(
                    ctx,
                    diagramFont,
                    gridLineWidth,
                    eventLineWidth,
                    eventWrapperHeight,
                    LogEvent.isThreadKind(eventKind) ? event.id : LogEvent.kindToAbb(eventKind),
                    eventKind,
                    startPos_x,
                    currentDecl.pos_y,
                    startPos_x + eventLength_x,
                    gridLineColor,
                    gridLineColor,
                    hasStartLine,
                    hasStopLine
                ).forEach((func) => func())
            );
            // Generate draw functions for bus arrows
            if (prevDecl && LogEvent.isBusKind(eventKind) && eventKind != LogEvent.messageActivate) {
                const isMsgComplete = eventKind == LogEvent.messageCompleted;
                const targetPos_y = !isMsgComplete ? prevDecl.pos_y : cpuDecls.find((cpuDecl) => cpuDecl.id == event.tocpu).pos_y;
                const eventPos_y = currentDecl.pos_y;
                const nextEventHasStartLine =
                    isMsgComplete && index < executionEvents.length - 1 && LogEvent.isThreadKind(executionEvents[index + 1].eventKind);
                drawFuncs.push((ctx, startPos_x) => {
                    // Draw arrows from/to cpu and bus
                    const end_y = eventPos_y - eventWrapperHeight;
                    const start_y = targetPos_y + (!nextEventHasStartLine || !isMsgComplete ? eventWrapperHeight / 2 : eventWrapperHeight);
                    const pos_x = startPos_x + (isMsgComplete ? eventLength_x : 0);
                    this.drawArrow(ctx, pos_x, start_y, pos_x, end_y, 3, 5, false, gridLineWidth, [], gridLineColor, isMsgComplete);
                });
            }

            // Generate draw functions for conjecture indication
            if (conjectureTimestamps.has(event.time)) {
                const conjecturesForEvent = this.conjectures.filter(
                    (conj) =>
                        (conj.source.time == event.time &&
                            event.eventKind.toLowerCase() == conj.source.kind.toLowerCase() &&
                            event.opname.toLowerCase().includes(conj.source.opname.toLowerCase())) ||
                        (conj.destination.time == event.time &&
                            event.eventKind.toLowerCase() == conj.destination.kind.toLowerCase() &&
                            event.opname.toLowerCase().includes(conj.destination.opname.toLowerCase()))
                );
                if (conjecturesForEvent.length > 0) {
                    const txtMeasure = ctx.measureText(conjecturesForEvent[0].name);
                    drawFuncs.push(
                        this.generateConjectureDrawFunc(
                            currentDecl.pos_y - eventLineWidth,
                            conjecturesForEvent.map((conj) => conj.name),
                            ctx,
                            eventLength_x,
                            txtMeasure.fontBoundingBoxAscent + txtMeasure.fontBoundingBoxDescent + eventLineWidth
                        )
                    );
                }
            }

            prevDecl = currentDecl;

            // Add draw events to the time
            let dfft = drawFuncsForTime.find((dfft) => dfft.time == currentTime);
            if (!dfft) {
                dfft = {
                    time: currentTime,
                    drawFuncs: [],
                    endPos_y: diagramEnd_y,
                    eventKinds: new Set(),
                };

                drawFuncsForTime.push(dfft);
            }
            dfft.eventKinds.add(eventKind);
            dfft.drawFuncs.push((ctx, startPos_x) => drawFuncs.forEach((func) => func(ctx, startPos_x)));
        }

        return drawFuncsForTime;
    }

    /**
     *
     * Generate helper functions
     *
     */

    generateConjectureTable(conjectures) {
        const table = document.createElement("table");
        table.style.float = "center";
        const headerNames = ["status", "name", "expression", "src time", "src thread", "dest time", "dest thread"];

        //  Build and add the headers
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        headerNames.forEach((header) => {
            const th = document.createElement("th");
            th.appendChild(document.createTextNode(header));
            headerRow.appendChild(th);
        });

        // Add the table body
        let tbdy = document.createElement("tbody");
        tbdy.id = "tbdy";
        table.appendChild(tbdy);

        if (conjectures.length == 0) {
            // Add an empty row to display an empty table
            conjectures.push({
                status: " ",
                name: " ",
                expression: " ",
                source: { time: " ", thid: " " },
                destination: { time: " ", thid: " " },
            });
        }
        // Build the rows
        conjectures.forEach((conj) => {
            const row = tbdy.insertRow();

            row.classList.add("row");
            // Add cells to the rows
            [
                { header: headerNames[0], value: conj.status },
                { header: headerNames[1], value: conj.name },
                { header: headerNames[2], value: conj.expression },
                { header: headerNames[3], value: conj.source.time },
                { header: headerNames[4], value: conj.source.thid },
                { header: headerNames[5], value: conj.destination.time },
                { header: headerNames[6], value: conj.destination.thid },
            ].forEach((content) => {
                const rowCell = row.insertCell();
                rowCell.classList.add("statuscell");
                // Parse a true or falls value to an icon instead
                rowCell.appendChild(
                    document.createTextNode(content.value === true ? "\u2713" : content.value === false ? "\u2715" : content.value)
                );
                // Click listener for focusing the diagram on the time of the conjecture
                if (content.header == headerNames[3] || content.header == headerNames[5]) {
                    rowCell.classList.add("clickableCell");
                    rowCell.ondblclick = () => {
                        selectedTime = content.value;
                        timeSelector.value = selectedTime;
                        resetViews(currentViewId, selectedTime);
                    };
                }
            });
        });

        return table;
    }

    generateConjectureDrawFunc(midPos_y, conjectureNames, ctx, length, height) {
        const rectStart_y = midPos_y - height / 2;
        const rectHeight = height;
        const rectWidth = length - conjectureMarkerWidth * 2;
        const lineStart_y = rectStart_y + rectHeight;
        const lineEnd_y = lineStart_y + eventLineWidth;
        const drawFuncs = [];
        drawFuncs.push((ctx, startPos_x) => {
            const prevStrokeStyle = ctx.strokeStyle;
            const prevLineWidth = ctx.lineWidth;
            ctx.lineWidth = conjectureMarkerWidth;
            ctx.strokeStyle = conjectureColor;
            ctx.beginPath();
            ctx.rect(startPos_x + conjectureMarkerWidth, rectStart_y, rectWidth, rectHeight);
            ctx.stroke();
            const lineStart_x = startPos_x + length / 2;

            this.drawLine(ctx, conjectureMarkerWidth, [], conjectureColor, lineStart_x, lineStart_y, lineStart_x, lineEnd_y);
            ctx.strokeStyle = prevStrokeStyle;
            ctx.lineWidth = prevLineWidth;
        });
        let nextConjPos_y = lineEnd_y + gridLineWidth;
        conjectureNames.forEach((name) => {
            const pos_y = nextConjPos_y;
            const textMeasure = ctx.measureText(name);
            drawFuncs.push((ctx, startPos_x) => {
                const prevFillStyle = ctx.fillStyle;
                const prevLineWidth = ctx.lineWidth;
                ctx.lineWidth = conjectureMarkerWidth;
                ctx.fillStyle = conjectureColor;
                ctx.fillText(
                    name,
                    startPos_x + length / 2 - textMeasure.width / 4,
                    pos_y + textMeasure.actualBoundingBoxAscent + textMeasure.actualBoundingBoxDescent
                );
                ctx.fillStyle = prevFillStyle;
                ctx.lineWidth = prevLineWidth;
            });

            nextConjPos_y += textMeasure.actualBoundingBoxAscent + textMeasure.actualBoundingBoxDescent + gridLineWidth * 2;
        });

        return (ctx, startPos_x) => {
            drawFuncs.forEach((func) => func(ctx, startPos_x));
        };
    }

    generateEmptyCanvas() {
        const canvas = document.createElement("CANVAS");
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        canvas.style.background = backgroundColor;

        return canvas;
    }

    calculateEventLength(ctx) {
        // The event length is based on whatever is the widest of "9999" (to fit a high thread number) and any of the abbreviation of the event kinds.
        const prevFont = ctx.font;
        ctx.font = diagramFont;
        const threadIdMetrics = ctx.measureText("9999");
        const msgAbbMetrics = ctx.measureText(LogEvent.getKindsAbbs().reduce((prev, curr) => (prev.size > curr.size ? prev : curr)));
        const txtWidth = threadIdMetrics.width > msgAbbMetrics.width ? threadIdMetrics.width : msgAbbMetrics.width;
        ctx.font = prevFont;
        return txtWidth + gridLineWidth * 2 > eventWrapperHeight * 2 ? txtWidth + gridLineWidth * 2 : eventWrapperHeight * 2;
    }

    generateEventKindsLegend(
        ctx,
        font,
        eventLineWidth,
        gridLineWidth,
        gridLineColor,
        elementPadding,
        eventLength_x,
        eventWrapperHeight,
        startPos_y,
        eventKinds,
        addConjectureLegend
    ) {
        // Calculate draw functions for elements in the legend
        let nextLegendElementPos_y = startPos_y;
        const drawFuncs = [];
        const lgndTxtMetrics = ctx.measureText(eventKinds[0]);
        const txtHeight = lgndTxtMetrics.fontBoundingBoxAscent + lgndTxtMetrics.fontBoundingBoxDescent;
        let width = lgndTxtMetrics.width;
        eventKinds
            .sort((a, b) => a.localeCompare(b))
            .forEach((eventKind) => {
                const txt = eventKind.replace(/([A-Z])/g, " $1").trim();
                const elementPos_y = nextLegendElementPos_y;
                drawFuncs.push(() => {
                    this.generateEventDrawFuncs(
                        ctx,
                        font,
                        gridLineWidth,
                        eventLineWidth,
                        eventWrapperHeight,
                        LogEvent.isThreadKind(eventKind) ? undefined : LogEvent.kindToAbb(eventKind),
                        eventKind,
                        elementPadding,
                        elementPos_y,
                        elementPadding + eventLength_x - gridLineWidth * 2,
                        gridLineColor,
                        gridLineColor
                    ).forEach((func) => {
                        ctx.font = font;
                        func();
                    });
                    ctx.fillText(txt, elementPadding + eventLength_x + eventLineWidth, elementPos_y);
                });
                const txtWidth = ctx.measureText(txt).width;
                if (txtWidth > width) {
                    width = txtWidth;
                }
                nextLegendElementPos_y += txtHeight * 1.5 + gridLineWidth;
            });

        // Add draw function for the validation conjecture legend
        if (addConjectureLegend) {
            const txt = "Validation Conjecture";
            const elementPos_y = nextLegendElementPos_y;
            drawFuncs.push(() => {
                this.generateConjectureDrawFunc(
                    elementPos_y - txtHeight / 4,
                    [],
                    ctx,
                    eventLength_x,
                    txtHeight + eventLineWidth
                )(ctx, -(gridLineWidth * 2));
                const prevStrokeStyle = ctx.strokeStyle;
                ctx.strokeStyle = conjectureColor;
                ctx.fillText(txt, elementPadding + eventLength_x + eventLineWidth, elementPos_y);
                ctx.strokeStyle = prevStrokeStyle;
            });
            const txtWidth = ctx.measureText(txt).width;
            if (txtWidth > width) {
                width = txtWidth;
            }
        } else {
            nextLegendElementPos_y -= txtHeight * 1.5 + gridLineWidth;
        }

        return {
            endPos_y: nextLegendElementPos_y + txtHeight,
            drawFuncs: drawFuncs,
            width: width + elementPadding + eventLength_x + eventLineWidth + gridLineWidth,
        };
    }

    generateEventDrawFuncs(
        ctx,
        font,
        gridLineWidth,
        eventLineWidth,
        lineWrapperHeight,
        eventTxt,
        eventKind,
        startPos_x,
        pos_y,
        endPos_x,
        gridLineColor,
        txtColor,
        startLine,
        stopLine
    ) {
        ctx.fillStyle = txtColor;
        ctx.font = font;
        const eventColor = LogEvent.eventKindToColor.find((ektc) => ektc.kind == eventKind).color;
        const drawFuncs = [];
        // Draw the event
        drawFuncs.push(() => {
            this.drawLine(ctx, eventLineWidth, [], eventColor, startPos_x, pos_y, endPos_x, pos_y);

            if (eventTxt) {
                const textMeasure = ctx.measureText(eventTxt);
                const textWidth = textMeasure.width;
                const textPos_y = pos_y - eventLineWidth;
                ctx.fillText(eventTxt, startPos_x + (endPos_x - startPos_x - textWidth) / 2, textPos_y);
            }
        });

        if (LogEvent.isThreadKind(eventKind)) {
            // Draw the "marker" for the thread event
            drawFuncs.push(() => {
                const txtMetrics = eventTxt ? ctx.measureText(eventTxt) : undefined;
                this.drawThreadEventMarker(
                    ctx,
                    font,
                    txtMetrics ? txtMetrics.actualBoundingBoxAscent + txtMetrics.actualBoundingBoxDescent + gridLineWidth * 2 : 0,
                    lineWrapperHeight,
                    eventLineWidth,
                    eventKind,
                    eventColor,
                    startPos_x,
                    endPos_x,
                    pos_y
                );
            });
        }

        // Draw the event "wrapper lines"
        if (stopLine) {
            drawFuncs.push(() =>
                this.drawLine(
                    ctx,
                    gridLineWidth,
                    [],
                    gridLineColor,
                    endPos_x,
                    pos_y - lineWrapperHeight / 2,
                    endPos_x,
                    pos_y + lineWrapperHeight / 2
                )
            );
        }

        if (startLine) {
            drawFuncs.push(() =>
                this.drawLine(
                    ctx,
                    gridLineWidth,
                    [],
                    gridLineColor,
                    startPos_x,
                    pos_y - lineWrapperHeight / 2,
                    startPos_x,
                    pos_y + lineWrapperHeight / 2
                )
            );
        }

        return drawFuncs;
    }

    /**
     *
     * Draw functions
     *
     */

    drawThreadEventMarker(
        ctx,
        font,
        txtHeight,
        eventWrapperHeight,
        eventLineWidth,
        eventKind,
        eventColor,
        eventStartPos_x,
        eventEndPos_x,
        eventPos_y
    ) {
        // Draw marker for event
        ctx.font == font;
        const halfEventLineWidth = Math.ceil(eventLineWidth / 2);
        const markerPos_x = eventStartPos_x + (eventEndPos_x - eventStartPos_x) / 2;
        const markerStart_y = eventPos_y - eventLineWidth - txtHeight;
        const markerEnd_y = markerStart_y - eventWrapperHeight;
        const markerWidth = eventLineWidth - 1;
        if (LogEvent.isThreadSwapKind(eventKind)) {
            if (eventKind == LogEvent.delayedThreadSwapIn) {
                const lineLength = Math.abs(Math.abs(markerEnd_y) - Math.abs(markerStart_y)) / 2 + halfEventLineWidth;
                const start_x = markerPos_x - lineLength / 2;
                const end_x = markerPos_x + lineLength / 2;
                this.drawLine(ctx, halfEventLineWidth, [], eventColor, start_x, markerEnd_y, end_x, markerEnd_y);
            }

            // Adjust arrow placement and position depending on in/out
            const isSwapIn = eventKind != LogEvent.threadSwapOut;
            this.drawArrow(
                ctx,
                markerPos_x,
                markerStart_y - (isSwapIn ? markerWidth : 0),
                markerPos_x,
                markerEnd_y + (isSwapIn ? 0 : markerWidth),
                halfEventLineWidth,
                halfEventLineWidth,
                true,
                markerWidth,
                undefined,
                eventColor,
                isSwapIn
            );
        } else {
            this.drawCross(
                ctx,
                markerPos_x,
                markerStart_y - (markerStart_y - markerEnd_y) / 2,
                markerEnd_y - markerStart_y + halfEventLineWidth,
                markerWidth,
                eventColor,
                eventKind == LogEvent.threadCreate ? 0 : Math.PI / 4
            );
        }
    }

    drawCross(ctx, center_x, center_y, lineLength, lineWidth, strokeStyle, angle) {
        const prevLineWidth = ctx.lineWidth;
        const prevStrokeStyle = ctx.strokeStyle;
        const rotate = angle && angle != 0;

        if (lineWidth) {
            ctx.lineWidth = lineWidth;
        }
        if (strokeStyle) {
            ctx.strokeStyle = strokeStyle;
        }
        // center
        const x = rotate ? 0 : center_x;
        const y = rotate ? 0 : center_y;

        if (rotate) {
            ctx.save();
            ctx.translate(center_x, center_y);
            ctx.rotate(angle);
        }

        ctx.beginPath();
        ctx.setLineDash([]);

        // Draw
        ctx.moveTo(x, y + lineLength / 2);
        ctx.lineTo(x, y - lineLength / 2);
        ctx.moveTo(x + lineLength / 2, y);
        ctx.lineTo(x - lineLength / 2, y);
        ctx.stroke();

        if (rotate) {
            ctx.restore();
        }

        // Restore settings
        ctx.strokeStyle = prevStrokeStyle;
        ctx.lineWidth = prevLineWidth;
    }

    drawLine(ctx, lineWidth, lineDash, strokeStyle, from_x, from_y, to_x, to_y) {
        const prevLineWidth = ctx.lineWidth;
        const prevStrokeStyle = ctx.strokeStyle;

        if (lineWidth) {
            ctx.lineWidth = lineWidth;
        }
        if (strokeStyle) {
            ctx.strokeStyle = strokeStyle;
        }
        if (lineDash) {
            ctx.setLineDash(lineDash);
        }

        ctx.beginPath();
        ctx.moveTo(from_x, from_y);
        ctx.lineTo(to_x, to_y);
        ctx.stroke();

        // Restore
        if (lineDash) {
            ctx.setLineDash([]);
        }
        ctx.strokeStyle = prevStrokeStyle;
        ctx.lineWidth = prevLineWidth;
    }

    drawArrow(ctx, x_start, y_start, x_end, y_end, aWidth, aLength, fill, lineWidth, lineDash, color, arrowStart) {
        const dx = x_end - x_start;
        const dy = y_end - y_start;
        const angle = Math.atan2(dy, dx);
        const length = Math.sqrt(dx * dx + dy * dy);
        let prevFillStyle;
        let prevStrokeStyle;
        let prevLineWidth;

        ctx.translate(x_start, y_start);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.setLineDash([]);
        if (color) {
            prevFillStyle = ctx.fillStyle;
            prevStrokeStyle = ctx.strokeStyle;
            ctx.fillStyle = ctx.strokeStyle = color;
        }
        if (lineWidth) {
            prevLineWidth = ctx.lineWidth;
            ctx.lineWidth = lineWidth;
        }
        if (lineDash) {
            ctx.setLineDash(lineDash);
        }
        ctx.moveTo(0, 0);
        ctx.lineTo(length, 0);
        if (arrowStart) {
            ctx.moveTo(aLength, -aWidth);
            ctx.lineTo(0, 0);
            ctx.lineTo(aLength, aWidth);
        } else {
            ctx.moveTo(length - aLength, -aWidth);
            ctx.lineTo(length, 0);
            ctx.lineTo(length - aLength, aWidth);
        }
        if (fill) {
            ctx.closePath();
            ctx.fill();
        }
        ctx.stroke();

        // Restore
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (prevFillStyle) {
            ctx.fillStyle = prevFillStyle;
            ctx.strokeStyle = prevStrokeStyle;
        }

        if (prevLineWidth) {
            ctx.lineWidth = prevLineWidth;
        }

        if (lineDash) {
            ctx.setLineDash([]);
        }
    }
}

// Class for handling log event kinds
class LogEvent {
    // Event kinds
    static cpuDecl = "CPUdecl";
    static busDecl = "BUSdecl";
    static threadCreate = "ThreadCreate";
    static threadSwapIn = "ThreadSwapIn";
    static delayedThreadSwapIn = "DelayedThreadSwapIn";
    static threadSwapOut = "ThreadSwapOut";
    static threadKill = "ThreadKill";
    static messageRequest = "MessageRequest";
    static messageActivate = "MessageActivate";
    static messageCompleted = "MessageCompleted";
    static opActivate = "OpActivate";
    static opRequest = "OpRequest";
    static opCompleted = "OpCompleted";
    static replyRequest = "ReplyRequest";
    static deployObj = "DeployObj";

    // The colors are changed based on the users theme
    static eventKindToColor = [
        { kind: this.threadCreate, color: this.kindToStandardColor(this.threadCreate) },
        { kind: this.threadKill, color: this.kindToStandardColor(this.threadKill) },
        { kind: this.opActivate, color: this.kindToStandardColor(this.opActivate) },
        { kind: this.opRequest, color: this.kindToStandardColor(this.opRequest) },
        { kind: this.opCompleted, color: this.kindToStandardColor(this.opCompleted) },
        { kind: this.threadSwapOut, color: this.kindToStandardColor(this.threadSwapOut) },
        { kind: this.threadSwapIn, color: this.kindToStandardColor(this.threadSwapIn) },
        { kind: this.delayedThreadSwapIn, color: this.kindToStandardColor(this.delayedThreadSwapIn) },
        { kind: this.messageRequest, color: this.kindToStandardColor(this.messageRequest) },
        { kind: this.replyRequest, color: this.kindToStandardColor(this.replyRequest) },
        { kind: this.messageActivate, color: this.kindToStandardColor(this.messageActivate) },
        { kind: this.messageCompleted, color: this.kindToStandardColor(this.messageCompleted) },
    ];

    static kindToAbb(eventKind) {
        return eventKind == this.threadKill
            ? "tk"
            : eventKind == this.threadCreate
            ? "tc"
            : eventKind == this.threadSwapOut
            ? "tso"
            : eventKind == this.threadSwapIn
            ? "tsi"
            : eventKind == this.delayedThreadSwapIn
            ? "dtsi"
            : eventKind == this.messageRequest
            ? "mr"
            : eventKind == this.replyRequest
            ? "rr"
            : eventKind == this.messageActivate
            ? "ma"
            : eventKind == this.messageCompleted
            ? "mc"
            : eventKind == this.opRequest
            ? "or"
            : eventKind == this.opActivate
            ? "oa"
            : eventKind == this.opCompleted
            ? "oc"
            : "";
    }

    static getKindsAbbs() {
        return this.eventKindToColor.map((ektc) => this.kindToAbb(ektc.kind));
    }

    static kindToStandardColor(eventKind) {
        return eventKind == this.threadKill
            ? "#a1260d"
            : eventKind == this.threadCreate
            ? "#388a34"
            : eventKind == this.threadSwapOut
            ? "#be8700"
            : eventKind == this.threadSwapIn
            ? "#bf8803"
            : eventKind == this.delayedThreadSwapIn
            ? "#d186167d"
            : eventKind == this.messageRequest
            ? "#808080"
            : eventKind == this.replyRequest
            ? "#737373"
            : eventKind == this.messageActivate
            ? "#D0D0D0"
            : eventKind == this.messageCompleted
            ? "#B5B5B5"
            : "#007acc";
    }

    static isThreadKind(eventKind) {
        return (
            eventKind == this.threadKill ||
            eventKind == this.threadSwapOut ||
            eventKind == this.threadSwapIn ||
            eventKind == this.threadCreate ||
            eventKind == this.delayedThreadSwapIn
        );
    }

    static isBusKind(eventKind) {
        return (
            eventKind == this.replyRequest ||
            eventKind == this.messageCompleted ||
            eventKind == this.messageActivate ||
            eventKind == this.messageRequest
        );
    }

    static isThreadSwapKind(eventKind) {
        return eventKind == this.threadSwapIn || eventKind == this.threadSwapOut || eventKind == this.delayedThreadSwapIn;
    }

    static isOperationKind(eventKind) {
        return eventKind == this.opRequest || eventKind == this.opActivate || eventKind == this.opCompleted;
    }
}

/**
 *
 * Functions
 *
 */

function resetViews(currentViewId, selectedTime) {
    viewContainer.innerHTML = "";
    // Remove view components from views and rebuild and display the view components for the current view
    views.forEach((view) => {
        view.components = [];
        if (view.id == currentViewId) {
            // Rebuild view components for the current view
            view.components = buildViewComponents(currentViewId, selectedTime);
            // Display the view
            view.components.forEach((item) => viewContainer.appendChild(item));
        }
    });
}

function buildViewComponents(viewId, startTime) {
    return viewId == execViewId
        ? canvasDrawer.generateExecView(startTime)
        : viewId == archViewId
        ? [canvasDrawer.generateArchView()]
        : [canvasDrawer.generateCpuView(startTime, viewId.replace(/\D/g, ""))];
}

function setButtonColors(btns, activeBtn) {
    // There is alwasy an active (pressed) button. Change its color to secondary
    if (activeBtn) {
        activeBtn.style.background = btnColors.secondaryBackground;
        activeBtn.style.color = btnColors.secondaryForeground;
    }

    // Update the other buttons to primary color
    btns.forEach((btn) => {
        if (btn.id != activeBtn.id) {
            btn.style.background = btnColors.primaryBackground;
            btn.style.color = btnColors.primaryForeground;
        }
    });
}

function updateFontAndColors(scaleWithFont, matchTheme) {
    const computedStyle = getComputedStyle(document.body);
    // Update font properties
    fontSize = scaleWithFont ? Number(computedStyle.getPropertyValue("--vscode-editor-font-size").replace(/\D/g, "")) : 16;
    const fontFamily = computedStyle.getPropertyValue("--vscode-editor-font-family").trim();
    fontColor = matchTheme ? computedStyle.getPropertyValue("--vscode-editor-foreground").trim() : "#000000";
    conjectureColor = matchTheme ? computedStyle.getPropertyValue("--vscode-debugIcon-breakpointForeground").trim() : "#FF0000";

    // Update background color for the diagrams
    backgroundColor = matchTheme ? computedStyle.getPropertyValue("--vscode-editor-background").trim() : "#ffffff";

    // Update colors for events and bus
    themeColors = [fontColor];
    let themeColorsHasOpColor = false;
    LogEvent.eventKindToColor.forEach((ektc) => {
        const isOpKind = LogEvent.isOperationKind(ektc.kind);
        if (isOpKind || LogEvent.isThreadKind(ektc.kind)) {
            ektc.color = matchTheme
                ? ektc.kind == LogEvent.threadCreate
                    ? computedStyle.getPropertyValue("--vscode-debugIcon-startForeground").trim()
                    : ektc.kind == LogEvent.threadSwapIn
                    ? computedStyle.getPropertyValue("--vscode-debugIcon-breakpointCurrentStackframeForeground").trim()
                    : ektc.kind == LogEvent.threadKill
                    ? computedStyle.getPropertyValue("--vscode-debugIcon-stopForeground").trim()
                    : ektc.kind == LogEvent.threadSwapOut
                    ? computedStyle.getPropertyValue("--vscode-statusBar-debuggingBackground").trim()
                    : ektc.kind == LogEvent.delayedThreadSwapIn
                    ? computedStyle.getPropertyValue("--vscode-editorOverviewRuler-findMatchForeground").trim()
                    : computedStyle.getPropertyValue("--vscode-debugIcon-continueForeground").trim()
                : LogEvent.kindToStandardColor(ektc.kind);
        }
        // Only include op color once as it is identical for all op kinds.
        if (isOpKind && !themeColorsHasOpColor) {
            themeColorsHasOpColor = true;
            themeColors.push(ektc.color);
        } else if (!isOpKind) {
            themeColors.push(ektc.color);
        }
    });

    // Update button colors
    btnColors.primaryBackground = computedStyle.getPropertyValue("--vscode-button-background").trim();
    btnColors.secondaryBackground = computedStyle.getPropertyValue("--vscode-button-secondaryBackground").trim();
    btnColors.primaryForeground = computedStyle.getPropertyValue("--vscode-button-foreground").trim();
    btnColors.secondaryForeground = computedStyle.getPropertyValue("--vscode-button-secondaryForeground").trim();

    // Update size of diagram elements
    declFont = `${fontSize * 1.5}px ${fontFamily}`;
    diagramFont = `${fontSize}px ${fontFamily}`;
    gridLineWidth = fontSize / 10 > 1 ? fontSize / 10 : 1;
    eventLineWidth = gridLineWidth * 4;
    conjectureMarkerWidth = gridLineWidth * 2;
    eventWrapperHeight = eventLineWidth * 2 + eventLineWidth;
}

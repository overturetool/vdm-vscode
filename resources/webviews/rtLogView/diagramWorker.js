/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable eqeqeq */

const archViewId = "arch";
const execViewId = "exec";
const legendViewId = "legend";
const initMsg = "init";
const settingsChangedMsg = "settingsChanged";
// A canvas with a total area larger than 268435456 and/or wider/higher than 65535 cannot be displayed in VSCode.
//However, the context of a web worker on windows seems to be based on IE 11 where the max area size is 67108864 and max width/height is 16384
const canvasMaxArea = 67108864;
const canvasMaxSize = 16384;

// Global variables
let backgroundColor;
let fontSize;
let declFont;
let conjectureViolationFont;
let diagramFont;
let gridLineWidth;
let eventLineWidth;
let conjectureViolationMarkerWidth;
let lineDashSize;
let eventWrapperHeight;
let themeColors = [];
let fontColor;
let conjectureViolationColor;
let canvasGenerator;

// Handle messages
self.onmessage = function (e) {
    const msg = e.data.msg;

    if (msg == initMsg) {
        canvasGenerator = new CanvasGenerator(
            e.data.cpuDecls,
            e.data.busDecls,
            e.data.executionEvents,
            e.data.cpusWithEvents,
            e.data.conjectures,
            e.data.canvas,
            e.data.screenWidth
        );
    } else if (msg == archViewId) {
        canvasGenerator.drawArchCanvas(e.data.canvas);
    } else if (msg == settingsChangedMsg) {
        backgroundColor = e.data.backgroundColor;
        fontSize = e.data.fontSize;
        declFont = e.data.declFont;
        conjectureViolationFont = e.data.conjectureViolationFont;
        diagramFont = e.data.diagramFont;
        gridLineWidth = e.data.gridLineWidth;
        eventLineWidth = e.data.eventLineWidth;
        conjectureViolationMarkerWidth = e.data.conjectureViolationMarkerWidth;
        lineDashSize = e.data.lineDashSize;
        eventWrapperHeight = e.data.eventWrapperHeight;
        themeColors = e.data.themeColors;
        fontColor = e.data.fontColor;
        conjectureViolationColor = e.data.conjectureViolationColor;
        canvasGenerator.resetViewDataCache();
    } else if (msg == execViewId) {
        canvasGenerator.drawExecutionCanvas(e.data.canvas, e.data.startTime);
    } else if (msg == legendViewId) {
        canvasGenerator.drawLegendCanvas(e.data.canvas);
    } else if (msg.toLowerCase().includes("cpu")) {
        canvasGenerator.drawCpuCanvas(e.data.canvas, e.data.startTime, msg);
    }
};

// Class for generation view components
class CanvasGenerator {
    constructor(cpuDeclEvents, busDeclEvents, executionEvents, cpusWithEvents, conjectures, canvas, screenWidth) {
        this.cpuDeclEvents = cpuDeclEvents;
        this.busDeclEvents = busDeclEvents;
        this.executionEvents = executionEvents;
        this.conjectures = conjectures;
        this.cpusWithEvents = cpusWithEvents;
        this.defaultCanvas = canvas;
        this.queuedExecDrawCall = undefined;
        this.isGeneratingExecDrawwData = false;
        this.execDrawData = {
            declDrawFuncs: [],
            gridDrawFuncs: [],
            gridStartPos_x: undefined,
            eventLength: undefined,
            conjectureViolationTable: undefined,
        };
        // Screen width is used as the max width for the cpu view
        this.screenWidth = screenWidth;
    }

    resetViewDataCache() {
        this.generateExecDrawData(this.defaultCanvas);
    }

    generateExecDrawData(canvas) {
        this.isGeneratingExecDrawwData = true;
        const cpuDecls = [];
        const busDecls = [];
        let ctx = canvas.getContext("2d");
        this.execDrawData.eventLength = this.calculateEventLength(ctx);
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
                this.execDrawData.declDrawFuncs.push((ctx) => {
                    ctx.font = declFont;
                    ctx.fillText(decl.name, declPadding_x, declTextPos_y);
                });
                nextDeclPos_y += declPadding_y;
            });

        // Calculate where events should start on the x-axis
        this.execDrawData.gridStartPos_x = widestText + declPadding_x * 2;

        // Generate and push draw functions for the diagram
        this.execDrawData.gridDrawFuncs = this.generateGridDrawFuncs(
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
            this.execDrawData.eventLength
        );

        this.isGeneratingExecDrawwData = false;
        if (this.queuedExecDrawCall) {
            this.queuedExecDrawCall();
        }
    }

    drawArchCanvas(canvas) {
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

            // If the bus has any connections then draw them
            if (bus.topo.length > 1) {
                let startPos_x;
                let endPos_x;
                const sortedTopo = bus.topo.sort((a, b) => Number(a) - Number(b));
                // Draw outgoing connections

                for (let i = 0; i < sortedTopo.length; i++) {
                    const cpuId = sortedTopo[i];
                    const rect = rects.find((rect) => rect.id == cpuId);

                    // Make sure that lines are spaced evenly on the rectangle
                    const linePos_x = (rect.width / (rect.connections + 1)) * ++rect.established + rect.start;

                    // Draw outgoing part of the line
                    ctx.moveTo(linePos_x, rectBottomPos_y);
                    ctx.lineTo(linePos_x, nextBusNamePos_y);
                    ctx.stroke();

                    if (i == 0) {
                        startPos_x = linePos_x;
                    }
                    endPos_x = linePos_x;
                }

                // Connect outgoing connections
                ctx.moveTo(startPos_x, nextBusNamePos_y);
                ctx.lineTo(endPos_x, nextBusNamePos_y);
                ctx.stroke();
            }

            // Draw the name of the bus
            ctx.fillText(bus.name, margin, nextBusNamePos_y + textHeight / 2);

            // Increment y position for next bus name
            nextBusNamePos_y += busTextPosInc_y;
        }

        const bitmap = canvas.transferToImageBitmap();
        self.postMessage({ msg: archViewId, bitmap: bitmap, width: canvas.width, height: canvas.height });
    }

    drawLegendCanvas(canvas) {
        // Generate the legend canvas
        let legendCtx = canvas.getContext("2d");
        const eventLength = this.calculateEventLength(legendCtx);
        legendCtx.font = diagramFont;
        // Generate draw functions for the legend
        const legend = this.generateEventKindsLegend(
            legendCtx,
            diagramFont,
            eventLineWidth,
            gridLineWidth,
            fontColor,
            0,
            eventLength,
            eventWrapperHeight,
            eventLength * 0.7,
            LogEvent.eventKindToColor.map((ektc) => ektc.kind),
            true
        );
        canvas.width = legend.width;
        canvas.height = legend.endPos_y;
        legendCtx = canvas.getContext("2d");
        legend.drawFuncs.forEach((func) => func());

        const bitmap = canvas.transferToImageBitmap();
        self.postMessage({ msg: legendViewId, bitmap: bitmap, width: canvas.width, height: canvas.height });
    }

    drawExecutionCanvas(canvas, startTime) {
        if (this.isGeneratingExecDrawwData) {
            queuedExecDrawCall = () => this.drawExecutionCanvas(canvas, startTime);
            return;
        }
        // Generate diagram canvas
        let gridEndPos_y = 0;
        let gridPos_x = this.execDrawData.gridStartPos_x;
        const gridDrawFuncs = [];
        let timeOfExceededSize;
        // Only use grid draw funcs from the specified time
        for (let i = 0; i < this.execDrawData.gridDrawFuncs.length; i++) {
            const gdfs = this.execDrawData.gridDrawFuncs[i];
            if (gdfs.time >= startTime) {
                const newGridEndPos_y = gdfs.endPos_y > gridEndPos_y ? gdfs.endPos_y : gridEndPos_y;
                const resultingCanvasWidth =
                    gdfs.drawFuncs.length * this.execDrawData.eventLength + gridPos_x + this.execDrawData.eventLength;
                // Break out if the size of the canvas exceeds the size that can be displayed
                if (
                    resultingCanvasWidth > canvasMaxSize ||
                    newGridEndPos_y > canvasMaxSize ||
                    resultingCanvasWidth * newGridEndPos_y > canvasMaxArea
                ) {
                    timeOfExceededSize = this.execDrawData.gridDrawFuncs[i - 1].time;
                    break;
                }

                gridEndPos_y = newGridEndPos_y;
                gdfs.drawFuncs.forEach((drawFunc) => {
                    const pos_x = gridPos_x;
                    gridPos_x += this.execDrawData.eventLength;
                    gridDrawFuncs.push((ctx) => drawFunc(ctx, pos_x));
                });
            }
        }

        // Resize diagram canvas to fit content
        canvas.width = gridPos_x + this.execDrawData.eventLength;
        canvas.height = gridEndPos_y;
        const diagramCtx = canvas.getContext("2d");
        diagramCtx.fillStyle = fontColor;
        // Draw visuals on diagram canvas
        this.execDrawData.declDrawFuncs.forEach((func) => func(diagramCtx));
        gridDrawFuncs.forEach((func) => func(diagramCtx));

        const bitmap = canvas.transferToImageBitmap();
        self.postMessage({ msg: execViewId, bitmap: bitmap, width: canvas.width, height: canvas.height, exceedTime: timeOfExceededSize });
    }

    drawCpuCanvas(canvas, startTime, msg) {
        const cpuId = msg.replace(/\D/g, "");
        const executionEvents = this.cpusWithEvents.find((cwe) => cwe.id == cpuId).executionEvents;
        let ctx = canvas.getContext("2d");
        ctx.font = declFont;
        const txtMetrics = ctx.measureText("Gg");
        const txtHeight = txtMetrics.fontBoundingBoxAscent + txtMetrics.fontBoundingBoxDescent;

        // If there is no execution events just return a canvas with text
        if (executionEvents.length == 0) {
            ctx.font = declFont;
            ctx.fillStyle = fontColor;
            const msg = "No events found";
            ctx.fillText(msg, eventLineWidth, txtHeight + eventLineWidth * 2);
            const txtMetrics = ctx.measureText(msg);
            self.postMessage({
                msg: msg,
                bitmap: canvas.transferToImageBitmap(),
                width: txtMetrics.width,
                height: txtMetrics.fontBoundingBoxAscent + txtMetrics.fontBoundingBoxDescent,
                exceedTime: undefined,
            });
            return;
        }

        const eventLength = this.calculateEventLength(ctx);
        const drawFuncs = [];
        const yAxisLinesDash = [lineDashSize, lineDashSize * 4];
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
        let currentEventPos_y = txtHeight + padding + margin * 2;
        let diagramHeight = currentEventPos_y + eventLength;
        let timeOfExceededSize;
        let diagramWidth = axisStart_x;
        let firstTimestampAfterStartTime;
        // Find which obj refs (rects) needs to be displayed and which events for the given time. To properly display this it needs to be calculated from the beginning.
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
                            // An op complete event needs to be inserted
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
                            event.objref = targetEvent.objref;
                            opComplete = {
                                eventKind: LogEvent.opCompleted,
                                id: event.callthr,
                                opname: "",
                                objref: targetEvent.objref,
                                clnm: targetEvent.clnm,
                                cpunm: targetEvent.cpunm,
                                async: undefined,
                                time: event.time,
                                rectId: event.objref,
                            };

                            if (!rectIdToRectName.find((ritrn) => ritrn.id == event.objref)) {
                                rectIdToRectName.push({ id: event.objref, name: targetEvent.clnm });
                            }
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

            // Only generate draw functions for the events from the chosen start time
            if (event.time >= startTime) {
                if (firstTimestampAfterStartTime == undefined) {
                    firstTimestampAfterStartTime = event.time;
                }
                // Push to events to draw
                eventsToDraw.push(event);
                if (opComplete) {
                    eventsToDraw.push(opComplete);
                }
                const newRects = [];
                // Generate the rect(s) related to the event if they do not already exist
                [event, opComplete].forEach((event) => {
                    if (event && !rects.find((rect) => rect.rectId == event.rectId)) {
                        const rectName = rectIdToRectName.find((ritrn) => ritrn.id == event.rectId).name;
                        ctx.font = declFont;
                        const rect = {
                            name: rectName,
                            margin: { right: margin, left: margin },
                            width: ctx.measureText(rectName).width + padding * 2,
                            height: txtHeight + padding,
                            textHeight: txtHeight,
                            busId: isBusEvent ? event.busid : undefined,
                            rectId: event.rectId,
                            pos_x: 0,
                            pos_y: txtHeight + padding + margin * 2,
                        };
                        newRects.push(rect);
                        // Find where to insert the rect. If its a bus rect its busId determines where to place it else its rectid.
                        // The vbus rect should always come first followed by the other bus rects and then by the rest of the rects.
                        let index = 0;
                        for (; index < rects.length; index++) {
                            const existingRect = rects[index];
                            if (rect.busId != undefined) {
                                if (existingRect.busId == undefined || rect.busId < existingRect.busId) {
                                    break;
                                }
                            } else {
                                if (existingRect.busId == undefined && (rect.rectId > existingRect.rectId || isNaN(rect.rectId))) {
                                    break;
                                }
                            }
                        }
                        // Insert rect
                        rects.splice(index, 0, rect);
                    }
                });

                //Calculate the margin that is needed to the right and left side of the rectangle so that opnames does not clash into other visuals.
                const prevEvent = i > 0 ? executionEvents[i - 1] : undefined;
                const prevRect = prevEvent ? rects.find((rect) => rect.rectId == prevEvent.rectId) : undefined;
                const previousMarginsForRect = { rectId: undefined, margin: {} };
                if (
                    (prevRect &&
                        (LogEvent.isOperationKind(prevEvent.eventKind) ||
                            (prevEvent.eventKind == LogEvent.messageCompleted && "opname" in prevEvent))) ||
                    opComplete
                ) {
                    const targetRect = rects.find(
                        (rect) =>
                            rect.rectId ==
                            (opComplete
                                ? opComplete.rectId
                                : LogEvent.isBusKind(event.eventKind)
                                ? this.busDeclEvents.find((bde) => bde.id == event.busid).name
                                : prevEvent.eventKind == LogEvent.opRequest || prevEvent.eventKind == LogEvent.messageCompleted
                                ? prevEvent.objref
                                : prevEvent.rectId)
                    );
                    const targetRectIndex = rects.indexOf(targetRect);
                    const isSelf = opComplete || targetRect.rectId == prevRect.rectId;
                    ctx.font = diagramFont;
                    const newMargin =
                        ctx.measureText(opComplete ? opComplete.opname : prevEvent.opname).width -
                        (isSelf ? targetRect.width : prevRect.width) / 2 +
                        margin * 2;

                    const rectToMarginAdjust = opComplete || prevEvent.eventKind == LogEvent.messageCompleted ? targetRect : prevRect;
                    previousMarginsForRect.rectId = rectToMarginAdjust.rectId;
                    if (
                        (isSelf || rects.indexOf(rectToMarginAdjust) + 1 == targetRectIndex) &&
                        newMargin > rectToMarginAdjust.margin.right
                    ) {
                        previousMarginsForRect.margin.right = rectToMarginAdjust.margin.right;
                        rectToMarginAdjust.margin.right = newMargin;
                    } else if (rects.indexOf(rectToMarginAdjust) - 1 == targetRectIndex && newMargin > rectToMarginAdjust.margin.left) {
                        previousMarginsForRect.margin.left = rectToMarginAdjust.margin.left;
                        rectToMarginAdjust.margin.left = newMargin;
                    }
                }

                // Update rect positions based on their margins if they have been updated
                if (previousMarginsForRect.rectId) {
                    diagramWidth = axisStart_x;
                    for (let i = 0; i < rects.length; i++) {
                        const rect = rects[i];
                        const rectStartPos_x =
                            diagramWidth +
                            (i == 0
                                ? margin
                                : i > 0 && rects[i - 1].margin.right < rect.margin.left
                                ? rect.margin.left - rects[i - 1].margin.right
                                : -(rects[i - 1].margin.right - margin < rect.width / 2
                                      ? rects[i - 1].margin.right - margin
                                      : rect.width / 2));
                        rect.startPos_x = rectStartPos_x;
                        rect.pos_x = rectStartPos_x + rect.width / 2;
                        diagramWidth = rectStartPos_x + rect.width + rect.margin.right;
                    }
                }

                // Validate that events until the current timestamp does not cause the diagram to exceeds its max area or the screen width.
                // If not then rollback to the previous timestamp
                let breakOut = false;
                if (
                    event.time > firstTimestampAfterStartTime &&
                    (diagramHeight > canvasMaxSize || diagramHeight * diagramWidth > canvasMaxArea || diagramWidth > this.screenWidth)
                ) {
                    for (let k = eventsToDraw.length - 2; k >= 0; k--) {
                        const prevEvent = eventsToDraw[k];
                        if (prevEvent.time != event.time) {
                            timeOfExceededSize = prevEvent.time;
                            eventsToDraw.splice(k + 1);
                            breakOut = true;
                            if (diagramWidth > this.screenWidth) {
                                // Rollback rects
                                const rectWithAdjustedMargins = rects.find((rect) => rect.rectId == previousMarginsForRect.rectId);
                                if (previousMarginsForRect.margin.right) {
                                    rectWithAdjustedMargins.margin.right = previousMarginsForRect.margin.right;
                                } else if (previousMarginsForRect.margin.left) {
                                    rectWithAdjustedMargins.margin.left = previousMarginsForRect.margin.left;
                                }

                                newRects.forEach((rect) => {
                                    const rectIndex = rects.indexOf(rect);
                                    rects.splice(rectIndex, 1);
                                });
                            }
                            break;
                        }
                    }
                }
                // Later events cannot fit on the canvas so break out and generate the draw functions
                if (breakOut) {
                    break;
                }

                diagramHeight += eventLength + (opComplete ? eventLength : 0);
                currentEventPos_y += eventLength;
            }
        }

        // Define where the rectangles end
        const rectsEnd_y = txtHeight + padding + margin;

        // Geneate draw functions for the rectangles and their text.
        rects.forEach((rect) =>
            drawFuncs.push(() => {
                ctx.font = declFont;
                ctx.fillStyle = fontColor;
                ctx.strokeStyle = fontColor;
                ctx.lineWidth = gridLineWidth;
                ctx.setLineDash(rect.busId == 0 ? [2, 2] : []);
                ctx.strokeRect(rect.startPos_x, margin, rect.width, rect.height);
                ctx.fillText(rect.name, rect.startPos_x + padding, rectsEnd_y - (rect.height - rect.textHeight));
            })
        );

        // Generate draw functions for each event
        let currentTime = -1;
        let lastEventPos_y = 0;

        // Reset the current event pos.
        currentEventPos_y = rectsEnd_y + margin;
        const diagramEndMax = eventsToDraw.length * eventLength + rectsEnd_y + margin;

        // Generate draw funcs for x-axis dashed lines
        rects.forEach((rect) => {
            drawFuncs.push(() =>
                this.drawLine(ctx, gridLineWidth, yAxisLinesDash, fontColor, rect.pos_x, rectsEnd_y + margin, rect.pos_x, diagramEndMax)
            );
        });

        for (let i = 0; i < eventsToDraw.length; i++) {
            const event = eventsToDraw[i];
            const nextEvent = i < eventsToDraw.length - 1 ? eventsToDraw[i + 1] : undefined;
            const prevEvent = i > 0 ? eventsToDraw[i - 1] : undefined;
            const eventStartPos_y = currentEventPos_y;
            const eventEndPos_y = eventStartPos_y + eventLength;
            const currentRect = rects.find((rect) => rect.rectId == event.rectId);

            // Generate draw functions for diagram line along the y-axis
            if (currentTime != event.time) {
                const pos_y = eventStartPos_y;
                const axisTxt = event.time;
                drawFuncs.push(() => {
                    ctx.font = diagramFont;
                    const txtMeasure = ctx.measureText(axisTxt);
                    this.drawLine(ctx, gridLineWidth, [1, 4], fontColor, axisStart_x, pos_y, diagramWidth + margin, pos_y);
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
                    eventLength,
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
                !eventHasArrowWithTxt &&
                ((prevEvent &&
                    ((event.eventKind == LogEvent.opCompleted && prevEvent.opname != event.opname) ||
                        (LogEvent.isOperationKind(event.eventKind) &&
                            !(LogEvent.isOperationKind(prevEvent.eventKind) && prevEvent.opname == event.opname)))) ||
                    (!prevEvent && LogEvent.isOperationKind(event.eventKind)))
            ) {
                drawFuncs.push(() => {
                    ctx.font = diagramFont;
                    const txtMeasure = ctx.measureText("Gg");
                    const txtHeight = txtMeasure.actualBoundingBoxAscent + txtMeasure.actualBoundingBoxDescent;
                    const txtStart_x = currentRect.pos_x + eventWrapperHeight + txtHeight;
                    ctx.fillText(event.opname, txtStart_x, eventEndPos_y - (eventLength - txtHeight) / 2);
                });
            }

            // Keep track of the highest x-axis value
            if (lastEventPos_y < eventEndPos_y) {
                lastEventPos_y = eventEndPos_y;
            }

            currentEventPos_y = eventEndPos_y;
        }

        // Generate draw functions for diagram lines between rects and the start of the diagram
        rects.forEach((rect) => {
            drawFuncs.push(() =>
                this.drawLine(ctx, gridLineWidth, yAxisLinesDash, fontColor, rect.pos_x, rectsEnd_y, rect.pos_x, rectsEnd_y + margin)
            );
        });

        // Resize canvas to fit content
        canvas.width = diagramWidth;
        canvas.height = lastEventPos_y;
        ctx = canvas.getContext("2d");
        // Draw on canvas
        drawFuncs.forEach((drawFunc) => drawFunc());

        const bitmap = canvas.transferToImageBitmap();
        self.postMessage({ msg: msg, bitmap: bitmap, width: canvas.width, height: canvas.height, exceedTime: timeOfExceededSize });
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
        const conjectureViolationTimestamps = new Set(this.conjectures.flatMap((conj) => [conj.source.time, conj.destination.time]));
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

            // Generate draw function to mark time on the x-axis line
            if (currentTime < event.time) {
                // Add function that draws the visuals for the x-axis line
                ctx.font = diagramFont;
                const txtWidth = ctx.measureText(event.time).width;
                diagramEnd_y = gridHeight + txtWidth + eventLineWidth * 2;
                drawFuncs.push((ctx, startPos_x) => {
                    ctx.font = diagramFont;
                    this.drawLine(
                        ctx,
                        gridLineWidth,
                        [lineDashSize, lineDashSize * 4],
                        gridLineColor,
                        startPos_x,
                        gridStartPos_y,
                        startPos_x,
                        gridHeight
                    );

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
                    let lineDash = [lineDashSize, lineDashSize * 4];
                    let lineWidth = gridLineWidth;
                    const pos_y = decl.pos_y;
                    if (decl.isCpuDecl == true && decl.activeThreads && decl.activeThreads.length > 0) {
                        lineDash = decl.activeThreads.find((at) => at.suspended == true) ? [eventLineWidth * 1.1, eventLineWidth] : [];
                        lineWidth = eventLineWidth;
                        color = LogEvent.eventKindToColor.find((ektc) => ektc.kind == LogEvent.opActivate).color;
                    }
                    const constLineDash = lineDash;
                    const constColor = color;
                    const isOdd = index % 2 > 0;
                    drawFuncs.push((ctx, startPos_x) => {
                        const x_end = startPos_x + eventLength_x + gridLineWidth;
                        const x_start = startPos_x + (isOdd ? gridLineWidth / 2 : 0);
                        this.drawLine(ctx, lineWidth, constLineDash, constColor, x_start, pos_y, x_end, pos_y);
                    });
                }
            });

            const conjectureViolationsForEvent = conjectureViolationTimestamps.has(event.time)
                ? this.conjectures.filter(
                      (conj) =>
                          (conj.source.time == event.time &&
                              event.eventKind.toLowerCase() == conj.source.kind.toLowerCase() &&
                              event.opname.toLowerCase().includes(conj.source.opname.toLowerCase())) ||
                          (conj.destination.time == event.time &&
                              event.eventKind.toLowerCase() == conj.destination.kind.toLowerCase() &&
                              event.opname.toLowerCase().includes(conj.destination.opname.toLowerCase()))
                  )
                : [];

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

            // Generate draw functions for conjecture violation indication
            if (conjectureViolationsForEvent.length > 0) {
                drawFuncs.push(
                    this.generateConjectureViolationDrawFunc(
                        currentDecl.pos_y - eventLineWidth,
                        eventLength_x / 2,
                        conjectureViolationsForEvent.map((conj) => conj.name),
                        ctx,
                        eventLength_x / 2.3
                    )
                );
            }

            prevDecl = currentDecl;

            // Add draw events to the time
            let dfft = drawFuncsForTime.find((dfft) => dfft.time == currentTime);
            if (!dfft) {
                dfft = {
                    time: currentTime,
                    drawFuncs: [],
                    endPos_y: diagramEnd_y,
                };

                drawFuncsForTime.push(dfft);
            }
            dfft.drawFuncs.push((ctx, startPos_x) => drawFuncs.forEach((func) => func(ctx, startPos_x)));
        }

        return drawFuncsForTime;
    }

    /**
     *
     * Generate helper functions
     *
     */

    generateConjectureViolationDrawFunc(midPos_y, relMidPos_x, conjectureViolationNames, ctx, radi) {
        const lineStart_y = midPos_y + radi;
        const lineEnd_y = lineStart_y + eventLineWidth;
        const drawFuncs = [
            (ctx, startPos_x) => {
                const prevStrokeStyle = ctx.strokeStyle;
                const prevLineWidth = ctx.lineWidth;
                ctx.lineWidth = conjectureViolationMarkerWidth;
                ctx.strokeStyle = conjectureViolationColor;
                ctx.beginPath();
                ctx.arc(startPos_x + relMidPos_x, midPos_y, radi, 0, 2 * Math.PI);
                ctx.stroke();
                const lineStart_x = startPos_x + relMidPos_x;

                this.drawLine(
                    ctx,
                    conjectureViolationMarkerWidth,
                    [],
                    conjectureViolationColor,
                    lineStart_x,
                    lineStart_y,
                    lineStart_x,
                    lineEnd_y
                );
                ctx.strokeStyle = prevStrokeStyle;
                ctx.lineWidth = prevLineWidth;
            },
        ];
        let nextConjPos_y = lineEnd_y + gridLineWidth * 2;
        conjectureViolationNames.forEach((name) => {
            const pos_y = nextConjPos_y;
            const textMeasure = ctx.measureText(name);
            drawFuncs.push((ctx, startPos_x) => {
                const prevFillStyle = ctx.fillStyle;
                const prevLineWidth = ctx.lineWidth;
                const prevFont = ctx.font;
                ctx.lineWidth = conjectureViolationMarkerWidth;
                ctx.fillStyle = conjectureViolationColor;
                ctx.font = conjectureViolationFont;
                ctx.fillText(
                    name,
                    startPos_x + relMidPos_x - textMeasure.width / 4,
                    pos_y + textMeasure.actualBoundingBoxAscent + textMeasure.actualBoundingBoxDescent
                );
                ctx.fillStyle = prevFillStyle;
                ctx.lineWidth = prevLineWidth;
                ctx.font = prevFont;
            });

            nextConjPos_y += textMeasure.actualBoundingBoxAscent + textMeasure.actualBoundingBoxDescent + gridLineWidth * 2;
        });

        return (ctx, startPos_x) => {
            drawFuncs.forEach((func) => func(ctx, startPos_x));
        };
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
        addConjectureViolationLegend
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

        // Add draw function for the validation conjecture violation legend
        if (addConjectureViolationLegend) {
            const txt = "Validation Conjecture Violation";
            const elementPos_y = nextLegendElementPos_y;
            drawFuncs.push(() => {
                this.generateConjectureViolationDrawFunc(
                    elementPos_y - txtHeight / 4,
                    eventLength_x / 2,
                    [],
                    ctx,
                    eventLength_x / 3
                )(ctx, 0);
                const prevStrokeStyle = ctx.strokeStyle;
                ctx.strokeStyle = conjectureViolationColor;
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

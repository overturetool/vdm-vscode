/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable eqeqeq */

const archViewId = "arch";
const execViewId = "exec";
const legendViewId = "legend";
const initMsg = "init";
const settingsChangedMsg = "settingsChanged";

let diagramGenerator;

// Handle messages
self.onmessage = function (e) {
    const msg = e.data.msg;

    if (msg == initMsg) {
        diagramGenerator = new DiagramGenerator(
            e.data.cpuDecls,
            e.data.busDecls,
            e.data.executionEvents,
            e.data.cpusWithEvents,
            e.data.conjectures,
            e.data.canvas,
            e.data.diagramSize,
            e.data.styling,
            e.data.logEvents
        );
    } else if (msg == archViewId) {
        diagramGenerator.drawArchCanvas(e.data.canvas);
    } else if (msg == settingsChangedMsg) {
        diagramGenerator.updateDiagramStyling(
            e.data.fontSize,
            e.data.fontFamily,
            e.data.declFont,
            e.data.conjectureViolationFont,
            e.data.diagramFont,
            e.data.gridLineWidth,
            e.data.eventLineWidth,
            e.data.conjectureViolationMarkerWidth,
            e.data.lineDashSize,
            e.data.eventWrapperHeight,
            e.data.fontColor,
            e.data.conjectureViolationColor,
            e.data.themeColors,
            e.data.backgroundColor,
            e.data.eventKindsToColors
        );
    } else if (msg == execViewId) {
        diagramGenerator.drawExecutionCanvas(e.data.canvas, e.data.startTime);
    } else if (msg == legendViewId) {
        diagramGenerator.drawLegendCanvas(e.data.canvas);
    } else if (msg.toLowerCase().includes("cpu")) {
        diagramGenerator.drawCpuCanvas(e.data.canvas, Number(e.data.startTime), msg, false);
    }
};

// Class for generating diagrams as canvas
class DiagramGenerator {
    constructor(cpuDeclEvents, busDeclEvents, executionEvents, cpusWithEvents, conjectures, canvas, diagramSize, styling, logEvents) {
        // Log data
        this.cpuDeclEvents = cpuDeclEvents;
        this.busDeclEvents = busDeclEvents;
        this.executionEvents = executionEvents;
        this.conjectures = conjectures;
        this.cpusWithEvents = cpusWithEvents;
        this.logEvents = logEvents;

        this.eventKinds = Object.values(this.logEvents);

        this.defaultCanvas = canvas;
        // A canvas with a total area larger than 268435456 and/or wider/higher than 65535 cannot be displayed in VSCode.
        //However, the context of a web worker on windows seems to be based on IE 11 where the max area size is 67108864 and max width/height is 16384
        this.canvasMaxArea = 67108864;
        this.canvasMaxSize = 16384;
        this.opnameIdentifier = "opname";

        // Screen diagram size is used to keep the size of the cpu view within a reasonable size of the users screen.
        this.diagramSize = diagramSize;

        // Keep state for the execution view. This includes the draw functions so these does not have to be recalculated each time.
        this.execucionViewData = {
            declDrawFuncs: [],
            gridDrawFuncs: [],
            gridStartPos_x: undefined,
            eventLength: undefined,
            conjectureViolationTable: undefined,
        };

        // Keep state for the CPU views. This includes the start times to canvas states so these does not have to be recalculated each time.
        this.cpuViewData = new Map();
        cpusWithEvents.forEach((cwe) => {
            this.cpuViewData.set(cwe.id + "", {
                startTimesToCanvasStates: new Map(),
                executionEvents: cwe.executionEvents,
            });
        });

        // Canvas styling
        this.gridLineWidth;
        this.eventLineWidth;
        this.themeColors;
        this.fontColor;
        this.conjectureViolationColor;
        this.conjectureViolationMarkerWidth;
        this.lineDashSize;
        this.eventWrapperHeight;
        this.declFont;
        this.conjectureViolationFont;
        this.diagramFont;
        this.backgroundColor;
        this.eventKindsToColors;
        this.updateDiagramStyling(
            styling.fontSize,
            styling.fontFamily,
            styling.declFont,
            styling.conjectureViolationFont,
            styling.diagramFont,
            styling.gridLineWidth,
            styling.eventLineWidth,
            styling.conjectureViolationMarkerWidth,
            styling.lineDashSize,
            styling.eventWrapperHeight,
            styling.fontColor,
            styling.conjectureViolationColor,
            styling.themeColors,
            styling.backgroundColor,
            styling.eventKindsToColors
        );

        this.generateExecutionViewData(this.defaultCanvas);
    }

    resetViewDataCache() {
        this.execucionViewData = {
            declDrawFuncs: [],
            gridDrawFuncs: [],
            gridStartPos_x: undefined,
            eventLength: undefined,
            conjectureViolationTable: undefined,
        };

        for (const value of this.cpuViewData.values()) {
            value.startTimesToCanvasStates = new Map();
        }
    }

    drawArchCanvas(canvas) {
        // Set text style to calculate text sizes
        let ctx = canvas.getContext("2d");
        ctx.font = this.declFont;

        const txtMeasure = ctx.measureText("Gg");
        const textHeight = txtMeasure.actualBoundingBoxAscent + txtMeasure.actualBoundingBoxDescent;
        const margin = txtMeasure.width;
        const padding = margin / 2;
        const rectBottomPos_y = textHeight + padding * 2 + margin + this.gridLineWidth;
        const rects = this.cpuDeclEvents.map((cde) => ({ id: cde.id, connections: 0, established: 0 }));
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
        ctx.font = this.declFont;
        ctx.fillStyle = ctx.strokeStyle = this.fontColor;
        ctx.lineWidth = this.gridLineWidth;

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
            ctx.fillStyle = ctx.strokeStyle = i < this.themeColors.length ? this.themeColors[i] : this.fontColor;
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

        this.returnCanvas(archViewId, canvas);
    }

    drawLegendCanvas(canvas) {
        // Generate the legend canvas
        let legendCtx = canvas.getContext("2d");
        const eventLength = this.calculateEventLength(legendCtx);
        const elementPadding = eventLength;
        legendCtx.font = this.diagramFont;
        let nextLegendElementPos_y = eventLength * 1.5;
        const drawFuncs = [];
        const firstTxtMetrics = legendCtx.measureText(this.eventKinds[0]);

        const txtHeight = firstTxtMetrics.fontBoundingBoxAscent + firstTxtMetrics.fontBoundingBoxDescent;
        let maxTxtWidth = firstTxtMetrics.width;
        // Add draw function for the event kinds
        this.eventKinds
            .filter((ek) => ek != this.logEvents.cpuDecl && ek != this.logEvents.busDecl && ek != this.logEvents.deployObj)
            .sort((a, b) => a.localeCompare(b))
            .forEach((eventKind) => {
                const txt = eventKind.replace(/([A-Z])/g, " $1").trim();
                const elementPos_y = nextLegendElementPos_y;
                drawFuncs.push(() => {
                    this.generateEventDrawFuncs(
                        legendCtx,
                        this.diagramFont,
                        this.gridLineWidth,
                        this.eventLineWidth,
                        this.eventWrapperHeight,
                        this.isThreadKind(eventKind) ? undefined : this.kindToAbb(eventKind),
                        eventKind,
                        elementPadding,
                        elementPos_y,
                        elementPadding + eventLength - this.gridLineWidth * 2,
                        this.fontColor,
                        this.fontColor
                    ).forEach((func) => {
                        legendCtx.font = this.diagramFont;
                        func();
                    });
                    legendCtx.fillText(txt, elementPadding + eventLength + this.eventLineWidth, elementPos_y);
                });
                const txtWidth = legendCtx.measureText(txt).width;
                if (txtWidth > maxTxtWidth) {
                    maxTxtWidth = txtWidth;
                }
                nextLegendElementPos_y += txtHeight * 1.5 + this.gridLineWidth;
            });

        // Add draw function for the validation conjecture violation legend
        const conjTxt = "Validation Conjecture Violation";
        const elementPos_y = nextLegendElementPos_y;
        drawFuncs.push(() => {
            this.generateConjectureViolationDrawFunc(
                elementPos_y - txtHeight / 4,
                elementPadding * 1.5,
                [],
                legendCtx,
                eventLength / 3
            )(legendCtx, 0);
            const prevStrokeStyle = legendCtx.strokeStyle;
            legendCtx.strokeStyle = this.conjectureViolationColor;
            legendCtx.fillText(conjTxt, elementPadding + eventLength + this.eventLineWidth, elementPos_y);
            legendCtx.strokeStyle = prevStrokeStyle;
        });
        const txtWidth = legendCtx.measureText(conjTxt).width;
        if (txtWidth > maxTxtWidth) {
            maxTxtWidth = txtWidth;
        }

        canvas.width = maxTxtWidth + elementPadding + eventLength + this.eventLineWidth + this.gridLineWidth;
        canvas.height = nextLegendElementPos_y + txtHeight;
        legendCtx = canvas.getContext("2d");
        drawFuncs.forEach((func) => func());

        this.returnCanvas(legendViewId, canvas);
    }

    drawExecutionCanvas(canvas, startTime) {
        if (this.execucionViewData.gridDrawFuncs.length == 0) {
            this.generateExecutionViewData(canvas);
        }
        // Generate diagram canvas
        let gridEndPos_y = 0;
        let gridPos_x = this.execucionViewData.gridStartPos_x;
        const drawFunctions = [];
        let timeOfExceededSize;
        // Only use grid draw functions from the specified time
        const gridDrawFunctionsForTime = this.execucionViewData.gridDrawFuncs.slice(
            this.execucionViewData.gridDrawFuncs.indexOf(this.execucionViewData.gridDrawFuncs.find((gdfs) => gdfs.time >= startTime))
        );
        for (let i = 0; i < gridDrawFunctionsForTime.length; i++) {
            const gdfs = gridDrawFunctionsForTime[i];
            const newGridEndPos_y = gdfs.endPos_y > gridEndPos_y ? gdfs.endPos_y : gridEndPos_y;
            const resultingCanvasWidth =
                gdfs.drawFuncs.length * this.execucionViewData.eventLength + gridPos_x + this.execucionViewData.eventLength;
            // Break out if the size of the canvas exceeds the size that can be displayed
            if (
                resultingCanvasWidth > this.canvasMaxSize ||
                newGridEndPos_y > this.canvasMaxSize ||
                resultingCanvasWidth * newGridEndPos_y > this.canvasMaxArea
            ) {
                //TODO: If the canvas dimension exceeds the restricted size for the first timestamp then it cannot be displayed on a single canvas and should be split into multiple canvases
                if (i == 0) {
                    this.postErrorCanvas(
                        canvas,
                        `Events for time ${gdfs.time} cannot fit onto the diagram! Try lowevering the font size.`,
                        execViewId
                    );
                    return;
                }
                timeOfExceededSize = gridDrawFunctionsForTime[i - 1].time;
                break;
            }

            gridEndPos_y = newGridEndPos_y;
            gdfs.drawFuncs.forEach((drawFunc) => {
                const pos_x = gridPos_x;
                gridPos_x += this.execucionViewData.eventLength;
                drawFunctions.push((ctx) => drawFunc(ctx, pos_x));
            });
        }

        // Resize diagram canvas to fit content
        canvas.width = gridPos_x + this.execucionViewData.eventLength;
        canvas.height = gridEndPos_y;
        const diagramCtx = canvas.getContext("2d");
        diagramCtx.fillStyle = this.fontColor;
        // Draw visuals on diagram canvas
        this.execucionViewData.declDrawFuncs.forEach((func) => func(diagramCtx));
        drawFunctions.forEach((func) => func(diagramCtx));

        this.returnCanvas(execViewId, canvas, { exceedTime: timeOfExceededSize });
    }

    drawCpuCanvas(canvas, startTime, viewId, disableMargins) {
        const viewData = this.cpuViewData.get(viewId.replace(/\D/g, ""));
        const executionEvents = viewData.executionEvents;
        let ctx = canvas.getContext("2d");
        ctx.font = this.declFont;
        const txtMetrics = ctx.measureText("Gg");
        const txtHeight = txtMetrics.fontBoundingBoxAscent + txtMetrics.fontBoundingBoxDescent;

        // If there is no execution events just return a canvas with text
        if (executionEvents.length == 0) {
            this.postErrorCanvas(canvas, "No events found", viewId);
            return;
        }

        const eventLength = this.calculateEventLength(ctx);
        const drawFuncs = [];
        const yAxisLinesDash = [this.lineDashSize, this.lineDashSize * 4];
        const margin = txtMetrics.width;
        const padding = margin / 2;
        ctx.font = this.diagramFont;
        const axisStart_x = ctx.measureText(executionEvents[executionEvents.length - 1].time).width + padding;
        ctx.font = this.declFont;
        const rects = [];
        let cpuRectId;
        const traversedEvents = [];
        const threads = [];
        const eventsToDraw = [];
        const rectIdToRectName = [];
        const opActiveEvents = [];
        let currentEventPos_y = txtHeight + padding + margin * 2;
        let diagramHeight = currentEventPos_y + eventLength;
        let diagramWidth = axisStart_x;
        const rectsEnd_y = txtHeight + padding + margin;
        const rollback = { lastEventIndex: 0, rects: [], diagramWidth: 0, diagramHeight: 0, time: undefined };
        let diagramSizeExceededTimestamp;
        // Find which obj refs (rects) needs to be displayed and which events for the given time. To properly display this it needs to be calculated from the beginning.
        for (let i = 0; i < executionEvents.length; i++) {
            const event = executionEvents[i];
            // We need to keep track of all OpActive events to later draw correct event arrows
            if (event.eventKind == this.logEvents.opActivate) {
                opActiveEvents.unshift(event);
            }
            traversedEvents.push(event);
            const isBusEvent = this.isBusKind(event.eventKind);
            let opComplete;
            if (!isBusEvent) {
                const thread = this.logEvents.threadCreate != event.eventKind ? threads.find((at) => at.id == event.id) : undefined;
                if (thread) {
                    if (this.logEvents.threadKill == event.eventKind) {
                        threads.splice(threads.indexOf(thread), 1);
                    } else if (event.eventKind == this.logEvents.opActivate) {
                        thread.prevRectIds.push(thread.currentRectId);
                        thread.currentRectId = event.objref;
                    } else if (event.eventKind == this.logEvents.opCompleted) {
                        thread.currentRectId = thread.prevRectIds.length > 0 ? thread.prevRectIds.pop() : thread.currentRectId;
                    }
                }

                cpuRectId = thread
                    ? thread.currentRectId
                    : this.logEvents.threadKill == event.eventKind
                    ? i == 0
                        ? executionEvents[i].rectId
                        : executionEvents[i - 1].rectId
                    : event.objref;

                if (!thread) {
                    threads.push({ id: event.id, currentRectId: cpuRectId, prevRectIds: [] });
                }
            } else if (event.eventKind == this.logEvents.messageCompleted) {
                if (!(this.opnameIdentifier in event)) {
                    // Look back through the traversed events
                    for (let ind = traversedEvents.length - 1; ind >= 0; ind--) {
                        const prevEvent = traversedEvents[ind];
                        if (ind - 1 > 0 && prevEvent.eventKind == this.logEvents.messageRequest && prevEvent.callthr == event.callthr) {
                            // An op complete event needs to be inserted
                            opComplete = {
                                eventKind: this.logEvents.opCompleted,
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
                                (nextEvent.eventKind == this.logEvents.threadSwapIn ||
                                    nextEvent.eventKind == this.logEvents.threadCreate ||
                                    nextEvent.eventKind == this.logEvents.opActivate ||
                                    nextEvent.eventKind == this.logEvents.opCompleted) &&
                                nextEvent.id == event.callthr
                            ) {
                                targetEvent = nextEvent;
                                break;
                            }
                        }
                        if (targetEvent) {
                            event.objref = targetEvent.objref;
                            opComplete = {
                                eventKind: this.logEvents.opCompleted,
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

            // Associate rectangle id with a rectangle name so that it can be used later for events past the start time.
            const bus = isBusEvent ? this.busDeclEvents.find((bde) => bde.id == event.busid) : undefined;
            const rectId = bus ? `${bus.name}_${bus.id}` : cpuRectId;
            if (!rectIdToRectName.find((ritrn) => ritrn.id == rectId)) {
                rectIdToRectName.push({ id: rectId, name: !bus ? event.clnm + `(${rectId})` : bus.name });
            }
            // Associate the event with the rectangle id
            event.rectId = rectId;

            // Only generate draw functions for the events from the chosen start time
            if (Number(event.time) >= startTime) {
                if (i > 0 && executionEvents[i - 1].time < event.time) {
                    // Save the previous state of the canvas so that it can be restored if the current time stamp exceeds the canvas size
                    rollback.rects = [
                        ...rects.map((rect) => ({
                            name: rect.name,
                            margin: rect.margin,
                            width: rect.width,
                            height: rect.height,
                            textHeight: rect.textHeight,
                            busId: rect.busId,
                            rectId: rect.rectId,
                            pos_x: rect.pos_x,
                            pos_y: rect.pos_y,
                            startPos_x: rect.startPos_x,
                        })),
                    ];
                    rollback.lastEventIndex = eventsToDraw.length - 1;
                    rollback.diagramWidth = diagramWidth;
                    rollback.diagramHeight = diagramHeight;
                    rollback.time = executionEvents[i - 1].time;
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
                        ctx.font = this.declFont;
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
                            startPos_x: 0,
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

                let didChangeMargins = false;
                if (!disableMargins) {
                    //Calculate the margin that is needed to the right and left side of the rectangle so that opnames does not clash into other visuals.
                    const prevEvent = eventsToDraw.length > 0 ? eventsToDraw[eventsToDraw.length - 2] : undefined;
                    if (
                        eventsToDraw.length > 1 &&
                        (this.isOperationKind(prevEvent.eventKind) ||
                            (prevEvent.eventKind == this.logEvents.messageCompleted && this.opnameIdentifier in prevEvent) ||
                            prevEvent.eventKind == this.logEvents.messageRequest)
                    ) {
                        let targetRect;

                        if (prevEvent.eventKind == this.logEvents.messageCompleted && this.opnameIdentifier in prevEvent) {
                            targetRect = rects.find((rect) => rect.rectId == prevEvent.objref);
                        } else if (prevEvent.eventKind == this.logEvents.messageRequest) {
                            targetRect = rects.find((rect) => rect.rectId == eventsToDraw[eventsToDraw.length - 2].rectId);
                        } else if (
                            prevEvent.eventKind != this.logEvents.opRequest &&
                            (!(this.opnameIdentifier in eventsToDraw[eventsToDraw.length - 2]) || prevEvent.opname != prevEvent.opname)
                        ) {
                            targetRect = rects.find((rect) => rect.rectId == prevEvent.rectId);
                        } else if (prevEvent.eventKind == this.logEvents.opRequest) {
                            targetRect = rects.find(
                                (rect) => rect.rectId == (event.rectId != prevEvent.rectId ? event.rectId : prevEvent.rectId)
                            );
                        } else {
                            targetRect = rects.find((rect) => rect.rectId == prevEvent.rectId);
                        }

                        const isSelf = targetRect.rectId == prevEvent.rectId;
                        const rectForEvent = rects.find((rect) => rect.rectId == prevEvent.rectId);
                        ctx.font = this.diagramFont;
                        const newMargin =
                            ctx.measureText(this.opnameToShortName(prevEvent.opname)).width - rectForEvent.width / 2 + margin * 2;
                        const targetRectIndex = rects.indexOf(targetRect);

                        if ((isSelf || rects.indexOf(rectForEvent) + 1 == targetRectIndex) && newMargin > rectForEvent.margin.right) {
                            rectForEvent.margin.right = newMargin;
                            didChangeMargins = true;
                        } else if (rects.indexOf(rectForEvent) - 1 == targetRectIndex && newMargin > rectForEvent.margin.left) {
                            rectForEvent.margin.left = newMargin;
                            didChangeMargins = true;
                        }
                    }
                }

                // Update rect positions based on their margins if they have been updated
                if (newRects.length > 0 || didChangeMargins) {
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

                // Validate that events until the current timestamp does not cause the diagram to exceeds its max area or the screen width or height.
                // If it does then rollback to the previous timestamp
                let existingRollbackForTimestamp =
                    rollback.time != undefined &&
                    viewData.startTimesToCanvasStates.has(startTime) &&
                    viewData.startTimesToCanvasStates.get(startTime).time == rollback.time
                        ? viewData.startTimesToCanvasStates.get(startTime)
                        : undefined;

                const rollbackExceedsDiagramSize =
                    rollback.diagramWidth > this.diagramSize.width || rollback.diagramHeight > this.diagramSize.height;

                // It is okay for the diagram to exceed canvas size restrictions as long as atleast one timestamp can be displayed.
                const diagramExceedsCanvasSizeRestrictions =
                    diagramHeight > this.canvasMaxSize ||
                    diagramWidth > this.canvasMaxSize ||
                    diagramHeight * diagramWidth > this.canvasMaxArea;

                if (
                    diagramExceedsCanvasSizeRestrictions ||
                    existingRollbackForTimestamp ||
                    (rollback.time != undefined && rollback.time >= startTime && rollbackExceedsDiagramSize)
                ) {
                    if (!existingRollbackForTimestamp) {
                        viewData.startTimesToCanvasStates.set(startTime, rollback);
                        existingRollbackForTimestamp = rollback;
                    }

                    //TODO: If there is no time defined for the rollback the events for the timestamp cannot fit within the size restrictions of the canvas so the diagram needs to be displayed across multiple canvases
                    if (existingRollbackForTimestamp.time == undefined) {
                        if (disableMargins) {
                            this.postErrorCanvas(
                                canvas,
                                `Events for time ${event.time} cannot fit onto the diagram! Try lowevering the font size.`,
                                viewId
                            );
                        } else {
                            // Temporary mitigation is to call the drawCpuCanvas again but disable margins between obj deployments and let opnames clash to attempt to fit the events within the canvas size restricitons.
                            this.drawCpuCanvas(canvas, startTime, viewId, true);
                        }
                        return;
                    }
                    // Rollback
                    eventsToDraw.splice(existingRollbackForTimestamp.lastEventIndex + 1);
                    diagramSizeExceededTimestamp = existingRollbackForTimestamp.time;
                    rects.splice(0);
                    existingRollbackForTimestamp.rects.forEach((rect) => rects.push(rect));
                    diagramWidth = existingRollbackForTimestamp.diagramWidth;
                    diagramHeight = existingRollbackForTimestamp.diagramHeight;
                    break;
                }

                diagramHeight += eventLength + (opComplete ? eventLength : 0);
                currentEventPos_y += eventLength;
            }
        }

        // Geneate draw functions for the rectangles and their text.
        rects.forEach((rect) =>
            drawFuncs.push(() => {
                ctx.font = this.declFont;
                ctx.fillStyle = this.fontColor;
                ctx.strokeStyle = this.fontColor;
                ctx.lineWidth = this.gridLineWidth;
                ctx.setLineDash(rect.busId == 0 ? [2, 2] : []);
                ctx.strokeRect(rect.startPos_x, margin, rect.width, rect.height);
                ctx.fillText(rect.name, rect.startPos_x + padding, rectsEnd_y - (rect.height - rect.textHeight));
            })
        );

        // Generate draw funcs for x-axis dashed lines
        rects.forEach((rect) => {
            drawFuncs.push(() =>
                this.drawLine(
                    ctx,
                    this.gridLineWidth,
                    yAxisLinesDash,
                    this.fontColor,
                    rect.pos_x,
                    rectsEnd_y + margin,
                    rect.pos_x,
                    eventsToDraw.length * eventLength + rectsEnd_y + margin
                )
            );
        });

        // Generate draw functions for each event
        let currentTime = -1;
        currentEventPos_y = rectsEnd_y + margin;

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
                    ctx.font = this.diagramFont;
                    const txtMeasure = ctx.measureText(axisTxt);
                    this.drawLine(ctx, this.gridLineWidth, [1, 4], this.fontColor, axisStart_x, pos_y, diagramWidth + margin, pos_y);
                    ctx.fillText(
                        axisTxt,
                        axisStart_x - txtMeasure.width - this.eventLineWidth,
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
                    this.diagramFont,
                    this.gridLineWidth,
                    this.eventLineWidth,
                    this.eventWrapperHeight,
                    this.isThreadKind(event.eventKind) ? event.id : this.kindToAbb(event.eventKind),
                    event.eventKind,
                    0,
                    0,
                    eventLength,
                    this.fontColor,
                    this.fontColor
                ).forEach((drawFunc) => drawFunc());

                ctx.restore();
            });

            // Generate draw function for the arrow to/from the event
            let eventHasArrowWithTxt = false;
            if (nextEvent) {
                let targetRect = undefined;
                let targetRectId = nextEvent.eventKind == this.logEvents.replyRequest ? nextEvent.rectId : undefined;
                if (!targetRectId && !(event.rectId == nextEvent.rectId && this.isOperationKind(nextEvent.eventKind))) {
                    // Find the target for the event i.e. an event on another rect.
                    targetRect =
                        event.eventKind == this.logEvents.opRequest
                            ? eventsToDraw
                                  .slice(i + 1, eventsToDraw.length)
                                  .find(
                                      (eve) =>
                                          (eve.eventKind == this.logEvents.opActivate || eve.eventKind == this.logEvents.messageRequest) &&
                                          event.objref == eve.objref
                                  )
                            : event.eventKind == this.logEvents.opActivate && this.isOperationKind(nextEvent.eventKind)
                            ? eventsToDraw
                                  .slice(i + 1, eventsToDraw.length)
                                  .find((eve) => eve.eventKind == this.logEvents.opCompleted && event.opname == eve.opname)
                            : event.eventKind == this.logEvents.opCompleted && nextEvent.eventKind == this.logEvents.opCompleted
                            ? (() => {
                                  return opActiveEvents.find((eve) => eve.opname == nextEvent.opname && eve.rectId == event.rectId)
                                      ? rects.find((rect) => nextEvent.rectId == rect.rectId)
                                      : undefined;
                              }).apply()
                            : undefined;
                    if (targetRect && event.eventKind == this.logEvents.opActivate && targetRect.rectId != nextEvent.rectId) {
                        targetRect = undefined;
                    }

                    targetRectId = targetRect ? targetRect.rectId : undefined;
                }

                // If there is a target for the event then draw the arrow
                if ((targetRectId && targetRectId != event.rectId) || event.eventKind == this.logEvents.messageCompleted) {
                    const isReplyArrow =
                        !(event.eventKind == this.logEvents.messageCompleted && this.opnameIdentifier in event) &&
                        event.eventKind != this.logEvents.opRequest;

                    const nextRect = rects.find(
                        (rect) => rect.rectId == (targetRectId ? targetRectId : isReplyArrow ? nextEvent.rectId : event.objref)
                    );
                    if (nextRect) {
                        const arrwEnd_x =
                            (nextRect.pos_x < currentRect.pos_x ? currentRect.pos_x : nextRect.pos_x) - this.eventWrapperHeight / 2;
                        const arrwStart_x =
                            (nextRect.pos_x < currentRect.pos_x ? nextRect.pos_x : currentRect.pos_x) + this.eventWrapperHeight / 2;

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
                                this.gridLineWidth,
                                isReplyArrow ? [5, 2] : undefined,
                                this.fontColor,
                                nextRect.pos_x < currentRect.pos_x
                            );
                        });

                        // If the arrow is not a reply arrow then draw the opname of the event on the arrow
                        if (!isReplyArrow && nextEvent.eventKind != this.logEvents.replyRequest) {
                            eventHasArrowWithTxt = true;
                            drawFuncs.push(() => {
                                ctx.font = this.diagramFont;
                                const txt = this.opnameToShortName(event.opname);
                                const txtWidth = ctx.measureText(txt).width;
                                ctx.fillText(
                                    txt,
                                    arrwStart_x + (arrwEnd_x - arrwStart_x - txtWidth) / 2,
                                    eventEndPos_y - this.gridLineWidth - 3
                                );
                            });
                        }
                    }
                }
            }

            // Generate draw function for the opname next to the event if needed
            if (
                !eventHasArrowWithTxt &&
                ((prevEvent &&
                    ((event.eventKind == this.logEvents.opCompleted && prevEvent.opname != event.opname) ||
                        (this.isOperationKind(event.eventKind) &&
                            !(this.isOperationKind(prevEvent.eventKind) && prevEvent.opname == event.opname)))) ||
                    (!prevEvent && this.isOperationKind(event.eventKind)))
            ) {
                drawFuncs.push(() => {
                    ctx.font = this.diagramFont;
                    const txtMeasure = ctx.measureText("Gg");
                    const txtHeight = txtMeasure.actualBoundingBoxAscent + txtMeasure.actualBoundingBoxDescent;
                    const txtStart_x = currentRect.pos_x + this.eventWrapperHeight + txtHeight;
                    ctx.fillText(this.opnameToShortName(event.opname), txtStart_x, eventEndPos_y - (eventLength - txtHeight) / 2);
                });
            }

            currentEventPos_y = eventEndPos_y;
        }

        // Generate draw functions for diagram lines between rects and the start of the diagram
        rects.forEach((rect) => {
            drawFuncs.push(() =>
                this.drawLine(
                    ctx,
                    this.gridLineWidth,
                    yAxisLinesDash,
                    this.fontColor,
                    rect.pos_x,
                    rectsEnd_y,
                    rect.pos_x,
                    rectsEnd_y + margin
                )
            );
        });

        // Resize canvas to fit content
        canvas.width = diagramWidth;
        canvas.height = diagramHeight;
        ctx = canvas.getContext("2d");
        // Draw on canvas
        drawFuncs.forEach((drawFunc) => drawFunc());

        this.returnCanvas(viewId, canvas, { exceedTime: diagramSizeExceededTimestamp });
    }

    /**
     *
     * Helper functions
     *
     */

    returnCanvas(viewId, canvas, properties) {
        const ctx = canvas.getContext("2d");
        // Color in the background as a rectangle as the canvas.style.background css property sometimes doesn't work on Linux
        ctx.fillStyle = this.backgroundColor;
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "source-over";
        let returnObj = { msg: viewId, bitmap: canvas.transferToImageBitmap() };
        if (properties) {
            returnObj = { ...returnObj, ...properties };
        }
        self.postMessage(returnObj);
    }

    updateDiagramStyling(
        fontSize,
        fontFamily,
        declFont,
        conjectureViolationFont,
        diagramFont,
        gridLineWidth,
        eventLineWidth,
        conjectureViolationMarkerWidth,
        lineDashSize,
        eventWrapperHeight,
        fontColor,
        conjectureViolationColor,
        themeColors,
        backgroundColor,
        eventKindsToColors
    ) {
        // Reset cached draw functions as these are based on the prior styling
        this.resetViewDataCache();

        this.gridLineWidth = gridLineWidth;
        this.eventLineWidth = eventLineWidth;
        this.themeColors = themeColors;
        this.fontColor = fontColor;
        this.conjectureViolationColor = conjectureViolationColor;
        this.backgroundColor = backgroundColor;
        this.eventKindsToColors = eventKindsToColors;
        // Properties that by default are relative to the above properties unless specified
        this.conjectureViolationMarkerWidth =
            conjectureViolationMarkerWidth == undefined ? gridLineWidth * 3 : conjectureViolationMarkerWidth;
        this.lineDashSize = lineDashSize == undefined ? gridLineWidth * 0.7 : lineDashSize;
        this.eventWrapperHeight = eventWrapperHeight == undefined ? eventLineWidth * 2 + eventLineWidth : eventWrapperHeight;
        this.declFont = declFont == undefined ? `${fontSize * 1.5}px ${fontFamily}` : declFont;
        this.conjectureViolationFont =
            conjectureViolationFont == undefined ? `900 ${fontSize * 1.1}px ${fontFamily}` : conjectureViolationFont;
        this.diagramFont = diagramFont == undefined ? `${fontSize}px ${fontFamily}` : diagramFont;
    }

    postErrorCanvas(canvas, errMsg, msgId) {
        const ctx = canvas.getContext("2d");
        ctx.font = this.declFont;
        ctx.fillStyle = this.fontColor;
        const txtMeasure = ctx.measureText(errMsg);
        const txtHeight = txtMeasure.actualBoundingBoxAscent + txtMeasure.actualBoundingBoxDescent;
        ctx.fillText(errMsg, this.eventLineWidth, txtHeight + this.eventLineWidth * 2);
        self.postMessage({
            msg: msgId,
            bitmap: canvas.transferToImageBitmap(),
            exceedTime: undefined,
        });
    }

    generateExecutionViewData(canvas) {
        const cpuDecls = [];
        const busDecls = [];
        let ctx = canvas.getContext("2d");
        this.execucionViewData.eventLength = this.calculateEventLength(ctx);
        ctx.font = this.declFont;
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
                newDecl.pos_y = nextDeclPos_y - txtHeight / 2 + this.eventLineWidth;
                newDecl.pos_x = undefined;
                newDecl.name = decl.name;

                if (decl.eventKind == this.logEvents.busDecl) {
                    newDecl.fromcpu = undefined;
                    newDecl.tocpu = undefined;
                    busDecls.push(newDecl);
                } else {
                    newDecl.activeThreadsNumb = 0;
                    cpuDecls.push(newDecl);
                }
                const declTextPos_y = nextDeclPos_y;
                this.execucionViewData.declDrawFuncs.push((ctx) => {
                    ctx.font = this.declFont;
                    ctx.fillText(decl.name, declPadding_x, declTextPos_y);
                });
                nextDeclPos_y += declPadding_y;
            });

        // Calculate where events should start on the x-axis
        this.execucionViewData.gridStartPos_x = widestText + declPadding_x * 2;

        // Generate and push draw functions for the diagram
        this.execucionViewData.gridDrawFuncs = this.generateGridDrawFuncs(
            cpuDecls,
            busDecls,
            this.executionEvents,
            declPadding_y / 2,
            nextDeclPos_y - declPadding_y / 2,
            ctx,
            this.diagramFont,
            this.gridLineWidth,
            this.fontColor,
            this.eventLineWidth,
            this.eventWrapperHeight,
            this.execucionViewData.eventLength
        );
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
        // Calculate draw functions for each event for each of the decls
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
            const isBusEvent = this.isBusKind(eventKind);
            // Find the current decl
            let currentDecl;
            if (isBusEvent) {
                if (eventKind != this.logEvents.messageRequest && eventKind != this.logEvents.replyRequest) {
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

            // Look behind and find the decl for which the message complete is a reply to
            if (index > 1 && executionEvents[index - 1].eventKind == this.logEvents.messageCompleted) {
                const events = executionEvents.slice(0, index - 1);
                for (let i = events.length - 1; i >= 0; i--) {
                    const prevEvent = events[i];
                    if (prevEvent.eventKind == this.logEvents.messageRequest || prevEvent.eventKind == this.logEvents.replyRequest) {
                        if (prevEvent.eventKind == this.logEvents.replyRequest && prevEvent.busid == currentBusDecl.id) {
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

            if (eventKind == this.logEvents.opRequest && event.async == false && index + 1 < executionEvents.length) {
                if (!currentDecl.activeThreads) {
                    currentDecl.activeThreads = [];
                }
                const activeThread = currentDecl.activeThreads.find((at) => at.id == event.id);
                if (activeThread) {
                    activeThread.suspended = executionEvents[index + 1].eventKind == this.logEvents.messageRequest;
                } else {
                    currentDecl.activeThreads.push({
                        eventKind: this.logEvents.threadSwapIn,
                        id: event.id,
                        suspended: executionEvents[index + 1].eventKind == this.logEvents.messageRequest,
                    });
                }
            } else if (this.isThreadSwapKind(eventKind)) {
                if (currentDecl.activeThreads) {
                    if (eventKind == this.logEvents.threadSwapOut) {
                        currentDecl.activeThreads.splice(
                            currentDecl.activeThreads.indexOf(currentDecl.activeThreads.find((at) => at.id == event.id)),
                            1
                        );
                    } else {
                        currentDecl.activeThreads.push(event);
                    }
                } else {
                    currentDecl.activeThreads =
                        eventKind == this.logEvents.threadSwapIn || eventKind == this.logEvents.delayedThreadSwapIn ? [event] : [];
                }
            }

            // Generate draw function to mark timestamp on the x-axis line
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
                        [this.lineDashSize, this.lineDashSize * 4],
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

            // TODO: instead of drawing lines for each "event step" this could be optimized to draw a single line between events
            decls.forEach((decl) => {
                // Generate the draw functions for the line between events
                if (decl != currentDecl) {
                    let color = gridLineColor;
                    let lineDash = [this.lineDashSize, this.lineDashSize * 4];
                    let lineWidth = gridLineWidth;
                    const pos_y = decl.pos_y;
                    if (decl.isCpuDecl == true && decl.activeThreads && decl.activeThreads.length > 0) {
                        lineDash = decl.activeThreads.find((at) => at.suspended == true) ? [eventLineWidth * 1.1, eventLineWidth] : [];
                        lineWidth = eventLineWidth;
                        color = this.eventKindsToColors.get(this.logEvents.opActivate);
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
            const hasStopLine = !this.isOperationKind(eventKind);
            const hasStartLine =
                hasStopLine &&
                (!prevDecl || currentDecl.pos_y != prevDecl.pos_y || this.isOperationKind(executionEvents[index - 1].eventKind));
            drawFuncs.push((ctx, startPos_x) =>
                this.generateEventDrawFuncs(
                    ctx,
                    diagramFont,
                    gridLineWidth,
                    eventLineWidth,
                    eventWrapperHeight,
                    this.isThreadKind(eventKind) ? event.id : this.kindToAbb(eventKind),
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

            // Generate draw function for bus arrow
            if (prevDecl && this.isBusKind(eventKind) && eventKind != this.logEvents.messageActivate) {
                const isMsgComplete = eventKind == this.logEvents.messageCompleted;
                const targetPos_y = !isMsgComplete ? prevDecl.pos_y : cpuDecls.find((cpuDecl) => cpuDecl.id == event.tocpu).pos_y;
                const eventPos_y = currentDecl.pos_y;
                const nextEventHasStartLine =
                    isMsgComplete && index < executionEvents.length - 1 && this.isThreadKind(executionEvents[index + 1].eventKind);
                drawFuncs.push((ctx, startPos_x) => {
                    // Draw arrows from/to cpu and bus
                    const end_y = eventPos_y - eventWrapperHeight;
                    const start_y = targetPos_y + (!nextEventHasStartLine || !isMsgComplete ? eventWrapperHeight / 2 : eventWrapperHeight);
                    const pos_x = startPos_x + (isMsgComplete ? eventLength_x : 0);
                    this.drawArrow(ctx, pos_x, start_y, pos_x, end_y, 3, 5, false, gridLineWidth, [], gridLineColor, isMsgComplete);
                });
            }

            // Generate draw function for conjecture violation indication
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

            // Add draw events to the timestamp
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

    generateConjectureViolationDrawFunc(midPos_y, midPos_x, conjectureViolationNames, ctx, radi) {
        const lineStart_y = midPos_y + radi;
        const lineEnd_y = lineStart_y + this.eventLineWidth;
        const drawFuncs = [
            (ctx, startPos_x) => {
                const prevStrokeStyle = ctx.strokeStyle;
                const prevLineWidth = ctx.lineWidth;
                ctx.lineWidth = this.conjectureViolationMarkerWidth;
                ctx.strokeStyle = this.conjectureViolationColor;
                ctx.beginPath();
                ctx.arc(startPos_x + midPos_x, midPos_y, radi, 0, 2 * Math.PI);
                ctx.stroke();
                const lineStart_x = startPos_x + midPos_x;

                this.drawLine(
                    ctx,
                    this.conjectureViolationMarkerWidth,
                    [],
                    this.conjectureViolationColor,
                    lineStart_x,
                    lineStart_y,
                    lineStart_x,
                    lineEnd_y
                );
                ctx.strokeStyle = prevStrokeStyle;
                ctx.lineWidth = prevLineWidth;
            },
        ];
        let nextConjPos_y = lineEnd_y + this.gridLineWidth * 2;
        conjectureViolationNames.forEach((name) => {
            const pos_y = nextConjPos_y;
            const textMeasure = ctx.measureText(name);
            drawFuncs.push((ctx, startPos_x) => {
                const prevFillStyle = ctx.fillStyle;
                const prevLineWidth = ctx.lineWidth;
                const prevFont = ctx.font;
                ctx.lineWidth = this.conjectureViolationMarkerWidth;
                ctx.fillStyle = this.conjectureViolationColor;
                ctx.font = this.conjectureViolationFont;
                ctx.fillText(
                    name,
                    startPos_x + midPos_x - textMeasure.width / 4,
                    pos_y + textMeasure.actualBoundingBoxAscent + textMeasure.actualBoundingBoxDescent
                );
                ctx.fillStyle = prevFillStyle;
                ctx.lineWidth = prevLineWidth;
                ctx.font = prevFont;
            });

            nextConjPos_y += textMeasure.actualBoundingBoxAscent + textMeasure.actualBoundingBoxDescent + this.gridLineWidth * 2;
        });

        return (ctx, startPos_x) => {
            drawFuncs.forEach((func) => func(ctx, startPos_x));
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
        const eventColor = this.eventKindsToColors.get(eventKind);
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

        if (this.isThreadKind(eventKind)) {
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

    calculateEventLength(ctx) {
        // The event length is based on whatever is the widest of "9999" (to fit a high thread number) and any of the abbreviation of the event kinds.
        const prevFont = ctx.font;
        ctx.font = this.diagramFont;
        const threadIdMetrics = ctx.measureText("9999");
        const msgAbbMetrics = ctx.measureText(
            this.eventKinds.map((kind) => this.kindToAbb(kind)).reduce((prev, curr) => (prev.size > curr.size ? prev : curr))
        );
        const txtWidth = threadIdMetrics.width > msgAbbMetrics.width ? threadIdMetrics.width : msgAbbMetrics.width;
        ctx.font = prevFont;
        return txtWidth + this.gridLineWidth * 2 > this.eventWrapperHeight * 2
            ? txtWidth + this.gridLineWidth * 2
            : this.eventWrapperHeight * 2;
    }

    opnameToShortName(opname) {
        return opname.substring(opname.indexOf("`") + 1);
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
        if (this.isThreadSwapKind(eventKind)) {
            if (eventKind == this.logEvents.delayedThreadSwapIn) {
                const lineLength = Math.abs(Math.abs(markerEnd_y) - Math.abs(markerStart_y)) / 2 + halfEventLineWidth;
                const start_x = markerPos_x - lineLength / 2;
                const end_x = markerPos_x + lineLength / 2;
                this.drawLine(ctx, halfEventLineWidth, [], eventColor, start_x, markerEnd_y, end_x, markerEnd_y);
            }

            // Adjust arrow placement and position depending on in/out
            const isSwapIn = eventKind != this.logEvents.threadSwapOut;
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
                eventKind == this.logEvents.threadCreate ? 0 : Math.PI / 4
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

    kindToAbb(eventKind) {
        return eventKind == this.logEvents.threadKill
            ? "tk"
            : eventKind == this.logEvents.threadCreate
            ? "tc"
            : eventKind == this.logEvents.threadSwapOut
            ? "tso"
            : eventKind == this.logEvents.threadSwapIn
            ? "tsi"
            : eventKind == this.logEvents.delayedThreadSwapIn
            ? "dtsi"
            : eventKind == this.logEvents.messageRequest
            ? "mr"
            : eventKind == this.logEvents.replyRequest
            ? "rr"
            : eventKind == this.logEvents.messageActivate
            ? "ma"
            : eventKind == this.logEvents.messageCompleted
            ? "mc"
            : eventKind == this.logEvents.opRequest
            ? "or"
            : eventKind == this.logEvents.opActivate
            ? "oa"
            : eventKind == this.logEvents.opCompleted
            ? "oc"
            : "";
    }

    isThreadKind(eventKind) {
        return (
            eventKind == this.logEvents.threadKill ||
            eventKind == this.logEvents.threadSwapOut ||
            eventKind == this.logEvents.threadSwapIn ||
            eventKind == this.logEvents.threadCreate ||
            eventKind == this.logEvents.delayedThreadSwapIn
        );
    }

    isBusKind(eventKind) {
        return (
            eventKind == this.logEvents.replyRequest ||
            eventKind == this.logEvents.messageCompleted ||
            eventKind == this.logEvents.messageActivate ||
            eventKind == this.logEvents.messageRequest
        );
    }

    isThreadSwapKind(eventKind) {
        return (
            eventKind == this.logEvents.threadSwapIn ||
            eventKind == this.logEvents.threadSwapOut ||
            eventKind == this.logEvents.delayedThreadSwapIn
        );
    }

    isOperationKind(eventKind) {
        return eventKind == this.logEvents.opRequest || eventKind == this.logEvents.opActivate || eventKind == this.logEvents.opCompleted;
    }
}

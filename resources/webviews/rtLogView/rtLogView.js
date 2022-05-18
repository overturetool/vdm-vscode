// SPDX-License-Identifier: GPL-3.0-or-later

const vscode = acquireVsCodeApi();

// Create view container
const viewContainer = document.createElement("div");
viewContainer.id = "viewContainer";
viewContainer.style.height = "100%";
viewContainer.style.width = "100%";
document.body.appendChild(viewContainer);

// Global variables
let backgroundColor;
let declFont;
let graphFont;
let gridLineWidth;
let eventLineWidth;
let eventWrapperHeight;
let busColors = [];

const font = { size: undefined, family: undefined, color: undefined };
const archViewId = "arch";
const execViewId = "exec";
const initMsg = "init";
const editorSettingsChangedMsg = "editorSettingsChanged";
const logData = { cpuDeclEvents: [], busDeclEvents: [], cpusWithEvents: [], executionEvents: [], timeStampsWithData: [] };
const cpuViewData = [];

const BtnColors = {
    primaryBackground: undefined,
    primaryForeground: undefined,
    secondaryBackground: undefined,
    secondaryForeground: undefined,
};
let currentViewId = archViewId;
const views = [];
const buttons = Array.from(document.getElementsByClassName("button"));
const timeSelector = document.getElementById("timeStamp");
timeSelector.onchange = (event) => {
    selectedTime = event.target.value;
    redrawViews(currentViewId);
};
let selectedTime = 0;

// Handle button press
buttons.forEach((btn) => {
    views.push({ id: btn.id, canvas: undefined });
    btn.onclick = function () {
        // Update the pressed button to "pressed" color and the previous pressed button to "standard" color
        setButtonColors([document.getElementById(currentViewId)], btn);
        // Clear the view container
        viewContainer.innerHTML = "";
        // Check if the canvas for the view has already been generated - the btn id is the view id
        const existingView = views.find((vc) => vc.id == btn.id);
        if (!existingView.canvas) {
            existingView.canvas = buildViewCanvas(btn.id, selectedTime);
        }
        viewContainer.appendChild(existingView.canvas);
        currentViewId = btn.id;
    };
});

function redrawViews(currentViewId) {
    viewContainer.innerHTML = "";
    // Remove current canvas from views
    views.forEach((view) => (view.canvas = undefined));
    // Set button colors
    setButtonColors(
        buttons.filter((btn) => btn.id != currentViewId),
        document.getElementById(currentViewId)
    );

    // Rebuild canvas for the current view
    const viewCanvas = buildViewCanvas(currentViewId, selectedTime);
    views.find((view) => view.id == currentViewId).canvas = viewCanvas;
    // Display the canvas (graph)

    viewContainer.appendChild(viewCanvas);
}

// Handle event from extension backend
window.addEventListener("message", (event) => {
    if (event.data.cmd == initMsg) {
        selectedTime = Math.min(...event.data.timeStamps);
        // Handle parsed log data
        logData.cpuDeclEvents = event.data.cpuDecls;
        logData.busDeclEvents = event.data.busDecls;
        logData.cpusWithEvents = event.data.cpusWithEvents;
        logData.executionEvents = event.data.executionEvents;
    }
    // Always check for changes to font and theme
    updateFontAndColors(event.data.scaleWithFont, event.data.matchTheme);
    // A message from the extension backend always results in a rebuild of the canvas
    redrawViews(currentViewId, selectedTime);
});

// Load data and build the view
document.body.onload = vscode.postMessage(initMsg);

/**
 * Class and function definitions
 */

// Class for handling log event kinds
class LogEvent {
    // Event kinds
    static CpuDecl = "CPUdecl";
    static BusDecl = "BUSdecl";
    static ThreadCreate = "ThreadCreate";
    static ThreadSwapIn = "ThreadSwapIn";
    static DelayedThreadSwapIn = "DelayedThreadSwapIn";
    static ThreadSwapOut = "ThreadSwapOut";
    static ThreadKill = "ThreadKill";
    static MessageRequest = "MessageRequest";
    static MessageActivate = "MessageActivate";
    static MessageCompleted = "MessageCompleted";
    static OpActivate = "OpActivate";
    static OpRequest = "OpRequest";
    static OpCompleted = "OpCompleted";
    static ReplyRequest = "ReplyRequest";
    static DeployObj = "DeployObj";

    static eventKindToColor = [
        { kind: this.ThreadCreate, color: this.kindToStandardColor(this.ThreadCreate) },
        { kind: this.ThreadKill, color: this.kindToStandardColor(this.ThreadKill) },
        { kind: this.OpActivate, color: this.kindToStandardColor(this.OpActivate) },
        { kind: this.OpRequest, color: this.kindToStandardColor(this.OpRequest) },
        { kind: this.OpCompleted, color: this.kindToStandardColor(this.OpCompleted) },
        { kind: this.ThreadSwapOut, color: this.kindToStandardColor(this.ThreadSwapOut) },
        { kind: this.ThreadSwapIn, color: this.kindToStandardColor(this.ThreadSwapIn) },
        { kind: this.DelayedThreadSwapIn, color: this.kindToStandardColor(this.DelayedThreadSwapIn) },
        { kind: this.MessageRequest, color: this.kindToStandardColor(this.MessageRequest) },
        { kind: this.ReplyRequest, color: this.kindToStandardColor(this.ReplyRequest) },
        { kind: this.MessageActivate, color: this.kindToStandardColor(this.MessageActivate) },
        { kind: this.MessageCompleted, color: this.kindToStandardColor(this.MessageCompleted) },
    ];

    static kindToAbb(eventKind) {
        return eventKind == this.ThreadKill
            ? "tk"
            : eventKind == this.ThreadCreate
            ? "tc"
            : eventKind == this.ThreadSwapOut
            ? "tso"
            : eventKind == this.ThreadSwapIn
            ? "tsi"
            : eventKind == this.DelayedThreadSwapIn
            ? "dtsi"
            : eventKind == this.MessageRequest
            ? "mr"
            : eventKind == this.ReplyRequest
            ? "rr"
            : eventKind == this.MessageActivate
            ? "ma"
            : eventKind == this.MessageCompleted
            ? "mc"
            : eventKind == this.OpRequest
            ? "or"
            : eventKind == this.OpActivate
            ? "oa"
            : eventKind == this.OpCompleted
            ? "oc"
            : "";
    }

    static getKindsAbbs() {
        return this.eventKindToColor.map((ektc) => this.kindToAbb(ektc.kind));
    }

    static kindToStandardColor(eventKind) {
        return eventKind == this.ThreadKill
            ? "#a1260d"
            : eventKind == this.ThreadCreate
            ? "#388a34"
            : eventKind == this.ThreadSwapOut
            ? "#be8700"
            : eventKind == this.ThreadSwapIn
            ? "#bf8803"
            : eventKind == this.DelayedThreadSwapIn
            ? "#d186167d"
            : eventKind == this.MessageRequest
            ? "#808080"
            : eventKind == this.ReplyRequest
            ? "#737373"
            : eventKind == this.MessageActivate
            ? "#D0D0D0"
            : eventKind == this.MessageCompleted
            ? "#B5B5B5"
            : "#007acc";
    }

    static isThreadKind(eventKind) {
        return (
            eventKind == this.ThreadKill ||
            eventKind == this.ThreadSwapOut ||
            eventKind == this.ThreadSwapIn ||
            eventKind == this.ThreadCreate ||
            eventKind == this.DelayedThreadSwapIn
        );
    }

    static isBusKind(eventKind) {
        return (
            eventKind == this.ReplyRequest ||
            eventKind == this.MessageCompleted ||
            eventKind == this.MessageActivate ||
            eventKind == this.MessageRequest
        );
    }

    static isThreadSwapKind(eventKind) {
        return eventKind == this.ThreadSwapIn || eventKind == this.ThreadSwapOut || eventKind == this.DelayedThreadSwapIn;
    }

    static isOperationKind(eventKind) {
        return eventKind == this.OpRequest || eventKind == this.OpActivate || eventKind == this.OpCompleted;
    }
}

/**
 *
 * Vies canvas generation functions
 *
 */

function generateExecCanvas(cpuDeclEvents, busDeclEvents, executionEvents, startTime) {
    const canvas = generateEmptyCanvas();

    const drawFuncs = [];
    const cpuDecls = [];
    const busDecls = [];
    let ctx = canvas.getContext("2d");
    const eventLength_x = calculateEventLength(ctx);
    ctx.font = declFont;
    const declTextMetrics = ctx.measureText("Gg");
    const declPadding_y = (declTextMetrics.fontBoundingBoxAscent + declTextMetrics.fontBoundingBoxDescent) * 2;
    const declPadding_x = declPadding_y / 4;

    // Calculate decls placement and push their draw functions
    let widestText = 0;
    let nextDeclPos_y = declPadding_y;
    cpuDeclEvents
        .slice()
        .reverse()
        .concat(busDeclEvents)
        .forEach((decl) => {
            const txtMetrics = ctx.measureText(decl.name);
            if (txtMetrics.width > widestText) {
                widestText = txtMetrics.width;
            }

            const txtHeight = txtMetrics.fontBoundingBoxAscent + txtMetrics.fontBoundingBoxDescent;
            const newDecl = {};
            newDecl.id = decl.id;
            newDecl.events = [];
            newDecl.y_pos = nextDeclPos_y - txtHeight / 2 + eventLineWidth;
            newDecl.x_pos = undefined;
            newDecl.name = decl.name;

            if (decl.eventKind == LogEvent.BusDecl) {
                newDecl.fromcpu = undefined;
                newDecl.tocpu = undefined;
                busDecls.push(newDecl);
            } else {
                newDecl.activeThreadsNumb = 0;
                cpuDecls.push(newDecl);
            }
            const declTextPos_y = nextDeclPos_y;
            drawFuncs.push(() => {
                ctx.font = declFont;
                ctx.fillText(decl.name, declPadding_x, declTextPos_y);
            });
            nextDeclPos_y += declPadding_y;
        });

    // Calculate where events should start on the x-axis
    const graphStartPos_x = widestText + declPadding_x * 2;
    cpuDecls.concat(busDecls).forEach((decl) => (decl.x_pos = graphStartPos_x));

    // Generate and push draw functions for the graph
    const graph = generateEventGraph(
        cpuDecls,
        busDecls,
        executionEvents,
        declPadding_y / 2,
        graphStartPos_x,
        nextDeclPos_y - declPadding_y / 2,
        ctx,
        graphFont,
        gridLineWidth,
        font.color,
        eventLineWidth,
        eventWrapperHeight,
        eventLength_x,
        startTime
    );
    drawFuncs.push(...graph.drawFuncs);

    if (graph.index) {
        console.log("CAPPED AT TIME: " + executionEvents[graph.index].time);
    }

    // Generate and push draw functions for the legend
    const legend = generateEventKindsLegend(
        ctx,
        graphFont,
        eventLineWidth,
        gridLineWidth,
        font.color,
        declPadding_x,
        eventLength_x,
        eventWrapperHeight,
        graph.endPos_y + declPadding_y,
        graph.eventKinds
    );
    drawFuncs.push(...legend.drawFuncs);

    // Resize canvas to fit content
    canvas.width = graph.endPos_x + graphStartPos_x;
    canvas.height = legend.endPos_y;
    ctx = canvas.getContext("2d");
    ctx.fillStyle = font.color;

    // Draw visuals on canvas
    drawFuncs.forEach((func) => func());

    return canvas;
}

function generateCpuCanvas(executionEvents, busDeclEvents, startTime) {
    let index = 0;
    if (startTime > 0) {
        for (; index < executionEvents.length; index++) {
            if (executionEvents[index].time >= startTime) {
                break;
            }
        }
    }
    const eventFromStartTime = index > 0 ? executionEvents.slice(index) : executionEvents;

    const canvas = generateEmptyCanvas();
    let ctx = canvas.getContext("2d");
    const eventLength_y = calculateEventLength(ctx);
    const drawFuncs = [];
    const yAxisLinesDash = [1, 4];
    ctx.font = declFont;
    const txtMetrics = ctx.measureText("Gg");
    const txtHeight = txtMetrics.fontBoundingBoxAscent + txtMetrics.fontBoundingBoxDescent;
    const margin = txtMetrics.width;
    const padding = margin / 2;
    ctx.font = graphFont;
    const axisStart_x = ctx.measureText(eventFromStartTime[eventFromStartTime.length - 1].time).width + padding;
    ctx.font = declFont;
    const rects = [];

    // Each unique obj deployment that is referenced by an event should be converted to a rectangle to display. These should be pushed after the bus rectangles.
    let cpuRectId;
    const traversedEvents = [];
    const threads = [];
    const eventsToDraw = [];
    const rectIdToRectName = [];
    for (let i = 0; i < executionEvents.length; i++) {
        const event = executionEvents[i];
        traversedEvents.push(event);
        const isBusEvent = LogEvent.isBusKind(event.eventKind);
        let opComplete;
        if (!isBusEvent) {
            const thread = LogEvent.ThreadCreate != event.eventKind ? threads.find((at) => at.id == event.id) : undefined;
            if (thread) {
                if (LogEvent.ThreadKill == event.eventKind) {
                    threads.splice(threads.indexOf(thread), 1);
                } else if (event.eventKind == LogEvent.OpActivate) {
                    thread.prevRectIds.push(thread.currentRectId);
                    thread.currentRectId = event.objref;
                } else if (event.eventKind == LogEvent.OpCompleted) {
                    thread.currentRectId = thread.prevRectIds.length > 0 ? thread.prevRectIds.pop() : thread.currentRectId;
                }
            }

            cpuRectId = thread
                ? thread.currentRectId
                : LogEvent.ThreadKill == event.eventKind
                ? i == 0
                    ? executionEvents[i].rectId
                    : executionEvents[i - 1].rectId
                : event.objref;

            if (!thread) {
                threads.push({ id: event.id, currentRectId: cpuRectId, prevRectIds: [] });
            }
        } else if (event.eventKind == LogEvent.MessageCompleted) {
            if (!("opname" in event)) {
                for (let ind = traversedEvents.length - 1; ind >= 0; ind--) {
                    const prevEvent = traversedEvents[ind];
                    if (ind - 1 > 0 && prevEvent.eventKind == LogEvent.MessageRequest && prevEvent.callthr == event.callthr) {
                        opComplete = {
                            eventKind: LogEvent.OpCompleted,
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
                            (nextEvent.eventKind == LogEvent.ThreadSwapIn ||
                                nextEvent.eventKind == LogEvent.ThreadCreate ||
                                nextEvent.eventKind == LogEvent.OpActivate ||
                                nextEvent.eventKind == LogEvent.OpCompleted) &&
                            nextEvent.id == event.callthr
                        ) {
                            targetEvent = nextEvent;
                            break;
                        }
                    }
                    if (targetEvent) {
                        opComplete = {
                            eventKind: LogEvent.OpCompleted,
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
        const rectId = isBusEvent ? busDeclEvents.find((bde) => bde.id == event.busid).name : cpuRectId;
        if (!rectIdToRectName.find((ritc) => ritc.id == rectId)) {
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

            // Generate rectangle if it doesnt exist.
            let currentRect = rects.find((rect) => rect.rectId == rectId);
            if (!currentRect) {
                const rectName = rectIdToRectName.find((ritc) => ritc.id == rectId).name;
                ctx.font = declFont;
                currentRect = {
                    name: rectName,
                    margin: { right: margin, left: margin },
                    width: ctx.measureText(rectName).width + padding * 2,
                    height: txtHeight + padding,
                    textHeight: txtHeight,
                    busId: isBusEvent ? event.busid : undefined,
                    rectId: rectId,
                    x_pos: 0,
                    y_pos: txtHeight + padding + margin * 2,
                };
                let index = 0;
                for (; index < rects.length; index++) {
                    const rect = rects[index];
                    if (currentRect.busId != undefined) {
                        if (rect.busId == undefined || currentRect.busId > rect.busId) {
                            break;
                        }
                    } else {
                        if (rect.busId == undefined && (currentRect.rectId > rect.rectId || isNaN(currentRect.rectId))) {
                            break;
                        }
                    }
                }
                rects.splice(index, 0, currentRect);
            }

            // Calculate the margin that is needed to the right and left side of the rectangle so that opnames does not clash into other visuals.
            if (
                (LogEvent.isOperationKind(event.eventKind) || (event.eventKind == LogEvent.MessageCompleted && "opname" in event)) &&
                i < executionEvents.length - 1
            ) {
                const targetRectIndex = rects.indexOf(
                    rects.find(
                        (rect) =>
                            rect.rectId ==
                            (LogEvent.isBusKind(executionEvents[i + 1].eventKind)
                                ? busDeclEvents.find((bde) => bde.id == executionEvents[i + 1].busid).name
                                : event.objref)
                    )
                );
                ctx.font = graphFont;
                const rectMargin = ctx.measureText(event.opname).width - currentRect.width / 2;
                if (
                    (rects.indexOf(currentRect) + 1 == targetRectIndex || rects.indexOf(currentRect) == targetRectIndex) &&
                    currentRect.margin.right < rectMargin
                ) {
                    currentRect.margin.right = rectMargin;
                } else if (rects.indexOf(currentRect) - 1 == targetRectIndex && currentRect.margin.left < rectMargin) {
                    currentRect.margin.left = rectMargin;
                }
            }
        }
    }

    // Define where the rectangles end
    const rectEndPos_y = txtHeight + padding + margin;

    // Geneate draw functions for the rectangles and their text
    let graphEnd_x = axisStart_x;
    const prevRects = [];
    for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        const rectStartPos_x =
            graphEnd_x +
            eventLength_y +
            (i == 0 ? 0 : rects[i - 1].margin.right > rect.margin.left ? 0 : rect.margin.left - rects[i - 1].margin.right);
        drawFuncs.push(() => {
            ctx.font = declFont;
            ctx.fillStyle = font.color;
            ctx.strokeStyle = font.color;
            ctx.lineWidth = font.size / 10 < 1 ? 1 : Math.floor(font.size / 10);
            ctx.setLineDash(rect.busId ? [2, 2] : []);
            ctx.strokeRect(rectStartPos_x, margin, rect.width, rect.height);
            ctx.fillText(rect.name, rectStartPos_x + padding, rectEndPos_y - (rect.height - rect.textHeight));
        });

        rect.x_pos = rectStartPos_x + rect.width / 2;
        graphEnd_x = rectStartPos_x + rect.width + rect.margin.right;
        prevRects.push(rect.rectId);
    }

    // Generate draw functions for each event
    let currentTime = -1;
    let lastEventPos_y = 0;
    let currentPos_y = rectEndPos_y + margin;
    const eventKinds = [];
    const filteredEvents = eventsToDraw;
    const prevOpEvents = [];
    for (let i = 0; i < filteredEvents.length; i++) {
        const event = filteredEvents[i];

        if (LogEvent.isOperationKind(event.eventKind)) {
            prevOpEvents.unshift(event);
        }

        const nextEvent = i < filteredEvents.length - 1 ? filteredEvents[i + 1] : undefined;
        const prevEvent = i > 0 ? filteredEvents[i - 1] : undefined;
        const eventStartPos_y = currentPos_y;
        const eventEndPos_y = eventStartPos_y + eventLength_y;
        const currentRect = rects.find((rect) => rect.rectId == event.rectId);
        rects.forEach((rect) => {
            if (rect.rectId != currentRect.rectId) {
                drawFuncs.push(() =>
                    drawLine(ctx, gridLineWidth, yAxisLinesDash, font.color, rect.x_pos, eventStartPos_y, rect.x_pos, eventEndPos_y)
                );
            }
        });

        // Push draw functions for graph line along the y-axis
        if (currentTime != event.time) {
            const pos_y = currentPos_y;
            const axisTxt = event.time;
            drawFuncs.push(() => {
                ctx.font = graphFont;
                const txtMeasure = ctx.measureText(axisTxt);
                drawLine(ctx, gridLineWidth, [1, 4], font.color, axisStart_x, pos_y, graphEnd_x + margin, pos_y);
                ctx.fillText(
                    axisTxt,
                    axisStart_x - txtMeasure.width - eventLineWidth,
                    pos_y + (txtMeasure.actualBoundingBoxAscent + txtMeasure.actualBoundingBoxDescent) / 2
                );
            });

            // Update time
            currentTime = event.time;
        }
        // Push draw function for the event
        drawFuncs.push(() => {
            ctx.save();
            ctx.translate(currentRect.x_pos, eventStartPos_y);
            ctx.rotate(Math.PI / 2);

            generateEventDrawFuncs(
                ctx,
                graphFont,
                gridLineWidth,
                eventLineWidth,
                eventWrapperHeight,
                LogEvent.isThreadKind(event.eventKind) ? event.id : LogEvent.kindToAbb(event.eventKind),
                event.eventKind,
                0,
                0,
                eventLength_y,
                font.color,
                font.color,
                undefined
            ).forEach((drawFunc) => drawFunc());

            ctx.restore();
        });

        // Push draw function for the arrow to/from event
        let eventHasArrowWithTxt = false;
        let isDelayedOpComplete =
            event.eventKind == LogEvent.OpCompleted &&
            prevEvent &&
            nextEvent &&
            prevEvent.opname != event.opname &&
            nextEvent.opname != event.opname;

        if (nextEvent) {
            let targetRect = undefined;
            let targetRectId = nextEvent.eventKind == LogEvent.ReplyRequest ? nextEvent.rectId : undefined;
            if (!targetRectId && !(event.rectId == nextEvent.rectId && LogEvent.isOperationKind(nextEvent.eventKind))) {
                targetRect =
                    event.eventKind == LogEvent.OpRequest
                        ? filteredEvents
                              .slice(i + 1, filteredEvents.length)
                              .find(
                                  (eve) =>
                                      (eve.eventKind == LogEvent.OpActivate || eve.eventKind == LogEvent.MessageRequest) &&
                                      event.opname == eve.opname
                              )
                        : event.eventKind == LogEvent.OpActivate && LogEvent.isOperationKind(nextEvent.eventKind)
                        ? filteredEvents
                              .slice(i + 1, filteredEvents.length)
                              .find((eve) => eve.eventKind == LogEvent.OpCompleted && event.opname == eve.opname)
                        : event.eventKind == LogEvent.OpCompleted && nextEvent.eventKind == LogEvent.OpCompleted
                        ? (() => {
                              const prevOaRect = prevOpEvents.find(
                                  (eve) => eve.eventKind == LogEvent.OpActivate && eve.opname == nextEvent.opname
                              );
                              return prevOaRect && prevOaRect.rectId == event.rectId
                                  ? rects.find((rect) => nextEvent.rectId == rect.rectId)
                                  : undefined;
                          }).apply()
                        : undefined;
                if (targetRect && event.eventKind == LogEvent.OpActivate && targetRect.rectId != nextEvent.rectId) {
                    targetRect = undefined;
                }

                targetRectId = targetRect ? targetRect.rectId : undefined;
            }

            // If there is another target for the event then draw the arrow
            if ((targetRectId && targetRectId != event.rectId) || event.eventKind == LogEvent.MessageCompleted) {
                const isReplyArrow =
                    !(event.eventKind == LogEvent.MessageCompleted && "opname" in event) && event.eventKind != LogEvent.OpRequest;

                const nextRect = rects.find(
                    (rect) => rect.rectId == (targetRectId ? targetRectId : isReplyArrow ? nextEvent.rectId : event.objref)
                );
                const arrwEnd_x = (nextRect.x_pos < currentRect.x_pos ? currentRect.x_pos : nextRect.x_pos) - eventWrapperHeight;
                const arrwStart_x = (nextRect.x_pos < currentRect.x_pos ? nextRect.x_pos : currentRect.x_pos) + eventWrapperHeight;

                drawFuncs.push(() => {
                    drawArrow(
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
                        font.color,
                        nextRect.x_pos < currentRect.x_pos
                    );
                });

                if (!isReplyArrow && nextEvent.eventKind != LogEvent.ReplyRequest) {
                    eventHasArrowWithTxt = true;
                    drawFuncs.push(() => {
                        ctx.font = graphFont;
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

        // Push draw function for the opname if needed
        if (
            prevEvent &&
            (isDelayedOpComplete ||
                (!eventHasArrowWithTxt &&
                    LogEvent.isOperationKind(event.eventKind) &&
                    !(LogEvent.isOperationKind(prevEvent.eventKind) && prevEvent.opname == event.opname)))
        ) {
            drawFuncs.push(() => {
                ctx.font = graphFont;
                const txtMeasure = ctx.measureText("Gg");
                const txtHeight = txtMeasure.actualBoundingBoxAscent + txtMeasure.actualBoundingBoxDescent;
                const txtStart_x = currentRect.x_pos + eventWrapperHeight + txtHeight;
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

    // Push draw functions for graph lines along the x-axis
    rects.forEach((rect) => {
        drawFuncs.push(() =>
            drawLine(ctx, gridLineWidth, yAxisLinesDash, font.color, rect.x_pos, rectEndPos_y, rect.x_pos, rectEndPos_y + margin)
        );
        drawFuncs.push(() =>
            drawLine(ctx, gridLineWidth, yAxisLinesDash, font.color, rect.x_pos, lastEventPos_y, rect.x_pos, lastEventPos_y + eventLength_y)
        );
    });

    // Push draw functions for the legend
    const legend = generateEventKindsLegend(
        ctx,
        graphFont,
        eventLineWidth,
        gridLineWidth,
        font.color,
        (txtHeight * 2) / 4,
        eventLength_y,
        eventWrapperHeight,
        lastEventPos_y + eventLength_y * 2 + margin,
        eventKinds
    );
    drawFuncs.push(...legend.drawFuncs);

    // Resize canvas to fit content
    canvas.width = graphEnd_x + margin;
    canvas.height = legend.endPos_y;
    ctx = canvas.getContext("2d");

    // Draw on canvas
    drawFuncs.forEach((drawFunc) => drawFunc());

    return canvas;
}

function generateArchCanvas(cpuDeclEvents, busDeclEvents) {
    const canvas = generateEmptyCanvas();

    // Set text style to calculate text sizes
    let ctx = canvas.getContext("2d");
    ctx.font = declFont;

    const txtMeasure = ctx.measureText("Gg");
    const textHeight = txtMeasure.actualBoundingBoxAscent + txtMeasure.actualBoundingBoxDescent;
    const margin = txtMeasure.width;
    const padding = margin / 2;
    const rectBottomPos_y = textHeight + padding * 2 + margin;
    let maxBusTxtWidth = margin;
    busDeclEvents.forEach((busdecl) => {
        // The startig position for the rectangle on the x-axis should be max text width + predefined margin
        const metrics = ctx.measureText(busdecl.name);
        const totalWidth = metrics.width + margin;
        if (totalWidth > maxBusTxtWidth) {
            maxBusTxtWidth = totalWidth;
        }
    });
    const busTextPosInc_y = textHeight * 2;

    // Calculate position for the rectangles and the text inside
    let nextRectPos_x = maxBusTxtWidth;
    const rects = cpuDeclEvents.map((cpud) => {
        const rectWidth = ctx.measureText(cpud.name).width + padding * 2;

        const rect = {
            text: cpud.name,
            id: cpud.id,
            start: nextRectPos_x,
            width: rectWidth,
            height: textHeight + padding * 2,
            textHeight: textHeight,
        };
        nextRectPos_x += rectWidth + margin;
        return rect;
    });

    // Resize canvas to fit content
    canvas.height = rectBottomPos_y + busTextPosInc_y * busDeclEvents.length + textHeight + margin;
    canvas.width = nextRectPos_x;

    // Get context after resize
    ctx = canvas.getContext("2d");
    ctx.font = declFont;
    ctx.fillStyle = ctx.strokeStyle = font.color;
    ctx.lineWidth = gridLineWidth;

    // Draw the rectangles and text
    rects.forEach((rect) => {
        ctx.setLineDash(rect.id == 0 ? [2, 2] : []);
        ctx.strokeRect(rect.start, margin, rect.width, rect.height);
        ctx.fillText(rect.text, rect.start + padding, rectBottomPos_y - padding);
    });

    // Concat all connections for each rectangle
    const rectConnections = [];
    busDeclEvents.forEach((busdecl) => {
        [busdecl.topo.from].concat(busdecl.topo.to).forEach((id) => {
            const existingRectCon = rectConnections.find((rect) => rect.id == id);
            if (existingRectCon) {
                existingRectCon.connections += 1;
            } else {
                rectConnections.push({ id: id, connections: 1, established: 0 });
            }
        });
    });

    // Draw the connections between rectangles and place the name for each bus
    let nextBusNamePos_y = rectBottomPos_y + busTextPosInc_y;
    for (let i = 0; i < busDeclEvents.length; i++) {
        const bus = busDeclEvents[i];

        // Setup color for and style for the connection line
        ctx.beginPath();
        ctx.fillStyle = ctx.strokeStyle = i < busColors.length - 1 ? busColors[i] : font.color;
        ctx.setLineDash(bus.id == 0 ? [2, 2] : []);

        // Draw bus connections between rectangles
        const fromRect = rects.find((rect) => rect.id == bus.topo.from);
        const fromRectConn = rectConnections.find((rect) => rect.id == bus.topo.from);

        // Make sure that lines are spaced evenly on the "from" rectangle
        const lineOnFromRectPos_x = (fromRect.width / (fromRectConn.connections + 1)) * ++fromRectConn.established + fromRect.start;

        // Draw outgoing part of the line
        ctx.moveTo(lineOnFromRectPos_x, rectBottomPos_y);
        ctx.lineTo(lineOnFromRectPos_x, nextBusNamePos_y);

        // Draw the rest of the lines connecting the outgoing part
        bus.topo.to.forEach((toId) => {
            const toRect = rects.find((rect) => rect.id == toId);
            const toRectConn = rectConnections.find((rect) => rect.id == toId);

            // Make sure that lines are spaced evenly on the "to" rectangle
            const lineOnToRectPos_x = (toRect.width / (toRectConn.connections + 1)) * ++toRectConn.established + toRect.start;

            // Draw the line from the latest "lineTo" position
            ctx.lineTo(lineOnToRectPos_x, nextBusNamePos_y);
            ctx.lineTo(lineOnToRectPos_x, rectBottomPos_y);
            ctx.stroke();

            // Reset to the outgoing line from this rectangle
            ctx.moveTo(lineOnToRectPos_x, nextBusNamePos_y);
        });

        // Draw the name of the bus
        ctx.fillText(bus.name, margin, nextBusNamePos_y + textHeight / 2);

        // Increment y position for next bus name
        nextBusNamePos_y += busTextPosInc_y;
    }
    return canvas;
}

/**
 *
 * Generate helper functions
 *
 */
function generateEmptyCanvas() {
    const canvas = document.createElement("CANVAS");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.background = backgroundColor;

    return canvas;
}

function calculateEventLength(ctx) {
    const prevFont = ctx.font;
    ctx.font = graphFont;
    const threadIdMetrics = ctx.measureText("9999");
    const msgAbbMetrics = ctx.measureText(LogEvent.getKindsAbbs().reduce((prev, curr) => (prev.size > curr.size ? prev : curr)));
    const txtWidth = threadIdMetrics.width > msgAbbMetrics.width ? threadIdMetrics.width : msgAbbMetrics.width;
    ctx.font = prevFont;
    return txtWidth + gridLineWidth * 2 > eventWrapperHeight * 2 ? txtWidth + gridLineWidth * 2 : eventWrapperHeight * 2;
}

function generateEventKindsLegend(
    ctx,
    graphFont,
    eventLineWidth,
    gridLineWidth,
    gridLineColor,
    elementPadding,
    eventLength_x,
    eventWrapperHeight,
    startPos_y,
    eventKinds
) {
    // Calculate placement of legend and its visuals
    ctx.font = graphFont;
    let nextLegendElementPos_y = startPos_y;
    const drawFuncs = [];
    const lgndTxtMetrics = ctx.measureText(eventKinds[0]);
    const txtHeight = lgndTxtMetrics.fontBoundingBoxAscent + lgndTxtMetrics.fontBoundingBoxDescent;
    eventKinds
        .sort((a, b) => a.localeCompare(b))
        .forEach((eventKind) => {
            const elementPos_y = nextLegendElementPos_y;
            drawFuncs.push(
                ...generateEventDrawFuncs(
                    ctx,
                    graphFont,
                    gridLineWidth,
                    eventLineWidth,
                    eventWrapperHeight,
                    LogEvent.isThreadKind(eventKind) ? undefined : LogEvent.kindToAbb(eventKind),
                    eventKind,
                    elementPadding,
                    elementPos_y,
                    elementPadding + eventLength_x - gridLineWidth * 2,
                    gridLineColor,
                    gridLineColor,
                    undefined
                )
            );

            drawFuncs.push(() =>
                ctx.fillText(eventKind.replace(/([A-Z])/g, " $1").trim(), elementPadding + eventLength_x + eventLineWidth, elementPos_y)
            );

            nextLegendElementPos_y += txtHeight * 2;
        });

    return { endPos_y: nextLegendElementPos_y, drawFuncs: drawFuncs };
}

function generateEventGraph(
    cpuDecls,
    busDecls,
    logEvents,
    graphStartPos_y,
    graphStartPos_x,
    gridHeight,
    graphCtx,
    graphFont,
    gridLineWidth,
    gridLineColor,
    eventLineWidth,
    eventWrapperHeight,
    eventLength_x,
    startTime
) {
    // Calculate draw functions for each event for the decls
    let graphEnd_y = gridHeight;
    let currentBusDecl = undefined;
    let currentTime = -1;
    let prevDecl;
    let lastEventPos_x = 0;
    let eventStartPos_x = graphStartPos_x;
    const decls = cpuDecls.concat(busDecls);
    const drawFuncs = [];
    const knownEventKinds = [];
    let index = 0;
    for (; index < logEvents.length; index++) {
        const event = logEvents[index];
        const eventKind = event.eventKind;
        const isBusEvent = LogEvent.isBusKind(eventKind);
        // Find the current decl
        let currentDecl;
        if (isBusEvent) {
            if (eventKind != LogEvent.MessageRequest && eventKind != LogEvent.ReplyRequest) {
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
        if (index > 1 && logEvents[index - 1].eventKind == LogEvent.MessageCompleted) {
            const events = logEvents.slice(0, index - 1);
            for (let i = events.length - 1; i >= 0; i--) {
                const prevEvent = events[i];
                if (prevEvent.eventKind == LogEvent.MessageRequest || prevEvent.eventKind == LogEvent.ReplyRequest) {
                    if (prevEvent.eventKind == LogEvent.ReplyRequest && prevEvent.busid == currentBusDecl.id) {
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

        if (
            eventKind == LogEvent.OpRequest &&
            event.async == false &&
            index + 1 < logEvents.length &&
            logEvents[index + 1].eventKind == LogEvent.MessageRequest
        ) {
            if (!currentDecl.activeThreads) {
                currentDecl.activeThreads = [];
            }
            const activeThread = currentDecl.activeThreads.find((at) => at.id == event.id);
            if (activeThread) {
                activeThread.suspended = true;
            } else {
                currentDecl.activeThreads.push({ eventKind: LogEvent.ThreadSwapIn, id: event.id, suspended: true });
            }
        } else if (LogEvent.isThreadSwapKind(eventKind)) {
            if (currentDecl.activeThreads) {
                if (eventKind == LogEvent.ThreadSwapOut) {
                    currentDecl.activeThreads.splice(
                        currentDecl.activeThreads.indexOf(currentDecl.activeThreads.find((at) => at.id == event.id)),
                        1
                    );
                } else {
                    currentDecl.activeThreads.push(event);
                }
            } else {
                currentDecl.activeThreads = eventKind == LogEvent.ThreadSwapIn || eventKind == LogEvent.DelayedThreadSwapIn ? [event] : [];
            }
        }

        if (event.time >= startTime) {
            const eventEndPos_x = eventStartPos_x + eventLength_x;
            decls.forEach((decl) => {
                if (decl != currentDecl) {
                    let color = gridLineColor;
                    let lineDash = [1, 4];
                    let lineWidth = gridLineWidth;
                    const x_end = eventStartPos_x + eventLength_x;
                    const x_start = eventStartPos_x - gridLineWidth;
                    const y_pos = decl.y_pos;
                    if (decl.isCpuDecl == true && decl.activeThreads && decl.activeThreads.length > 0) {
                        lineDash = decl.activeThreads.find((at) => at.suspended == true) ? [4, 4] : [];
                        lineWidth = eventLineWidth;
                        color = LogEvent.eventKindToColor.find((ektc) => ektc.kind == LogEvent.OpActivate).color;
                    }
                    drawFuncs.push(() => drawLine(graphCtx, lineWidth, lineDash, color, x_start, y_pos, x_end, y_pos));
                }
            });

            // Generate draw function for the x-axis line
            if (currentTime < event.time) {
                // Add function that draws the visuals for the x-axis line
                graphCtx.font = graphFont;
                const txtWidth = graphCtx.measureText(event.time).width;
                const lineEndPos_y = gridHeight;
                const linePox_x = eventStartPos_x;
                graphEnd_y = lineEndPos_y + txtWidth;
                drawFuncs.push(() => {
                    graphCtx.font = graphFont;
                    drawLine(graphCtx, gridLineWidth, [1, 4], gridLineColor, linePox_x, graphStartPos_y, linePox_x, lineEndPos_y);

                    graphCtx.save();
                    graphCtx.translate(linePox_x, lineEndPos_y);
                    graphCtx.rotate(Math.PI / 2);
                    graphCtx.fillText(event.time, eventLineWidth, 0);
                    graphCtx.restore();
                });

                // Update time
                currentTime = event.time;
            }

            if (eventEndPos_x > 65000) {
                // A canvas wider than ~65175 cannot be shown in VSCode so break out
                break;
            }

            // Generate visual for event and add the draw function
            drawFuncs.push(
                ...generateEventDrawFuncs(
                    graphCtx,
                    graphFont,
                    gridLineWidth,
                    eventLineWidth,
                    eventWrapperHeight,
                    LogEvent.isThreadKind(eventKind) ? event.id : LogEvent.kindToAbb(eventKind),
                    eventKind,
                    eventStartPos_x,
                    currentDecl.y_pos,
                    eventEndPos_x,
                    gridLineColor,
                    gridLineColor,
                    LogEvent.isBusKind(eventKind)
                        ? prevDecl && (eventKind == LogEvent.MessageRequest || eventKind == LogEvent.ReplyRequest)
                            ? prevDecl.y_pos
                            : eventKind == LogEvent.MessageCompleted
                            ? cpuDecls.find((cpuDecl) => cpuDecl.id == event.tocpu).y_pos
                            : undefined
                        : undefined
                )
            );

            // Generate draw function for the event "wrapper line"
            if (index != logEvents.length - 1 && !LogEvent.isOperationKind(eventKind)) {
                const begin_y = currentDecl.y_pos - eventWrapperHeight / 2;
                const end_y = currentDecl.y_pos + eventWrapperHeight / 2;
                drawFuncs.push(() => drawLine(graphCtx, gridLineWidth, [], gridLineColor, eventEndPos_x, begin_y, eventEndPos_x, end_y));

                if (
                    !prevDecl ||
                    currentDecl.y_pos != prevDecl.y_pos ||
                    (index > 0 && LogEvent.isOperationKind(logEvents[index - 1].eventKind))
                ) {
                    const startPos_x = eventStartPos_x;
                    drawFuncs.push(() => drawLine(graphCtx, gridLineWidth, [], gridLineColor, startPos_x, begin_y, startPos_x, end_y));
                }
            }

            eventStartPos_x = eventEndPos_x;
            // Keep track of the highest x-axis value
            if (lastEventPos_x < eventEndPos_x) {
                lastEventPos_x = eventEndPos_x;
            }

            // Keep track of which event types are present so the legend can be generated
            if (!knownEventKinds.find((knownEventKind) => knownEventKind == eventKind)) {
                knownEventKinds.push(eventKind);
            }
        }

        prevDecl = currentDecl;
    }

    return {
        drawFuncs: drawFuncs,
        endPos_x: lastEventPos_x,
        endPos_y: graphEnd_y,
        eventKinds: knownEventKinds,
        index: index < logEvents.length ? index : undefined,
    };
}

function generateEventDrawFuncs(
    ctx,
    graphFont,
    gridLineWidth,
    eventLineWidth,
    eventWrapperHeight,
    eventTxt,
    eventKind,
    eventStartPos_x,
    eventPos_y,
    eventEndPos_x,
    gridLineColor,
    txtColor,
    targetEventPos_y
) {
    ctx.fillStyle = txtColor;
    const eventColor = LogEvent.eventKindToColor.find((ektc) => ektc.kind == eventKind).color;
    const drawFuncs = [];
    // Calculate and add the draw function
    drawFuncs.push(() => {
        drawLine(ctx, eventLineWidth, [], eventColor, eventStartPos_x, eventPos_y, eventEndPos_x, eventPos_y);

        if (eventTxt) {
            const textMeasure = ctx.measureText(eventTxt);
            const textWidth = textMeasure.width;
            const textPos_y = eventPos_y - eventLineWidth;
            ctx.fillText(eventTxt, eventStartPos_x + (eventEndPos_x - eventStartPos_x - textWidth) / 2, textPos_y);
        }
    });

    if (LogEvent.isThreadKind(eventKind)) {
        // Draw the "marker" for the thread event
        drawFuncs.push(() => {
            const txtMetrics = eventTxt ? ctx.measureText(eventTxt) : undefined;
            drawThreadEventMarker(
                ctx,
                graphFont,
                txtMetrics ? txtMetrics.fontBoundingBoxAscent + txtMetrics.fontBoundingBoxDescent : 0,
                eventWrapperHeight,
                eventLineWidth,
                eventKind,
                eventColor,
                eventStartPos_x,
                eventEndPos_x,
                eventPos_y
            );
        });
    } else if (LogEvent.isBusKind(eventKind)) {
        drawFuncs.push(() => {
            // Draw arrows from/to cpu and bus
            if (targetEventPos_y != undefined) {
                let pos_x = eventStartPos_x;
                let end_y = eventPos_y - eventWrapperHeight;
                let start_y = targetEventPos_y + eventWrapperHeight;

                if (eventKind == LogEvent.MessageCompleted) {
                    pos_x = eventEndPos_x;
                    end_y = targetEventPos_y + eventWrapperHeight;
                    start_y = eventPos_y - eventWrapperHeight;
                }

                drawArrow(ctx, pos_x, start_y, pos_x, end_y, 3, 5, false, gridLineWidth, undefined, gridLineColor, undefined);
            }
        });
    }

    return drawFuncs;
}

/**
 *
 * Draw functions
 *
 */

function drawThreadEventMarker(
    ctx,
    graphFont,
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
    ctx.font == graphFont;
    const halfEventLineWidth = Math.ceil(eventLineWidth / 2);
    const markerPos_x = eventStartPos_x + (eventEndPos_x - eventStartPos_x) / 2;
    const markerStart_y = eventPos_y - eventLineWidth - txtHeight;
    const markerEnd_y = markerStart_y - eventWrapperHeight;
    const markerWidth = eventLineWidth - 1;
    if (LogEvent.isThreadSwapKind(eventKind)) {
        if (eventKind == LogEvent.DelayedThreadSwapIn) {
            const lineLength = Math.abs(Math.abs(markerEnd_y) - Math.abs(markerStart_y)) / 2;
            const start_x = markerPos_x - lineLength / 2;
            const end_x = markerPos_x + lineLength / 2;
            drawLine(ctx, halfEventLineWidth, [], eventColor, start_x, markerEnd_y, end_x, markerEnd_y);
        }

        // Adjust arrow placement and position depending on in/out
        const isSwapIn = eventKind != LogEvent.ThreadSwapOut;
        drawArrow(
            ctx,
            markerPos_x,
            markerStart_y - (isSwapIn ? markerWidth : 0),
            markerPos_x,
            markerEnd_y - (isSwapIn ? markerWidth : 0),
            halfEventLineWidth,
            eventLineWidth,
            true,
            markerWidth,
            undefined,
            eventColor,
            isSwapIn
        );
    } else {
        drawCross(
            ctx,
            markerPos_x,
            markerStart_y - (markerStart_y - markerEnd_y) / 2,
            markerEnd_y - markerStart_y + halfEventLineWidth,
            markerWidth,
            eventColor,
            eventKind == LogEvent.ThreadCreate ? 0 : Math.PI / 4
        );
    }
}

function drawCross(ctx, center_x, center_y, lineLength, lineWidth, strokeStyle, angle) {
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

function drawLine(ctx, lineWidth, lineDash, strokeStyle, from_x, from_y, to_x, to_y) {
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

function drawArrow(ctx, x_start, y_start, x_end, y_end, aWidth, aLength, fill, lineWidth, lineDash, color, arrowStart) {
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

/**
 *
 * General functions
 *
 */

function buildViewCanvas(viewId, startTime) {
    if (viewId == archViewId) {
        return generateArchCanvas(logData.cpuDeclEvents, logData.busDeclEvents);
    }

    if (viewId == execViewId) {
        return generateExecCanvas(logData.cpuDeclEvents, logData.busDeclEvents, logData.executionEvents, startTime);
    }

    return generateCpuCanvas(
        logData.cpusWithEvents.find((cwe) => cwe.id == viewId.replace(/\D/g, "")).executionEvents,
        logData.busDeclEvents,
        startTime
    );
}

function setButtonColors(btns, activeBtn) {
    // There is alwasy an active (pressed) button. Change its color to secondary
    if (activeBtn) {
        activeBtn.style.background = BtnColors.secondaryBackground;
        activeBtn.style.color = BtnColors.secondaryForeground;
    }

    // Update the other buttons to primary color
    btns.forEach((btn) => {
        if (btn.id != activeBtn.id) {
            btn.style.background = BtnColors.primaryBackground;
            btn.style.color = BtnColors.primaryForeground;
        }
    });
}

function updateFontAndColors(scaleWithFont, matchTheme) {
    const computedStyle = getComputedStyle(document.body);
    // Update font properties
    font.size = scaleWithFont ? Number(computedStyle.getPropertyValue("--vscode-editor-font-size").replace(/\D/g, "")) : 15;
    font.family = computedStyle.getPropertyValue("--vscode-editor-font-family").trim();
    font.color = matchTheme ? computedStyle.getPropertyValue("--vscode-editor-foreground").trim() : "#000000";

    // Update background color for the graphs
    backgroundColor = matchTheme ? computedStyle.getPropertyValue("--vscode-editor-background").trim() : "#ffffff";

    // Update colors for events and bus
    LogEvent.eventKindToColor.forEach((ektc) => {
        if (LogEvent.isOperationKind(ektc.kind) || LogEvent.isThreadKind(ektc.kind)) {
            const color =
                ektc.kind == LogEvent.ThreadCreate
                    ? computedStyle.getPropertyValue("--vscode-debugIcon-startForeground").trim()
                    : ektc.kind == LogEvent.ThreadSwapIn
                    ? computedStyle.getPropertyValue("--vscode-debugIcon-breakpointCurrentStackframeForeground").trim()
                    : ektc.kind == LogEvent.ThreadKill
                    ? computedStyle.getPropertyValue("--vscode-debugIcon-stopForeground").trim()
                    : ektc.kind == LogEvent.ThreadSwapOut
                    ? computedStyle.getPropertyValue("--vscode-statusBar-debuggingBackground").trim()
                    : ektc.kind == LogEvent.DelayedThreadSwapIn
                    ? computedStyle.getPropertyValue("--vscode-editorOverviewRuler-findMatchForeground").trim()
                    : computedStyle.getPropertyValue("--vscode-debugIcon-continueForeground").trim();

            ektc.color = matchTheme && color ? color : LogEvent.kindToStandardColor(ektc.kind);
        }
    });
    busColors = [font.color];
    busColors.push(...LogEvent.eventKindToColor.map((ektc) => ektc.color));

    // Update button colors
    BtnColors.primaryBackground = computedStyle.getPropertyValue("--vscode-button-background").trim();
    BtnColors.secondaryBackground = computedStyle.getPropertyValue("--vscode-button-secondaryBackground").trim();
    BtnColors.primaryForeground = computedStyle.getPropertyValue("--vscode-button-foreground").trim();
    BtnColors.secondaryForeground = computedStyle.getPropertyValue("--vscode-button-secondaryForeground").trim();

    // Update size of graph elements
    declFont = `${font.size * 2}px ${font.family}`;
    graphFont = `${font.size}px ${font.family}`;
    gridLineWidth = font.size / 10 > 1 ? Math.floor(font.size / 10) : 1;
    eventLineWidth = gridLineWidth * 4;
    eventWrapperHeight = eventLineWidth * 2 + eventLineWidth;
}

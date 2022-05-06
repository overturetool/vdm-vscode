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
const logData = { cpuDeclEvents: [], busDeclEvents: [], cpusWithEvents: [], executionEvents: [] };

const BtnColors = {
    primaryBackground: undefined,
    primaryForeground: undefined,
    secondaryBackground: undefined,
    secondaryForeground: undefined,
};
let currentViewId = archViewId;
const views = [];
const buttons = Array.from(document.getElementsByClassName("button"));

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
            existingView.canvas = buildViewCanvas(btn.id);
        }
        viewContainer.appendChild(existingView.canvas);
        currentViewId = btn.id;
    };
});

// Handle event from extension backend
window.addEventListener("message", (event) => {
    if (event.data.cmd == initMsg) {
        // Handle parsed log data
        logData.cpuDeclEvents.push(...event.data.cpuDecls);
        logData.busDeclEvents.push(...event.data.busDecls);
        logData.executionEvents.push(...event.data.executionEvents);
        event.data.cpusWithEvents.forEach((cpuWithEvent) => {
            logData.cpusWithEvents.push({
                id: cpuWithEvent.id,
                executionEvents: cpuWithEvent.executionEvents,
                deployEvents: cpuWithEvent.deployEvents,
            });
        });
    } else if (event.data.cmd == editorSettingsChangedMsg) {
        // Remove generated canvas for the views so they are rebuild with new colors/font settings.
        views.forEach((view) => (view.canvas = undefined));
    }

    // Update font and colors
    updateFontAndColors(event.data.scaleWithFont, event.data.matchTheme);
    // Set button colors
    setButtonColors(
        buttons.filter((btn) => btn.id != currentViewId),
        document.getElementById(currentViewId)
    );

    // A message from the extension backend always entails a rebuild of the canvas
    const viewCanvas = buildViewCanvas(currentViewId);
    views.find((view) => view.id == currentViewId).canvas = viewCanvas;
    // Display the canvas (graph)
    viewContainer.innerHTML = "";
    viewContainer.appendChild(viewCanvas);
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

function generateExecCanvas() {
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
    logData.cpuDeclEvents
        .slice()
        .reverse()
        .concat(logData.busDeclEvents)
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
        logData.executionEvents,
        declPadding_y / 2,
        graphStartPos_x,
        nextDeclPos_y - declPadding_y / 2,
        ctx,
        graphFont,
        gridLineWidth,
        font.color,
        eventLineWidth,
        eventWrapperHeight,
        eventLength_x
    );
    drawFuncs.push(...graph.drawFuncs);

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

function generateCpuCanvas(viewId) {
    const canvas = generateEmptyCanvas();
    const cpuExecutionEvents = logData.cpusWithEvents.find((cpu) => cpu.id == viewId.replace(/\D/g, "")).executionEvents;
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
    const axisStart_x = ctx.measureText(cpuExecutionEvents[cpuExecutionEvents.length - 1].time).width + padding;
    ctx.font = declFont;
    const rects = [];

    // The first rects to draw should be the ones for the bus starting with the virtual bus if it is present
    let virtualBus = undefined;
    const filteredBusEvents = cpuExecutionEvents.filter((event) => {
        const isBusEvent = LogEvent.isBusKind(event.eventKind);
        if (isBusEvent && event.id == 0) {
            virtualBus = event;
        }
        return isBusEvent && event.id != 0;
    });

    if (filteredBusEvents.length > 0 || virtualBus) {
        if (virtualBus && filteredBusEvents[0].busid != 0) {
            // Place the virtual bus in front of the array
            filteredBusEvents.unshift(virtualBus);
        }
        filteredBusEvents.forEach((event) => {
            // Map busid to the name of the bus so that it does not collide with obj refs
            const rectId = logData.busDeclEvents.find((bde) => bde.id == event.busid).name;
            if (!rects.find((rect) => rect.rectId == rectId)) {
                rects.push({
                    name: rectId,
                    margin: { right: margin, left: margin },
                    width: ctx.measureText(rectId).width + padding * 2,
                    height: txtHeight + padding,
                    textHeight: txtHeight,
                    isBusRect: true,
                    rectId: rectId,
                    events: [],
                    x_pos: 0,
                    y_pos: txtHeight + padding + margin * 2,
                });
            }
            event.rectId = rectId;
        });
    }

    // Each unique obj deployment that is referenced by an event should be converted to a rectangle to display. These should be pushed after the bus rectangles.
    let cpuRectId;
    const traversedEvents = [];
    const threads = [];
    for (let i = 0; i < cpuExecutionEvents.length; i++) {
        const event = cpuExecutionEvents[i];
        // Keep track of events already visited for the ability to look behind.
        traversedEvents.push(event);
        const isBusEvent = LogEvent.isBusKind(event.eventKind);

        // Locate the correct rectangle to place the event under from the events kind
        if (LogEvent.ThreadKill == event.eventKind) {
            cpuRectId = threads.find((t) => t.id == event.id).currentRectId;
        } else if (LogEvent.ThreadCreate == event.eventKind) {
            cpuRectId = event.objref;
            threads.push({ id: event.id, currentRectId: cpuRectId, prevRectIds: [], active: false });
        } else if (event.eventKind == LogEvent.ThreadKill) {
            cpuRectId = threads.splice(threads.indexOf(threads.find((at) => at.id == event.id)), 1).currentRectId;
        } else if (event.eventKind == LogEvent.ThreadSwapOut || event.eventKind == LogEvent.ThreadSwapIn) {
            const thread = threads.find((t) => t.id == event.id);
            thread.active = event.eventKind == LogEvent.ThreadSwapIn;
            cpuRectId = thread.currentRectId;
        } else if (event.eventKind == LogEvent.OpRequest) {
            cpuRectId = threads.find((t) => t.id == event.id).currentRectId;
        } else if (event.eventKind == LogEvent.OpActivate) {
            const thread = threads.find((t) => t.id == event.id);
            const rectId = event.objref;
            thread.prevRectIds.push(thread.currentRectId);
            thread.currentRectId = rectId;
            cpuRectId = rectId;
        } else if (event.eventKind == LogEvent.OpCompleted) {
            const thread = threads.find((t) => t.id == event.id);
            thread.currentRectId = thread.prevRectIds.pop();
            cpuRectId = thread.currentRectId;
        } else if (event.eventKind == LogEvent.MessageCompleted) {
            if ("objref" in event) {
                cpuRectId = event.objref;
            } else {
                // If the message completed event does not have an obj ref it is a reply to a messsage request
                // so look behind for the message request event to find the proper rectangle id.
                const msgRequest = traversedEvents.find((te) => te.eventKind == LogEvent.MessageRequest && te.msgid == event.origmsgid);
                const opReqeust = msgRequest
                    ? traversedEvents.find(
                          (te) => te.eventKind == LogEvent.OpRequest && te.opname == msgRequest.opname && te.objref == msgRequest.objref
                      )
                    : undefined;
                // If we cannot find the event then just use next rect id
                cpuRectId = opReqeust ? opReqeust.rectId : i < cpuExecutionEvents.length - 1 ? cpuExecutionEvents[i + 1].rectId : cpuRectId;

                if (opReqeust) {
                    traversedEvents.push({
                        eventKind: LogEvent.OpCompleted,
                        id: opReqeust.id,
                        opname: opReqeust.opname,
                        objref: opReqeust.objref,
                        clnm: opReqeust.clnm,
                        cpunm: opReqeust.cpunm,
                        async: opReqeust.async,
                        time: event.time,
                        rectId: opReqeust.rectId,
                    });
                }

                // Set the obj ref so that an arrow can be drawn to the correct rectangle.
                event.objref = cpuRectId;
            }
        }

        // Set the current rectangle and generate it if it does not exist.
        const rectId = isBusEvent ? logData.busDeclEvents.find((bde) => bde.id == event.busid).name : cpuRectId;
        let currentRect = rects.find((rect) => rect.rectId == rectId);
        if (!currentRect) {
            const rectName = isBusEvent ? rectId : event.clnm + `(${rectId})`;
            ctx.font = declFont;
            currentRect = {
                name: rectName,
                margin: { right: margin, left: margin },
                width: ctx.measureText(rectName).width + padding * 2,
                height: txtHeight + padding,
                textHeight: txtHeight,
                isBusRect: false,
                rectId: rectId,
                events: [],
                x_pos: 0,
                y_pos: txtHeight + padding + margin * 2,
            };
            rects.push(currentRect);
        }

        // Calculate the margin that is needed to the right and left side of the rectangle so that opnames does not clash into other visuals.
        if (
            (LogEvent.isOperationKind(event.eventKind) || (event.eventKind == LogEvent.MessageCompleted && "opname" in event)) &&
            i < cpuExecutionEvents.length - 1
        ) {
            const targetRectIndex = rects.indexOf(
                rects.find(
                    (rect) =>
                        rect.rectId ==
                        (LogEvent.isBusKind(cpuExecutionEvents[i + 1].eventKind)
                            ? logData.busDeclEvents.find((bde) => bde.id == cpuExecutionEvents[i + 1].busid).name
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
        // Associate the event with the rectangle id
        event.rectId = rectId;
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
            ctx.setLineDash(rect.isBusRect ? [2, 2] : []);
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
    const events = traversedEvents.filter((event) => event.eventKind != LogEvent.MessageActivate);
    const prevOpEvents = [];
    for (let i = 0; i < events.length; i++) {
        const event = events[i];

        if (LogEvent.isOperationKind(event.eventKind)) {
            prevOpEvents.unshift(event);
        }

        const nextEvent = i < events.length - 1 ? events[i + 1] : undefined;
        const prevEvent = i > 0 ? events[i - 1] : undefined;
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
                        ? events
                              .slice(i + 1, events.length)
                              .find(
                                  (eve) =>
                                      (eve.eventKind == LogEvent.OpActivate || eve.eventKind == LogEvent.MessageRequest) &&
                                      event.opname == eve.opname
                              )
                        : event.eventKind == LogEvent.OpActivate && LogEvent.isOperationKind(nextEvent.eventKind)
                        ? events
                              .slice(i + 1, events.length)
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
                    (rect) =>
                        rect.rectId ==
                        (targetRectId
                            ? targetRectId
                            : isReplyArrow && event.eventKind != LogEvent.MessageCompleted
                            ? nextEvent.rectId
                            : event.objref)
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

function generateArchCanvas() {
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
    logData.busDeclEvents.forEach((busdecl) => {
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
    const rects = logData.cpuDeclEvents.map((cpud) => {
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
    canvas.height = rectBottomPos_y + busTextPosInc_y * logData.busDeclEvents.length + textHeight + margin;
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
    logData.busDeclEvents.forEach((busdecl) => {
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
    for (let i = 0; i < logData.busDeclEvents.length; i++) {
        const bus = logData.busDeclEvents[i];

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
    eventKinds.forEach((eventKind) => {
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
    eventLength_x
) {
    // Calculate draw functions for each event for the decls
    let graphEnd_y = gridHeight;
    let currentBusDecl = undefined;
    let currentTime = -1;
    let previousEventDecl;
    let lastEventPos_x = 0;
    const decls = cpuDecls.concat(busDecls);
    const drawFuncs = [];
    const knownEventKinds = [];
    for (let i = 0; i < logEvents.length; i++) {
        const event = logEvents[i];
        const eventKind = event.eventKind;
        // Find the current decl
        let currentDecl;
        if (LogEvent.isBusKind(eventKind)) {
            if (eventKind != LogEvent.MessageRequest && eventKind != LogEvent.ReplyRequest) {
                currentDecl = currentBusDecl;
            } else {
                // Keep track of the current bus decl
                currentDecl = busDecls.find((busDecl) => busDecl.id == event.busid);
                currentDecl.tocpu = event.tocpu;
                currentDecl.fromcpu = event.fromcpu;
                currentBusDecl = currentDecl;
            }
        } else {
            currentDecl = cpuDecls.find((cpu) => cpu.id == event.cpunm);
        }

        // Sync decls x-axis position with the event time and calculate generate draw function for the x-axis line
        if (currentTime != event.time) {
            // Set every line to max x value
            let maxPos_x = 0;
            decls.forEach((decl) => {
                if (maxPos_x < decl.x_pos) {
                    maxPos_x = decl.x_pos;
                }
            });
            decls.forEach((decl) => {
                decl.x_pos = maxPos_x;
            });

            // Add function that draws the visuals for the x-axis line
            graphCtx.font = graphFont;
            const txtWidth = graphCtx.measureText(event.time).width;
            const lineEndPos_y = gridHeight;
            graphEnd_y = lineEndPos_y + txtWidth;
            drawFuncs.push(() => {
                graphCtx.font = graphFont;
                drawLine(graphCtx, gridLineWidth, [1, 4], gridLineColor, maxPos_x, graphStartPos_y, maxPos_x, lineEndPos_y);

                graphCtx.save();
                graphCtx.translate(maxPos_x, lineEndPos_y);
                graphCtx.rotate(Math.PI / 2);
                graphCtx.fillText(event.time, eventLineWidth, 0);
                graphCtx.restore();
            });

            // Update time
            currentTime = event.time;
        }

        // Update the x-axis position for decls if event matches specific eventKinds
        if (eventKind == LogEvent.MessageRequest || eventKind == LogEvent.ReplyRequest) {
            currentDecl.x_pos = cpuDecls.find((cpuDecl) => cpuDecl.id == event.fromcpu).x_pos;
        } else if (eventKind == LogEvent.MessageCompleted) {
            cpuDecls.find((cpuDecl) => cpuDecl.id == currentBusDecl.tocpu).x_pos = currentDecl.x_pos + eventLength_x;
        } else if (previousEventDecl && eventKind == LogEvent.ThreadCreate) {
            currentDecl.x_pos = previousEventDecl.x_pos;
        }
        const eventStartPos_x = currentDecl.x_pos;
        const eventPos_y = currentDecl.y_pos;
        const eventEndPos_x = currentDecl.x_pos + eventLength_x;

        // Calculate visual for event and add the draw function
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
                eventPos_y,
                eventEndPos_x,
                gridLineColor,
                LogEvent.isBusKind(eventKind)
                    ? previousEventDecl && (eventKind == LogEvent.MessageRequest || eventKind == LogEvent.ReplyRequest)
                        ? previousEventDecl.y_pos
                        : eventKind == LogEvent.MessageCompleted
                        ? cpuDecls.find((cpuDecl) => cpuDecl.id == currentBusDecl.tocpu).y_pos
                        : undefined
                    : undefined
            )
        );

        // Calculate visual for the event "wrapper line"
        if (i != logEvents.length - 1 && !LogEvent.isOperationKind(eventKind)) {
            const begin_y = currentDecl.y_pos - eventWrapperHeight / 2;
            const end_y = currentDecl.y_pos + eventWrapperHeight / 2;
            drawFuncs.push(() => drawLine(graphCtx, gridLineWidth, [], gridLineColor, eventEndPos_x, begin_y, eventEndPos_x, end_y));

            if (
                !previousEventDecl ||
                currentDecl.y_pos != previousEventDecl.y_pos ||
                (i > 0 && LogEvent.isOperationKind(logEvents[i - 1].eventKind))
            ) {
                drawFuncs.push(() =>
                    drawLine(graphCtx, gridLineWidth, [], gridLineColor, eventStartPos_x, begin_y, eventStartPos_x, end_y)
                );
            }
        }
        // Update events for the decl so that the visual for the x-axis line between events can be calculated
        currentDecl.events.push({
            x_start: eventStartPos_x,
            x_end: eventEndPos_x,
            kind: eventKind,
        });
        // Update the x-axis position for the decl
        currentDecl.x_pos = eventEndPos_x;
        previousEventDecl = currentDecl;

        // Keep track of the highest x-axis value
        if (lastEventPos_x < eventEndPos_x) {
            lastEventPos_x = eventEndPos_x;
        }
        // Keep track of which event types are present so the legend can be generated
        if (!knownEventKinds.find((knownEventKind) => knownEventKind == eventKind)) {
            knownEventKinds.push(eventKind);
        }
    }

    // generate draw functions for x-axis lines between events
    decls.forEach((decl) => {
        let idleThreads = 0;
        for (let i = 0; i < decl.events.length; i++) {
            const event = decl.events[i];
            const prevEventEnd_x = i > 0 ? decl.events[i - 1].x_end : graphStartPos_x;

            // Push function to draw visuals, i.e. "normal line" or "idle thread"
            if (prevEventEnd_x >= eventLength_x) {
                const hasActiveThread = idleThreads > 0;
                const x_end = prevEventEnd_x + gridLineWidth;
                drawFuncs.push(() =>
                    drawLine(
                        graphCtx,
                        hasActiveThread ? eventLineWidth : gridLineWidth,
                        hasActiveThread ? [4, 4] : [1, 4],
                        hasActiveThread ? LogEvent.eventKindToColor.find((ektc) => ektc.kind == LogEvent.OpActivate).color : gridLineColor,
                        x_end,
                        decl.y_pos,
                        event.x_start,
                        decl.y_pos
                    )
                );
            }
            // Keep track of idle threads
            if (event.kind == LogEvent.ThreadSwapIn || event.kind == LogEvent.DelayedThreadSwapIn || event.kind == LogEvent.ThreadSwapOut) {
                idleThreads = idleThreads + (event.kind == LogEvent.ThreadSwapOut ? -1 : 1);
            }
        }

        // Make sure that the x-axis lines extend to the last event
        const lastEvent = decl.events[decl.events.length - 1];
        if (lastEvent.x_end < lastEventPos_x) {
            drawFuncs.push(() =>
                drawLine(graphCtx, gridLineWidth, [1, 4], gridLineColor, lastEvent.x_end, decl.y_pos, lastEventPos_x, decl.y_pos)
            );
        }
    });

    return { drawFuncs: drawFuncs, endPos_x: lastEventPos_x, endPos_y: graphEnd_y, eventKinds: knownEventKinds };
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
    targetEventPos_y
) {
    const eventColor = LogEvent.eventKindToColor.find((ektc) => ektc.kind == eventKind).color;
    const drawFuncs = [];
    // Calculate visual for event and add the draw function
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
        if (eventKind == LogEvent.DelayedThreadSwapIn) {
            const lineLength = (markerEnd_y - markerStart_y) / 2;
            const start_x = markerPos_x - lineLength / 2;
            const end_x = markerPos_x + lineLength / 2;
            drawLine(ctx, halfEventLineWidth, [], eventColor, start_x, markerEnd_y, end_x, markerEnd_y);
        }
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

function buildViewCanvas(viewId) {
    return viewId == archViewId ? generateArchCanvas() : viewId == execViewId ? generateExecCanvas() : generateCpuCanvas(viewId);
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

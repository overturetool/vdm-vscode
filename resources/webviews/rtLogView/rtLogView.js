// SPDX-License-Identifier: GPL-3.0-or-later

const vscode = acquireVsCodeApi();

// Create view container
const viewContainer = document.createElement("div");
viewContainer.id = "viewContainer";
viewContainer.style.height = "100%";
viewContainer.style.width = "100%";
document.body.appendChild(viewContainer);

// Handle button presses
let firstBtnId;
const generatedViews = [];
Array.from(document.getElementsByClassName("button")).forEach((ele) => {
    if (!firstBtnId) {
        firstBtnId = ele.id;
    }

    ele.onclick = function () {
        buildView(ele.id);
    };
});

const global_font = "30px Arial"; // "var(--vscode-editor-font-size) var(--vscode-editor-font-family)"
const dataCmd = "data";

// Build the view connected to the first button on load
document.body.onload = onLoad();

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

    static eventKindsWithInfo = [
        { kind: LogEvent.ThreadCreate, color: "#00e400" },
        { kind: LogEvent.ThreadKill, color: "#ff0000" },
        { kind: LogEvent.OpActivate, color: "#0000ff" },
        { kind: LogEvent.OpRequest, color: "#0000ff" },
        { kind: LogEvent.OpCompleted, color: "#0000ff" },
        { kind: LogEvent.ThreadSwapOut, color: "#ff8000" },
        { kind: LogEvent.ThreadSwapIn, color: "#00b7ff" },
        { kind: LogEvent.DelayedThreadSwapIn, color: "#bf00ff" },
        { kind: LogEvent.MessageRequest, color: "#808080", abb: "mr" },
        { kind: LogEvent.ReplyRequest, color: "#949494", abb: "rr" },
        { kind: LogEvent.MessageActivate, color: "#D0D0D0", abb: "ma" },
        { kind: LogEvent.MessageCompleted, color: "#B5B5B5", abb: "mc" },
    ];

    static eventToColor(eventKind) {
        return LogEvent.eventKindsWithInfo.find((eventToColor) => eventToColor.kind == eventKind)?.color;
    }

    static isThreadEventKind(eventKind) {
        return (
            eventKind == LogEvent.ThreadKill ||
            eventKind == LogEvent.ThreadSwapOut ||
            eventKind == LogEvent.ThreadSwapIn ||
            eventKind == LogEvent.ThreadCreate ||
            eventKind == LogEvent.DelayedThreadSwapIn
        );
    }

    static isBusEventKind(eventKind) {
        return (
            eventKind == LogEvent.ReplyRequest ||
            eventKind == LogEvent.MessageCompleted ||
            eventKind == LogEvent.MessageActivate ||
            eventKind == LogEvent.MessageRequest
        );
    }

    static isThreadSwapEventKind(eventKind) {
        return eventKind == LogEvent.ThreadSwapIn || eventKind == LogEvent.ThreadSwapOut || eventKind == LogEvent.DelayedThreadSwapIn;
    }

    static isOperationEventKind(eventKind) {
        return eventKind == LogEvent.OpRequest || eventKind == LogEvent.OpActivate || eventKind == LogEvent.OpCompleted;
    }
}

function drawStuff(viewId, content) {
    const canvas = document.createElement("CANVAS");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.background = "white";
    generatedViews.push({ id: viewId, canvas: canvas });

    const ctx = canvas.getContext("2d");
    ctx.font = global_font;
    ctx.lineWidth = 2;
    ctx.moveTo(0, 0);
    ctx.lineTo(500, 400);
    ctx.stroke();

    ctx.fillText(content, 0, 400);
    viewContainer.appendChild(canvas);
}

let cpuDecls = [];
let busDecls = [];
const eventsOfInterest = [];

function buildExecutionOverview(viewId) {
    const canvas = document.createElement("CANVAS");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.background = "white";
    generatedViews.push({ id: viewId, canvas: canvas });

    // Define size constants
    const declFont = "30px Arial";
    const graphFont = "15px Arial";
    let ctx = canvas.getContext("2d");

    ctx.font = graphFont;
    const graphTextMetrics = ctx.measureText("Gg");
    const graphFontHeight = graphTextMetrics.fontBoundingBoxAscent + graphTextMetrics.fontBoundingBoxDescent;
    const eventLength_x = graphFontHeight + 1 > 25 ? graphFontHeight + 1 : 25;

    ctx.font = declFont;
    const declTextMetrics = ctx.measureText("Gg");
    const margin_y = (declTextMetrics.fontBoundingBoxAscent + declTextMetrics.fontBoundingBoxDescent) * 2;
    const gridLineWidth = 1;
    const eventLineWidth = 4;
    const eventWrapperHeight = 10 + eventLineWidth;
    const margin_x = margin_y / 4;

    // Calculate decl text placement
    let widestText = 0;
    let currentTextPos_y = margin_y;
    let decls = [];
    let cpus = [];
    let bus = [];
    cpuDecls
        .reverse()
        .concat(busDecls)
        .forEach((decl) => {
            const txtMetrics = ctx.measureText(decl.name);
            if (txtMetrics.width > widestText) {
                widestText = txtMetrics.width;
            }

            const txtHeight = txtMetrics.fontBoundingBoxAscent + txtMetrics.fontBoundingBoxDescent;
            const newDecl = {};
            newDecl.id = decl.id;
            newDecl.events = [];
            newDecl.y_pos = currentTextPos_y - txtHeight / 2 + eventLineWidth;
            newDecl.x_pos = undefined;
            newDecl.name = decl.name;

            if (decl.eventKind == LogEvent.BusDecl) {
                newDecl.fromcpu = undefined;
                newDecl.tocpu = undefined;
                bus.push(newDecl);
            } else {
                newDecl.activeThreadsNumb = 0;
                cpus.push(newDecl);
            }
            decls.push({
                name: decl.name,
                y_pos: currentTextPos_y,
            });

            currentTextPos_y += margin_y;
        });

    // Define where events should start on the x axis
    const graphStart_x = widestText + margin_x * 2;
    cpus.concat(bus).forEach((decl) => (decl.x_pos = graphStart_x));

    // Define where legend should start
    ctx.font = graphFont;
    const graphHeight =
        cpuDecls.concat(busDecls).length * margin_y + margin_y + ctx.measureText(eventsOfInterest[eventsOfInterest.length - 1].time).width;
    ctx.font = graphFont;
    const legendTxtMetrics = ctx.measureText("Gg");
    const legendFontHeight = legendTxtMetrics.fontBoundingBoxAscent + legendTxtMetrics.fontBoundingBoxDescent;
    const legendHeight = LogEvent.eventKindsWithInfo.length * legendFontHeight * 2 + legendFontHeight;

    // Resize canvas to fit content
    canvas.width = eventsOfInterest.length * eventLength_x + margin_x + graphStart_x;
    canvas.height = graphHeight + legendHeight;

    const drawFuncs = [];

    // Draw decl text
    ctx = canvas.getContext("2d");
    ctx.font = declFont;
    decls.forEach((decl) => {
        ctx.fillText(decl.name, margin_x, decl.y_pos);
    });

    // Draw events for decls
    const declsTotalHeight = currentTextPos_y - margin_y;
    let currentBusDecl = undefined;
    let currentTime = -1;
    const gridLineColor = "#000000";
    ctx.font = graphFont;
    let previousEventDecl;
    let highestPos_x = 0;
    const eventKinds = [];
    for (let i = 0; i < eventsOfInterest.length; i++) {
        const event = eventsOfInterest[i];

        // Keep track of current bus
        let currentDecl;
        if (LogEvent.isBusEventKind(event.eventKind)) {
            if (event.eventKind != LogEvent.MessageRequest && event.eventKind != LogEvent.ReplyRequest) {
                currentDecl = currentBusDecl;
            } else {
                currentDecl = bus.find((busDecl) => busDecl.id == event.busid);
                currentDecl.tocpu = event.tocpu;
                currentDecl.fromcpu = event.fromcpu;
                currentBusDecl = currentDecl;
            }
        } else {
            currentDecl = cpus.find((cpu) => cpu.id == event.cpunm);
        }

        // Sync x-axis with the event time and draw vertical grid line
        if (currentTime != event.time) {
            // Set every line to max x value
            let maxPos_x = 0;
            cpus.concat(bus).forEach((decl) => {
                if (maxPos_x < decl.x_pos) {
                    maxPos_x = decl.x_pos;
                }
            });
            cpus.concat(bus).forEach((decl) => {
                decl.x_pos = maxPos_x;
            });

            // Draw x axis line with time
            const lineEnd_y = declsTotalHeight + margin_y / 4;
            drawLine(ctx, gridLineWidth, [1, 4], gridLineColor, maxPos_x, margin_y / 2, maxPos_x, lineEnd_y);

            ctx.save();
            ctx.translate(maxPos_x, lineEnd_y);
            ctx.rotate(Math.PI / 2);
            ctx.fillText(event.time, eventLineWidth, 0);
            ctx.restore();

            // Update time
            currentTime = event.time;
        }

        // Update the x axis position for decls if event matches specific eventKinds
        if (event.eventKind == LogEvent.MessageRequest || event.eventKind == LogEvent.ReplyRequest) {
            currentDecl.x_pos = cpus.find((cpuDecl) => cpuDecl.id == event.fromcpu).x_pos;
        } else if (event.eventKind == LogEvent.MessageCompleted) {
            cpus.find((cpuDecl) => cpuDecl.id == currentBusDecl.tocpu).x_pos = currentDecl.x_pos + eventLength_x;
        } else if (event.eventKind == LogEvent.ThreadCreate) {
            currentDecl.x_pos = previousEventDecl?.x_pos ?? graphStart_x;
        }

        const currentEventEndPos_x = currentDecl.x_pos + eventLength_x;

        // Draw event
        if (LogEvent.isThreadEventKind(event.eventKind)) {
            drawThreadEvent(
                ctx,
                eventLineWidth,
                currentDecl.x_pos,
                currentDecl.y_pos,
                currentEventEndPos_x,
                event.id,
                event.eventKind,
                eventWrapperHeight
            );
        } else if (LogEvent.isBusEventKind(event.eventKind)) {
            drawBusEvent(
                ctx,
                eventLineWidth,
                event.eventKind,
                currentDecl.x_pos,
                currentDecl.y_pos,
                currentEventEndPos_x,
                previousEventDecl.y_pos,
                gridLineWidth,
                gridLineColor,
                currentBusDecl,
                eventWrapperHeight,
                cpus
            );
        } else {
            drawLine(
                ctx,
                eventLineWidth,
                [],
                LogEvent.eventToColor(event.eventKind),
                currentDecl.x_pos,
                currentDecl.y_pos,
                currentEventEndPos_x,
                currentDecl.y_pos
            );
        }

        // Draw event "wrapper line"
        if (i != eventsOfInterest.length - 1 && !LogEvent.isOperationEventKind(event.eventKind)) {
            const begin_y = currentDecl.y_pos - eventWrapperHeight / 2;
            const end_y = currentDecl.y_pos + eventWrapperHeight / 2;
            drawLine(ctx, gridLineWidth, [], gridLineColor, currentEventEndPos_x, begin_y, currentEventEndPos_x, end_y);

            if (
                !previousEventDecl ||
                currentDecl.y_pos != previousEventDecl.y_pos ||
                (i > 0 && LogEvent.isOperationEventKind(eventsOfInterest[i - 1].eventKind))
            ) {
                drawLine(ctx, gridLineWidth, [], gridLineColor, currentDecl.x_pos, begin_y, currentDecl.x_pos, end_y);
            }
        }

        currentDecl.events.push({
            x_start: currentDecl.x_pos,
            x_end: currentEventEndPos_x,
            kind: event.eventKind,
            y_pos: currentDecl.y_pos,
        });
        currentDecl.x_pos = currentEventEndPos_x;
        previousEventDecl = currentDecl;
        if (highestPos_x < currentEventEndPos_x) {
            highestPos_x = currentEventEndPos_x;
        }

        if (!eventKinds.find((eventKind) => eventKind == event.eventKind)) {
            eventKinds.push(event.eventKind);
        }
    }

    // Draw legend
    ctx.font = graphFont;
    let currentLegendHeight = graphHeight;
    eventKinds.forEach((eventKind) => {
        const text = eventKind.replace(/([A-Z])/g, " $1").trim();
        const lgndTxtMetrics = ctx.measureText(text);
        const txtHeight = lgndTxtMetrics.fontBoundingBoxAscent + lgndTxtMetrics.fontBoundingBoxDescent;
        const txtBegin_x = margin_x + eventLength_x + eventLineWidth;

        if (LogEvent.isThreadEventKind(eventKind)) {
            drawThreadEvent(
                ctx,
                eventLineWidth,
                margin_x,
                currentLegendHeight,
                margin_x + eventLength_x - gridLineWidth * 2,
                undefined,
                eventKind,
                eventWrapperHeight
            );
        } else if (LogEvent.isBusEventKind(eventKind)) {
            drawBusEvent(
                ctx,
                eventLineWidth,
                eventKind,
                margin_x,
                currentLegendHeight,
                margin_x + eventLength_x - gridLineWidth * 2,
                undefined,
                gridLineWidth,
                gridLineColor,
                undefined,
                eventWrapperHeight,
                undefined
            );
        } else {
            drawLine(
                ctx,
                eventLineWidth,
                [],
                LogEvent.eventToColor(eventKind),
                margin_x,
                currentLegendHeight - txtHeight / 3,
                margin_x + eventLength_x - gridLineWidth * 2,
                currentLegendHeight - txtHeight / 3
            );
        }

        ctx.fillText(text, txtBegin_x, currentLegendHeight);

        currentLegendHeight = currentLegendHeight + txtHeight * 2;
    });

    // Draw x-axis lines and mark active threads
    cpus.concat(bus).forEach((decl) => {
        let activeThreadsNumb = 0;
        let prev_event = undefined;
        for (let i = 0; i < decl.events.length; i++) {
            const event = decl.events[i];

            if (i == decl.events.length - 1 && event.x_end < highestPos_x) {
                drawLine(ctx, gridLineWidth, [1, 4], gridLineColor, event.x_end, event.y_pos, highestPos_x, event.y_pos);
            }

            if (
                (prev_event && event.x_start - prev_event.x_end >= eventLength_x) ||
                (i == 0 && event.x_start - graphStart_x > eventLength_x)
            ) {
                drawLine(
                    ctx,
                    activeThreadsNumb > 0 ? eventLineWidth : gridLineWidth,
                    activeThreadsNumb > 0 ? [4, 4] : [1, 4],
                    activeThreadsNumb > 0 ? "#0040ff" : gridLineColor,
                    (i == 0 ? graphStart_x : prev_event.x_end) + eventLineWidth,
                    event.y_pos,
                    event.x_start,
                    event.y_pos
                );
            }
            // Keep track of active threads
            if (event.kind == LogEvent.ThreadSwapIn || event.kind == LogEvent.DelayedThreadSwapIn || event.kind == LogEvent.ThreadSwapOut) {
                activeThreadsNumb = activeThreadsNumb + (event.kind == LogEvent.ThreadSwapOut ? -1 : 1);
            }
            prev_event = event;
        }
    });

    viewContainer.appendChild(canvas);
}

function drawBusEvent(
    ctx,
    eventLineWidth,
    eventKind,
    eventStartPos_x,
    eventPos_y,
    eventEndPos_x,
    prevEventPos_y,
    gridLineWidth,
    gridLineColor,
    busDecl,
    eventWrapperHeight,
    cpus
) {
    drawLine(ctx, eventLineWidth, [], LogEvent.eventToColor(eventKind), eventStartPos_x, eventPos_y, eventEndPos_x, eventPos_y);

    // Draw marker for event
    const eventTxt = LogEvent.eventKindsWithInfo.find((ev) => ev.kind == eventKind).abb;
    const textMeasure = ctx.measureText(eventTxt);
    const textWidth = textMeasure.width;
    const textPos_y = eventPos_y - eventLineWidth;
    ctx.fillText(eventTxt, eventStartPos_x + (eventEndPos_x - eventStartPos_x - textWidth) / 2, textPos_y);

    // Draw arrows from/to cpu and bus
    if (
        prevEventPos_y &&
        busDecl &&
        cpus &&
        (eventKind == LogEvent.MessageRequest || eventKind == LogEvent.ReplyRequest || eventKind == LogEvent.MessageCompleted)
    ) {
        let pos_x = eventStartPos_x;
        let end_y = eventPos_y - eventWrapperHeight;
        let start_y = prevEventPos_y + eventWrapperHeight;

        if (eventKind == LogEvent.MessageCompleted) {
            pos_x = eventEndPos_x;
            end_y = cpus.find((cpuDecl) => cpuDecl.id == busDecl.tocpu).y_pos + eventWrapperHeight;
            start_y = eventPos_y - eventWrapperHeight;
        }

        drawArrow(ctx, pos_x, start_y, pos_x, end_y, 3, 5, false, gridLineWidth, gridLineColor);
    }
}

function drawThreadEvent(ctx, lineWidth, startPos_x, pos_y, endPos_x, threadId, eventKind, eventWrapperHeight) {
    const eventColor = LogEvent.eventToColor(eventKind);
    const markerWidth = lineWidth - 1;
    drawLine(ctx, lineWidth, [], eventColor, startPos_x, pos_y, endPos_x, pos_y);

    let textHeight = 0;
    const textStartPos_y = pos_y - lineWidth;
    if (threadId) {
        const textMeasure = ctx.measureText(threadId);
        textHeight = textMeasure.fontBoundingBoxAscent + textMeasure.fontBoundingBoxDescent;
        const textWidth = textMeasure.width;
        ctx.fillText(threadId, startPos_x + (endPos_x - startPos_x - textWidth) / 2, textStartPos_y);
    }

    // Draw marker for event
    const halfLineWidth = Math.ceil(lineWidth / 2);
    const markerPos_x = startPos_x + (endPos_x - startPos_x) / 2;
    const markerStart_y = textStartPos_y - textHeight;
    const markerEnd_y = textStartPos_y - eventWrapperHeight - textHeight;
    const markerMid_y = markerStart_y - (markerStart_y - markerEnd_y) / 2;
    if (LogEvent.isThreadSwapEventKind(eventKind)) {
        // Adjust arrow placement and position depending on in/out
        const isSwapIn = eventKind != LogEvent.ThreadSwapOut;
        drawArrow(
            ctx,
            markerPos_x,
            markerStart_y - (isSwapIn ? markerWidth : 0),
            markerPos_x,
            markerEnd_y - (isSwapIn ? markerWidth : 0),
            halfLineWidth,
            lineWidth,
            true,
            markerWidth,
            eventColor,
            isSwapIn
        );
        if (eventKind == LogEvent.DelayedThreadSwapIn) {
            const lineLength = (markerEnd_y - markerStart_y) / 2;
            const start_x = markerPos_x - lineLength / 2;
            const end_x = markerPos_x + lineLength / 2;
            drawLine(ctx, halfLineWidth, [], eventColor, start_x, markerEnd_y, end_x, markerEnd_y);
        }
    } else {
        drawCross(
            ctx,
            markerPos_x,
            markerMid_y,
            markerEnd_y - markerStart_y + halfLineWidth,
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
    ctx.beginPath();
    // Line color
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;

    // center
    const x = rotate ? 0 : center_x;
    const y = rotate ? 0 : center_y;

    if (rotate) {
        ctx.save();
        ctx.translate(center_x, center_y);
        ctx.rotate(angle);
    }

    // Size
    const size = lineLength / 2;

    ctx.moveTo(x, y + size);
    ctx.lineTo(x, y - size);

    ctx.moveTo(x + size, y);
    ctx.lineTo(x - size, y);

    ctx.stroke();

    if (rotate) {
        ctx.restore();
    }

    ctx.strokeStyle = prevStrokeStyle;
    ctx.lineWidth = prevLineWidth;
}

function drawLine(ctx, lineWidth, lineDash, strokeStyle, from_x, from_y, to_x, to_y) {
    const prevLineWidth = ctx.lineWidth;
    const prevStrokeStyle = ctx.strokeStyle;
    // Draw event
    ctx.beginPath();
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(lineDash);
    ctx.strokeStyle = strokeStyle;
    ctx.moveTo(from_x, from_y);
    ctx.lineTo(to_x, to_y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = prevStrokeStyle;
    ctx.lineWidth = prevLineWidth;
}

function drawArrow(ctx, x_start, y_start, x_end, y_end, aWidth, aLength, fill, lineWidth, color, arrowStart) {
    const dx = x_end - x_start;
    const dy = y_end - y_start;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);
    let oldFillStyle;
    let oldStrokeStyle;
    let oldLineWidth;

    ctx.translate(x_start, y_start);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.setLineDash([]);
    if (color) {
        oldFillStyle = ctx.fillStyle;
        oldStrokeStyle = ctx.strokeStyle;
        ctx.fillStyle = ctx.strokeStyle = color;
    }
    if (lineWidth) {
        ctx.lineWidth = lineWidth;
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
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Reset colors
    if (oldFillStyle) {
        ctx.fillStyle = oldFillStyle;
        ctx.strokeStyle = oldStrokeStyle;
    }

    if (oldLineWidth) {
        ctx.lineWidth = oldLineWidth;
    }
}

function buildArchitectureOverview(viewId) {
    const canvas = document.createElement("CANVAS");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.background = "white";
    generatedViews.push({ id: viewId, canvas: canvas });

    // Set text style to calculate text sizes
    let ctx = canvas.getContext("2d");
    ctx.font = global_font;
    const metrics = ctx.measureText("Gg");
    const textHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const margin = metrics.width;
    // Find start position for rectangles on the x axis and find the max text height.
    let busTextWidth = margin;
    busDecls.forEach((busdecl) => {
        // The startig position for the rectangle on the x axis should be max text width + predefined margin
        const metrics = ctx.measureText(busdecl.name);
        const totalWidth = metrics.width + margin;
        if (totalWidth > busTextWidth) {
            busTextWidth = totalWidth;
        }
    });
    const busText_y_increment = textHeight * 2;

    // Calculate position for the rectangles and the text inside
    const padding = margin / 2;
    let nextRect_X_pos = busTextWidth;
    const rects = [];
    let rectBottom_y_pos;
    cpuDecls.forEach((cpud) => {
        const textMetrics = ctx.measureText(cpud.name);
        const textHeight = textMetrics.fontBoundingBoxAscent + textMetrics.fontBoundingBoxDescent;
        const rectWidth = textMetrics.width + padding * 2;
        const rectHeight = textHeight + padding;

        // Save position information for the rectangle
        rects.push({ text: cpud.name, id: cpud.id, start: nextRect_X_pos, width: rectWidth, height: rectHeight, textHeight: textHeight });
        nextRect_X_pos += rectWidth + margin;
        if (!rectBottom_y_pos) {
            rectBottom_y_pos = rectHeight + margin;
        }
    });

    // Resize canvas to fit content
    canvas.height = rectBottom_y_pos + busText_y_increment * busDecls.length + textHeight;
    canvas.width = nextRect_X_pos;

    // Get context after resize
    ctx = canvas.getContext("2d");

    // Set line and text style
    ctx.font = global_font;
    ctx.lineWidth = 2;
    ctx.setLineDash([2, 2]);
    ctx.fillStyle = "#000000";

    // Draw the rectangles and text
    rects.forEach((rect) => {
        ctx.strokeRect(rect.start, margin, rect.width, rect.height);
        ctx.fillText(rect.text, rect.start + padding, rectBottom_y_pos - (rect.height - rect.textHeight));
    });

    // Concat all connections for each rectangle
    const rectConnections = [];
    busDecls.forEach((busdecl) => {
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
    let nextBusName_y_pos = rectBottom_y_pos + busText_y_increment;
    const colors = ["#000000", "#c90000", "#00c800", "#0000c9", "#bf00ff", "#ffbf00"];

    for (let i = 0; i < busDecls.length; i++) {
        const bus = busDecls[i];

        // Setup color for and style for the connection line
        ctx.beginPath();
        ctx.fillStyle = ctx.strokeStyle = i < colors.length - 1 ? colors[i] : "#000000";
        if (bus.id == 0) {
            ctx.setLineDash([2, 2]);
        } else {
            ctx.setLineDash([]);
        }

        // Draw bus connections between rectangles
        const fromRect = rects.find((rect) => rect.id == bus.topo.from);
        const fromRectConn = rectConnections.find((rect) => rect.id == bus.topo.from);

        // Make sure that lines are spaced evenly on the "from" rectangle
        const linePlacementOnFromRect = (fromRect.width / (fromRectConn.connections + 1)) * ++fromRectConn.established + fromRect.start;

        // Draw outgoing part of the line
        ctx.moveTo(linePlacementOnFromRect, rectBottom_y_pos);
        ctx.lineTo(linePlacementOnFromRect, nextBusName_y_pos);

        // Draw the rest of the lines connecting the outgoing part
        bus.topo.to.forEach((toId) => {
            const toRect = rects.find((rect) => rect.id == toId);
            const toRectConn = rectConnections.find((rect) => rect.id == toId);

            // Make sure that lines are spaced evenly on the "to" rectangle
            const linePlacementOnToRect = (toRect.width / (toRectConn.connections + 1)) * ++toRectConn.established + toRect.start;

            // Draw the line from the latest "lineTo" position
            ctx.lineTo(linePlacementOnToRect, nextBusName_y_pos);
            ctx.lineTo(linePlacementOnToRect, rectBottom_y_pos);
            ctx.stroke();

            // Reset to the outgoing line from this rectangle
            ctx.moveTo(linePlacementOnToRect, nextBusName_y_pos);
        });

        // Draw the name of the bus
        ctx.fillText(bus.name, margin, nextBusName_y_pos + textHeight / 2);

        // Increment y position for next bus name
        nextBusName_y_pos += busText_y_increment;
    }

    viewContainer.appendChild(canvas);
}

function onLoad() {
    vscode.postMessage(dataCmd);
}

function buildView(viewId) {
    // Clear the container
    viewContainer.innerHTML = "";
    const generatedView = generatedViews.find((vc) => vc.id == viewId);
    if (generatedView) {
        // Use the existing view
        viewContainer.appendChild(generatedView.canvas);
    } else if (viewId == "btn1") {
        buildArchitectureOverview(viewId);
    } else if (viewId == "btn2") {
        buildExecutionOverview(viewId);
    } else if (viewId == "btn3") {
        drawStuff(viewId, "viewData");
    }
}

window.addEventListener("message", (event) => {
    if (event.data.cmd == dataCmd) {
        // Sort events
        event.data.logData.forEach((ld) => {
            if (ld.eventKind == LogEvent.CpuDecl) {
                cpuDecls.push(ld);
            } else if (ld.eventKind == LogEvent.BusDecl) {
                busDecls.push(ld);
            } else if (ld.eventKind != LogEvent.DeployObj) {
                eventsOfInterest.push(ld);
            }
        });
        cpuDecls = cpuDecls.sort((a, b) => a.id - b.id);
        busDecls = busDecls.sort((a, b) => a.id - b.id);
        buildView(firstBtnId);
    }
});

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

let logData = [];
const dataCmd = "data";

// Build the view connected to the first button on load
document.body.onload = onLoad();

// enum eventKind {
//     BUSdecl = "BUSdecl",
//     CPUdecl = "CPUdecl",
//     ThreadCreate = "ThreadCreate",
//     ThreadSwapIn = "ThreadSwapIn",
//     ThreadSwapOut = "ThreadSwapOut",
//     ThreadKill = "ThreadKill",
//     MessageRequest = "MessageRequest",
//     MessageActivate = "MessageActivate",
//     MessageCompleted = "MessageCompleted",
//     OpRequest = "OpRequest",
//     OpActivate = "OpActivate",
//     OpCompleted = "OpCompleted",
// }

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

function buildExecutionOverview(viewId, logData) {
    const canvas = document.createElement("CANVAS");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.background = "white";
    generatedViews.push({ id: viewId, canvas: canvas });

    // Sort events
    let cpudecls = [];
    let busdecls = [];
    const eventsOfInterest = [];

    logData.forEach((ld) => {
        if (ld.eventKind == "CPUdecl") {
            cpudecls.push(ld);
        } else if (ld.eventKind == "BUSdecl") {
            busdecls.push(ld);
        } else if (ld.eventKind != "DeployObj") {
            eventsOfInterest.push(ld);
        }
    });
    cpudecls = cpudecls.sort((a, b) => a.id - b.id);
    busdecls = busdecls.sort((a, b) => a.id - b.id);

    // get context and set font
    let ctx = canvas.getContext("2d");
    ctx.font = global_font;

    // Calculate text metrics and spacing
    const textMetrics = ctx.measureText("Gg");
    const margin_Y = (textMetrics.fontBoundingBoxAscent + textMetrics.fontBoundingBoxDescent) * 2;
    const gridLineWidth = 1;
    const eventLineWidth = 4;
    const eventLength = 25;
    const lineWrapperHeight = 14;
    const margin_X = 10;

    // Calculate decl text placement
    let widestText = 0;
    let current_Y_pos_text = margin_Y;
    let decls = [];
    cpudecls
        .reverse()
        .concat(busdecls)
        .forEach((decl) => {
            const txtMetrics = ctx.measureText(decl.name);
            if (txtMetrics.width > widestText) {
                widestText = txtMetrics.width;
            }

            const txtHeight = textMetrics.fontBoundingBoxAscent + textMetrics.fontBoundingBoxDescent;

            decls.push({
                name: decl.name,
                kind: decl.eventKind,
                id: decl.id,
                txt_y_pos: current_Y_pos_text,
                line_y_pos: current_Y_pos_text - txtHeight / 2 + eventLineWidth,
            });

            current_Y_pos_text += margin_Y;
        });

    const startPos_X_event = widestText + margin_X * 2;

    canvas.width = eventsOfInterest.length * eventLength + eventLength + startPos_X_event;
    canvas.height = cpudecls.concat(busdecls).length * margin_Y + margin_Y;

    // Get context again after resize
    ctx = canvas.getContext("2d");
    ctx.font = global_font;

    // Draw decl text
    decls.forEach((decl) => {
        ctx.fillText(decl.name, margin_X, decl.txt_y_pos);
    });

    // Draw events for decls
    let currentPos_X_event = startPos_X_event;
    let currentBusId = 0;
    let prev_Y_pos = 0;
    let msgTargetCpuId;
    let currentCpuId = 0;
    let activeThreads = [];
    for (let i = 0; i < eventsOfInterest.length; i++) {
        const event = eventsOfInterest[i];
        const isCpuEvent = !isBusEvent(event.eventKind);
        const nextPos_X_event = currentPos_X_event + eventLength;
        currentBusId = event.eventKind == "MessageRequest" ? event.busid : currentBusId;
        msgTargetCpuId = event.eventKind == "MessageRequest" || event.eventKind == "ReplyRequest" ? event.tocpu : msgTargetCpuId;
        currentCpuId = isCpuEvent ? event.cpunm : currentCpuId;
        const current_Y_pos = decls.find(
            (decl) => decl.kind == (isCpuEvent ? "CPUdecl" : "BUSdecl") && decl.id == (isCpuEvent ? currentCpuId : currentBusId)
        ).line_y_pos;

        decls.forEach((decl) => {
            ctx.beginPath();
            if (activeThreads.find((thread) => thread.y_pos == decl.line_y_pos && thread.y_pos != current_Y_pos)) {
                ctx.lineWidth = eventLineWidth;
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = "#0040ff";
                ctx.moveTo(currentPos_X_event + eventLineWidth, decl.line_y_pos);
                ctx.lineTo(nextPos_X_event, decl.line_y_pos);
                ctx.stroke();
            } else if (decl.line_y_pos != current_Y_pos) {
                ctx.strokeStyle = "#000000";
                ctx.lineWidth = gridLineWidth;
                ctx.setLineDash([1, 4]);
                ctx.moveTo(currentPos_X_event + gridLineWidth, decl.line_y_pos);
                ctx.lineTo(nextPos_X_event, decl.line_y_pos);
                ctx.stroke();
            }
        });

        // Keep track of threads that have been swapped in but not out
        if (event.eventKind == "ThreadSwapIn" || event.eventKind == "DelayedThreadSwapIn") {
            activeThreads.push({ cpunm: event.cpunm, threadid: event.id, y_pos: current_Y_pos });
        } else if (event.eventKind == "ThreadSwapOut") {
            const index = activeThreads.findIndex((at) => at.threadid == event.id);
            if (index > -1) {
                activeThreads.splice(index, 1);
            }
        }

        // Draw event
        ctx.beginPath();
        ctx.lineWidth = eventLineWidth;
        ctx.setLineDash([]);
        ctx.strokeStyle = eventKindToColor(event.eventKind);
        ctx.moveTo(currentPos_X_event, current_Y_pos);
        ctx.lineTo(nextPos_X_event, current_Y_pos);
        ctx.stroke();

        // Draw event arrows
        if (event.eventKind == "MessageRequest" || event.eventKind == "ReplyRequest" || event.eventKind == "MessageCompleted") {
            const pos_x = event.eventKind == "MessageCompleted" ? nextPos_X_event : currentPos_X_event;
            let end_y = current_Y_pos - lineWrapperHeight;
            let start_y = prev_Y_pos + lineWrapperHeight;

            if (event.eventKind == "MessageCompleted") {
                const cpu_Y_pos = decls.find((decl) => decl.kind == "CPUdecl" && decl.id == msgTargetCpuId).line_y_pos;
                end_y = cpu_Y_pos + lineWrapperHeight;
                start_y = current_Y_pos - lineWrapperHeight;
            }

            drawArrow(ctx, pos_x, start_y, pos_x, end_y, 3, 5, false, gridLineWidth, "#000000");
        }

        // Mark event with "line wrapper"
        if (i != eventsOfInterest.length - 1 && !isOperationEvent(event.eventKind)) {
            ctx.beginPath();
            ctx.lineWidth = gridLineWidth;
            ctx.strokeStyle = "#000000";
            ctx.setLineDash([]);
            ctx.moveTo(nextPos_X_event, current_Y_pos - lineWrapperHeight / 2);
            ctx.lineTo(nextPos_X_event, current_Y_pos + lineWrapperHeight / 2);

            if (current_Y_pos != prev_Y_pos || (i > 0 && isOperationEvent(eventsOfInterest[i - 1].eventKind))) {
                ctx.moveTo(currentPos_X_event, current_Y_pos - lineWrapperHeight / 2);
                ctx.lineTo(currentPos_X_event, current_Y_pos + lineWrapperHeight / 2);
            }

            ctx.stroke();
        }

        // Mark thread event
        if (isThreadEvent(event.eventKind)) {
            ctx.font = "15px Arial";
            const textMeasure = ctx.measureText(event.id);
            const textHeight = textMeasure.fontBoundingBoxAscent + textMeasure.fontBoundingBoxDescent;
            const textWidth = textMeasure.width;
            const text_Y_pos = current_Y_pos - eventLineWidth;
            ctx.fillText(event.id, currentPos_X_event + (eventLength - textWidth) / 2, text_Y_pos);
            ctx.font = global_font;

            if (event.eventKind == "ThreadSwapOut" || event.eventKind == "ThreadSwapIn" || event.eventKind == "DelayedThreadSwapIn") {
                const pos_x = currentPos_X_event + eventLength / 2;
                const errowLength = lineWrapperHeight;
                const isSwapIn = event.eventKind == "ThreadSwapIn" || event.eventKind == "DelayedThreadSwapIn";
                const end_y = text_Y_pos - errowLength - textHeight - (isSwapIn ? eventLineWidth : 0);
                const start_y = text_Y_pos - textHeight - (isSwapIn ? eventLineWidth : 0);
                drawArrow(ctx, pos_x, start_y, pos_x, end_y, 2, 4, true, eventLineWidth, eventKindToColor(event.eventKind), isSwapIn);
            }
        }
        prev_Y_pos = current_Y_pos;
        currentPos_X_event = nextPos_X_event;
    }

    viewContainer.appendChild(canvas);
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

function isThreadEvent(eventKind) {
    return (
        eventKind == "ThreadKill" ||
        eventKind == "ThreadSwapOut" ||
        eventKind == "ThreadSwapIn" ||
        eventKind == "ThreadCreate" ||
        eventKind == "DelayedThreadSwapIn"
    );
}

function isBusEvent(eventKind) {
    return (
        eventKind == "ReplyRequest" || eventKind == "MessageCompleted" || eventKind == "MessageActivate" || eventKind == "MessageRequest"
    );
}

function eventKindToColor(eventKind) {
    const color_threadCreate = "#00ff00";
    const color_threadCreateKill = "#ff0000";
    const color_operation = "#0000ff";
    const color_threadSwap = "#808080";
    const color_messageRequest = "#8000ff";
    const color_messageActivate = "#bf00ff";
    const color_messageCompleted = "#ff00ff";

    return eventKind == "MessageRequest" || eventKind == "ReplyRequest"
        ? color_messageRequest
        : eventKind == "MessageActivate"
        ? color_messageActivate
        : eventKind == "MessageCompleted"
        ? color_messageCompleted
        : eventKind == "ThreadCreate"
        ? color_threadCreate
        : eventKind == "ThreadSwapIn" || eventKind == "ThreadSwapOut" || eventKind == "DelayedThreadSwapIn"
        ? color_threadSwap
        : eventKind == "ThreadKill"
        ? color_threadCreateKill
        : color_operation;
}

function isOperationEvent(event) {
    return event == "OpRequest" || event == "OpActivate" || event == "OpCompleted";
}

function buildArchitectureOverview(viewId, logData) {
    const canvas = document.createElement("CANVAS");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.background = "white";
    generatedViews.push({ id: viewId, canvas: canvas });

    let cpudecls = [];
    let busdecls = [];

    logData.forEach((data) => {
        if (data.eventKind == "CPUdecl") {
            cpudecls.push(data);
        }

        if (data.eventKind == "BUSdecl") {
            busdecls.push(data);
        }
    });

    cpudecls = cpudecls.sort((a, b) => a.id - b.id);
    busdecls = busdecls.sort((a, b) => a.id - b.id);

    // Set text style to calculate text sizes
    let ctx = canvas.getContext("2d");
    ctx.font = global_font;

    // Find start position for rectangles on the x axis and find the max text height.
    let busTextWidth = 0;
    let busTextHeight = 0;
    busdecls.forEach((busdecl) => {
        // The startig position for the rectangle on the x axis should be max text width + predefined margin
        const metrics = ctx.measureText(busdecl.name);
        const totalWidth = metrics.width + metrics.width / 5;
        if (totalWidth > busTextWidth) {
            busTextWidth = totalWidth;
        }

        // Find the max text height
        const textHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
        if (busTextHeight < textHeight) {
            busTextHeight = textHeight;
        }
    });
    const busText_Y_increment = busTextHeight * 2;

    // Calculate position for the rectangles and the text inside
    const margin = busTextWidth / 10;
    let nextRect_X_pos = busTextWidth;
    const padding = margin * 2;
    const rects = [];
    let rectBottom_Y_pos;
    cpudecls.forEach((cpud) => {
        const textMetrics = ctx.measureText(cpud.name);
        const textHeight = textMetrics.fontBoundingBoxAscent + textMetrics.fontBoundingBoxDescent;
        const actualTextHeight = textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;
        const rectWidth = textMetrics.width + padding * 2;
        const rectHeight = textHeight + padding;

        // Save position information for the rectangle
        rects.push({ text: cpud.name, id: cpud.id, start: nextRect_X_pos, width: rectWidth, height: rectHeight, textHeight: textHeight });
        nextRect_X_pos += textMetrics.width + padding * 2 + margin;
        if (!rectBottom_Y_pos) {
            rectBottom_Y_pos = rectHeight + margin;
        }
    });

    // Resize canvas to fit content
    canvas.height = rectBottom_Y_pos + busText_Y_increment * busdecls.length + busTextHeight;
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
        ctx.fillText(rect.text, rect.start + padding, margin + rect.textHeight);
    });

    // Concat all connections for each rectangle
    const rectConnections = [];
    busdecls.forEach((busdecl) => {
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
    let nextBusName_Y_pos = rectBottom_Y_pos + busText_Y_increment;
    const colors = ["#000000", "#c90000", "#00c800", "#0000c9", "#bf00ff", "#ffbf00"];

    for (let i = 0; i < busdecls.length; i++) {
        const bus = busdecls[i];

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
        ctx.moveTo(linePlacementOnFromRect, rectBottom_Y_pos);
        ctx.lineTo(linePlacementOnFromRect, nextBusName_Y_pos);

        // Draw the rest of the lines connecting the outgoing part
        bus.topo.to.forEach((toId) => {
            const toRect = rects.find((rect) => rect.id == toId);
            const toRectConn = rectConnections.find((rect) => rect.id == toId);

            // Make sure that lines are spaced evenly on the "to" rectangle
            const linePlacementOnToRect = (toRect.width / (toRectConn.connections + 1)) * ++toRectConn.established + toRect.start;

            // Draw the line from the latest "lineTo" position
            ctx.lineTo(linePlacementOnToRect, nextBusName_Y_pos);
            ctx.lineTo(linePlacementOnToRect, rectBottom_Y_pos);
            ctx.stroke();

            // Reset to the outgoing line from this rectangle
            ctx.moveTo(linePlacementOnToRect, nextBusName_Y_pos);
        });

        // Draw the name of the bus
        ctx.fillText(bus.name, margin, nextBusName_Y_pos + busTextHeight / 2);

        // Increment y position for next bus name
        nextBusName_Y_pos += busText_Y_increment;
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
        buildArchitectureOverview(viewId, logData);
    } else if ((viewId = "btn2")) {
        buildExecutionOverview(viewId, logData);
    } else if ((viewId = "btn3")) {
        drawStuff(viewId, "viewData");
    }
}

window.addEventListener("message", (event) => {
    if (event.data.cmd == dataCmd) {
        logData = event.data.data;
        buildView(firstBtnId);
    }
});

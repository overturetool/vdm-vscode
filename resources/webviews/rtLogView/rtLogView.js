// SPDX-License-Identifier: GPL-3.0-or-later

/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable eqeqeq */

const vscode = acquireVsCodeApi();

// Get the view container
const viewContainer = document.getElementById("viewContainer");
viewContainer.classList.add("viewContainer");
const btnContainer = document.getElementById("btnsContainer");

// Global const variables
const archViewId = "arch";
const execViewId = "exec";
const legendViewId = "legend";
const settingsChangedMsg = "settingsChanged";
const initMsg = "init";
const btnColors = {};
const views = [];
const viewButtons = Array.from(document.getElementsByClassName("button")).filter((btn) => btn.id != "tup" && btn.id != "tdown");
const timeUpBtn = document.getElementById("tup");
const timeDownBtn = document.getElementById("tdown");
const timeOptions = document.getElementById("timeOptions");
const timeSelectorElement = document.getElementById("timeSelector");
timeSelectorElement.style.visibility = "hidden";
const workerSource = document.currentScript.getAttribute("src").replace("rtLogView.js", "diagramWorker.js");

// Global variables
let fontSize;
let backgroundColor;
let currentViewId = archViewId;
let selectedTime = 0;
let hasConjectures = false;
let conjectures;
let cpusWithEvents = [];
let timestamps = [];
let logEvents;

// Offload the canvas generation logic to a webworker so that the main thread is not being blocked
let diagramWorker;
fetch(workerSource)
    .then((result) => result.blob())
    .then((blob) => {
        // Start the webworker
        const blobUrl = URL.createObjectURL(blob);
        diagramWorker = new Worker(blobUrl);
        // Handle responses from the worker i.e. when it has created a canvas.
        diagramWorker.onmessage = handleWorkerResponse;

        // Post init msg to the ts backend which in turn returns the log data
        vscode.postMessage(initMsg);
        // Make sure that the worker terminates before closing the window
        window.onbeforeunload = () => {
            diagramWorker.terminate();
        };
    });

// Handle button press
viewButtons.forEach((btn) => {
    // Each button corresponds to a view
    views.push({ id: btn.id, containers: [] });
    btn.onclick = function () {
        if (btn.id != currentViewId) {
            // Update the pressed button to "pressed" color and the previous pressed button to "standard" color
            setButtonColors([document.getElementById(currentViewId)], btn);
            // Clear the view container
            viewContainer.innerHTML = "";
            currentViewId = btn.id;

            // Populate the time selector with the timestamps for the view. Cpu views does not have all timestamps.
            if (currentViewId != archViewId && currentViewId != legendViewId) {
                let newtimestamps = undefined;
                if (currentViewId != archViewId && currentViewId != execViewId && currentViewId != legendViewId) {
                    const cpuId = currentViewId.replace(/\D/g, "");
                    newtimestamps = cpusWithEvents.find((cwe) => cwe.id == cpuId).timestamps;
                } else {
                    newtimestamps = timestamps;
                }

                timeOptions.innerHTML = "";
                // Setup timestamp options to be selected by the user
                newtimestamps.forEach((timestamp) => {
                    const opt = document.createElement("option");
                    opt.value = timestamp;
                    opt.innerHTML = timestamp;
                    timeOptions.appendChild(opt);
                });
                // Reset selectedTime
                selectedTime = newtimestamps[0];
                // Display the time selector
                timeSelectorElement.style.visibility = "visible";
            } else {
                // Hide the time selector
                timeSelectorElement.style.visibility = "hidden";
            }

            // Display the selected view and set the current view id - the btn id is the view id
            displayView(currentViewId, selectedTime);
        }
    };
});

// Handle user choosing a new start time
timeOptions.onchange = (event) => handleSelectedTimeChanged(event.target.value);

timeUpBtn.onclick = () => {
    if (timeOptions.selectedIndex - 1 > -1) {
        timeOptions.selectedIndex--;
        handleSelectedTimeChanged(timeOptions.value);
    }
};

timeDownBtn.onclick = () => {
    if (timeOptions.length != timeOptions.selectedIndex + 1) {
        timeOptions.selectedIndex++;
        handleSelectedTimeChanged(timeOptions.value);
    }
};

// Handle event from extension backend
window.addEventListener("message", (event) => {
    if (event.data.cmd == initMsg) {
        timestamps = event.data.timestamps;
        selectedTime = timestamps[0];
        hasConjectures = event.data.conjectures.length > 0;
        conjectures = event.data.conjectures;
        cpusWithEvents = event.data.cpusWithEvents;
        logEvents = event.data.logEvents;

        // Trigger the initiate logic in the diagram worker
        const osCanvas = new OffscreenCanvas(window.innerWidth, window.innerHeight);
        diagramWorker.postMessage(
            {
                msg: initMsg,
                logEvents: logEvents,
                cpuDecls: event.data.cpuDecls,
                busDecls: event.data.busDecls,
                executionEvents: event.data.executionEvents,
                cpusWithEvents: event.data.cpusWithEvents,
                conjectures: conjectures,
                canvas: osCanvas,
                diagramSize: { width: Math.round(screen.width * 0.9), height: Math.round(screen.height * 0.9) },
                styling: getFontsAndColors(event.data.fontSize, event.data.matchTheme),
            },
            [osCanvas]
        );
    } else if (event.data.cmd == settingsChangedMsg) {
        // Post updated font and size properties to the worker
        diagramWorker.postMessage({
            msg: settingsChangedMsg,
            ...getFontsAndColors(event.data.fontSize, event.data.matchTheme),
        });
    }

    // Set button colors
    setButtonColors(
        viewButtons.filter((btn) => btn.id != currentViewId),
        document.getElementById(currentViewId)
    );

    // Remove existing view containers to trigger a complete rebuild of the canvas
    views.forEach((view) => (view.containers = []));

    displayView(currentViewId, selectedTime);
});

window.onresize = () => {
    // Handle vertical overflow. If the diagram overflows, i.e. is larger than the visible area a scrollbar should appear but only for the diagram.
    viewContainer.style.height = `${getViewContainerHeight()}px`;
};

function generateCanvas(viewId, startTime) {
    const offscreen = new OffscreenCanvas(window.innerWidth, window.innerHeight);
    // Post message to the webworker to initiate the canvas generation
    diagramWorker.postMessage({ msg: viewId, canvas: offscreen, startTime: startTime }, [offscreen]);
}

function generateConjectureTable(conjectures) {
    const table = document.createElement("table");
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
            // Click listener for focusing the diagram on the time of the conjecture violation
            if ((content.header == headerNames[3] || content.header == headerNames[5]) && content.value != "") {
                rowCell.classList.add("clickableCell");
                rowCell.ondblclick = () => {
                    handleSelectedTimeChanged(content.value);
                    timeOptions.value = selectedTime;
                };
            }
        });
    });

    return table;
}

function handleSelectedTimeChanged(newTime) {
    selectedTime = newTime;
    displayView(currentViewId, selectedTime);
}

function displayView(viewId, timeStamp) {
    const view = views.find((view) => view.id == viewId);
    // Check if components for the view have already been generated for the timestamp and if they exist then reuse them
    if (view.containers.length == 0 || (view.time != timeStamp && viewId != archViewId && viewId != legendViewId)) {
        generateCanvas(viewId, timeStamp);
    } else {
        viewContainer.innerHTML = "";
        view.containers.forEach((container) => viewContainer.appendChild(container));
    }
    view.time = timeStamp;
}

function bitmapToCanvas(bitmap) {
    const canvas = document.createElement("CANVAS");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("bitmaprenderer").transferFromImageBitmap(bitmap);
    return canvas;
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

function handleWorkerResponse(event) {
    // The worker responds with a diagram in form of a bitmap. Add it to the view container as a canvas
    const data = event.data;
    const view = views.find((view) => view.id == data.msg);

    // Container for the diagram
    const mainContainer = document.createElement("div");
    mainContainer.classList.add("mainContainer");

    // Append the canvas
    mainContainer.appendChild(bitmapToCanvas(data.bitmap));
    view.containers = [mainContainer];

    // Add conjeture table if the view is the execeution view and it has conjectures
    if (data.msg == execViewId && conjectures && conjectures.length > 0) {
        const secondContainer = document.createElement("div");
        secondContainer.classList.add("secondaryContainer");

        // Setup container for the table
        const tableContainer = document.createElement("div");
        tableContainer.classList.add("tableContainer");
        const tableHeader = document.createElement("h1");
        tableHeader.textContent = "Validation Conjecture Violations";
        tableHeader.style.fontSize = `${fontSize * 1.5}px`;
        tableContainer.appendChild(tableHeader);
        tableContainer.appendChild(generateConjectureTable(conjectures));
        secondContainer.appendChild(tableContainer);
        view.containers.push(secondContainer);
    }

    // Clear the view container and add the new elements
    viewContainer.innerHTML = "";
    viewContainer.style.height = `${getViewContainerHeight()}px`;
    view.containers.forEach((container) => viewContainer.appendChild(container));
}

function getViewContainerHeight() {
    const computedStyle = window.getComputedStyle(btnContainer);
    return (
        window.innerHeight -
        Math.ceil(btnContainer.offsetHeight + parseFloat(computedStyle["marginTop"]) + parseFloat(computedStyle["marginBottom"]))
    );
}

function getFontsAndColors(baseFontSize, matchTheme) {
    const computedStyle = getComputedStyle(document.body);
    // Update font properties
    baseFontSize =
        baseFontSize == undefined ? Number(computedStyle.getPropertyValue("--vscode-editor-font-size").replace(/\D/g, "")) : baseFontSize;
    const fontFamily = computedStyle.getPropertyValue("--vscode-editor-font-family").trim();
    const fontColor = matchTheme ? computedStyle.getPropertyValue("--vscode-editor-foreground").trim() : "#000000";

    // Update background color for the diagrams
    backgroundColor = matchTheme ? computedStyle.getPropertyValue("--vscode-editor-background").trim() : "#ffffff";

    // Update colors for events.
    let eventKindsToColors = new Map();
    for (const eventKind of Object.values(logEvents)) {
        const color =
            eventKind == logEvents.threadKill
                ? matchTheme
                    ? computedStyle.getPropertyValue("--vscode-statusBar-debuggingBackground").trim()
                    : "#a1260d"
                : eventKind == logEvents.threadCreate
                ? matchTheme
                    ? computedStyle.getPropertyValue("--vscode-debugIcon-startForeground").trim()
                    : "#388a34"
                : eventKind == logEvents.threadSwapOut
                ? matchTheme
                    ? computedStyle.getPropertyValue("--vscode-debugIcon-stopForeground").trim()
                    : "#cc6633"
                : eventKind == logEvents.threadSwapIn
                ? matchTheme
                    ? computedStyle.getPropertyValue("--vscode-debugIcon-breakpointCurrentStackframeForeground").trim()
                    : "#bf8803"
                : eventKind == logEvents.delayedThreadSwapIn
                ? matchTheme
                    ? computedStyle.getPropertyValue("--vscode-editorOverviewRuler-findMatchForeground").trim()
                    : "#d186167d"
                : eventKind == logEvents.messageRequest
                ? "#808080"
                : eventKind == logEvents.replyRequest
                ? "#737373"
                : eventKind == logEvents.messageActivate
                ? "#D0D0D0"
                : eventKind == logEvents.messageCompleted
                ? "#B5B5B5"
                : eventKind == logEvents.opRequest
                ? matchTheme
                    ? computedStyle.getPropertyValue("--vscode-debugIcon-continueForeground").trim()
                    : "#007acc"
                : eventKind == logEvents.opActivate
                ? matchTheme
                    ? computedStyle.getPropertyValue("--vscode-debugIcon-continueForeground").trim()
                    : "#007acc"
                : eventKind == logEvents.opCompleted
                ? matchTheme
                    ? computedStyle.getPropertyValue("--vscode-debugIcon-continueForeground").trim()
                    : "#007acc"
                : "";
        eventKindsToColors.set(eventKind, color);
    }

    for (const key of eventKindsToColors.keys()) {
        const color = eventKindsToColors.get(key);
        if (!color) {
            eventKindsToColors.set(key, fontColor);
        }
    }

    // Update theme colors used in the architecture view
    let themeColors = [matchTheme ? fontColor : "#000000"];
    [...eventKindsToColors.values()].forEach((color) => {
        if (!themeColors.find((tc) => tc == color)) {
            themeColors.push(color);
        }
    });
    themeColors.push(computedStyle.getPropertyValue("--vscode-debugIcon-disconnectForeground").trim());
    themeColors.push(computedStyle.getPropertyValue("--vscode-charts-green").trim());
    themeColors.push(computedStyle.getPropertyValue("--vscode-charts-purple").trim());
    themeColors.forEach((color) => {
        if (color == undefined) {
            color = fontColor;
        }
    });

    // Update button colors
    btnColors.primaryBackground = computedStyle.getPropertyValue("--vscode-button-background").trim();
    btnColors.secondaryBackground = computedStyle.getPropertyValue("--vscode-button-secondaryBackground").trim();
    btnColors.primaryForeground = computedStyle.getPropertyValue("--vscode-button-foreground").trim();
    btnColors.secondaryForeground = computedStyle.getPropertyValue("--vscode-button-secondaryForeground").trim();
    const gridLineWidth = baseFontSize / 10 > 1 ? baseFontSize / 10 : 1;
    const eventLineWidth = gridLineWidth * 4;

    return {
        eventLineWidth: eventLineWidth,
        gridLineWidth: gridLineWidth,
        themeColors: themeColors,
        eventKindsToColors: eventKindsToColors,
        backgroundColor: backgroundColor,
        conjectureViolationColor: matchTheme ? computedStyle.getPropertyValue("--vscode-debugIcon-breakpointForeground").trim() : "#FF0000",
        fontColor: fontColor,
        fontSize: baseFontSize,
        fontFamily: fontFamily,
    };
}

// SPDX-License-Identifier: GPL-3.0-or-later

const vscode = acquireVsCodeApi();

const Btn1 = document.getElementById("btn1");
// const Btn1 = document.createElement("button");
// Btn1.id = "btn1";
// document.body.appendChild(Btn1);

const Btn2 = document.getElementById("btn2");
// const Btn2 = document.createElement("button");
// Btn2.id = "btn2";
// document.body.appendChild(Btn2);

const IBtn = document.getElementById("ibtn");

// const IBtn = document.createElement("button");
// IBtn.id = "ibtn";
// document.body.appendChild(IBtn);

// create view container
const viewContainer = document.createElement("div");
viewContainer.id = "viewContainer";
document.body.appendChild(viewContainer);

IBtn.onclick = function () {
    if (currentViewId == "initial") return;
    buildView("initial");
};

Btn1.onclick = function () {
    if (currentViewId == "view1") return;
    buildView("view1");
};

Btn2.onclick = function () {
    if (currentViewId == "view2") return;
    buildView("view2");
};

let currentViewId = "";

function buildView(cmd) {
    // Clear the container
    viewContainer.innerHTML = "";

    vscode.postMessage({
        command: cmd,
    });
}

function buildInitialView(content) {
    // create a new div element
    const newDiv = document.createElement("div");

    // and give it some content
    const newContent = document.createTextNode(content);

    // add the text node to the newly created div
    newDiv.appendChild(newContent);

    newDiv.style.color = "yellow";
    viewContainer.appendChild(newDiv);
    currentViewId = "initial";
}

function buildFirstView(content) {
    // create a new div element
    const newDiv = document.createElement("div");

    // and give it some content
    const newContent = document.createTextNode(content);

    // add the text node to the newly created div
    newDiv.appendChild(newContent);

    newDiv.style.color = "blue";
    viewContainer.appendChild(newDiv);

    currentViewId = "view1";
}

function buildSecondView(content) {
    // create a new div element
    const newDiv = document.createElement("div");

    // and give it some content
    const newContent = document.createTextNode(content);

    // add the text node to the newly created div
    newDiv.appendChild(newContent);

    newDiv.style.color = "red";
    viewContainer.appendChild(newDiv);

    currentViewId = "view2";
}

window.addEventListener("message", (event) => {
    switch (event.data.command) {
        case "initial":
            buildInitialView(event.data.data);
            break;
        case "view1":
            buildFirstView(event.data.data);
            break;
        case "view2":
            buildSecondView(event.data.data);
    }
});

document.body.onload = buildView("initial");

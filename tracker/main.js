import { getSong, getInstrument, getPattern } from "./song.js"
import { drawOrders, drawPattern } from "./render.js";
import { handleInput } from "./input.js";

const cellWidth = 16;
const cellHeight = 16;

let state = {
	pattern: 0,
	row: 0,
	channel: 0,
	column: 0,
	recording: false,
	octave: 3,
	editOrder: false,
	firstOrderNumberTyped: false,
	currentInstrument: 0,
	currentSeqType: "volume",
	patternControlsActive: true,
	view: "pattern",
	isPlaying: false,
	draggingSampleEdge: null, // "start" or "end"
	channelMute: [false, false, false, false],
	playbackRow: -1,
	playbackPattern: -1
};

let song = getSong(4, 32);

// Ensure loaded song has all required fields (older saves may be missing some)
function sanitizeSong(s) {
	if (!s.effectsInUse) s.effectsInUse = Array(s.channelCount || 4).fill(1);
	if (!s.primaryHighlight) s.primaryHighlight = 16;
	if (!s.secondaryHighlight) s.secondaryHighlight = 4;
	if (!s.rowsPerPattern) s.rowsPerPattern = 32;
	if (!s.bpm) s.bpm = 120;
	if (!s.rowsPerBeat) s.rowsPerBeat = 4;
	if (!s.channelCount) s.channelCount = 4;
	if (!s.instruments) s.instruments = [getInstrument()];
	if (!s.orders) s.orders = [[0, 0, 0, 0]];
	if (!s.patterns) s.patterns = [getPattern(s.channelCount, s.rowsPerPattern)];
	// Ensure each channel in each pattern has effectsInUse
	for (let p of s.patterns) {
		if (!p) continue;
		for (let c of p) {
			if (c && !c.effectsInUse) c.effectsInUse = 1;
		}
	}
	// Ensure instruments have all fields
	s.instruments = s.instruments.map(inst => ({
		...getInstrument(inst.name),
		...inst
	}));
	return s;
}

// Update initial instruments to new format if needed
song.instruments = song.instruments.map(inst => ({
	...getInstrument(inst.name),
	...inst
}));

// Undo/Redo system
let undoStack = [];
let redoStack = [];
const MAX_UNDO = 100;

window.pushUndo = function () {
	undoStack.push(JSON.parse(JSON.stringify(song)));
	if (undoStack.length > MAX_UNDO) undoStack.shift();
	redoStack = [];
};

window.doUndo = function () {
	if (undoStack.length === 0) return;
	redoStack.push(JSON.parse(JSON.stringify(song)));
	song = sanitizeSong(undoStack.pop());
	window.song = song;
	resetState();
	if (state.view === "pattern") renderPatternInstruments();
};

window.doRedo = function () {
	if (redoStack.length === 0) return;
	undoStack.push(JSON.parse(JSON.stringify(song)));
	song = sanitizeSong(redoStack.pop());
	window.song = song;
	resetState();
	if (state.view === "pattern") renderPatternInstruments();
};

let songEditorDiv = document.createElement("div");
songEditorDiv.className = "editor-container";
songEditorDiv.style.display = "none";

let instrumentEditorDiv = document.createElement("div");
instrumentEditorDiv.className = "editor-container";
instrumentEditorDiv.style.display = "none";

// ── Top bar with tabs + status info ──
const topBar = document.createElement("div");
topBar.className = "top-bar";

const tabGroup = document.createElement("div");
tabGroup.className = "tab-group";

const btnP = document.createElement("button");
btnP.className = "tab-btn active"; btnP.textContent = "Pattern";
const btnI = document.createElement("button");
btnI.className = "tab-btn"; btnI.textContent = "Instrument";
const btnS = document.createElement("button");
btnS.className = "tab-btn"; btnS.textContent = "Song";

tabGroup.append(btnP, btnI, btnS);

const statusInfo = document.createElement("div");
statusInfo.className = "status-info";
const statusFields = [
	{ id: "sOct", label: "OCT" },
	{ id: "sBpm", label: "BPM" },
	{ id: "sRow", label: "ROW" },
	{ id: "sOrd", label: "ORD" },
	{ id: "sCh", label: "CH" },
	{ id: "sRec", label: "REC" },
	{ id: "sPlay", label: "PLAY" }
];
const statusEls = {};
statusFields.forEach(f => {
	const item = document.createElement("div");
	item.className = "status-item";
	const lbl = document.createElement("span");
	lbl.textContent = f.label;
	const val = document.createElement("span");
	val.className = "status-value";
	item.append(lbl, val);
	statusInfo.appendChild(item);
	statusEls[f.id] = val;
});

topBar.append(tabGroup, statusInfo);

// ── Pattern editor: main-area with sidebars ──
const patternEditorDiv = document.createElement("div");
patternEditorDiv.className = "main-area";

// Left sidebar (orders)
const leftSidebar = document.createElement("div");
leftSidebar.className = "sidebar-left";
leftSidebar.style.width = "180px";
leftSidebar.style.minWidth = "180px";

const ordersTitle = document.createElement("div");
ordersTitle.className = "sidebar-title";
ordersTitle.textContent = "ORDERS";
leftSidebar.appendChild(ordersTitle);

// Channel mute bar
const muteBar = document.createElement("div");
muteBar.className = "mute-bar";

function updateMuteButtons() {
	Array.from(muteBar.children).forEach((btn, i) => {
		btn.classList.toggle("muted", state.channelMute[i]);
	});
}

const channelLabels = ["S1", "S2", "S3", "N"];
channelLabels.forEach((label, i) => {
	const btn = document.createElement("button");
	btn.className = "mute-btn";
	btn.textContent = label;
	btn.onclick = () => {
		state.channelMute[i] = !state.channelMute[i];
		updateMuteButtons();
		if (window.audioNode) {
			window.audioNode.port.postMessage({ type: "MUTE_STATE", channels: state.channelMute });
		}
	};
	muteBar.appendChild(btn);
});
leftSidebar.appendChild(muteBar);

const dpr = window.devicePixelRatio || 1;
let orderCanvas = document.createElement("canvas");
orderCanvas.style.width = "100%";
orderCanvas.style.flex = "1";
orderCanvas.style.minHeight = "0";
orderCanvas.width = 180 * dpr;
orderCanvas.height = 10 * cellHeight * dpr;
let orderCtx = orderCanvas.getContext("2d");
orderCtx.scale(dpr, dpr);
leftSidebar.appendChild(orderCanvas);

// Left toggle
const leftToggle = document.createElement("button");
leftToggle.className = "sidebar-toggle";
leftToggle.textContent = "\u25C0";
leftToggle.onclick = () => {
	leftSidebar.classList.toggle("collapsed");
	leftToggle.textContent = leftSidebar.classList.contains("collapsed") ? "\u25B6" : "\u25C0";
	handleResize();
};

// Pattern canvas area
const patternCanvasArea = document.createElement("div");
patternCanvasArea.className = "pattern-canvas-area";

let patternCanvas = document.createElement("canvas");
let patternCtx = patternCanvas.getContext("2d");
patternCanvasArea.appendChild(patternCanvas);

// Right toggle
const rightToggle = document.createElement("button");
rightToggle.className = "sidebar-toggle";
rightToggle.textContent = "\u25B6";
rightToggle.onclick = () => {
	rightSidebar.classList.toggle("collapsed");
	rightToggle.textContent = rightSidebar.classList.contains("collapsed") ? "\u25C0" : "\u25B6";
	handleResize();
};

// Right sidebar (instruments)
const rightSidebar = document.createElement("div");
rightSidebar.className = "sidebar-right";
rightSidebar.style.width = "200px";
rightSidebar.style.minWidth = "200px";

const instTitle = document.createElement("div");
instTitle.className = "sidebar-title";
instTitle.textContent = "INSTRUMENTS";
rightSidebar.appendChild(instTitle);

patternEditorDiv.append(leftSidebar, leftToggle, patternCanvasArea, rightToggle, rightSidebar);

// Click-to-seek on pattern canvas
patternCanvas.addEventListener("click", (e) => {
	const rect = patternCanvas.getBoundingClientRect();
	const clickX = e.clientX - rect.left;
	const clickY = e.clientY - rect.top;

	const targetBuffer = rect.height * 0.25;
	const verticalBuffer = Math.floor(targetBuffer / cellHeight) * cellHeight;
	const translationY = verticalBuffer - cellHeight * state.row;
	const canvasRow = Math.floor((clickY - translationY) / cellHeight);

	if (canvasRow >= 0 && canvasRow < song.rowsPerPattern) {
		let currentCell = 0;
		const pastCells = [];
		for (let i = 0; i < song.channelCount; i++) {
			const pIdx = song.orders[state.pattern][i];
			const chan = song.patterns[pIdx][i];
			currentCell += (9 + 4 * chan.effectsInUse) - 1;
			pastCells.push(currentCell);
		}
		const cellX = Math.floor(clickX / cellWidth) - 2;
		let clickedChan = 0;
		const chanStarts = [0, ...pastCells];
		for (let c = 0; c < song.channelCount; c++) {
			if (cellX >= chanStarts[c] && cellX < pastCells[c]) { clickedChan = c; break; }
		}

		if (state.isPlaying) {
			if (window.audioNode) {
				window.audioNode.port.postMessage({ type: "SEEK", orderIndex: state.pattern, row: canvasRow });
			}
		} else {
			state.row = canvasRow;
			state.channel = clickedChan;
		}
	}
});

// Click on order canvas to jump to order
orderCanvas.addEventListener("click", (e) => {
	const rect = orderCanvas.getBoundingClientRect();
	const clickY = e.clientY - rect.top;
	const row = Math.floor((clickY - cellHeight * 2) / cellHeight);
	const startingOrder = (state.pattern >> 3) << 3;
	const targetOrder = startingOrder + row;
	if (targetOrder >= 0 && targetOrder < song.orders.length) {
		if (state.isPlaying && window.audioNode) {
			window.audioNode.port.postMessage({ type: "SEEK", orderIndex: targetOrder, row: 0 });
		}
		state.pattern = targetOrder;
		state.row = 0;
	}
});

// Help overlay
const helpOverlay = document.createElement("div");
helpOverlay.className = "help-overlay";
helpOverlay.style.display = "none";
helpOverlay.innerHTML = `<div style="max-width:700px; margin:0 auto;">
<h2>Keyboard Shortcuts</h2>
<table>
<tr><td class="key">Enter</td><td>Play / Stop</td></tr>
<tr><td class="key">Shift+Enter</td><td>Play from current row</td></tr>
<tr><td class="key">Space</td><td>Toggle recording mode</td></tr>
<tr><td class="key">Arrow keys</td><td>Navigate pattern</td></tr>
<tr><td class="key">Ctrl+Arrow keys</td><td>Select region</td></tr>
<tr><td class="key">-/=</td><td>Octave down/up</td></tr>
<tr><td class="key">Z-M, Q-U</td><td>Note entry (piano keys)</td></tr>
<tr><td class="key">\\</td><td>Note off (in record mode)</td></tr>
<tr><td class="key">Insert</td><td>Insert empty row</td></tr>
<tr><td class="key">Backspace/Delete</td><td>Clear cell / remove row</td></tr>
<tr><td class="key-blue">Ctrl+Z / Ctrl+Y</td><td>Undo / Redo</td></tr>
<tr><td class="key-blue">Ctrl+C / Ctrl+V</td><td>Copy / Paste selection</td></tr>
<tr><td class="key-blue">Ctrl+X</td><td>Cut selection</td></tr>
<tr><td class="key-orange">F1</td><td>Toggle this help</td></tr>
<tr><td class="key-orange">F9-F12</td><td>Mute channel 1-4</td></tr>
<tr><td class="key-orange">Shift+Arrows</td><td>Order editor (navigate)</td></tr>
<tr><td class="key-orange">Shift+/-</td><td>Add/remove order</td></tr>
<tr><td class="key-orange">Click pattern</td><td>Set cursor / seek (when playing)</td></tr>
</table>
<h3>Effects</h3>
<table>
<tr><td class="key-orange">0</td><td>Arpeggio</td></tr>
<tr><td class="key-orange">1</td><td>Portamento up</td></tr>
<tr><td class="key-orange">2</td><td>Portamento down</td></tr>
<tr><td class="key-orange">3</td><td>Volume slide / Glissando</td></tr>
<tr><td class="key-orange">4</td><td>Vibrato</td></tr>
<tr><td class="key-orange">A</td><td>Volume slide</td></tr>
<tr><td class="key-orange">P</td><td>Retrigger</td></tr>
<tr><td class="key-orange">Q/R</td><td>Pitch slide up/down</td></tr>
<tr><td class="key-orange">V</td><td>Noise channel control</td></tr>
</table>
<p style="margin-top:30px; color:var(--text-muted);">Press F1 or Escape to close</p>
</div>`;
document.body.appendChild(helpOverlay);

window.toggleHelp = function () {
	helpOverlay.style.display = helpOverlay.style.display === "none" ? "block" : "none";
};

// ── Bottom status bar ──
const statusBar = document.createElement("div");
statusBar.className = "status-bar";
const sbFields = [
	{ id: "sbOct", label: "Octave" },
	{ id: "sbBpm", label: "BPM" },
	{ id: "sbRow", label: "Row" },
	{ id: "sbOrd", label: "Order" },
	{ id: "sbCh", label: "Channel" },
	{ id: "sbRec", label: "REC" },
	{ id: "sbPlay", label: "Playing" }
];
const sbEls = {};
sbFields.forEach(f => {
	const span = document.createElement("span");
	const lbl = document.createElement("span");
	lbl.textContent = f.label + ": ";
	const val = document.createElement("span");
	val.className = f.id === "sbRec" ? "sb-recording" : (f.id === "sbPlay" ? "sb-playing" : "sb-value");
	span.append(lbl, val);
	statusBar.appendChild(span);
	sbEls[f.id] = val;
});

// ── Assemble body ──
document.body.append(topBar, patternEditorDiv, instrumentEditorDiv, songEditorDiv, statusBar);

// Initial resize after DOM is assembled
requestAnimationFrame(() => handleResize());

function renderPatternInstruments() {
	// Keep only the title
	const title = rightSidebar.querySelector(".sidebar-title");
	rightSidebar.innerHTML = "";
	rightSidebar.appendChild(title);

	song.instruments.forEach((inst, i) => {
		const item = document.createElement("div");
		item.className = "sidebar-item" + (state.currentInstrument === i ? " active" : "");
		item.textContent = `${i.toString(16).toUpperCase().padStart(2, '0')} - ${inst.name || "Untitled"}`;

		item.onclick = () => {
			state.currentInstrument = i;
			renderPatternInstruments();
			if (window.audioNode) {
				window.audioNode.port.postMessage({
					type: "PLAY_NOTE",
					note: 48,
					instrument: song.instruments[i],
					volume: 15,
					channel: 0,
					isNoise: false,
					effect: 0,
					params: 0x00
				});
				setTimeout(() => {
					window.audioNode.port.postMessage({ type: "STOP_NOTE" });
				}, 200);
			}
		};

		item.ondblclick = () => {
			state.currentInstrument = i;
			setView("instrument");
		};

		rightSidebar.appendChild(item);
	});
}

function setView(view) {
	state.view = view;
	[patternEditorDiv, instrumentEditorDiv, songEditorDiv].forEach(d => d.style.display = "none");
	[btnP, btnI, btnS].forEach(b => b.classList.remove("active"));

	if (view === "pattern") {
		patternEditorDiv.style.display = "flex";
		btnP.classList.add("active");
		state.patternControlsActive = true;
		renderPatternInstruments();
		handleResize();
	}
	else state.patternControlsActive = false;

	if (view === "instrument") {
		instrumentEditorDiv.style.display = "block";
		btnI.classList.add("active");
		renderInstrumentEditor();
	}

	if (view === "song") {
		songEditorDiv.style.display = "block";
		btnS.classList.add("active");
		renderSongEditor();
	}
}

btnP.onclick = () => setView("pattern");
btnI.onclick = () => setView("instrument");
btnS.onclick = () => setView("song");

window.onSongChanged = (field, value) => {
	song[field] = value;
};

function handleResize() {
	const dpr = window.devicePixelRatio || 1;
	const rect = patternCanvasArea.getBoundingClientRect();
	const w = Math.floor(rect.width);
	const h = Math.floor(rect.height);
	if (w <= 0 || h <= 0) return;

	patternCanvas.style.width = w + "px";
	patternCanvas.style.height = h + "px";
	patternCanvas.width = w * dpr;
	patternCanvas.height = h * dpr;
	patternCtx = patternCanvas.getContext("2d");
	patternCtx.scale(dpr, dpr);

	const oRect = orderCanvas.getBoundingClientRect();
	if (oRect.width > 0 && oRect.height > 0) {
		orderCanvas.width = Math.floor(oRect.width) * dpr;
		orderCanvas.height = Math.floor(oRect.height) * dpr;
		orderCtx = orderCanvas.getContext("2d");
		orderCtx.scale(dpr, dpr);
	}
}

window.onresize = function () {
	handleResize();
};


//Song editor

const songLayout = document.createElement("div");
songLayout.className = "instrument-layout";
songLayout.style.display = "flex";
songLayout.style.flexDirection = "row";
songLayout.style.gap = "20px";
songLayout.style.height = "80vh";

const songSidebar = document.createElement("div");
songSidebar.className = "instrument-sidebar";
songSidebar.style.minWidth = "250px";

const songMain = document.createElement("div");
songMain.className = "instrument-main";
songMain.style.overflowY = "auto";
songMain.style.paddingRight = "10px";

songLayout.append(songSidebar, songMain);
songEditorDiv.appendChild(songLayout);

function resetState() {
	state.pattern = 0;
	state.row = 0;
	state.channel = 0;
	state.column = 0;
	state.currentInstrument = 0;
	state.recording = false;
}

function createSongField(label, key, type = "text") {
	const row = document.createElement("div");
	row.className = "row-field";
	const lbl = document.createElement("label");
	lbl.textContent = label;
	const input = document.createElement("input");
	input.type = type;
	input.value = song[key];
	input.oninput = (e) => {
		let val = type === "number" ? parseFloat(e.target.value) : e.target.value;
		song[key] = val;
		window.onSongChanged(key, val);
	};
	row.appendChild(lbl);
	row.appendChild(input);
	return row;
}

function renderSongEditor() {
	songMain.innerHTML = "";
	songSidebar.innerHTML = "";

	const songFields = [
		["Module Name", "name", "text"],
		["Author", "author", "text"],
		["Copyright", "copyright", "text"],
		["BPM", "bpm", "number"],
		["Rows Per Beat", "rowsPerBeat", "number"],
		["Rows Per Pattern", "rowsPerPattern", "number"],
		["Primary Highlight", "primaryHighlight", "number"],
		["Secondary Highlight", "secondaryHighlight", "number"]
	];

	songFields.forEach(f => songMain.appendChild(createSongField(...f)));

	// Control Buttons
	const controls = document.createElement("div");
	controls.style.display = "flex";
	controls.style.gap = "10px";
	controls.style.marginTop = "20px";

	const btnSave = document.createElement("button");
	btnSave.className = "action-btn primary";
	btnSave.textContent = "Save to Browser";
	btnSave.onclick = () => {
		const key = `dcsg_song_${song.name || "untitled"}`;
		localStorage.setItem(key, JSON.stringify(song));
		renderSongEditor();
	};

	const btnDownload = document.createElement("button");
	btnDownload.className = "action-btn";
	btnDownload.textContent = "Download JSON";
	btnDownload.onclick = () => {
		const blob = new Blob([JSON.stringify(song, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${song.name || "song"}.json`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const btnLoad = document.createElement("button");
	btnLoad.className = "action-btn";
	btnLoad.textContent = "Load from File";
	btnLoad.onclick = () => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json";
		input.onchange = (e) => {
			const file = e.target.files[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = (re) => {
				try {
					const loadedSong = JSON.parse(re.target.result);
					song = sanitizeSong(loadedSong);
					window.song = song;
					resetState();
					renderSongEditor();
				} catch (err) {
					console.error("Failed to parse song JSON");
				}
			};
			reader.readAsText(file);
		};
		input.click();
	};

	controls.append(btnSave, btnDownload, btnLoad);

	// New Song button
	const btnNew = document.createElement("button");
	btnNew.className = "action-btn warning";
	btnNew.textContent = "New Song";
	btnNew.onclick = () => {
		window.pushUndo();
		song = getSong(4, 32);
		song.instruments = song.instruments.map(inst => ({
			...getInstrument(inst.name),
			...inst
		}));
		window.song = song;
		resetState();
		renderSongEditor();
	};
	controls.appendChild(btnNew);

	songMain.appendChild(controls);

	// Sidebar Song List
	const title = document.createElement("div");
	title.className = "sidebar-title";
	title.textContent = "SAVED SONGS";
	songSidebar.appendChild(title);

	Object.keys(localStorage).forEach(key => {
		if (key.startsWith("dcsg_song_")) {
			const displayTitle = key.replace("dcsg_song_", "");
			const container = document.createElement("div");
			container.style.cssText = "display:flex; align-items:center; justify-content:space-between; cursor:pointer;";
			container.className = "sidebar-item";

			const item = document.createElement("div");
			item.style.flex = "1";
			item.textContent = displayTitle;
			item.onclick = () => {
				try {
					const loaded = JSON.parse(localStorage.getItem(key));
					song = sanitizeSong(loaded);
					window.song = song;
					resetState();
					renderSongEditor();
				} catch (e) {
					console.error("Error loading song from storage");
				}
			};

			const btnDel = document.createElement("div");
			btnDel.textContent = "×";
			btnDel.style.cssText = "color:var(--accent-red); font-weight:bold; font-size:1.4rem; padding:0 10px;";
			btnDel.onclick = (e) => {
				e.stopPropagation();
				localStorage.removeItem(key);
				renderSongEditor();
			};

			container.append(item, btnDel);
			songSidebar.appendChild(container);
		}
	});
}

//Instrument editor UI components

const instLayout = document.createElement("div");
instLayout.className = "instrument-layout";
instLayout.style.display = "flex";
instLayout.style.flexDirection = "row";
instLayout.style.gap = "20px";
instLayout.style.height = "80vh";

const instSidebarContainer = document.createElement("div");
instSidebarContainer.className = "instrument-sidebar-container";
instSidebarContainer.style.display = "flex";
instSidebarContainer.style.flexDirection = "column";
instSidebarContainer.style.minWidth = "250px";

const instControls = document.createElement("div");
instControls.className = "instrument-controls";
instControls.style.display = "flex";
instControls.style.gap = "10px";
instControls.style.padding = "10px 0";
instControls.style.marginBottom = "10px";

const addInstBtn = document.createElement("button");
addInstBtn.className = "action-btn primary";
addInstBtn.textContent = "+";
addInstBtn.style.flex = "1";
addInstBtn.style.padding = "5px";
addInstBtn.onclick = () => {
	song.instruments.push(getInstrument());
	state.currentInstrument = song.instruments.length - 1;
	renderInstrumentEditor();
};

const remInstBtn = document.createElement("button");
remInstBtn.className = "action-btn danger";
remInstBtn.textContent = "-";
remInstBtn.style.flex = "1";
remInstBtn.style.padding = "5px";
remInstBtn.onclick = () => {
	if (song.instruments.length > 1) {
		song.instruments.splice(state.currentInstrument, 1);
		state.currentInstrument = Math.max(0, state.currentInstrument - 1);
		renderInstrumentEditor();
	}
};

instControls.append(addInstBtn, remInstBtn);

const instSidebar = document.createElement("div");
instSidebar.className = "instrument-sidebar";
instSidebar.style.height = "100%";

const instMain = document.createElement("div");
instMain.className = "instrument-main";

const instNameInput = document.createElement("input");
instNameInput.style.fontSize = "1.5rem";
instNameInput.style.width = "100%";

const typeSelector = document.createElement("div");
typeSelector.style.display = "flex";
typeSelector.style.gap = "10px";

const btnTypePSG = document.createElement("button");
btnTypePSG.className = "action-btn";
btnTypePSG.textContent = "PSG";
btnTypePSG.style.padding = "5px 20px";

const btnTypeSample = document.createElement("button");
btnTypeSample.className = "action-btn";
btnTypeSample.textContent = "Sample";
btnTypeSample.style.padding = "5px 20px";

typeSelector.append(btnTypePSG, btnTypeSample);

// PSG Sequence UI
const psgUI = document.createElement("div");
psgUI.style.display = "flex";
psgUI.style.flexDirection = "column";
psgUI.style.gap = "10px";

const seqTabs = document.createElement("div");
seqTabs.className = "seq-selector";
["volume", "arpeggio", "pitch"].forEach(type => {
	const tab = document.createElement("div");
	tab.className = "seq-tab";
	tab.textContent = type.toUpperCase();
	tab.onclick = () => {
		state.currentSeqType = type;
		renderInstrumentEditor();
	};
	seqTabs.appendChild(tab);
});

const seqInput = document.createElement("input");
seqInput.style.width = "100%";
seqInput.placeholder = "Values separated by space (e.g. 10 12 | 15 14 |)";

const graphCanvas = document.createElement("canvas");
graphCanvas.width = 800;
graphCanvas.height = 300;
const gCtx = graphCanvas.getContext("2d");

psgUI.append(seqTabs, seqInput, graphCanvas);

// Sample UI
const sampleUI = document.createElement("div");
sampleUI.style.display = "flex";
sampleUI.style.flexDirection = "column";
sampleUI.style.gap = "10px";

const sampleUploader = document.createElement("input");
sampleUploader.type = "file";
sampleUploader.accept = ".wav";
sampleUploader.style.width = "100%";

const sampleLoopBtn = document.createElement("button");
sampleLoopBtn.className = "action-btn";
sampleLoopBtn.style.padding = "5px 20px";
sampleLoopBtn.style.width = "200px";

// New F0 UI row
const sampleF0Row = document.createElement("div");
sampleF0Row.style.cssText = "display:flex; align-items:center; gap:10px;";
const f0Label = document.createElement("label");
f0Label.textContent = "Base Frequency (F0) Hz:";
const sampleF0Input = document.createElement("input");
sampleF0Input.type = "number";
sampleF0Input.style.width = "100px";
sampleF0Row.append(f0Label, sampleF0Input);

const waveCanvas = document.createElement("canvas");
waveCanvas.width = 800;
waveCanvas.height = 300;
waveCanvas.style.background = "#0d0d1a";
waveCanvas.style.cursor = "crosshair";
const wCtx = waveCanvas.getContext("2d");

sampleUI.append(sampleUploader, sampleLoopBtn, sampleF0Row, waveCanvas);

instMain.append(instNameInput, typeSelector, psgUI, sampleUI);
instSidebarContainer.append(instControls, instSidebar);
instLayout.append(instSidebarContainer, instMain);
instrumentEditorDiv.appendChild(instLayout);

// Interaction logic for Waveform
waveCanvas.onmousedown = (e) => {
	const inst = song.instruments[state.currentInstrument];
	if (!inst.sample.loop || !inst.sample.samples.length) return;

	const rect = waveCanvas.getBoundingClientRect();
	const x = (e.clientX - rect.left) / rect.width;
	const sampleIdx = Math.floor(x * inst.sample.samples.length);

	const startX = inst.sample.start / inst.sample.samples.length;
	const endX = inst.sample.end / inst.sample.samples.length;

	// Detection for edges
	const threshold = 0.02;
	if (Math.abs(x - startX) < threshold) state.draggingSampleEdge = "start";
	else if (Math.abs(x - endX) < threshold) state.draggingSampleEdge = "end";
	else state.draggingSampleEdge = null;
};

window.onmousemove = (e) => {
	if (!state.draggingSampleEdge || state.view !== "instrument") return;
	const inst = song.instruments[state.currentInstrument];
	const rect = waveCanvas.getBoundingClientRect();
	const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
	const sampleIdx = Math.floor(x * inst.sample.samples.length);

	if (state.draggingSampleEdge === "start") {
		inst.sample.start = Math.min(sampleIdx, inst.sample.end - 1);
	} else {
		inst.sample.end = Math.max(sampleIdx, inst.sample.start + 1);
	}
	drawWaveform();
};

window.onmouseup = () => {
	state.draggingSampleEdge = null;
};

function parseSequence(str) {
	if (!str) return { data: [], loopStart: -1, loopEnd: -1 };
	const parts = str.match(/\||-?\d+/g) || [];
	let sequence = [];
	let loopStart = -1;
	let loopEnd = -1;
	let idx = 0;

	for (let p of parts) {
		if (p === "|") {
			if (loopStart === -1) loopStart = idx;
			else loopEnd = idx - 1;
			continue;
		}
		let v = parseInt(p);
		if (!isNaN(v)) {
			sequence.push(v);
			idx++;
		}
	}
	return { data: sequence, loopStart, loopEnd };
}

async function handleSampleUpload(file) {
	const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
	const arrayBuffer = await file.arrayBuffer();
	const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
	const data = audioBuffer.getChannelData(0); // Mono

	const inst = song.instruments[state.currentInstrument];
	inst.sample.samples = Array.from(data);
	// Automatically detect and set the sample rate from the decoded audio buffer
	inst.sample.sampleRate = audioBuffer.sampleRate;
	inst.sample.start = 0;
	inst.sample.end = inst.sample.samples.length - 1;
	drawWaveform();
}

sampleUploader.onchange = (e) => {
	if (e.target.files[0]) handleSampleUpload(e.target.files[0]);
};

function renderInstrumentEditor() {
	instSidebar.innerHTML = "";
	song.instruments.forEach((inst, i) => {
		const item = document.createElement("div");
		item.className = "sidebar-item" + (state.currentInstrument === i ? " active" : "");
		item.textContent = `${i.toString(16).toUpperCase().padStart(2, '0')} - ${inst.name || "Untitled"}`;
		item.onclick = () => {
			state.currentInstrument = i;
			renderInstrumentEditor();
		};
		instSidebar.appendChild(item);
	});

	const inst = song.instruments[state.currentInstrument];
	instNameInput.value = inst.name || "";
	instNameInput.oninput = (e) => {
		inst.name = e.target.value;
		renderInstrumentEditor();
		renderPatternInstruments();
	};

	// Toggle buttons logic
	btnTypePSG.classList.toggle("active", inst.type === "psg");
	btnTypeSample.classList.toggle("active", inst.type === "sample");

	btnTypePSG.onclick = () => { inst.type = "psg"; renderInstrumentEditor(); };
	btnTypeSample.onclick = () => { inst.type = "sample"; renderInstrumentEditor(); };

	if (inst.type === "psg") {
		psgUI.style.display = "flex";
		sampleUI.style.display = "none";

		seqInput.value = inst[state.currentSeqType] || "";
		seqInput.oninput = (e) => {
			inst[state.currentSeqType] = e.target.value;
			drawGraph();
		};

		Array.from(seqTabs.children).forEach(t => {
			t.classList.toggle("active", t.textContent.toLowerCase() === state.currentSeqType);
		});
		drawGraph();
	} else {
		psgUI.style.display = "none";
		sampleUI.style.display = "flex";

		sampleLoopBtn.textContent = inst.sample.loop ? "Loop: ON" : "Loop: OFF";
		sampleLoopBtn.classList.toggle("active", inst.sample.loop);
		sampleLoopBtn.onclick = () => {
			inst.sample.loop = !inst.sample.loop;
			renderInstrumentEditor();
		};

		// Populate F0 value and handle changes
		sampleF0Input.value = inst.sample.F0 || 440;
		sampleF0Input.oninput = (e) => {
			inst.sample.F0 = parseFloat(e.target.value) || 440;
		};

		drawWaveform();
	}
}

function drawWaveform() {
	const inst = song.instruments[state.currentInstrument];
	const data = inst.sample.samples;
	wCtx.fillStyle = "#0d0d1a";
	wCtx.fillRect(0, 0, waveCanvas.width, waveCanvas.height);

	if (!data || !data.length) {
		wCtx.fillStyle = "#444";
		wCtx.font = "14px monospace";
		wCtx.textAlign = "center";
		wCtx.fillText("No sample loaded", waveCanvas.width / 2, waveCanvas.height / 2);
		return;
	}

	wCtx.strokeStyle = "#00cc66";
	wCtx.beginPath();
	const step = Math.ceil(data.length / waveCanvas.width);
	const amp = waveCanvas.height / 2;

	for (let i = 0; i < waveCanvas.width; i++) {
		const val = data[i * step] || 0;
		const x = i;
		const y = amp + val * amp;
		if (i === 0) wCtx.moveTo(x, y);
		else wCtx.lineTo(x, y);
	}
	wCtx.stroke();

	// Draw loop overlay
	if (inst.sample.loop) {
		const startX = (inst.sample.start / data.length) * waveCanvas.width;
		const endX = (inst.sample.end / data.length) * waveCanvas.width;

		wCtx.fillStyle = "rgba(68, 170, 255, 0.2)";
		wCtx.fillRect(startX, 0, endX - startX, waveCanvas.height);

		wCtx.strokeStyle = "#44aaff";
		wCtx.lineWidth = 2;
		wCtx.strokeRect(startX, 0, endX - startX, waveCanvas.height);
		wCtx.lineWidth = 1;
	}
}

function drawGraph() {
	const inst = song.instruments[state.currentInstrument];
	const { data, loopStart, loopEnd } = parseSequence(inst[state.currentSeqType]);
	const type = state.currentSeqType;

	gCtx.fillStyle = "#0d0d1a";
	gCtx.fillRect(0, 0, graphCanvas.width, graphCanvas.height);

	const stepW = 20;
	const centerY = graphCanvas.height / 2;

	gCtx.strokeStyle = "#2a2a4a";
	for (let x = 0; x < graphCanvas.width; x += stepW) {
		gCtx.beginPath(); gCtx.moveTo(x, 0); gCtx.lineTo(x, graphCanvas.height); gCtx.stroke();
	}

	data.forEach((val, i) => {
		let x = i * stepW;
		gCtx.fillStyle = type === "volume" ? "#00cc66" : "#44aaff";
		if (type === "volume") {
			let h = (val / 15) * (graphCanvas.height - 40);
			gCtx.fillRect(x + 2, graphCanvas.height - h - 20, stepW - 4, h);
		} else {
			let range = type === "arpeggio" ? 128 : 192;
			let y = centerY - (val / range) * (centerY - 20);
			gCtx.fillRect(x + 2, y - 5, stepW - 4, 10);
		}
	});

	if (loopStart !== -1) {
		let x1 = loopStart * stepW;
		let x2 = (loopEnd === -1 ? data.length : loopEnd + 1) * stepW;
		gCtx.fillStyle = "rgba(255, 255, 255, 0.2)";
		gCtx.fillRect(x1, graphCanvas.height - 15, x2 - x1, 10);
		gCtx.strokeStyle = "#fff";
		gCtx.strokeRect(x1, graphCanvas.height - 15, x2 - x1, 10);
	}
}

window.song = song;
window.state = state;

let lastInstrument = -1;
(function update() {
	drawPattern(state, song, patternCtx, 16, 16, song.primaryHighlight, song.secondaryHighlight);
	drawOrders(state, song, orderCtx, 16, 16);

	handleInput(state, song);

	if (state.view === "pattern" && lastInstrument !== state.currentInstrument) {
		renderPatternInstruments();
		lastInstrument = state.currentInstrument;
	}

	// Update status bar
	if (sbEls.sbOct) sbEls.sbOct.textContent = state.octave;
	if (sbEls.sbBpm) sbEls.sbBpm.textContent = song.bpm;
	if (sbEls.sbRow) sbEls.sbRow.textContent = state.row;
	if (sbEls.sbOrd) sbEls.sbOrd.textContent = state.pattern;
	if (sbEls.sbCh) sbEls.sbCh.textContent = state.channel;
	if (sbEls.sbRec) sbEls.sbRec.textContent = state.recording ? "REC" : "";
	if (sbEls.sbPlay) sbEls.sbPlay.textContent = state.isPlaying ? "PLAY" : "";

	// Update top bar status
	if (statusEls.sOct) statusEls.sOct.textContent = state.octave;
	if (statusEls.sBpm) statusEls.sBpm.textContent = song.bpm;
	if (statusEls.sRow) statusEls.sRow.textContent = state.row;
	if (statusEls.sOrd) statusEls.sOrd.textContent = state.pattern;
	if (statusEls.sCh) statusEls.sCh.textContent = state.channel;
	if (statusEls.sRec) {
		statusEls.sRec.textContent = state.recording ? "REC" : "";
		statusEls.sRec.closest(".status-item").classList.toggle("status-recording", state.recording);
	}
	if (statusEls.sPlay) {
		statusEls.sPlay.textContent = state.isPlaying ? "PLAY" : "";
		statusEls.sPlay.closest(".status-item").classList.toggle("status-playing", state.isPlaying);
	}

	updateMuteButtons();

	window.requestAnimationFrame(update);
})()
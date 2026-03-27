import { getSong, getInstrument } from "./song.js"
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
	draggingSampleEdge: null // "start" or "end"
};

let song = getSong(4, 32);

// Update initial instruments to new format if needed
song.instruments = song.instruments.map(inst => ({
	...getInstrument(inst.name),
	...inst
}));

let patternEditorDiv = document.createElement("div");
patternEditorDiv.className = "editor-container";

let patternInstDiv = document.createElement("div");
patternInstDiv.style.cssText = "position:absolute; top:0; left:15vw; right:0; height:30vh; overflow-y:auto; border-left:1px solid #333; background:#050505;";
patternEditorDiv.appendChild(patternInstDiv);

let songEditorDiv = document.createElement("div");
songEditorDiv.className = "editor-container";
songEditorDiv.style.display = "none";

let instrumentEditorDiv = document.createElement("div");
instrumentEditorDiv.className = "editor-container";
instrumentEditorDiv.style.display = "none";

let patternCanvas = document.createElement("canvas");
patternCanvas.width = window.innerWidth;
patternCanvas.height = Math.round(window.innerHeight * 0.55);
patternCanvas.style.position = "absolute";
patternCanvas.style.top = "35vh";
let patternCtx = patternCanvas.getContext("2d");

let orderDiv = document.createElement("div");
orderDiv.style.position = "absolute";
orderDiv.style.top = "0px";
orderDiv.style.left = "0px";
orderDiv.style.width = "15vw";
orderDiv.style.height = "30vh";
orderDiv.style.borderRight = "1px solid #333";

let orderCanvas = document.canvas = document.createElement("canvas")
orderCanvas.width = Math.round(window.innerWidth * 0.15);
orderCanvas.height = 10 * cellHeight;
orderCanvas.style.position = "relative";
let orderCtx = orderCanvas.getContext("2d");

patternEditorDiv.appendChild(patternCanvas);
patternEditorDiv.appendChild(orderDiv);
orderDiv.appendChild(orderCanvas);

const navContainer = document.createElement("div");
navContainer.style.cssText = "position:absolute; bottom:0; width:100vw; height:10vh; display:flex; justify-content:space-around; align-items:center; background:#000; border-top:1px solid #333;";

const btnP = document.createElement("button");
btnP.id = "pattern-btn"; btnP.className = "sticky-btn active"; btnP.style.width = "30vw"; btnP.style.height = "70%"; btnP.textContent = "Pattern";

const btnI = document.createElement("button");
btnI.id = "instrument-btn"; btnI.className = "sticky-btn"; btnI.style.width = "30vw"; btnI.style.height = "70%"; btnI.textContent = "Instrument";

const btnS = document.createElement("button");
btnS.id = "song-btn"; btnS.className = "sticky-btn"; btnS.style.width = "30vw"; btnS.style.height = "70%"; btnS.textContent = "Song";

function renderPatternInstruments() {
	patternInstDiv.innerHTML = "";
	song.instruments.forEach((inst, i) => {
		const item = document.createElement("div");
		item.className = "instrument-item" + (state.currentInstrument === i ? " active" : "");
		item.textContent = `${i.toString(16).toUpperCase().padStart(2, '0')} - ${inst.name || "Untitled"}`;
		item.style.padding = "4px 8px";

		item.onclick = () => {
			state.currentInstrument = i;
			renderPatternInstruments();
		};

		item.ondblclick = () => {
			state.currentInstrument = i;
			setView("instrument");
		};

		patternInstDiv.appendChild(item);
	});
}

function setView(view) {
	state.view = view;
	[patternEditorDiv, instrumentEditorDiv, songEditorDiv].forEach(d => d.style.display = "none");
	[btnP, btnI, btnS].forEach(b => b.classList.remove("active"));

	if (view === "pattern") {
		patternEditorDiv.style.display = "block";
		btnP.classList.add("active");
		state.patternControlsActive = true;
		renderPatternInstruments();
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

navContainer.append(btnP, btnI, btnS);
document.body.append(patternEditorDiv, instrumentEditorDiv, songEditorDiv, navContainer);

window.onSongChanged = (field, value) => {
	song[field] = value;
};

window.onresize = function () {
	patternCanvas.width = window.innerWidth;
	patternCanvas.height = Math.round(window.innerHeight * 0.55);
	orderCanvas.width = Math.round(window.innerWidth * 0.15);
	orderCanvas.height = 10 * cellHeight;
}


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
	btnSave.className = "sticky-btn";
	btnSave.textContent = "Save to Browser";
	btnSave.onclick = () => {
		const key = `dcsg_song_${song.name || "untitled"}`;
		localStorage.setItem(key, JSON.stringify(song));
		renderSongEditor();
	};

	const btnDownload = document.createElement("button");
	btnDownload.className = "sticky-btn";
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
	btnLoad.className = "sticky-btn";
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
					song = loadedSong;
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
	songMain.appendChild(controls);

	// Sidebar Song List
	const title = document.createElement("div");
	title.style.padding = "10px";
	title.style.color = "#888";
	title.textContent = "SAVED SONGS";
	songSidebar.appendChild(title);

	Object.keys(localStorage).forEach(key => {
		if (key.startsWith("dcsg_song_")) {
			const displayTitle = key.replace("dcsg_song_", "");
			const container = document.createElement("div");
			container.style.cssText = "display:flex; align-items:center; justify-content:space-between; cursor:pointer;";
			container.className = "instrument-item";

			const item = document.createElement("div");
			item.style.flex = "1";
			item.textContent = displayTitle;
			item.onclick = () => {
				try {
					const loaded = JSON.parse(localStorage.getItem(key));
					song = loaded;
					window.song = song;
					resetState();
					renderSongEditor();
				} catch (e) {
					console.error("Error loading song from storage");
				}
			};

			const btnDel = document.createElement("div");
			btnDel.textContent = "×";
			btnDel.style.cssText = "color:#e74c3c; font-weight:bold; font-size:1.4rem; padding:0 10px;";
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
addInstBtn.className = "sticky-btn";
addInstBtn.textContent = "+";
addInstBtn.style.flex = "1";
addInstBtn.style.padding = "5px";
addInstBtn.onclick = () => {
	song.instruments.push(getInstrument());
	state.currentInstrument = song.instruments.length - 1;
	renderInstrumentEditor();
};

const remInstBtn = document.createElement("button");
remInstBtn.className = "sticky-btn";
remInstBtn.textContent = "-";
remInstBtn.style.flex = "1";
remInstBtn.style.padding = "5px";
remInstBtn.style.backgroundColor = "#e74c3c";
remInstBtn.style.boxShadow = "0 5px #c0392b";
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
btnTypePSG.className = "sticky-btn";
btnTypePSG.textContent = "PSG";
btnTypePSG.style.padding = "5px 20px";

const btnTypeSample = document.createElement("button");
btnTypeSample.className = "sticky-btn";
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
sampleLoopBtn.className = "sticky-btn";
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
waveCanvas.style.background = "#111";
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
		item.className = "instrument-item" + (state.currentInstrument === i ? " active" : "");
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
	wCtx.fillStyle = "#111";
	wCtx.fillRect(0, 0, waveCanvas.width, waveCanvas.height);

	if (!data || !data.length) {
		wCtx.fillStyle = "#444";
		wCtx.font = "14px monospace";
		wCtx.textAlign = "center";
		wCtx.fillText("No sample loaded", waveCanvas.width / 2, waveCanvas.height / 2);
		return;
	}

	wCtx.strokeStyle = "#0f0";
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

		wCtx.fillStyle = "rgba(52, 152, 219, 0.3)";
		wCtx.fillRect(startX, 0, endX - startX, waveCanvas.height);

		wCtx.strokeStyle = "#3498db";
		wCtx.lineWidth = 2;
		wCtx.strokeRect(startX, 0, endX - startX, waveCanvas.height);
		wCtx.lineWidth = 1;
	}
}

function drawGraph() {
	const inst = song.instruments[state.currentInstrument];
	const { data, loopStart, loopEnd } = parseSequence(inst[state.currentSeqType]);
	const type = state.currentSeqType;

	gCtx.fillStyle = "#111";
	gCtx.fillRect(0, 0, graphCanvas.width, graphCanvas.height);

	const stepW = 20;
	const centerY = graphCanvas.height / 2;

	gCtx.strokeStyle = "#222";
	for (let x = 0; x < graphCanvas.width; x += stepW) {
		gCtx.beginPath(); gCtx.moveTo(x, 0); gCtx.lineTo(x, graphCanvas.height); gCtx.stroke();
	}

	data.forEach((val, i) => {
		let x = i * stepW;
		gCtx.fillStyle = type === "volume" ? "#27ae60" : "#3498db";
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

	window.requestAnimationFrame(update);
})()
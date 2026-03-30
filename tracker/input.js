import * as consts from "./consts.js";
import { getPattern } from "./song.js"

let pressed = [];
let lastPressed = [];
let audioContext = null;
let audioWorkletNode = null;
let clipboard = null;

async function ensureAudioStarted() {
	if (!audioContext) {
		audioContext = new (window.AudioContext || window.webkitAudioContext)();
		try {
			await audioContext.audioWorklet.addModule('audio_worker.js');
			audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');
			audioWorkletNode.connect(audioContext.destination);

			audioWorkletNode.port.onmessage = (e) => {
				if (e.data.type === 'STATE_UPDATE' && window.state) {
					window.state.playbackPattern = e.data.orderIndex;
					window.state.playbackRow = e.data.row;
				}
			};

			window.audioNode = audioWorkletNode;
			console.log("Created audio context");
		} catch (err) {
			console.error("Failed to initialize AudioWorklet:", err);
		}
	}
	if (audioContext && audioContext.state === 'suspended') {
		await audioContext.resume();
	}
}

window.addEventListener("keydown", function (e) {
	ensureAudioStarted();

	const key = e.key.toLowerCase();
	if (pressed.indexOf(key) === -1) {
		pressed.push(key)
	}

	// Help overlay
	if (e.key === "F1") {
		e.preventDefault();
		window.toggleHelp();
		return;
	}
	if (e.key === "Escape" && window.toggleHelp) {
		window.toggleHelp();
		return;
	}

	if (e.key === "Enter") {
		if (window.audioNode) {
			if (window.state.isPlaying) {
				window.audioNode.port.postMessage({ type: "STOP_SONG" });
				window.state.isPlaying = false;
				window.state.playbackRow = -1;
				window.state.playbackPattern = -1;
			} else {
				window.audioNode.port.postMessage({
					type: "START_SONG",
					song: window.song,
					orderIndex: window.state.pattern,
					row: e.shiftKey ? window.state.row : 0
				});
				window.state.isPlaying = true;
			}
		}
		e.preventDefault();
	}

	if (window.state.patternControlsActive) {
		if (key.includes("arrow")) e.preventDefault();
		if (key == " ") e.preventDefault();
		if (key == "=") e.preventDefault();
		if (key == "-") e.preventDefault();
		if (key == "insert") e.preventDefault();
		if (key.match(/^f[0-9]+$/)) e.preventDefault();
	}
})

window.addEventListener("keyup", function (e) {
	const key = e.key.toLowerCase();
	const idx = pressed.indexOf(key);
	if (idx !== -1) {
		pressed.splice(idx, 1);
	}

	if (key.includes("arrow")) e.preventDefault();

	if (key in consts.noteEntryLUT && !state.isPlaying) {
		if (window.audioNode) {
			window.audioNode.port.postMessage({
				type: "STOP_NOTE"
			})
		}
	}
})

function increaseRow(state, song) {
	if (state.row < song.rowsPerPattern - 1) state.row++;
	else {
		state.row = 0;
		if (state.pattern < song.orders.length - 1) state.pattern++;
		else state.pattern = 0;
	}
}

function decreaseRow(state, song) {
	if (state.row > 0) state.row--;
	else {
		state.row = song.rowsPerPattern - 1;
		if (state.pattern > 0) state.pattern--;
		else state.pattern = song.orders.length - 1;
	}
}

function handleInput(state, song) {
	let justPressed = [];
	let justReleased = [];

	if (!song.orders[state.pattern]) return;
	let currentPatternIndices = song.orders[state.pattern];
	let currentPatternData = song.patterns[currentPatternIndices[state.channel]][state.channel];

	// Key Repeat Logic
	if (!state.keyTimers) state.keyTimers = {};
	const repeatKeys = [
		"arrowup", "arrowdown", "arrowleft", "arrowright",
		"backspace", "delete",
		...Object.keys(consts.noteEntryLUT)
	];

	for (let k in pressed) {
		let key = pressed[k];
		if (lastPressed.indexOf(key) === -1) {
			// New key press
			justPressed.push(key);
			state.keyTimers[key] = 0;
		} else if (repeatKeys.indexOf(key) !== -1) {
			// Held key repetition logic: 20 frame initial delay, 2 frame interval
			state.keyTimers[key]++;
			if (state.keyTimers[key] >= 20 && (state.keyTimers[key] - 20) % 2 === 0) {
				const isNoteKey = key in consts.noteEntryLUT;
				// Navigation keys always repeat, note keys only repeat if recording
				if (!isNoteKey || state.recording) {
					justPressed.push(key);
				}
			}
		}
	}

	for (let k in lastPressed) {
		let key = lastPressed[k];
		if (pressed.indexOf(key) === -1) {
			justReleased.push(key);
			if (state.keyTimers) delete state.keyTimers[key];
		}
	}

	if (!state.patternControlsActive) {
		lastPressed = [...pressed];
		return;
	}

	// Selection Logic Initiation (now Control)
	const isShift = pressed.indexOf("shift") !== -1;
	const isCtrl = pressed.indexOf("control") !== -1;

	if (isCtrl && !state.selectionActive && (justPressed.some(k => k.includes("arrow")))) {
		state.selectionActive = true;
		state.selStartRow = state.row;
		state.selStartChan = state.channel;
		state.selStartCol = state.column;
		state.selEndRow = state.row;
		state.selEndChan = state.channel;
		state.selEndCol = state.column;
	} else if (!isCtrl && (justPressed.some(k => k.includes("arrow"))) && state.selectionActive) {
		state.selectionActive = false;
	}

	state.editOrder = false;

	// Order Editor Mode (Shift)
	if (isShift && !state.isPlaying) {
		state.editOrder = true;
		state.recording = false;
		if (!state.firstOrderNumberTyped) {
			if (justPressed.indexOf("+") !== -1) {
				window.pushUndo();
				let newOrder = [];
				for (let c = 0; c < song.channelCount; c++) {
					let lastPattern = song.orders[song.orders.length - 1][c];
					let newPatternNumber = lastPattern + 1;
					newOrder.push(newPatternNumber);
					if (!song.patterns[newPatternNumber]) {
						song.patterns[newPatternNumber] = getPattern(song.channelCount, song.rowsPerPattern);
					}
				}
				song.orders.push(newOrder);
			}
			if (justPressed.indexOf("_") !== -1) {
				window.pushUndo();
				if (song.orders.length > 1) {
					if (state.pattern === song.orders.length - 1) state.pattern--;
					song.orders.splice(state.pattern, 1);
				}
			}
			if (justPressed.indexOf("arrowdown") !== -1) {
				if (state.pattern < song.orders.length - 1) state.pattern++;
				else state.pattern = 0;
			}
			if (justPressed.indexOf("arrowup") !== -1) {
				if (state.pattern > 0) state.pattern--;
				else state.pattern = song.orders.length - 1;
			}
			if (justPressed.indexOf("arrowright") !== -1) {
				if (state.channel < song.channelCount - 1) state.channel++;
				else state.channel = 0;
			}
			if (justPressed.indexOf("arrowleft") !== -1) {
				if (state.channel > 0) state.channel--;
				else state.channel = song.channelCount - 1;
			}
		}

		for (let k in justPressed) {
			let key = justPressed[k];
			let index = consts.keyToNumLUTSpecial.indexOf(key);
			if (index !== -1) {
				if (!state.firstOrderNumberTyped) window.pushUndo();
				if (state.firstOrderNumberTyped) {
					state.firstOrderNumberTyped = false;
					song.orders[state.pattern][state.channel] &= (15 << 4);
					song.orders[state.pattern][state.channel] |= index;
					if (!song.patterns[song.orders[state.pattern][state.channel]]) {
						song.patterns[song.orders[state.pattern][state.channel]] = getPattern(song.channelCount, song.rowsPerPattern);
					}
				} else {
					state.firstOrderNumberTyped = true;
					song.orders[state.pattern][state.channel] &= 15;
					song.orders[state.pattern][state.channel] |= index << 4;
					if (!song.patterns[song.orders[state.pattern][state.channel]]) {
						song.patterns[song.orders[state.pattern][state.channel]] = getPattern(song.channelCount, song.rowsPerPattern);
					}
				}
			}
		}
		lastPressed = [...pressed];
		return;
	}

	// Clipboard Logic (Control)
	if (isCtrl) {
		// Undo/Redo
		if (justPressed.indexOf("z") !== -1) { window.doUndo(); lastPressed = [...pressed]; return; }
		if (justPressed.indexOf("y") !== -1) { window.doRedo(); lastPressed = [...pressed]; return; }

		// Duplicate current pattern (Ctrl+D)
		if (justPressed.indexOf("d") !== -1) {
			window.pushUndo();
			const curPatIndices = song.orders[state.pattern];
			const newPatIndices = [];
			for (let c = 0; c < song.channelCount; c++) {
				const srcIdx = curPatIndices[c];
				const newIdx = song.patterns.length;
				song.patterns.push(JSON.parse(JSON.stringify(song.patterns[srcIdx])));
				newPatIndices.push(newIdx);
			}
			song.orders.splice(state.pattern + 1, 0, newPatIndices);
		}

		if ((justPressed.indexOf("c") !== -1 || justPressed.indexOf("x") !== -1) && state.selectionActive) {
			const minR = Math.min(state.selStartRow, state.selEndRow);
			const maxR = Math.max(state.selStartRow, state.selEndRow);
			const minC = Math.min(state.selStartChan, state.selEndChan);
			const maxC = Math.max(state.selStartChan, state.selEndChan);

			clipboard = [];
			for (let r = minR; r <= maxR; r++) {
				let rowClip = [];
				for (let c = minC; c <= maxC; c++) {
					const chanIdx = song.orders[state.pattern][c];
					const chanRows = song.patterns[chanIdx][c].rows;
					const rowData = chanRows[r];

					let chanClip = { channelOffset: c - minC, columns: {} };

					const curChanMaxCol = 6 + (song.effectsInUse[c] - 1) * 3;
					let sCol = 0;
					let eCol = curChanMaxCol;

					if (minC === maxC) {
						sCol = Math.min(state.selStartCol, state.selEndCol);
						eCol = Math.max(state.selStartCol, state.selEndCol);
					} else {
						if (c === minC) sCol = (state.selStartChan === minC) ? state.selStartCol : state.selEndCol;
						else if (c === maxC) eCol = (state.selStartChan === maxC) ? state.selStartCol : state.selEndCol;
					}

					for (let col = sCol; col <= eCol; col++) {
						if (col === 0) chanClip.columns.note = rowData.note;
						if (col === 1) chanClip.columns.instH = rowData.instrument === -1 ? -1 : (rowData.instrument >> 4);
						if (col === 2) chanClip.columns.instL = rowData.instrument === -1 ? -1 : (rowData.instrument & 15);
						if (col === 3) chanClip.columns.volume = rowData.volume;
						if (col >= 4) {
							let localColumn = col - 4;
							let effectIdx = Math.floor(localColumn / 3);
							let subCol = localColumn % 3;
							if (!chanClip.columns.effects) chanClip.columns.effects = {};
							if (!chanClip.columns.effects[effectIdx]) chanClip.columns.effects[effectIdx] = {};
							if (subCol === 0) chanClip.columns.effects[effectIdx].type = rowData.effects[effectIdx].type;
							else if (subCol === 1) chanClip.columns.effects[effectIdx].paramH = (rowData.effects[effectIdx].params >> 4);
							else chanClip.columns.effects[effectIdx].paramL = (rowData.effects[effectIdx].params & 15);
						}
					}
					rowClip.push(chanClip);
				}
				clipboard.push(rowClip);
			}
		}

		// Cut: copy was already done above, now delete selection
		if (justPressed.indexOf("x") !== -1 && state.selectionActive && clipboard) {
			window.pushUndo();
			const minR = Math.min(state.selStartRow, state.selEndRow);
			const maxR = Math.max(state.selStartRow, state.selEndRow);
			const minC = Math.min(state.selStartChan, state.selEndChan);
			const maxC = Math.max(state.selStartChan, state.selEndChan);
			for (let r = minR; r <= maxR; r++) {
				for (let c = minC; c <= maxC; c++) {
					const pIdx = song.orders[state.pattern][c];
					const rowData = song.patterns[pIdx][c].rows[r];
					rowData.note = -1;
					rowData.instrument = -1;
					rowData.volume = -1;
					rowData.effects.forEach(e => { e.type = ""; e.params = 0; });
				}
			}
		}

		if (justPressed.indexOf("v") !== -1 && clipboard) {
			window.pushUndo();
			for (let r = 0; r < clipboard.length; r++) {
				const targetRow = state.row + r;
				if (targetRow >= song.rowsPerPattern) break;

				for (let c = 0; c < clipboard[r].length; c++) {
					const clipChan = clipboard[r][c];
					const targetChan = state.channel + clipChan.channelOffset;
					if (targetChan >= song.channelCount) continue;

					const pIdx = song.orders[state.pattern][targetChan];
					const targetRowData = song.patterns[pIdx][targetChan].rows[targetRow];

					if (clipChan.columns.note !== undefined) targetRowData.note = clipChan.columns.note;
					if (clipChan.columns.instH !== undefined) {
						if (clipChan.columns.instH === -1) targetRowData.instrument = -1;
						else {
							if (targetRowData.instrument === -1) targetRowData.instrument = 0;
							targetRowData.instrument = (clipChan.columns.instH << 4) | (targetRowData.instrument & 15);
						}
					}
					if (clipChan.columns.instL !== undefined) {
						if (clipChan.columns.instL === -1) targetRowData.instrument = -1;
						else {
							if (targetRowData.instrument === -1) targetRowData.instrument = 0;
							targetRowData.instrument = (targetRowData.instrument & 0xF0) | clipChan.columns.instL;
						}
					}
					if (clipChan.columns.volume !== undefined) targetRowData.volume = clipChan.columns.volume;

					if (clipChan.columns.effects) {
						for (let eIdx in clipChan.columns.effects) {
							if (eIdx >= song.effectsInUse[targetChan]) continue;
							const eff = clipChan.columns.effects[eIdx];
							if (eff.type !== undefined) targetRowData.effects[eIdx].type = eff.type;
							if (eff.paramH !== undefined) targetRowData.effects[eIdx].params = (eff.paramH << 4) | (targetRowData.effects[eIdx].params & 0xF);
							if (eff.paramL !== undefined) targetRowData.effects[eIdx].params = (targetRowData.effects[eIdx].params & 0xF0) | eff.paramL;
						}
					}
				}
			}
		}
	}

	// Regular input handling
	state.firstOrderNumberTyped = false;
	if (justPressed.indexOf("-") !== -1) {
		if (state.octave > 0) state.octave--;
	}
	if (justPressed.indexOf("=") !== -1) {
		if (state.octave < 7) state.octave++;
	}

	let chanMaxColumn = 6 + (song.effectsInUse[state.channel] - 1) * 3;

	if (justPressed.indexOf("arrowright") !== -1) {
		if (state.column < chanMaxColumn) state.column++;
		else {
			state.column = 0;
			state.channel++;
			state.channel %= song.channelCount;
		}
		if (isCtrl) {
			state.selEndChan = state.channel;
			state.selEndCol = state.column;
		}
	}

	if (justPressed.indexOf("arrowleft") !== -1) {
		if (state.column > 0) state.column--;
		else {
			state.channel--;
			if (state.channel < 0) state.channel = song.channelCount - 1;
			state.column = 6 + (song.effectsInUse[state.channel] - 1) * 3;
		}
		if (isCtrl) {
			state.selEndChan = state.channel;
			state.selEndCol = state.column;
		}
	}

	if (justPressed.indexOf("arrowdown") !== -1) {
		increaseRow(state, song);
		if (isCtrl) state.selEndRow = state.row;
	}

	if (justPressed.indexOf("arrowup") !== -1) {
		decreaseRow(state, song);
		if (isCtrl) state.selEndRow = state.row;
	}

	const createEmptyRow = (chan) => ({
		note: -1,
		instrument: -1,
		volume: -1,
		effects: Array.from({ length: song.effectsInUse[chan] }, () => ({ type: "", params: 0 }))
	});

	if (justPressed.indexOf("insert") !== -1) {
		window.pushUndo();
		currentPatternData.rows.splice(state.row, 0, createEmptyRow(state.channel));
		currentPatternData.rows.pop();
	}

	if (justPressed.indexOf("\\") !== -1) {
		if (state.recording && state.column == 0) {
			window.pushUndo();
			currentPatternData.rows[state.row].note = -2;
		}
	}

	// Note entry
	if (!isCtrl) {
		for (let k in justPressed) {
			let key = justPressed[k];
			if (key in consts.noteEntryLUT) {
				let noteIndex = consts.noteEntryLUT[key] + state.octave * 12;
				if (state.recording && state.column == 0) {
					window.pushUndo();
					currentPatternData.rows[state.row].note = noteIndex;
					currentPatternData.rows[state.row].instrument = state.currentInstrument;
					increaseRow(state, song);
				}
				if (window.audioNode && state.column == 0) {
					const isNoise = state.channel === 3;
					const rowVol = currentPatternData.rows[state.row].volume;
					window.audioNode.port.postMessage({
						type: "PLAY_NOTE",
						note: noteIndex,
						instrument: song.instruments[state.currentInstrument],
						volume: rowVol === -1 ? 15 : rowVol,
						channel: state.channel,
						isNoise: isNoise,
						effect: isNoise ? "V" : 0,
						params: 0x00
					})
				}
			}
		}
	}

	if (state.recording) {
		// Snapshot before any recording mutation
		const hasMutationKey = justPressed.some(k =>
			k === "backspace" || k === "delete" ||
			k in consts.noteEntryLUT ||
			consts.keyToNumLUT.indexOf(k) !== -1 ||
			consts.effectLUT.indexOf(k) !== -1
		);
		if (hasMutationKey) window.pushUndo();

		// Selection Deletion
		if (state.selectionActive && (justPressed.indexOf("backspace") !== -1 || justPressed.indexOf("delete") !== -1)) {
			const minR = Math.min(state.selStartRow, state.selEndRow);
			const maxR = Math.max(state.selStartRow, state.selEndRow);
			const minC = Math.min(state.selStartChan, state.selEndChan);
			const maxC = Math.max(state.selStartChan, state.selEndChan);
			for (let r = minR; r <= maxR; r++) {
				for (let c = minC; c <= maxC; c++) {
					const pIdx = song.orders[state.pattern][c];
					const rowData = song.patterns[pIdx][c].rows[r];
					const curChanMaxCol = 6 + (song.effectsInUse[c] - 1) * 3;
					let sCol = 0, eCol = curChanMaxCol;
					if (minC === maxC) {
						sCol = Math.min(state.selStartCol, state.selEndCol);
						eCol = Math.max(state.selStartCol, state.selEndCol);
					} else {
						if (c === minC) sCol = (state.selStartChan === minC) ? state.selStartCol : state.selEndCol;
						else if (c === maxC) eCol = (state.selStartChan === maxC) ? state.selStartCol : state.selEndCol;
					}
					for (let col = sCol; col <= eCol; col++) {
						if (col === 0) rowData.note = -1;
						if (col === 1 || col === 2) rowData.instrument = -1;
						if (col === 3) rowData.volume = -1;
						if (col >= 4) {
							let eIdx = Math.floor((col - 4) / 3);
							rowData.effects[eIdx].type = "";
							rowData.effects[eIdx].params = 0;
						}
					}
				}
			}
			return;
		}

		const currentRowObj = currentPatternData.rows[state.row];
		const isRowEmpty = currentRowObj.note === -1 &&
			currentRowObj.instrument === -1 &&
			currentRowObj.volume === -1 &&
			currentRowObj.effects.every(e => e.type === "");

		if (state.column == 0) {
			if (justPressed.indexOf("backspace") !== -1) {
				if (isRowEmpty) {
					currentPatternData.rows.splice(state.row, 1);
					currentPatternData.rows.push(createEmptyRow(state.channel));
				} else {
					currentPatternData.rows[state.row].note = -1;
					currentPatternData.rows[state.row].instrument = -1;
					decreaseRow(state, song);
				}
			}
			if (justPressed.indexOf("delete") !== -1) {
				currentPatternData.rows[state.row].note = -1;
				currentPatternData.rows[state.row].instrument = -1;
				increaseRow(state, song);
			}
		}
		if (state.column == 1) {
			for (let k in justPressed) {
				let key = justPressed[k];
				let val = consts.keyToNumLUT.indexOf(key);
				if (val !== -1) {
					if (currentPatternData.rows[state.row].instrument == -1) currentPatternData.rows[state.row].instrument = 0;
					currentPatternData.rows[state.row].instrument &= 15;
					currentPatternData.rows[state.row].instrument |= val << 4;
					increaseRow(state, song);
				}
			}
			if (justPressed.indexOf("backspace") !== -1) {
				if (isRowEmpty) {
					currentPatternData.rows.splice(state.row, 1);
					currentPatternData.rows.push(createEmptyRow(state.channel));
				} else {
					currentPatternData.rows[state.row].instrument = -1;
					decreaseRow(state, song);
				}
			}
			if (justPressed.indexOf("delete") !== -1) {
				currentPatternData.rows[state.row].instrument = -1;
				increaseRow(state, song);
			}
		}
		if (state.column == 2) {
			for (let k in justPressed) {
				let key = justPressed[k];
				let val = consts.keyToNumLUT.indexOf(key);
				if (val !== -1) {
					if (currentPatternData.rows[state.row].instrument == -1) currentPatternData.rows[state.row].instrument = 0;
					currentPatternData.rows[state.row].instrument &= 0xF0;
					currentPatternData.rows[state.row].instrument |= val;
					increaseRow(state, song);
				}
			}
			if (justPressed.indexOf("backspace") !== -1) {
				if (isRowEmpty) {
					currentPatternData.rows.splice(state.row, 1);
					currentPatternData.rows.push(createEmptyRow(state.channel));
				} else {
					currentPatternData.rows[state.row].instrument = -1;
					decreaseRow(state, song);
				}
			}
			if (justPressed.indexOf("delete") !== -1) {
				currentPatternData.rows[state.row].instrument = -1;
				increaseRow(state, song);
			}
		}
		if (state.column == 3) {
			for (let k in justPressed) {
				let key = justPressed[k];
				let val = consts.keyToNumLUT.indexOf(key);
				if (val !== -1) {
					currentPatternData.rows[state.row].volume = val;
					increaseRow(state, song);
				}
			}
			if (justPressed.indexOf("backspace") !== -1) {
				if (isRowEmpty) {
					currentPatternData.rows.splice(state.row, 1);
					currentPatternData.rows.push(createEmptyRow(state.channel));
				} else {
					currentPatternData.rows[state.row].volume = -1;
					decreaseRow(state, song);
				}
			}
			if (justPressed.indexOf("delete") !== -1) {
				currentPatternData.rows[state.row].volume = -1;
				increaseRow(state, song);
			}
		}
		if (state.column >= 4) {
			let localColumn = state.column - 4;
			let effectIdx = Math.floor(localColumn / 3);
			let subCol = localColumn % 3;
			for (let k in justPressed) {
				let key = justPressed[k];
				if (subCol === 0) {
					if (consts.effectLUT.indexOf(key) !== -1) {
						currentPatternData.rows[state.row].effects[effectIdx].type = key;
						increaseRow(state, song);
					}
				} else {
					let val = consts.keyToNumLUT.indexOf(key);
					if (val !== -1) {
						if (subCol === 1) currentPatternData.rows[state.row].effects[effectIdx].params = (val << 4) | (currentPatternData.rows[state.row].effects[effectIdx].params & 0xF);
						else currentPatternData.rows[state.row].effects[effectIdx].params = (currentPatternData.rows[state.row].effects[effectIdx].params & 0xF0) | val;
						increaseRow(state, song);
					}
				}
			}
			if (justPressed.indexOf("backspace") !== -1) {
				if (isRowEmpty) {
					currentPatternData.rows.splice(state.row, 1);
					currentPatternData.rows.push(createEmptyRow(state.channel));
				} else {
					currentPatternData.rows[state.row].effects[effectIdx].type = "";
					currentPatternData.rows[state.row].effects[effectIdx].params = 0;
					decreaseRow(state, song);
				}
			}
			if (justPressed.indexOf("delete") !== -1) {
				currentPatternData.rows[state.row].effects[effectIdx].type = "";
				currentPatternData.rows[state.row].effects[effectIdx].params = 0;
				increaseRow(state, song);
			}
		}
	}
	if (justPressed.indexOf(" ") !== -1) state.recording = !state.recording;

	// Channel mute: F9-F12
	for (let fi = 0; fi < 4; fi++) {
		if (justPressed.indexOf("f" + (fi + 9)) !== -1) {
			state.channelMute[fi] = !state.channelMute[fi];
			if (window.audioNode) {
				window.audioNode.port.postMessage({ type: "MUTE_STATE", channels: state.channelMute });
			}
		}
	}

	lastPressed = [...pressed];
}
export { handleInput }
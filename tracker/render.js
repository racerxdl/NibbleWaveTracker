import * as consts from "./consts.js";
import * as utils from "./utils.js";

let colorCount = 0;
for (let c in consts.UIColors) colorCount++;

let textBuffCanvas = document.createElement("canvas");
textBuffCanvas.width = consts.cellWidth * 100;
textBuffCanvas.height = consts.cellHeight * colorCount;
//document.body.appendChild(textBuffCanvas);

let textBuffCtx = textBuffCanvas.getContext("2d");

textBuffCtx.fillStyle = "black";
textBuffCtx.fillRect(0, 0, textBuffCanvas.width, textBuffCanvas.height);

textBuffCtx.font = utils.getFitFont(textBuffCtx, "C", consts.cellWidth, consts.cellHeight);
textBuffCtx.fillStyle = "white";
textBuffCtx.textAlign = "center";
textBuffCtx.textBaseline = "middle";

for (let x = 0; x < 100; x++) {
	let index = x;
	colorCount = 0;
	if (index >= consts.characterSet.length) break;

	for (let c in consts.UIColors) {
		let color = consts.UIColors[c];

		textBuffCtx.fillStyle = color;
		textBuffCtx.fillText(consts.characterSet[index], (x + 0.5) * consts.cellWidth, (colorCount + 0.5) * consts.cellHeight);
		colorCount++;
	}
}

function drawRowNumbers(patternCtx, textBuff, rows, cellWidth, cellHeight, primaryHighlight, secondaryHighlight) {
	for (let r = 0; r < rows; r++) {
		let hightlight = (r % primaryHighlight == 0) || (r % secondaryHighlight == 0);
		let noteColor = hightlight ? utils.getColorHeight("noteHighlight") : utils.getColorHeight("note");

		let lowNibble = consts.characterSet.indexOf((r & 15).toString(16).toUpperCase());
		let highNibble = consts.characterSet.indexOf((r >> 4).toString(16).toUpperCase());

		patternCtx.drawImage(textBuff, highNibble * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, 0, cellHeight * r, cellWidth, cellHeight);
		patternCtx.drawImage(textBuff, lowNibble * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, cellWidth, cellHeight * r, cellWidth, cellHeight);
	}
}

function drawRow(patternCtx, textBuff, row, cellX, cellY, cellWidth, cellHeight, hightlight, effectsInUse) {
	let noteColor = hightlight ? utils.getColorHeight("noteHighlight") : utils.getColorHeight("note");
	let instrumentColor = utils.getColorHeight("instrument");
	let volumeColor = utils.getColorHeight("volume");
	let effectColor = utils.getColorHeight("effect");

	if (row.note === -2) {
		patternCtx.drawImage(textBuff, consts.characterSet.indexOf("O") * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, cellX, cellY, cellWidth, cellHeight);
		patternCtx.drawImage(textBuff, consts.characterSet.indexOf("F") * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, cellX + cellWidth * 1, cellY, cellWidth, cellHeight);
		patternCtx.drawImage(textBuff, consts.characterSet.indexOf("F") * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, cellX + cellWidth * 2, cellY, cellWidth, cellHeight);
	}
	else if (row.note != -1) {
		let noteCharacters = utils.getNoteText(row.note);

		patternCtx.drawImage(textBuff, noteCharacters[0] * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, cellX, cellY, cellWidth, cellHeight);
		patternCtx.drawImage(textBuff, noteCharacters[1] * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, cellX + cellWidth, cellY, cellWidth, cellHeight);
		patternCtx.drawImage(textBuff, noteCharacters[2] * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, cellX + cellWidth * 2, cellY, cellWidth, cellHeight);
	}
	else {
		patternCtx.drawImage(textBuff, consts.characterSet.indexOf("-") * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, cellX, cellY, cellWidth, cellHeight);
		patternCtx.drawImage(textBuff, consts.characterSet.indexOf("-") * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, cellX + cellWidth * 1, cellY, cellWidth, cellHeight);
		patternCtx.drawImage(textBuff, consts.characterSet.indexOf("-") * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, cellX + cellWidth * 2, cellY, cellWidth, cellHeight);
	}

	if (row.instrument != -1) {
		let instLowerNibble = consts.characterSet.indexOf((row.instrument & 15).toString(16).toUpperCase());
		let instHigherNibble = consts.characterSet.indexOf((row.instrument >> 4).toString(16).toUpperCase());

		patternCtx.drawImage(textBuff, instHigherNibble * cellWidth, instrumentColor * cellHeight, cellWidth, cellHeight, cellX + cellWidth * 4, cellY, cellWidth, cellHeight);
		patternCtx.drawImage(textBuff, instLowerNibble * cellWidth, instrumentColor * cellHeight, cellWidth, cellHeight, cellX + cellWidth * 5, cellY, cellWidth, cellHeight);
	}
	else {
		patternCtx.drawImage(textBuff, consts.characterSet.indexOf("-") * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, cellX + cellWidth * 4, cellY, cellWidth, cellHeight);
		patternCtx.drawImage(textBuff, consts.characterSet.indexOf("-") * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, cellX + cellWidth * 5, cellY, cellWidth, cellHeight);
	}

	if (row.volume != -1) {
		patternCtx.drawImage(textBuff, consts.characterSet.indexOf(row.volume.toString(16).toUpperCase()) * cellWidth, volumeColor * cellHeight, cellWidth, cellHeight, cellX + cellWidth * 7, cellY, cellWidth, cellHeight);
	}
	else {
		patternCtx.drawImage(textBuff, consts.characterSet.indexOf("-") * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, cellX + cellWidth * 7, cellY, cellWidth, cellHeight);
	}

	for (let e in row.effects) {
		let effect = row.effects[e];
		let effectX = cellX + cellWidth * 9 + e * 4 * cellWidth;

		if (e >= effectsInUse) break;

		if (effect.type.length > 0) {
			patternCtx.drawImage(textBuff, consts.characterSet.indexOf(effect.type.toUpperCase()) * cellWidth, effectColor * cellHeight, cellWidth, cellHeight, effectX, cellY, cellWidth, cellHeight);
			patternCtx.drawImage(textBuff, consts.characterSet.indexOf((effect.params >> 4).toString(16).toUpperCase()) * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, effectX + cellWidth, cellY, cellWidth, cellHeight);
			patternCtx.drawImage(textBuff, consts.characterSet.indexOf((effect.params & 15).toString(16).toUpperCase()) * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, effectX + 2 * cellWidth, cellY, cellWidth, cellHeight);
		}
		else {
			patternCtx.drawImage(textBuff, consts.characterSet.indexOf("-") * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, effectX, cellY, cellWidth, cellHeight);
			patternCtx.drawImage(textBuff, consts.characterSet.indexOf("-") * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, effectX + cellWidth, cellY, cellWidth, cellHeight);
			patternCtx.drawImage(textBuff, consts.characterSet.indexOf("-") * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, effectX + 2 * cellWidth, cellY, cellWidth, cellHeight);
		}
	}
}

function drawPattern(state, song, patternCtx, cellWidth, cellHeight, primaryHighlight, secondaryHighlight) {
	// Clear the whole canvas background to ensure previous frame is wiped
	patternCtx.fillStyle = "black";
	patternCtx.fillRect(0, 0, patternCtx.canvas.width, patternCtx.canvas.height);

	// Calculate the vertical scroll offset so the current row is 25% down the canvas
	const targetBuffer = patternCtx.canvas.height * 0.25;
	const verticalBuffer = Math.floor(targetBuffer / cellHeight) * cellHeight;

	patternCtx.save();
	// Translate coordinate system
	const translationY = verticalBuffer - cellHeight * state.row;
	patternCtx.translate(0, translationY);

	patternCtx.globalAlpha = 1;

	let currentCell = 0;
	let pastCurrentCells = [];

	// Render Pattern Data
	for (let i = 0; i < song.channelCount; i++) {
		let patternIndex = song.orders[state.pattern][i];
		let channel = song.patterns[patternIndex][i];

		for (let r = 0; r < song.rowsPerPattern; r++) {
			let row = channel.rows[r];
			let highlighted = (r % primaryHighlight == 0) || (r % secondaryHighlight == 0);
			drawRow(patternCtx, textBuffCanvas, row, (currentCell + 2) * cellWidth, r * cellHeight, cellWidth, cellHeight, highlighted, channel.effectsInUse);
		}

		currentCell += (9 + 4 * channel.effectsInUse) - 1;
		pastCurrentCells.push(currentCell);
	}

	// Draw Selection
	if (state.selectionActive) {
		const minRow = Math.min(state.selStartRow, state.selEndRow);
		const maxRow = Math.max(state.selStartRow, state.selEndRow);
		const minChan = Math.min(state.selStartChan, state.selEndChan);
		const maxChan = Math.max(state.selStartChan, state.selEndChan);

		patternCtx.fillStyle = "rgba(100, 149, 237, 0.4)"; // CornflowerBlue with alpha

		for (let c = minChan; c <= maxChan; c++) {
			const chanXStart = (c === 0 ? 0 : pastCurrentCells[c - 1]);
			const curChanMaxCol = 6 + (song.effectsInUse[c] - 1) * 3;

			let sCol = 0;
			let eCol = curChanMaxCol;

			// Logic to handle column bounds per channel correctly during selection
			if (minChan === maxChan) {
				sCol = Math.min(state.selStartCol, state.selEndCol);
				eCol = Math.max(state.selStartCol, state.selEndCol);
			} else {
				if (c === minChan) {
					// Leftmost channel: if it was the start, it goes from StartCol to Max. If it was the end, it goes from EndCol to Max.
					sCol = (state.selStartChan === minChan) ? state.selStartCol : state.selEndCol;
				} else if (c === maxChan) {
					// Rightmost channel: if it was the start, it goes from 0 to StartCol. If it was the end, it goes from 0 to EndCol.
					eCol = (state.selStartChan === maxChan) ? state.selStartCol : state.selEndCol;
				}
			}

			let minX = Infinity;
			let maxX = -Infinity;

			for (let col = sCol; col <= eCol; col++) {
				const dim = consts.columnDimensions[col];
				const x = (chanXStart + dim[0] + 2) * cellWidth;
				const w = dim[1] * cellWidth;
				minX = Math.min(minX, x);
				maxX = Math.max(maxX, x + w);
			}

			if (minX !== Infinity) {
				patternCtx.fillRect(minX, minRow * cellHeight, maxX - minX, (maxRow - minRow + 1) * cellHeight);
			}
		}
	}

	// Render row numbers and channel separators
	drawRowNumbers(patternCtx, textBuffCanvas, song.rowsPerPattern, cellWidth, cellHeight, primaryHighlight, secondaryHighlight);

	patternCtx.fillStyle = consts.UIColors.channelSeparator;
	const topOfCanvas = -translationY;
	const canvasFullHeight = patternCtx.canvas.height;

	for (let x = 0; x < pastCurrentCells.length; x++) {
		patternCtx.fillRect((pastCurrentCells[x] + 2) * cellWidth, topOfCanvas, 1, canvasFullHeight);
	}
	patternCtx.fillRect(2 * cellWidth, topOfCanvas, 1, canvasFullHeight);

	// Render Cursor Row Highlight
	let rowGradient = patternCtx.createLinearGradient(0, cellHeight * state.row, 0, cellHeight * (state.row + 1));
	if (state.recording) {
		rowGradient.addColorStop(0, consts.UIColors.recordingRow);
		rowGradient.addColorStop(1, consts.UIColors.recordingRowEnd);
	} else {
		rowGradient.addColorStop(0, consts.UIColors.cursorRow);
		rowGradient.addColorStop(1, consts.UIColors.cursorRowEnd);
	}

	patternCtx.fillStyle = rowGradient;
	patternCtx.globalAlpha = 0.5;
	patternCtx.fillRect(cellWidth * 2, cellHeight * state.row, currentCell * cellWidth, cellHeight);

	// Render Individual Cell Cursor
	const curPastCells = [0, ...pastCurrentCells];
	let cursorX = consts.columnDimensions[state.column][0];
	let cursorWidth = consts.columnDimensions[state.column][1];

	patternCtx.globalAlpha = 0.8;
	let cursorGradient = patternCtx.createLinearGradient(0, cellHeight * state.row, 0, cellHeight * (state.row + 1));
	cursorGradient.addColorStop(0, consts.UIColors.cursor);
	cursorGradient.addColorStop(1, consts.UIColors.cursorEnd);

	patternCtx.fillStyle = cursorGradient;
	patternCtx.fillRect((curPastCells[state.channel] + cursorX + 2) * cellWidth, cellHeight * state.row, cellWidth * cursorWidth, cellHeight);

	patternCtx.restore();
}

function drawOrders(state, song, orderCtx, cellWidth, cellHeight) {
	orderCtx.globalAlpha = 1;
	orderCtx.clearRect(0, 0, orderCtx.canvas.width, orderCtx.canvas.height);
	orderCtx.fillStyle = "black";
	orderCtx.fillRect(0, 0, orderCtx.canvas.width, orderCtx.canvas.height);

	orderCtx.save();
	orderCtx.translate(cellWidth, cellHeight * 2);

	let startingOrder = (state.pattern >> 3) << 3;

	for (let o = startingOrder; o < song.orders.length && o < startingOrder + 8; o++) {
		for (let c = 0; c < song.channelCount; c++) {
			let highNibble = consts.characterSet.indexOf((song.orders[o][c] >> 4).toString(16).toUpperCase());
			let lowNibble = consts.characterSet.indexOf((song.orders[o][c] & 15).toString(16).toUpperCase());

			orderCtx.drawImage(textBuffCanvas, highNibble * cellWidth, 0, cellWidth, cellHeight, cellWidth * (2 + c * 3), cellHeight * (o & 7), cellWidth, cellHeight);
			orderCtx.drawImage(textBuffCanvas, lowNibble * cellWidth, 0, cellWidth, cellHeight, cellWidth * (3 + c * 3), cellHeight * (o & 7), cellWidth, cellHeight);
		}
	}

	for (let r = startingOrder; r < song.orders.length && r < startingOrder + 8; r++) {
		let noteColor = utils.getColorHeight("noteHighlight");

		let lowNibble = consts.characterSet.indexOf((r & 15).toString(16).toUpperCase());
		let highNibble = consts.characterSet.indexOf((r >> 4).toString(16).toUpperCase());

		orderCtx.drawImage(textBuffCanvas, highNibble * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, 0, cellHeight * (r & 7), cellWidth, cellHeight);
		orderCtx.drawImage(textBuffCanvas, lowNibble * cellWidth, noteColor * cellHeight, cellWidth, cellHeight, cellWidth, cellHeight * (r & 7), cellWidth, cellHeight);
	}

	let gradient = orderCtx.createLinearGradient(0, cellHeight * state.row, 0, cellHeight * (state.row + 1));

	if (state.editOrder) {
		gradient.addColorStop(0, consts.UIColors.recordingRow);
		gradient.addColorStop(1, consts.UIColors.recordingRowEnd);
	}
	else {
		gradient.addColorStop(0, consts.UIColors.cursorRow);
		gradient.addColorStop(1, consts.UIColors.cursorRowEnd);
	}

	orderCtx.fillStyle = gradient;
	orderCtx.globalAlpha = 0.5;

	orderCtx.fillRect(cellWidth * 2, (state.pattern & 7) * cellHeight, (-1 + song.channelCount * 3) * cellWidth, cellHeight);

	orderCtx.globalAlpha = 0.8;
	gradient = orderCtx.createLinearGradient(0, cellHeight * state.row, 0, cellHeight * (state.row + 1));
	gradient.addColorStop(0, consts.UIColors.cursor);
	gradient.addColorStop(1, consts.UIColors.cursorEnd);
	orderCtx.fillRect(((state.channel * 3) + 2) * cellWidth, cellHeight * (state.pattern & 7), cellWidth * 2, cellHeight)

	orderCtx.restore();
}

export { drawPattern, drawOrders }
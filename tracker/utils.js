import * as consts from "./consts.js";

function getColorHeight(color) {
	let colors = [];
	for (let c in consts.UIColors) colors.push(c);

	return colors.indexOf(color);
}

function getNoteText(noteNum) {
	let noteIndex = noteNum % 12;
	let noteOctave = (noteNum - noteIndex) / 12;

	if (noteOctave > 9) noteOctave = 9;

	let noteNames = ["C-", "C#", "D-", "D#",
		"E-", "F-", "F#", "G-",
		"G#", "A-", "A#", "B-"];

	let noteName = noteNames[noteIndex];

	return [consts.characterSet.indexOf(noteName[0]), consts.characterSet.indexOf(noteName[1]), consts.characterSet.indexOf(String(noteOctave))];
}

function getFitFont(ctx, text, rectWidth, rectHeight) {
	const baseSize = 10;
	ctx.font = `${baseSize}px monospace`;

	const metrics = ctx.measureText(text);
	const widthFontSize = (rectWidth / metrics.width) * baseSize;

	const heightFontSize = rectHeight;
	const finalSize = Math.min(widthFontSize, heightFontSize);

	return `${Math.floor(finalSize)}px monospace`;
}

export { getColorHeight, getNoteText, getFitFont }
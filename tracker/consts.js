const characterSet = ["C", "D", "E", "F", "G", "A", "B", "O", "-", "#",
	"0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
	"V", "P", "Q", "R"];

window.characterSet = characterSet;

const keyToNumLUT = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"];
const keyToNumLUTSpecial = [")", "!", "@", "#", "$", "%", "^", "&", "*", "(", "a", "b", "c", "d", "e", "f"];
const effectLUT = ["0", "1", "2", "3", "4", "a", "v", "q", "r", "p"]

const cellWidth = 16;
const cellHeight = 16;

const columnDimensions = [
	[0, 3], //Note
	[4, 1], //Instrument high nibble
	[5, 1], //Instrument low nibble
	[7, 1], //Volume
	[9, 1], //Effect type
	[10, 1], //Param 0
	[11, 1], //Param 1
	[13, 1], //Effect type
	[14, 1], //Param 0
	[15, 1], //Param 1
	[17, 1], //Effect type
	[18, 1], //Param 0
	[19, 1], //Param 1
	[21, 1], //Effect type
	[22, 1], //Param 0
	[23, 1], //Param 1
];

const noteEntryLUT = {
	"z": 0, //C
	"s": 1, //C#
	"x": 2, //D
	"d": 3, //D#
	"c": 4, //E
	"v": 5, //F
	"g": 6, //F#
	"b": 7, //G
	"h": 8, //G#
	"n": 9, //A
	"j": 10, //A#
	"m": 11, //B
	"q": 12, //C
	"2": 13, //C#
	"w": 14, //D
	"3": 15, //D#
	"e": 16, //E
	"r": 17, //F
	"5": 18, //F#
	"t": 19, //G
	"6": 20, //G#
	"y": 21, //A
	"7": 22, //A#
	"u": 23, //B
	"i": 24, //C
	"9": 25, //C#
	"o": 26, //D
	"0": 27, //D#
	"p": 28, //E
	",": 12, //C
	"l": 13, //C#
	".": 14, //D
	";": 15 //D#
};

const UIColors = {
	note: "#00cc66",
	noteHighlight: "#ffcc00",
	instrument: "#88cc44",
	volume: "#44aaff",
	effect: "#ff8844",
	white: "#c0c0d0",
	channelSeparator: "#2a2a4a",
	cursorRow: "#1a2a5a",
	cursorRowEnd: "#0d1530",
	recordingRow: "#6c2330",
	recordingRowEnd: "#400f17",
	cursor: "#3355aa",
	cursorEnd: "#223366"
};

export { cellWidth, cellHeight, characterSet, keyToNumLUT, keyToNumLUTSpecial, noteEntryLUT, UIColors, effectLUT, columnDimensions }
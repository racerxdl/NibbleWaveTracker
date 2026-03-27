function getRow() {
	return {
		note: -1, instrument: -1,
		volume: -1, effects: [{ type: "", params: 0 }, { type: "", params: 0 },
		{ type: "", params: 0 }, { type: "", params: 0 }
		]
	}
}

function getChannel(rows) {
	let channel = { rows: [], effectsInUse: 1 }
	for (let i = 0; i < rows; i++) {
		channel.rows.push(getRow());
	}
	return channel;
}

function getPattern(channels, rows) {
	let pattern = [];
	for (let i = 0; i < channels; i++) {
		pattern.push(getChannel(rows));
	}

	return pattern;
}

function getInstrument() {
	let instrument = {
		name: "",
		volume: "",
		arpeggio: "",
		pitch: "",
		type: "psg",
		sample: {
			start: 0,
			end: 0,
			loop: false,
			samples: [],
			F0: 440,
			sampleRate: 44100
		}
	};

	return instrument;
}


function getSong(channels, rows) {
	let song = {};

	song.patterns = [getPattern(channels, rows)];
	song.orders = [[]];
	song.instruments = [getInstrument()];
	song.effectsInUse = [];
	song.channelNames = ["Square 1", "Square 2", "Square 3", "Noise"];
	song.channelCount = channels;
	song.rowsPerPattern = rows;
	song.primaryHighlight = 16;
	song.secondaryHighlight = 4;
	song.name = "";
	song.author = "";
	song.copyright = "";
	song.bpm = 120;
	song.rowsPerBeat = 4;
	song.rowsPerPattern = 32;
	song.trackerVersion = 0.01;

	for (let c = 0; c < channels; c++) {
		song.effectsInUse.push(1);
		song.orders[0].push(0);
	}

	return song;
}

export { getSong, getPattern, getInstrument }
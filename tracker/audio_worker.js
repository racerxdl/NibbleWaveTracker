// DCSG Implementation internal to the worker
const dcsgVolumeTable = new Uint32Array([
	256, 203, 162, 128, 102, 81, 64, 51,
	41, 32, 26, 20, 16, 13, 10, 0
]);

const CLOCK_RATE = 223721.625;
const BASE_FREQ = 32.7032;
const OCTAVES = 8;
const STEPS_PER_OCTAVE = 192; // 16 steps per semitone
const periodLUT = new Uint16Array(OCTAVES * STEPS_PER_OCTAVE);

// Sample PlayBACK Constants
const SAMPLE_PLAYBACK_RATE = 7849.881578947368; // NTSC color burst / (228 * 2)
const CHIP_SAMPLES_PER_SAMPLE_TICK = CLOCK_RATE / SAMPLE_PLAYBACK_RATE;

for (let i = 0; i < periodLUT.length; i++) {
	const frequency = BASE_FREQ * Math.pow(2, i / STEPS_PER_OCTAVE);
	let period = Math.round(CLOCK_RATE / (2 * frequency));
	if (period < 1) period = 1;
	if (period > 1023) period = 1023;
	periodLUT[i] = period;
}

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

class InternalDCSG {
	constructor() {
		this.channels = Array.from({ length: 4 }, () => ({
			period: 1, counter: 1, attenuation: 15, digitalOut: 0,
			periodSelect: 0, mode: 0, shiftRegister: 0x8000
		}));
		this.addrLatch = 0;
	}

	write(data) {
		if (data & 0x80) this.addrLatch = (data >> 4) & 0x07;
		const chIdx = this.addrLatch >> 1;
		if (this.addrLatch & 0x01) {
			this.channels[chIdx].attenuation = data & 0x0f;
		} else {
			if (chIdx < 3) {
				if (data & 0x80) {
					this.channels[chIdx].period = (this.channels[chIdx].period & 0x3f0) | (data & 0x0f);
				} else {
					this.channels[chIdx].period = (this.channels[chIdx].period & 0x00f) | ((data & 0x3f) << 4);
				}
			} else {
				const newMode = (data >> 2) & 0x01;
				const newPS = data & 0x03;
				if (newMode !== this.channels[3].mode || newPS !== this.channels[3].periodSelect) {
					this.channels[3].periodSelect = newPS;
					this.channels[3].mode = newMode;
					this.channels[3].shiftRegister = 0x8000;
				}
			}
		}
	}

	getSample() {
		let acc = 0;
		for (let c = 0; c < 4; c++) {
			const ch = this.channels[c];
			if (ch.period === 0 && c !== 3) acc += dcsgVolumeTable[ch.attenuation];
			else acc += ch.digitalOut * dcsgVolumeTable[ch.attenuation];
		}
		const n = this.channels[3];
		if (n.counter === 1) {
			n.digitalOut = n.shiftRegister & 1;
			let fb = n.mode ? (((n.shiftRegister >> 3) & 1) ^ (n.shiftRegister & 1)) : (n.shiftRegister & 1);
			n.shiftRegister = (n.shiftRegister >> 1) | (fb << 15);
			if (n.periodSelect === 0) n.counter = 32;
			else if (n.periodSelect === 1) n.counter = 64;
			else if (n.periodSelect === 2) n.counter = 128;
			else n.counter = this.channels[2].period << 1;
		} else n.counter = (n.counter - 1) & 0x3ff;
		for (let s = 0; s < 3; s++) {
			const t = this.channels[s];
			if (t.counter === 1) {
				t.counter = t.period || 1;
				t.digitalOut = t.digitalOut ? 0 : 1;
			} else t.counter = (t.counter - 1) & 0x3ff;
		}
		return acc;
	}
}

class ChannelSequencer {
	constructor(channelIndex, dcsg) {
		this.channelIndex = channelIndex;
		this.dcsg = dcsg;
		this.active = false;

		this.baseNote = 0;
		this.columnVolume = 15;
		this.instrument = null;
		this.sequences = { volume: null, arpeggio: null, pitch: null };
		this.indices = { volume: 0, arpeggio: 0, pitch: 0 };

		this.latchedEffects = new Map();
		this.continuousPitchOffset = 0;
		this.vibratoPhase = 0;
		this.vibratoDir = 1;
		this.glissandoTarget = -1;
		this.volumeSlideAccum = 0;
		this.arpTick = 0;
		this.mutedByNoteOff = false;
		this.retriggerCounter = 0;

		this.isSampleMode = false;
		this.sampleData = null;
		this.samplePhase = 0;
		this.samplePhaseIncrement = 0;
		this.sampleLoopStart = 0;
		this.sampleLoopEnd = 0;
		this.sampleLooping = false;
	}

	resetEffects() {
		this.latchedEffects.clear();
		this.continuousPitchOffset = 0;
		this.vibratoPhase = 0;
		this.vibratoDir = 1;
		this.glissandoTarget = -1;
		this.volumeSlideAccum = 0;
		this.arpTick = 0;
		this.mutedByNoteOff = false;
		this.retriggerCounter = 0;
		this.columnVolume = 15;
	}

	trigger(note, instrument, volume = -1, effects = [], params = []) {
		if (note === -1) {
			this.stop();
			return;
		}

		if (note === -2) {
			this.active = true;
			this.mutedByNoteOff = true;
			this.isSampleMode = false;
			this.indices.volume = 0;
			this.indices.arpeggio = 0;
			this.indices.pitch = 0;
			if (volume !== -1) this.columnVolume = volume;
			this.updateLatchedEffects(effects, params);
			this.dcsg.write(0x80 | (this.channelIndex << 5) | 0x10 | 0x0f);
			return;
		}

		const hasSlide = effects.some(t => t === 3);
		if (hasSlide && this.active && !this.mutedByNoteOff) {
			this.glissandoTarget = note;
			if (volume !== -1) this.columnVolume = volume;
			this.updateLatchedEffects(effects, params);
			return;
		}

		this.active = true;
		this.mutedByNoteOff = false;
		this.baseNote = note;
		if (volume !== -1) this.columnVolume = volume;
		this.instrument = instrument;

		if (this.channelIndex === 0 && instrument.type === 'sample' && instrument.sample && instrument.sample.samples && instrument.sample.samples.length > 0) {
			this.isSampleMode = true;
			this.prepareSample(instrument);
			this.dcsg.write(0x80 | (0 << 5) | 0x00);
			this.dcsg.write(0x00);
		} else {
			this.isSampleMode = false;
		}

		this.sequences.volume = parseSequence(instrument.volume);
		this.sequences.arpeggio = parseSequence(instrument.arpeggio);
		this.sequences.pitch = parseSequence(instrument.pitch);
		this.indices.volume = 0;
		this.indices.arpeggio = 0;
		this.indices.pitch = 0;

		this.updateLatchedEffects(effects, params, true);
		this.continuousPitchOffset = 0;
		this.glissandoTarget = -1;
		this.volumeSlideAccum = 0;

		// Click suppression: mute for one tick before setting new period
		this.dcsg.write(0x80 | (this.channelIndex << 5) | 0x10 | 0x0F);
		this.update();
	}

	updateLatchedEffects(types, params, forceResetOnNote = false) {
		for (let i = 0; i < types.length; i++) {
			const type = types[i];
			const p = params[i];
			if (type === -1) continue;
			const currentP = this.latchedEffects.get(type);
			if (p !== currentP) {
				this.latchedEffects.set(type, p);
				if (type === 4) { this.vibratoPhase = 0; this.vibratoDir = 1; }
				if (type === 0) { this.arpTick = 0; }
			}
		}
	}

	prepareSample(instrument) {
		const src = instrument.sample;
		const raw = src.samples || [];
		const len = raw.length;
		this.sampleData = new Uint8Array(len);

		let maxAmp = 0.0001;
		for (let i = 0; i < len; i++) {
			if (Math.abs(raw[i]) > maxAmp) maxAmp = Math.abs(raw[i]);
		}

		for (let i = 0; i < len; i++) {
			const normalized = (raw[i] / maxAmp + 1) * 0.5;
			const targetAmp = normalized * 256;
			let bestIdx = 15;
			let minDiff = 1000;
			for (let j = 0; j < 16; j++) {
				let diff = Math.abs(dcsgVolumeTable[j] - targetAmp);
				if (diff < minDiff) { minDiff = diff; bestIdx = j; }
			}
			this.sampleData[i] = bestIdx;
		}

		this.samplePhase = 0;
		this.sampleLooping = !!src.loop;
		this.sampleLoopStart = src.start || 0;
		this.sampleLoopEnd = src.end || (len - 1);

		if (this.sampleLoopEnd <= this.sampleLoopStart) this.sampleLooping = false;
	}

	stop() {
		this.active = false;
		this.isSampleMode = false;
		this.dcsg.write(0x80 | (this.channelIndex << 5) | 0x10 | 0x0f);
	}

	update() {
		if (!this.active) return;
		this.processEffects();
		if (this.mutedByNoteOff) return;

		if (!this.isSampleMode) {
			let seqVol = (this.sequences.volume && this.sequences.volume.data.length > 0) ? this.sequences.volume.data[this.indices.volume] : 15;
			this.advanceIndex('volume');
			const colAtten = 15 - this.columnVolume;
			const seqAtten = 15 - seqVol;
			const slideAtten = this.volumeSlideAccum >> 8;
			let totalAtten = Math.round(colAtten + seqAtten + slideAtten);
			totalAtten = Math.max(0, Math.min(15, totalAtten));
			this.dcsg.write(0x80 | (this.channelIndex << 5) | 0x10 | totalAtten);
		}

		let noteIdx = this.baseNote * 16;
		const arpParams = this.latchedEffects.get(0);
		if (arpParams !== undefined && arpParams !== 0) {
			const x = (arpParams >> 4) & 0x0f;
			const y = arpParams & 0x0f;
			if (this.arpTick === 1) noteIdx += (x * 16);
			else if (this.arpTick === 2) noteIdx += (y * 16);
			this.arpTick = (this.arpTick + 1) % 3;
		}

		if (this.sequences.arpeggio && this.sequences.arpeggio.data.length > 0) {
			noteIdx += (this.sequences.arpeggio.data[this.indices.arpeggio] * 16);
			this.advanceIndex('arpeggio');
		}

		if (this.sequences.pitch && this.sequences.pitch.data.length > 0) {
			noteIdx += this.sequences.pitch.data[this.indices.pitch];
			this.advanceIndex('pitch');
		}

		const finalNoteIdx = Math.max(0, Math.min(periodLUT.length - 1, Math.round(noteIdx + this.continuousPitchOffset + this.vibratoPhase)));

		if (this.isSampleMode) {
			const targetFreq = BASE_FREQ * Math.pow(2, finalNoteIdx / STEPS_PER_OCTAVE);
			const f0 = this.instrument.sample.F0 || 440;
			const sRate = this.instrument.sample.sampleRate || 44100;
			const ratio = targetFreq / f0;
			const targetRate = ratio * sRate;
			this.samplePhaseIncrement = Math.round((targetRate / SAMPLE_PLAYBACK_RATE) * 256);
		} else if (this.channelIndex === 3) {
			const vParams = this.latchedEffects.get(0x16);
			let nSrc = 0, nMode = 0;
			if (vParams !== undefined) { nSrc = (vParams >> 4) & 0x0f; nMode = vParams & 0x0f; }
			let rate = 0;
			if (nSrc === 1) rate = 3;
			else {
				const currentNote = Math.round(finalNoteIdx / 16);
				const n = currentNote % 16;
				if (n <= 5) rate = 0; else if (n <= 10) rate = 1; else rate = 2;
			}
			this.dcsg.write(0x80 | (3 << 5) | ((nMode === 1 ? 0 : 1) << 2) | rate);
		} else {
			const period = periodLUT[finalNoteIdx];
			this.dcsg.write(0x80 | (this.channelIndex << 5) | (period & 0x0f));
			this.dcsg.write((period >> 4) & 0x3f);
		}
	}

	updateSamplePhase() {
		if (!this.active || !this.isSampleMode || !this.sampleData) return;

		const currentIdx = this.samplePhase >> 8;

		// Check if we hit the end of the buffer or the assigned loop end
		if (currentIdx >= this.sampleData.length || currentIdx >= this.sampleLoopEnd) {
			if (this.sampleLooping) {
				this.samplePhase = this.sampleLoopStart << 8;
			} else {
				// Fix: Simply deactivate the sequencer to maintain last attenuation level
				// instead of calling stop(), which forces a mute (0x0F) jump and a click.
				this.active = false;
				this.isSampleMode = false;
				return;
			}
		}

		const atten = this.sampleData[this.samplePhase >> 8];
		this.dcsg.write(0x80 | (0 << 5) | 0x10 | atten);
		this.samplePhase += this.samplePhaseIncrement;
	}

	processEffects() {
		const changePerTick = 4 / 60;
		for (const [type, p] of this.latchedEffects) {
			switch (type) {
				case 1: if (p > 0) this.continuousPitchOffset += (p * changePerTick); break;
				case 2: if (p > 0) this.continuousPitchOffset -= (p * changePerTick); break;
				case 3:
					if (this.glissandoTarget !== -1) {
						const targetSteps = this.glissandoTarget * 16;
						const currentSteps = (this.baseNote * 16) + this.continuousPitchOffset;
						const speed = p * changePerTick;
						if (currentSteps < targetSteps) {
							this.continuousPitchOffset += speed;
							if ((this.baseNote * 16) + this.continuousPitchOffset >= targetSteps) { this.baseNote = this.glissandoTarget; this.continuousPitchOffset = 0; this.glissandoTarget = -1; }
						} else {
							this.continuousPitchOffset -= speed;
							if ((this.baseNote * 16) + this.continuousPitchOffset <= targetSteps) { this.baseNote = this.glissandoTarget; this.continuousPitchOffset = 0; this.glissandoTarget = -1; }
						}
					}
					break;
				case 4:
					const speedNibble = (p >> 4) & 0x0f;
					const depth = (p & 0x0f) * 2;
					if (speedNibble > 0 && depth > 0) {
						this.vibratoPhase += ((4 * depth * speedNibble * 0.5) / 60) * this.vibratoDir;
						if (Math.abs(this.vibratoPhase) >= depth) { this.vibratoPhase = depth * this.vibratoDir; this.vibratoDir *= -1; }
					} else this.vibratoPhase = 0;
					break;
				case 0xA:
					const xV = (p >> 4) & 0x0f, yV = p & 0x0f;
					if (xV > 0) this.volumeSlideAccum -= (xV << 8) / 60;
					else if (yV > 0) this.volumeSlideAccum += (yV << 8) / 60;
					break;
				case 0x1A: case 0x1B:
					const qSpeed = (p >> 4) & 0x0f, qAmount = (p & 0x0f) * 16, qDir = type === 0x1A ? 1 : -1;
					if (Math.abs(this.continuousPitchOffset) < qAmount) {
						this.continuousPitchOffset += (qSpeed * changePerTick * qDir * 16);
						if (Math.abs(this.continuousPitchOffset) >= qAmount) this.continuousPitchOffset = qAmount * qDir;
					}
					break;
				case 0x19: // Retrig (p effect)
					if (p > 0) {
						this.retriggerCounter++;
						if (this.retriggerCounter >= p) {
							this.retriggerCounter = 0;
							this.indices.volume = 0;
							this.indices.arpeggio = 0;
							this.indices.pitch = 0;
						}
					}
					break;
			}
		}
	}

	advanceIndex(type) {
		const seq = this.sequences[type];
		if (!seq || seq.data.length === 0) return;
		this.indices[type]++;
		if (this.indices[type] >= seq.data.length) {
			if (seq.loopStart !== -1) this.indices[type] = seq.loopStart;
			else this.indices[type] = seq.data.length - 1;
		}
	}
}

class AudioProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.dcsg = new InternalDCSG();
		this.sequencers = Array.from({ length: 4 }, (_, i) => new ChannelSequencer(i, this.dcsg));
		this.song = null;
		this.isPlaying = false;
		this.currentOrderIndex = 0;
		this.currentRow = 0;
		this.internalSampleRate = 223721.625;
		this.samplesToSum = 0;
		this.samplesUntilNextTick = 0;
		this.tickRate = 60;
		this.samplesPerTick = this.internalSampleRate / this.tickRate;
		this.samplesUntilNextRow = 0;
		this.samplesUntilNextSampleTick = 0;
		this.lpValue = 0;
		this.alpha = 0.25;
		this.mutedChannels = [false, false, false, false];
		this.port.onmessage = this.handleMessage.bind(this);
	}

	handleMessage(e) {
		const d = e.data;
		switch (d.type) {
			case 'START_SONG':
				this.song = d.song;
				this.currentOrderIndex = d.orderIndex !== undefined ? d.orderIndex : 0;
				this.currentRow = d.row || 0;
				this.isPlaying = true;
				this.samplesUntilNextRow = 0;
				this.sequencers.forEach(s => s.resetEffects());
				break;
			case 'STOP_SONG':
				this.isPlaying = false;
				this.sequencers.forEach(s => { s.stop(); s.resetEffects(); });
				break;
			case 'PLAY_NOTE':
				let effId = d.effect;
				if (typeof d.effect === 'string') {
					if (d.effect === 'q') effId = 0x1A; else if (d.effect === 'r') effId = 0x1B;
					else if (d.effect === 'a') effId = 0xA; else if (d.effect === 'v') effId = 0x16;
					else if (d.effect === 'p') effId = 0x19;
					else effId = parseInt(d.effect, 16);
				}
				const targetCh = d.channel !== undefined ? d.channel : (d.isNoise ? 3 : 0);
				this.sequencers[targetCh].resetEffects();
				this.sequencers[targetCh].trigger(d.note, d.instrument, d.volume || 15, [effId], [d.params || 0]);
				break;
			case 'STOP_NOTE': this.sequencers.forEach(s => s.stop()); break;
			case 'WRITE': this.dcsg.write(d.val); break;
			case 'MUTE_STATE': this.mutedChannels = d.channels || [false, false, false, false]; break;
			case 'SEEK':
				this.currentOrderIndex = d.orderIndex !== undefined ? d.orderIndex : this.currentOrderIndex;
				this.currentRow = d.row !== undefined ? d.row : 0;
				this.samplesUntilNextRow = 0;
				this.sequencers.forEach(s => s.stop());
				this.sequencers.forEach(s => s.resetEffects());
				this.advanceRow();
				break;
		}
	}

	process(inputs, outputs) {
		const channel = outputs[0][0];
		const systemSampleRate = sampleRate;
		const ratio = this.internalSampleRate / systemSampleRate;
		let samplesPerRow = this.song ? (this.internalSampleRate / ((this.song.bpm * this.song.rowsPerBeat) / 60)) : 0;

		for (let i = 0; i < channel.length; i++) {
			this.samplesToSum += ratio;
			while (this.samplesToSum >= 1) {
				if (this.isPlaying && this.song) {
					this.samplesUntilNextRow--;
					if (this.samplesUntilNextRow <= 0) {
						this.samplesUntilNextRow += samplesPerRow;
						this.samplesUntilNextTick = 0;
						this.advanceRow();
					}
				}
				this.samplesUntilNextTick--;
				if (this.samplesUntilNextTick <= 0) {
					this.samplesUntilNextTick += this.samplesPerTick;
					this.sequencers.forEach((s, i) => { if (!this.mutedChannels[i]) s.update(); });
				}
				this.samplesUntilNextSampleTick--;
				if (this.samplesUntilNextSampleTick <= 0) {
					this.samplesUntilNextSampleTick += CHIP_SAMPLES_PER_SAMPLE_TICK;
					this.sequencers[0].updateSamplePhase();
				}
				const rawSample = this.dcsg.getSample();
				this.lpValue += this.alpha * (rawSample - this.lpValue);
				this.samplesToSum -= 1;
			}
			channel[i] = this.lpValue / 1024.0;
		}
		return true;
	}

	advanceRow() {
		if (!this.song || !this.isPlaying) return;
		const orderEntry = this.song.orders[this.currentOrderIndex];
		for (let c = 0; c < 4; c++) {
			if (this.mutedChannels[c]) continue;
			const patternIdx = orderEntry[c], channel = this.song.patterns[patternIdx][c];
			if (!channel || !channel.rows) continue;
			const rowData = channel.rows[this.currentRow];
			if (rowData) {
				const inst = this.song.instruments[rowData.instrument];
				let effectsArr = [], paramsArr = [], hasAnyEffect = false;
				for (let eIdx = 0; eIdx < this.song.effectsInUse[c]; eIdx++) {
					if (rowData.effects && rowData.effects[eIdx] && rowData.effects[eIdx].type !== "") {
						let type = rowData.effects[eIdx].type, p = rowData.effects[eIdx].params;
						if (typeof type === 'string') {
							if (type === 'q') type = 0x1A; else if (type === 'r') type = 0x1B;
							else if (type === 'a') type = 0xA; else if (type === 'v') type = 0x16;
							else if (type === 'p') type = 0x19;
							else type = parseInt(type, 16);
						}
						effectsArr.push(type); paramsArr.push(p); hasAnyEffect = true;
					} else { effectsArr.push(-1); paramsArr.push(0); }
				}
				if (rowData.volume !== undefined && rowData.volume !== -1) this.sequencers[c].columnVolume = rowData.volume;
				if (rowData.note !== undefined || rowData.instrument !== undefined) {
					if (inst || rowData.note === -2) this.sequencers[c].trigger(rowData.note, inst, rowData.volume, effectsArr, paramsArr);
					else this.sequencers[c].updateLatchedEffects(effectsArr, paramsArr);
				} else if (hasAnyEffect) this.sequencers[c].updateLatchedEffects(effectsArr, paramsArr);
			}
		}
		this.port.postMessage({ type: 'STATE_UPDATE', orderIndex: this.currentOrderIndex, patterns: orderEntry, row: this.currentRow });
		this.currentRow++;
		if (this.currentRow >= this.song.rowsPerPattern) {
			this.currentRow = 0; this.currentOrderIndex++;
			if (this.currentOrderIndex >= this.song.orders.length) this.currentOrderIndex = 0;
		}
	}
}
registerProcessor('audio-processor', AudioProcessor);
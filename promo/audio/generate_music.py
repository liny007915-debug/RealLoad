#!/usr/bin/env python3
"""Original, deterministic RealLoad product-film music. No external samples.

Requires Python 3.10+ and NumPy. Writes 48 kHz, stereo, 16-bit PCM WAV.
The normal 24-bar arrangement lasts exactly 60 seconds at 96 BPM.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import wave

import numpy as np


SAMPLE_RATE = 48_000
BPM = 96
BEAT = 60 / BPM
BAR = 4 * BEAT
SEED = 127_2026
CHORDS = (
    # D major 7, B minor 7, G major 7, A suspended 2/4.
    {"bass": 38, "pad": (50, 57, 61, 66, 69), "arp": (62, 69, 73, 78)},
    {"bass": 35, "pad": (47, 54, 57, 61, 66), "arp": (59, 66, 69, 73)},
    {"bass": 31, "pad": (43, 50, 54, 57, 62), "arp": (55, 62, 66, 69)},
    {"bass": 33, "pad": (45, 52, 57, 59, 62), "arp": (57, 64, 71, 74)},
)


def frequency(midi: int) -> float:
    return 440 * 2 ** ((midi - 69) / 12)


def timebase(seconds: float) -> np.ndarray:
    return np.arange(round(seconds * SAMPLE_RATE), dtype=np.float64) / SAMPLE_RATE


def smooth_envelope(t: np.ndarray, attack: float, release: float) -> np.ndarray:
    up = np.minimum(t / attack, 1)
    down = np.minimum((t[-1] - t) / release, 1)
    return np.sin(np.clip(up, 0, 1) * np.pi / 2) ** 2 * np.sin(
        np.clip(down, 0, 1) * np.pi / 2
    ) ** 2


def pan_mono(signal: np.ndarray, pan: float = 0) -> np.ndarray:
    angle = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    return signal[:, None] * np.array((math.cos(angle), math.sin(angle)))


def pad(notes: tuple[int, ...], seconds: float) -> np.ndarray:
    t = timebase(seconds)
    stereo = np.zeros((len(t), 2))
    for index, midi in enumerate(notes):
        f = frequency(midi)
        phase = index * .61
        for side, detune in enumerate((.9992, 1.0008)):
            tone = np.sin(2 * np.pi * f * detune * t + phase)
            tone += .17 * np.sin(2 * np.pi * f * 2 * detune * t + phase)
            stereo[:, side] += tone / len(notes)
    breath = .92 + .08 * np.cos(2 * np.pi * .17 * t)
    return stereo * (smooth_envelope(t, .8, 1.5) * breath)[:, None]


def pluck(midi: int, seconds: float = 1.5) -> np.ndarray:
    t = timebase(seconds)
    f = frequency(midi)
    tone = np.sin(2 * np.pi * f * t)
    tone += .24 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 4)
    tone += .07 * np.sin(2 * np.pi * f * 3 * t) * np.exp(-t * 7)
    envelope = (1 - np.exp(-t * 380)) * np.exp(-t * 3.6)
    envelope *= np.minimum((t[-1] - t) / .03, 1).clip(0)
    return tone * envelope


def bass(midi: int, seconds: float) -> np.ndarray:
    t = timebase(seconds)
    f = frequency(midi)
    tone = np.sin(2 * np.pi * f * t) + .13 * np.sin(2 * np.pi * f * 2 * t)
    return tone * smooth_envelope(t, .035, .22)


def kick() -> np.ndarray:
    t = timebase(.45)
    # A restrained sine drum, with no sharp sampled click.
    phase = 2 * np.pi * (45 * t + 60 * .028 * (1 - np.exp(-t / .028)))
    return np.sin(phase) * np.exp(-t * 13) * (1 - np.exp(-t * 900))


def hat(rng: np.random.Generator, seconds: float = .095) -> np.ndarray:
    t = timebase(seconds)
    noise = rng.normal(0, 1, len(t))
    # Remove the low-frequency body without a signal-processing dependency.
    noise = np.convolve(noise, (-.25, .5, -.25), mode="same")
    envelope = (1 - np.exp(-t * 1800)) * np.exp(-t * 55)
    envelope *= np.minimum((t[-1] - t) / .006, 1).clip(0)
    return noise * envelope


def rim(rng: np.random.Generator) -> np.ndarray:
    t = timebase(.16)
    tone = np.sin(2 * np.pi * 470 * t) + .36 * np.sin(2 * np.pi * 720 * t)
    tone += rng.normal(0, .08, len(t))
    envelope = (1 - np.exp(-t * 1600)) * np.exp(-t * 45)
    envelope *= np.minimum((t[-1] - t) / .008, 1).clip(0)
    return tone * envelope


def compose(bars: int, seamless: bool) -> np.ndarray:
    rng = np.random.default_rng(SEED)
    seconds = bars * BAR
    mix = np.zeros((round(seconds * SAMPLE_RATE), 2), dtype=np.float64)

    def add(signal: np.ndarray, start: float, gain: float = 1) -> None:
        start_sample = round(start * SAMPLE_RATE)
        if signal.ndim == 1:
            signal = pan_mono(signal)
        count = min(len(signal), len(mix) - start_sample)
        if count > 0:
            mix[start_sample:start_sample + count] += signal[:count] * gain
        # In loop mode the end-of-file tails continue at the beginning.
        if seamless and count < len(signal):
            tail = signal[max(0, count):]
            count_tail = min(len(tail), len(mix))
            mix[:count_tail] += tail[:count_tail] * gain

    arp_pattern = (0, 1, 2, 1, 3, 2, 1, 2)
    drum = kick()
    for bar in range(bars):
        start = bar * BAR
        chord = CHORDS[(bar // 2) % len(CHORDS)]
        intro = not seamless and bar < 4
        outro = not seamless and bar >= bars - 4
        body_gain = .68 if intro else .75 if outro else 1
        if bar % 2 == 0:
            add(pad(chord["pad"], BAR * 2 + 1.4), start, .19)
        add(bass(chord["bass"], BEAT * 1.65), start, .13 * body_gain)
        if not intro:
            add(bass(chord["bass"] + 12, BEAT * .65), start + BEAT * 2.5, .055 * body_gain)

        for eighth, note_index in enumerate(arp_pattern):
            if intro and eighth % 2:
                continue
            if outro and eighth in (3, 7):
                continue
            beat_position = start + eighth * BEAT / 2
            pan = (-.30, .17, -.12, .32)[eighth % 4]
            velocity = (1, .72, .88, .65)[eighth % 4]
            signal = pan_mono(pluck(chord["arp"][note_index]), pan)
            add(signal, beat_position, .062 * velocity * body_gain)
            # Quiet cross-stereo taps make space without washing out narration.
            add(signal[:, ::-1], beat_position + BEAT * .75, .011 * velocity * body_gain)
            add(signal, beat_position + BEAT * 1.5, .004 * velocity * body_gain)

        if bar >= 2 or seamless:
            for beat_position in (0, 2):
                add(drum, start + BEAT * beat_position, .16 * body_gain)
            if not outro:
                add(drum, start + BEAT * 3.5, .05 * body_gain)
            for beat_position in (1, 3):
                add(pan_mono(rim(rng), -.10), start + BEAT * beat_position, .036 * body_gain)
            for eighth in range(1, 8, 2):
                add(pan_mono(hat(rng), .22 if eighth % 4 == 1 else -.22),
                    start + eighth * BEAT / 2, .033 * body_gain)

        # The middle section has a sparse, original two-note response.
        if seamless or 8 <= bar < bars - 4:
            if bar % 4 == 1:
                add(pan_mono(pluck(chord["arp"][2] + 12, 2), .3),
                    start + BEAT * .75, .026)
            elif bar % 4 == 3:
                add(pan_mono(pluck(chord["arp"][1] + 12, 2), -.3),
                    start + BEAT * 2.75, .022)

    mix -= mix.mean(axis=0)
    if not seamless:
        t = np.arange(len(mix)) / SAMPLE_RATE
        fade = np.sin(np.minimum(t / 1.4, 1) * np.pi / 2) ** 2
        fade *= np.sin(np.clip((seconds - t) / 3.2, 0, 1) * np.pi / 2) ** 2
        mix *= fade[:, None]
    peak = np.max(np.abs(mix))
    if not peak or not np.isfinite(mix).all():
        raise RuntimeError("Invalid synthesized signal")
    mix *= 10 ** (-3.0 / 20) / peak
    return mix


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path,
                        default=Path(__file__).with_name("realload-product-60s.wav"))
    parser.add_argument("--bars", type=int, default=24,
                        help="4 beats per bar; 24 bars = 60 seconds")
    parser.add_argument("--loop", action="store_true",
                        help="steady arrangement, wrapped tails, no fades")
    args = parser.parse_args()
    if not 8 <= args.bars <= 96 or args.bars % 8:
        parser.error("--bars must be a multiple of 8 between 8 and 96")
    mix = compose(args.bars, args.loop)
    pcm = np.rint(mix * 32767).astype("<i2")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(args.output), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm.tobytes())
    decoded = pcm.astype(np.float64) / 32768
    peak = float(np.max(np.abs(decoded)))
    rms = float(np.sqrt(np.mean(decoded ** 2)))
    channel_rms = np.sqrt(np.mean(decoded ** 2, axis=0))
    metadata = {
        "title": "RealLoad — Quiet Assembly",
        "description": "Original synthesized minimal electronic product-film background",
        "originalFor": "RealLoad Studio product film",
        "externalSamples": [],
        "generator": Path(__file__).name,
        "seed": SEED,
        "bpm": BPM,
        "bars": args.bars,
        "seconds": len(pcm) / SAMPLE_RATE,
        "sampleRate": SAMPLE_RATE,
        "channels": 2,
        "pcmBits": 16,
        "loopVersion": args.loop,
        "fadeInSeconds": 0 if args.loop else 1.4,
        "fadeOutSeconds": 0 if args.loop else 3.2,
        "peakLinear": peak,
        "peakDbfs": 20 * math.log10(peak),
        "rmsLinear": rms,
        "rmsDbfs": 20 * math.log10(rms),
        "channelRmsDbfs": [20 * math.log10(float(x)) for x in channel_rms],
        "crestFactorDb": 20 * math.log10(peak / rms),
        "clippedSamples": int(np.count_nonzero(np.abs(pcm.astype(np.int32)) >= 32767)),
        "sha256": hashlib.sha256(args.output.read_bytes()).hexdigest(),
        "fileBytes": args.output.stat().st_size,
        "measurementNote": "RMS is unweighted full-file stereo amplitude, not LUFS or true peak",
    }
    metadata_path = args.output.with_suffix(".json")
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

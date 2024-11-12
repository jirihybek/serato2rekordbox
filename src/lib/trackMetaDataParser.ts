/*
 * Copyright (C) 2024 Jiri Hybek <jiri@hybek.cz> / [Hybek Software](https://hybek.software/)
 * Licensed under MIT license. See the file LICENSE for copying permission.
 */

import * as music from 'music-metadata';
import { type IAudioMetadata } from 'music-metadata';
import { getFileOrThrow } from './util';

// Typings are missing Node.js specific entry point, so we need to cast it to any
const parseFile: (path: string) => Promise<IAudioMetadata> = (music as any).parseFile;

interface GEOBDir {
    type: string;
    filename: string;
    description: string;
    data: Uint8Array;
}

export type ColorRGB = [number, number, number];
export type ColorARGB = [number, number, number, number];

export interface CuePoint {
    index: number;
    positionMs: number;
    color: ColorRGB;
    name: string;
}

export interface LoopEntry {
    index: number;
    startMs: number;
    endMs: number;
    color: ColorARGB;
    locked: boolean;
    name: string;
}

interface SeratorMarker2Data {
    color: ColorARGB|null;
    cuePoints: CuePoint[];
    loopEntries: LoopEntry[];
    bpmLock: boolean|null;
}

export interface SeratoBeatGridMarker {
    position: number;
    bpm: number|null;
    beatsTillNextMarker: number|null;
}

interface SeratoBeatGridData {
    markers: SeratoBeatGridMarker[];
}

export interface TrackMetaData {
    path: string;
    trackId: number;
    size: number;

    name: string;
    artist: string;
    composer: string;
    album: string;
    grouping: string;
    genre: string;
    kind: string;
    discNumber: number;
    trackNumber: number;
    year: number;
    averageBpm: number;
    comments: string;
    playCount: number;
    remixer: string;
    tonalKey: string;
    label: string;
    mixName: string;
    totalTime: number;
    bitRate: number;
    sampleRate: number;

    color: ColorARGB|null;
    cuePoints: CuePoint[];
    loopEntries: LoopEntry[];
    beatGridMarkers: SeratoBeatGridMarker[]|null;
    bpmLock: boolean;

    hasWarnings: boolean;
}

function throwParseError(message: string) {
    throw new Error(`Failed to parse track meta-data: ${message}`);
}

function readNullTerminatedString(view: DataView, offset: number): string {
    let length = 0;

    while (view.getUint8(offset + length) !== 0 && offset + length < view.byteLength) {
        length++;
    }

    const buffer = view.buffer.slice(view.byteOffset + offset, view.byteOffset + offset + length);
    return new TextDecoder().decode(buffer);
}

function parseSeratorMarkers2(view: DataView): SeratorMarker2Data {
    const result: SeratorMarker2Data = {
        color: null,
        cuePoints: [],
        loopEntries: [],
        bpmLock: false
    };

    // Decode Base64 payload into another Uint8Array (node.js version)
    const base64String = readNullTerminatedString(view, 0);
    const payload = Uint8Array.from(Buffer.from(base64String, 'base64'));
    const payloadView = new DataView(payload.buffer);

    // Expect header
    if (payload[0] !== 0x01 || payload[1] !== 0x01) {
        throwParseError('Invalid markers header');
    }

    // Parse elements
    let offset = 2;
    const elements: Array<{ name: string, data: DataView }> = [];

    while (offset < payload.length) {
        const name = readNullTerminatedString(payloadView, offset);

        if (name === '') {
            break;
        }

        const length = payloadView.getUint32(offset + name.length + 1, false);
        const data = new DataView(payloadView.buffer, offset + name.length + 5, length);

        offset += name.length + 5 + length;
        elements.push({ name, data });
    }

    elements.forEach((element) => {
        switch(element.name) {
            case 'COLOR': {
                result.color = [ element.data.getUint8(0), element.data.getUint8(1), element.data.getUint8(2), element.data.getUint8(3) ];
                break;
            }
            case 'CUE': {
                const index = element.data.getUint8(0x01);
                const positionMs = element.data.getUint32(0x02, false);
                const color: ColorRGB = [ element.data.getUint8(0x07), element.data.getUint8(0x08), element.data.getUint8(0x09) ];
                const name = readNullTerminatedString(element.data, 0xc);

                result.cuePoints.push({ index, positionMs, color, name });
                break;
            }
            case 'LOOP': {
                const index = element.data.getUint8(0x01);
                const startMs = element.data.getUint32(0x02, false);
                const endMs = element.data.getUint32(0x06, false);
                const color: ColorARGB = [ element.data.getUint8(0x0e), element.data.getUint8(0x0f), element.data.getUint8(0x10), element.data.getUint8(0x11) ];
                const locked = element.data.getUint8(0x13) === 1;
                const name = readNullTerminatedString(element.data, 0x14);

                result.loopEntries.push({ index, startMs, endMs, color, locked, name });
                break;
            }
            case 'BPMLOCK': {
                result.bpmLock = element.data.getUint8(0) === 1;
                break;
            }
            default: {
                console.log(`Unknown marker element: ${element.name}`);
                break;
            }
        }
    });

    return result;
}

function parseSeratoBeatGrid(view: DataView): SeratoBeatGridData {
    const numMarkers = view.getUint32(0x02, false);
    const markers: SeratoBeatGridMarker[] = [];

    for (let i = 0; i < numMarkers; i++) {
        const markerStart = 0x06 + i * 0x08;
        const position = view.getFloat32(markerStart, false);

        if (i < numMarkers - 1) {
            const beatsTillNextMarker = view.getUint32(markerStart + 0x04, false);
            markers.push({ position, bpm: null, beatsTillNextMarker });
        } else {
            const bpm = view.getFloat32(markerStart + 0x04, false);
            markers.push({ position, bpm, beatsTillNextMarker: null });
        }
    }
    
    return {
        markers
    }
}

export async function parseTrackMetaData(path: string, trackId: number): Promise<TrackMetaData> {
    const file = await getFileOrThrow(path);

    const metadata: IAudioMetadata = await parseFile(path);
    const tags = metadata.native["ID3v2.4"] ?? metadata.native["ID3v2.3"];
    const seratoPlayCount = tags?.find((frame) => frame.id === "SeratoPlaycount")?.value as number|undefined;

    const result: TrackMetaData = {
        path,
        trackId,
        size: file.size,
        name: metadata.common.title ?? '',
        artist: metadata.common.artist ?? '',
        composer: metadata.common.composer?.join(', ') ?? '',
        album: metadata.common.album ?? '',
        grouping: metadata.common.grouping ?? '',
        genre: metadata.common.genre?.join(', ') ?? '',
        kind: metadata.common.media ?? '',
        discNumber: metadata.common.disk?.no ?? 0,
        trackNumber: metadata.common.track.no ?? 0,
        year: metadata.common.year ?? 0,
        averageBpm: metadata.common.bpm ?? 0,
        comments: metadata.common.comment?.map((x) => x.text)?.join(', ') ?? '',
        playCount: seratoPlayCount ?? 0,
        tonalKey: metadata.common.key ?? '',
        label: metadata.common.label?.join(', ') ?? '',
        remixer: metadata.common.remixer?.join(', ') ?? '',
        mixName: '',
        totalTime: metadata.format.duration ?? 0,
        bitRate: metadata.format.bitrate ?? 0,
        sampleRate: metadata.format.sampleRate ?? 0,

        color: null,
        cuePoints: [],
        loopEntries: [],
        beatGridMarkers: null,
        bpmLock: false,

        hasWarnings: false
    };

    if (!tags) {
        return result;
    }

    metadata.native

    const geobObjects = tags.filter((frame) => frame.id === "GEOB");

    geobObjects.forEach((geobObject) => {
        const value = geobObject.value as GEOBDir;
        
        if (value.type !== "application/octet-stream") {
            return;
        }

        const view = new DataView(value.data.buffer);
        const description = value.description; //.substring(0, 1) + readNullTerminatedString(view, 0);
        const data = new DataView(value.data.buffer);

        try {
            switch (description) {
                case 'Serato Markers2': {
                    const markers = parseSeratorMarkers2(data);

                    result.color = markers.color ?? result.color;
                    result.cuePoints = markers.cuePoints;
                    result.loopEntries = markers.loopEntries;
                    result.bpmLock = markers.bpmLock ?? result.bpmLock;

                    break;
                }
                case 'Serato BeatGrid': {
                    const beatgrid = parseSeratoBeatGrid(data);
                    result.beatGridMarkers = beatgrid.markers;

                    break;
                }
                default: {
                    // console.log(`Unknown GEOB frame description: ${description}`, data);
                    break;
                }
            }
        } catch (err) {
            console.error(`Failed to parse GEOB frame, skipping: ${err}`);
            result.hasWarnings = true;
        }
    });

    return result;
}

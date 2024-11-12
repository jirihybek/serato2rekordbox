/*
 * Copyright (C) 2024 Jiri Hybek <jiri@hybek.cz> / [Hybek Software](https://hybek.software/)
 * Licensed under MIT license. See the file LICENSE for copying permission.
 */

import xml2js from 'xml2js';
import type { ColorARGB, ColorRGB, TrackMetaData } from "./trackMetaDataParser";

export enum RecordboxPlaylistType {
    Folder = 0,
    Playlist = 1,
}

export interface RecordboxFolder {
    type: RecordboxPlaylistType.Folder;
    name: string;
    children: RecordboxPlaylistNode[];
}

export interface RecordboxPlaylist {
    type: RecordboxPlaylistType.Playlist;
    name: string;
    tracks: number[];
}

export type RecordboxPlaylistNode = RecordboxFolder | RecordboxPlaylist;

export interface RecordboxExportData {
    collection: Map<number, TrackMetaData>;
    rootFolder: RecordboxFolder;
}

function formatColor(color: ColorRGB|ColorARGB): string {
    const hex = (color.length === 3 ? color : color.slice(1))
        .map((x) => x.toString(16).padStart(2, '0')).join('');

    return `0x${hex.toUpperCase()}`;
}

function generatePlaylistNode(data: RecordboxExportData, node: RecordboxPlaylistNode): unknown {
    if (node.type === RecordboxPlaylistType.Folder) {
        return {
            $: {
                Type: '0',
                Name: node.name,
                Count: node.children.length
            },
            NODE: node.children.map((child) => generatePlaylistNode(data, child))
        }
    } else {
        return {
            $: {
                Type: '1',
                KeyType: '1',
                Name: node.name,
                Entries: node.tracks.length
            },
            TRACK: node.tracks.map((trackId) => ({
                $: {
                    Key: 'file://localhost' + encodeURIComponent(
                        data.collection.get(trackId)?.path ?? ''
                    )
                }
            }))
        }
    }
}

export function generateXml(data: RecordboxExportData): string {
    const builder = new xml2js.Builder();

    const obj = {
        DJ_PLAYLISTS: {
            $: { Version: '1.0.0' },
            PRODUCT: {
                $: {
                    Name: "serato2rekordbox",
                    Version: "7.0.5",
                    Company: "serato2rekordbox"
                }
            },
            COLLECTION: {
                $: {
                    Entries: data.collection.size,
                },
                TRACK: Array.from(data.collection.values()).map((track) => ({
                    $: {
                        TrackId: track.trackId,
                        Location: 'file://localhost' + encodeURIComponent(track.path),
                        Name: track.name,
                        Artist: track.artist,
                        Composer: track.composer,
                        Album: track.album,
                        Grouping: track.grouping,
                        Genre: track.genre,
                        Kind: track.kind,
                        Size: track.size,
                        TotalTime: track.totalTime,
                        DiscNumber: track.discNumber,
                        TrackNumber: track.trackNumber,
                        Year: track.year,
                        AverageBpm: track.averageBpm,
                        BitRate: track.bitRate,
                        SampleRate: track.sampleRate,
                        Comments: track.comments,
                        PlayCount: track.playCount,
                        Rating: 0,
                        Remixer: track.remixer,
                        Tonality: track.tonalKey,
                        Label: track.label,
                        MixName: track.mixName,
                        Colour: track.color ? formatColor(track.color) : undefined,
                    },
                    POSITION_MARK: [
                        ...track.cuePoints.map((marker) => ({
                            $: {
                                Name: marker.name,
                                Type: '0',
                                Start: marker.positionMs / 1000,
                                Num: marker.index
                            }
                        })),
                        ...track.loopEntries.map((entry) => ({
                            $: {
                                Name: entry.name,
                                Type: '4',
                                Start: entry.startMs / 1000,
                                End: entry.endMs / 1000,
                                Num: entry.index
                            }
                        }))
                    ],
                    TEMPO: track.beatGridMarkers?.map((marker) => ({
                        $: {
                            Inizio: marker.position,
                            Bpm: marker.bpm ?? undefined,
                            Battito: marker.beatsTillNextMarker ?? undefined
                        }
                    }))
                }))
            },
            PLAYLISTS: {
                NODE: generatePlaylistNode(data, data.rootFolder)
            }
        }
    };

    return builder.buildObject(obj);
}

export async function exportToRecordboxXml(data: RecordboxExportData, targetPath: string): Promise<string> {
    const xml = generateXml(data);
    const file = Bun.file(targetPath);
    await Bun.write(file, xml);

    console.log(`Exported to '${targetPath}'`);

    return xml;
}

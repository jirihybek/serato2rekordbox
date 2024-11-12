#!/usr/bin/env bun
/*
 * Copyright (C) 2024 Jiri Hybek <jiri@hybek.cz> / [Hybek Software](https://hybek.software/)
 * Licensed under MIT license. See the file LICENSE for copying permission.
 */

import { resolve } from 'node:path';
import { program } from 'commander';
import { errorToMessage, getDirStatsOrThrow, readDirOrThrow, resolveMountPathOrThrow } from './lib/util';
import { parseCrate, type Crate, type CrateTrack } from './lib/crateParser';
import { parseTrackMetaData, type TrackMetaData } from './lib/trackMetaDataParser';
import { exportToRecordboxXml, RecordboxPlaylistType, type RecordboxFolder, type RecordboxPlaylist } from './lib/rekordboxExporter';

program
    .name('serato2rekordbox')
    .argument('serato_dir', 'Path to the Serato directory')
    .argument('xml_path', 'Where to save Rekordbox XML file')
    .option(
        '-c <crate_file>',
        'Export only specified crate. Argument is a filename without path. Can be provided multiple times.',
        (val, acc) => {
            acc.push(val);
            return acc;
        },
        [] as string[]
    )
    .option('-f <filter>', 'Filter by crate name')
    .option('-t <filter>', 'Filter by track name')
    .option('-m <dir>', 'Path to music library directory. If provided, it\'s only used to check if playlist tracks are present in the library and reports errors if not.')
    .parse();

const seratoDir = resolve(decodeURI(program.args[0]));
const xmlPath = resolve(decodeURI(program.args[1]));
const options = program.opts();

let musicDir: string|null = null;
let includeCratesOnly: string[]|null = null;
let crateFilter: string|null = null;
let trackFilter: string|null = null;
let mountPath: string = '/';

if (options.m) {
    musicDir = resolve(decodeURI(options.m));
    console.log(`Using music library directory: \`${musicDir}\``);
}

console.log(`Using Serato directory: \`${seratoDir}\``);
console.log(`Will save Rekordbox XML to: \`${xmlPath}\``);

if (options.c.length > 0) {
    includeCratesOnly = options.c;
    console.log(`Exporting only crates: ${includeCratesOnly!.join(', ')}`);
}

if (options.f) {
    crateFilter = options.f;
    console.log(`Filtering crates by: ${crateFilter}`);
}

if (options.t) {
    trackFilter = options.t;
    console.log(`Filtering tracks by: ${trackFilter}`);
}

// Validate directories
await getDirStatsOrThrow(seratoDir);

if (musicDir) {
    await getDirStatsOrThrow(musicDir);
}

// Resolve mounth path
mountPath = await resolveMountPathOrThrow(seratoDir);
console.log(`Resolved mount path: \`${mountPath}\``);

console.log('');

let crateScanProgress = 0;
let crateScanTotal = 1;
let trackScanProgress = 0;
let trackScanTotal = 1;
let isComplete = false;

const errors: string[] = [];

function getProgress(): number {
    const crateScan = (crateScanProgress / crateScanTotal) * 0.2;
    const trackScan = (trackScanProgress / trackScanTotal) * 0.75;
    return isComplete ? 100 : (crateScan + trackScan) * 100;
}

function logProgress(message: string) {
    console.log(`[${getProgress().toFixed(1)}%] ${message}`);
}

function logError(message: string) {
    console.error(`[${getProgress().toFixed(1)}%] **!!! ${message}**`);
}

try {
    logProgress(`Loading crates...`);
    
    const subcratesFiles = await readDirOrThrow(`${seratoDir}/Subcrates`);
    const crateNameList = subcratesFiles
        .filter((crateName) => {
            if (!crateName.endsWith('.crate')) {
                return false;
            }
    
            if (includeCratesOnly && !includeCratesOnly.includes(crateName)) {
                return false;
            }
    
            if (crateFilter && !crateName.includes(crateFilter)) {
                return false;
            }

            return true;
        })
        .sort();
    
    const crateList: Crate[] = [];
    const trackList: CrateTrack[] = [];
    const trackMeta: TrackMetaData[] = [];
    const trackPathIndex: Map<string, number> = new Map();

    crateScanTotal = crateNameList.length || 1;

    logProgress(`Found (${crateNameList.length}) crates matching selected filters.`);

    // Parse crates
    for (const crateName of crateNameList) {
        const cratePath = resolve(`${seratoDir}/Subcrates/${crateName}`);
        
        logProgress(`Loading crate: ${cratePath}`);
        crateScanProgress++;

        try {
            const crate = await parseCrate(cratePath);
            crateList.push(crate);

            let includedTracks = 0;

            for (const track of crate.tracks) {
                if (trackFilter && !track.path.includes(trackFilter)) {
                    continue;
                }

                if (!trackPathIndex.has(track.path)) {
                    trackList.push(track);
                    trackPathIndex.set(track.path, trackList.length - 1);
                }

                includedTracks++;
            }

            logProgress(`  found total ${crate.tracks.length} tracks, will include ${includedTracks}`);
        } catch (err) {
            logError(`ERROR: ${errorToMessage(err)}`);
            errors.push(`Failed to load crate: ${crateName}: ${errorToMessage(err)}`);
        }
    }
    
    // Parse track metadata
    logProgress('Loading tracks...');

    trackScanTotal = trackList.length || 1;

    for (let i = 0; i < trackList.length; i++) {
        const track = trackList[i];
        const resolvedPath = resolve(`${mountPath}/${track.path}`);

        logProgress(`Loading track meta-data: ${track.path}`);
        trackScanProgress++;

        if (musicDir && !resolvedPath.startsWith(musicDir)) {
            logError(`ERROR: Track not in the music library: ${resolvedPath}`);
            errors.push(`Track not in the music library: ${resolvedPath}`);
            continue;
        }

        try {
            const meta = await parseTrackMetaData(resolvedPath, i);
            trackMeta[i] = meta;
        } catch (err) {
            logError(`ERROR: ${errorToMessage(err)}`);
            errors.push(`Failed to load track: ${track.path}: ${errorToMessage(err)}`);
        }
    }

    // Generate data for Rekordbox export
    logProgress('Generating Rekordbox XML');

    const collection: Map<number, TrackMetaData> = new Map();
    const folders: Map<string, RecordboxFolder> = new Map();

    folders.set('ROOT', {
        type: RecordboxPlaylistType.Folder,
        name: 'ROOT',
        children: []
    });

    trackMeta.forEach((track, index) => {
        collection.set(index, track)
    });

    const getParentFolder = (path: string[]): RecordboxFolder => {
        if (path.length === 0) {
            return folders.get('ROOT') as RecordboxFolder;
        }

        const key = path.join('/');
        const folder = folders.get(key);

        if (folder) {
            return folder;
        } else {
            const localPath = path.slice();
            const name = localPath.pop() as string;

            const newFolder: RecordboxFolder = {
                type: RecordboxPlaylistType.Folder,
                name: name,
                children: []
            };

            folders.set(key, newFolder);

            const parent = getParentFolder(localPath);
            parent.children.push(newFolder);

            return newFolder;
        }
    }

    crateList.forEach((crate) => {
        // Split name to hierarchy
        const parts = crate.name.slice();
        const name = parts.pop() as string;

        const parent = getParentFolder(parts);

        const playlist: RecordboxPlaylist = {
            type: RecordboxPlaylistType.Playlist,
            name,
            tracks: crate.tracks
                .map((track) => trackPathIndex.get(track.path) as number)
                .filter((index) => index !== undefined)
        };

        parent.children.push(playlist);
    });

    await exportToRecordboxXml({
        collection,
        rootFolder: folders.get('ROOT') as RecordboxFolder
    }, xmlPath);

    isComplete = true;
    logProgress('Export completed');

    if (errors.length > 0) {
        console.error('\n**Error Summary:**');

        errors.forEach((err) => {
            console.error(` - ${err}`);
        });

        process.exit(2);
    }
} catch (err) {
    isComplete = true;
    logError(`ERROR: Unexpected error: ${errorToMessage(err)}`);

    process.exit(1);
}

/*
 * Copyright (C) 2024 Jiri Hybek <jiri@hybek.cz> / [Hybek Software](https://hybek.software/)
 * Licensed under MIT license. See the file LICENSE for copying permission.
 */

import type { BunFile } from "bun";
import type { Stats } from "node:fs";
import { readdir, stat } from "node:fs/promises";

export async function getDirStatsOrThrow(path: string): Promise<Stats> {
    try {
        const pathStats = await stat(path);

        if (!pathStats.isDirectory()) {
            throw new Error(`Path '${path}' is not a directory`);
        }

        return pathStats;
    } catch (err) {
        // Throw different error messages based on error code
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
            throw new Error(`Directory '${path}' does not exist`);
        } else {
            throw new Error(`Failed to check if directory '${path}' exists: ${err}`);
        }
    }
}

export async function readDirOrThrow(path: string): Promise<string[]> {
    try {
        return await readdir(path, {
            recursive: true            
        });
    } catch (err) {
    throw new Error(`Failed to read directory '${path}': ${err}`);
    }
}

export async function readFileToArrayBufferOrThrow(path: string): Promise<ArrayBuffer> {
    const file = Bun.file(path);
    const exists = await file.exists();

    if (!exists) {
        throw new Error(`File '${path}' does not exist`);
    }

    return await file.arrayBuffer();
}

export async function getFileOrThrow(path: string): Promise<BunFile> {
    const file = Bun.file(path);
    const exists = await file.exists();

    if (!exists) {
        throw new Error(`File '${path}' does not exist`);
    }

    return file;
}

export async function resolveMountPathOrThrow(path: string): Promise<string> {
    const pathSegments = path.split('/');
    
    let lastDev: number|null = null;
    let lastPath: string|null = null;

    while (pathSegments.length > 0) {
        const _path = pathSegments.join('/') || '/';
        const pathStats = await getDirStatsOrThrow(_path);

        if (lastDev !== null && pathStats.dev !== lastDev) {
            return lastPath!;
        }

        lastDev = pathStats.dev;
        lastPath = _path;
        pathSegments.pop();
    }

    return lastPath ?? '/';
}

export function errorToMessage(err: any): string {
    if (err instanceof Error) {
        return err.message;
    } else {
        return String(err);
    }
}

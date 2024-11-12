/*
 * Copyright (C) 2024 Jiri Hybek <jiri@hybek.cz> / [Hybek Software](https://hybek.software/)
 * Licensed under MIT license. See the file LICENSE for copying permission.
 */

import { readFileToArrayBufferOrThrow } from "./util";

interface Section {
    type: string;
    offset: number;
    dataOffset: number;
    dataSize: number;
    data: DataView;
}

interface Node {
    type: string;
    value: string|number|null;
    children: NodeList;
}

type NodeList = Node[];

export interface CrateTrack {
    path: string;
}

export interface Crate {
    name: string[];
    version: string;
    tracks: CrateTrack[];
}

function throwParseError(message: string) {
    throw new Error(`Failed to parse crate file: ${message}`);
}

function parseSection(data: ArrayBuffer, offset: number): Section {
    const view = new DataView(data, offset);
    const sectionType = [ view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3) ].map((x) => String.fromCharCode(x)).join('');
    const sectionSize = view.getUint32(4, false);
    const sectionContents = new DataView(data, offset + 8, sectionSize);

    return {
        type: sectionType,
        offset: offset,
        dataOffset: offset + 8,
        dataSize: sectionSize,
        data: sectionContents,
    };
}

function parseSectionNodes(section: Section): NodeList {
    let offset = section.dataOffset;
    const nodes: NodeList = [];

    while (offset < section.dataOffset + section.dataSize) {
        const subSection = parseSection(section.data.buffer, offset);
        offset += 8 + subSection.dataSize;

        switch (subSection.type) {
            case 'vrsn':
            case 'tvcn':
            case 'tvcw':
            case 'ptrk': {
                nodes.push({
                    type: subSection.type,
                    value: parseString16(subSection.data, subSection.dataSize),
                    children: []
                });
                break;
            }
            case 'brev': {
                nodes.push({
                    type: subSection.type,
                    value: parseInt8(subSection.data, subSection.dataSize),
                    children: []
                });
                break;
            }
            default: {
                nodes.push({
                    type: subSection.type,
                    value: null,
                    children: parseSectionNodes(subSection)
                });
                break;
            }
        }
    }

    return nodes;
}

function parseString16(data: DataView, size: number): string {
    const chars = [];

    for (let i = 0; i < size; i += 2) {
        const charCode = data.getUint16(i, false);

        if (charCode === 0) {
            break;
        }

        chars.push(String.fromCharCode(charCode));
    }

    return chars.join('');
}

function parseInt8(data: DataView, size: number): number {
    let value = 0;

    for (let i = 0; i < size; i++) {
        value |= data.getUint8(i) << (i * 8);
    }

    return value;
}

function expectNodeType(node: Node, type: string): Node {
    if (node.type !== type) {
        throwParseError(`Expected node type '${type}', got '${node.type}'`);
    }

    return node;
}

function findNode(nodeList: NodeList, type: string): Node|null {
    const node = nodeList.find((node) => node.type === type);
    return node ?? null;
}

function findNodeOrThrow(nodeList: NodeList, type: string): Node {
    const node = findNode(nodeList, type);

    if (node === null) {
        throwParseError(`Node type '${type}' not found`);
    }

    return node as Node;
}

export function dumpNode(node: Node, indent: number = 0) {
    const indentStr = ' '.repeat(indent * 2);
    console.log(`${indentStr}${node.type}: ${node.value ?? ''}`);
    node.children.forEach((child) => dumpNode(child, indent + 1));
}

export async function parseCrate(path: string): Promise<Crate> {
    const data = await readFileToArrayBufferOrThrow(path);
    const filenameWithoutExtension = path.split('/').pop()?.split('.').shift() as string;

    const rootSection = {
        type: 'root',
        offset: 0,
        dataOffset: 0,
        dataSize: data.byteLength,
        data: new DataView(data)
    };

    const nodes = parseSectionNodes(rootSection);
    // nodes.forEach((node) => dumpNode(node));

    if (nodes.length === 0) {
        throwParseError('No sections found');
    }

    const version = expectNodeType(nodes[0], 'vrsn');

    if (version.value !== '1.0/Serato ScratchLive Crate') {
        console.log(Buffer.from(version.value as string, 'utf-8'))
        throwParseError(`Unsupported crate version: '${version.value}'`);
    }

    const tracks: CrateTrack[] = [];

    for (let i = 1; i < nodes.length; i++) {
        if (nodes[i].type === 'otrk') {
            const path = findNodeOrThrow(nodes[i].children, 'ptrk').value as string;
            tracks.push({ path });
        }
    }

    return {
        name: filenameWithoutExtension.split('%%'),
        version: version.value as string,
        tracks
    };
}

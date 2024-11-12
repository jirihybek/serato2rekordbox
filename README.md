# serato2rekordbox

CLI utility to convert Serator crates including track meta-data (cue points, grids and loops) to Rekordbox XML format.

**Features:**
- Exports Serato crates to Rekordbox XML format including folder structure.
- Exports cue points, grids and loops.
- Exports track meta-data (artist, title, album, genre, bpm, key, etc).

**Caveats:**
- It reads only ID3v2 tags, so MP3, AIFF, WAV, and FLAC files are supported.
- It is able to parse only Serato markers2 (v2.0.0) format.
- Rekordbox does not support Serato's color palette, so colors will be ignored for now. Maybe I will add some mapping later.

## Usage

It's the CLI utility written in TypeScript for the [Bun](https://bun.sh/) runtime. So you have to install [Bun](https://bun.sh/) first and you need to know how to run commands in a terminal.

Then, install dependencies:

```bash
bun install
```

To run the utility:

```bash
bun run src/cli.ts <serato_dir> <output_xml_path>
# or
serato2rekordbox <serato_dir> <output_xml_path>

# Example:
serato2rekordbox ~/Music/_Serato_ ~/Music/rekordbox.xml

# To show all options:
serato2rekordbox --help
```

## Development

There is no build step because Bun can run TypeScript directly.

Here are some useful references regarding Serato and Rekordbox file formats:
- [serato-tags](https://github.com/Holzhaus/serato-tags/tree/main) - Awesome repo with documentation of Serato tags.
- [rekordbox.xml spec](https://cdn.rekordbox.com/files/20200410160904/xml_format_list.pdf) - Official Rekordbox XML format specification.

## License - MIT

Copyright (C) 2024 Jiri Hybek <jiri@hybek.cz> / [Hybek Software](https://hybek.software/)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

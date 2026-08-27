#!/usr/bin/env python3
"""
Regenerate src/lib/server/card-fonts.ts.

resvg cannot see system fonts inside a Worker, so the share card's glyph data
has to travel in the bundle. Shipping two full weights of JetBrains Mono would
cost ~380KB; subsetting to the characters the card can actually draw brings that
under 20KB.

Run after changing the glyphs the card renders:

    npm run fonts:build

Requires: pip install fonttools brotli
"""

import base64
import os
import textwrap

from fontTools import subset
from fontTools.ttLib import TTFont

SRC = 'node_modules/@fontsource/jetbrains-mono/files'
OUT = 'src/lib/server/card-fonts.ts'

# ASCII plus the terminal glyphs the design uses. Keep in step with the strings
# in card-layout.ts — a character missing here renders as blank in the PNG.
EXTRA = '·…↓↗✓✗▍—–'
TEXT = ''.join(chr(c) for c in range(0x20, 0x7F)) + EXTRA


def build(weight: int) -> str:
    font = TTFont(f'{SRC}/jetbrains-mono-latin-{weight}-normal.woff2')
    font.flavor = None  # woff2 -> plain TTF; resvg reads no compressed flavours

    options = subset.Options()
    options.layout_features = []
    options.hinting = False
    options.desubroutinize = True
    options.notdef_outline = True

    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=TEXT)
    subsetter.subset(font)

    tmp = f'/tmp/jbm-{weight}.ttf'
    font.save(tmp)
    data = open(tmp, 'rb').read()
    os.remove(tmp)
    print(f'  weight {weight}: {len(data):,} bytes')
    return base64.b64encode(data).decode()


def literal(name: str, b64: str) -> str:
    lines = textwrap.wrap(b64, 110)
    body = "\n\t\t+ ".join(f"'{line}'" for line in lines)
    return f'const {name} =\n\t{body};'


print('Subsetting JetBrains Mono...')
regular = build(400)
bold = build(700)

open(OUT, 'w').write(f'''/**
 * JetBrains Mono, subset and embedded for the Worker.
 *
 * resvg has no access to system fonts, so the card's text would not render at
 * all without the actual glyph data in the bundle. These are subset to the
 * characters the card can draw, which takes each weight from ~190KB to under
 * 10KB.
 *
 * GENERATED FILE — do not edit. Run `npm run fonts:build` to rebuild.
 */

{literal('REGULAR_BASE64', regular)}

{literal('BOLD_BASE64', bold)}

function decode(base64: string): Uint8Array {{
\tconst binary = atob(base64);
\tconst bytes = new Uint8Array(binary.length);
\tfor (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
\treturn bytes;
}}

let cached: Uint8Array[] | null = null;

/** Decoded once per isolate; resvg copies the buffers on each render. */
export function getCardFonts(): Uint8Array[] {{
\tif (!cached) cached = [decode(REGULAR_BASE64), decode(BOLD_BASE64)];
\treturn cached;
}}
''')
print(f'Wrote {OUT} ({os.path.getsize(OUT):,} bytes)')

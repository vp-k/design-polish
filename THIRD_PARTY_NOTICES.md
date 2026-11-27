# Third-Party Notices

design-polish is MIT-licensed (see [LICENSE](LICENSE)). This includes `knowledge/craft-floor.md`, which was
rewritten in this project's own words in v2.8.2.

## nextlevelbuilder/ui-ux-pro-max-skill

**Original work:** https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
**Original license:** MIT License (full text below)

| File | What was taken | Changes made in this plugin |
|------|----------------|-----------------------------|
| `data/styles.json`, `data/colors.json`, `data/typography.json`, `data/stacks.json` | Design knowledge data (styles, palettes, typography pairings, stack guides) | Converted from CSV/Python to JSON, searched by this plugin's own Node.js BM25 engine (`scripts/search.cjs`) |

```
MIT License

Copyright (c) 2024 Next Level Builder

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Acknowledgements

Some ideas and numeric thresholds behind the craft floor (`DP-F###`) and the readability and pattern lints
(`DP-R###`, `DP-P###`) were informed by [pbakaus/impeccable](https://github.com/pbakaus/impeccable). No text or
code from that project is included; the documents and the lint code in this plugin were written independently.

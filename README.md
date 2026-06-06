# TileHexicon

A version of the Tilexicon game based on hexes rather than squares.

As in Tilexicon we will be aiming to build tilings of (initially) four tetrahexes. Unlike tilexicon I think the board shape may vary between attempts.

## Data Generation

Tetrahex data is generated with:

```sh
scripts/generate-polyhex-tilings.py
```

The generator writes:

- `data/tetrahex-shapes.txt`: all fixed tetrahex orientations, not just symmetry representatives. Each line is a normalized axial-coordinate shape, with cells written as `q,r` and separated by semicolons.
- `data/tetrahex-generation-orders.json`: the current association table from fixed tetrahex shape key to allowed generation orders.
- `data/tetrahex-tilings-radius-2-holes-3.txt`: all tilings of a radius-2 hex board with three cells left empty. Each 19-character line follows the board's axial cells sorted by `(r, q)`. A `.` is an empty cell; labels `0` to `3` are the four tetrahex pieces, assigned in first-uncovered-cell order.
- `data/penthex-generation-orders.json`: the current association table from fixed penthex orientation index to allowed generation order strings.

The initial radius-2, three-hole data has 44 fixed tetrahex orientations and 9,628 tilings, so uniform random generation can choose directly from the tiling file.

See `docs/generation-order-notes.md` for the current working notes on
tetrahex/penthex generation orders, mixed tiling formats, and rules that may
need revisiting.

## First Prototype

The first prototype is a served browser game in `index.html`, `styles.css`, and
`src/game.js`. It loads the Tilexicon four-letter word lists and the generated
radius-2 tetrahex tilings from `data/`.

Run it with:

```sh
python3 -m http.server
```

Generation uses explicit order lists for fixed tetrahex orientations. Shapes
not listed in `src/game.js` use the normalized shape order from
`data/tetrahex-shapes.txt`.

Solving is currently more liberal than generation: a selected tetrahex is
accepted if its four letters anagram to an allowed word. This can create
plausible alternate groupings that were not part of the generated solution. Two
future options are to filter generated boards with too many tempting alternate
valid tetrahex words, or to add a stricter solving mode where a word is accepted
only if it matches one of that shape orientation's generation orders.

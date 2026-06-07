# Ideas

## Full Puzzle Editor

Build a proper puzzle editor rather than only the current four-word builder.

Core idea: allow a user to create, inspect, and revise complete puzzle instances,
including both the visible board and the intended solution.

Possible features:

- Edit an existing generated grid.
- Create a new grid from scratch.
- Specify the exact solution pieces and intended words.
- Move, recolour, replace, or delete pieces.
- Add or remove holes.
- Validate that every solution piece is connected and has the right size.
- Validate words against the current common-word lists, with an override for
  names or deliberate custom words.
- Export/share the resulting puzzle as a URL.
- Import a URL and continue editing it.

The editor should probably expose the encoded solution more explicitly than the
player UI does. In particular, it should preserve:

- the board letters,
- holes,
- piece membership,
- intended words,
- and, if needed later, the exact generation-order choice for each piece.

## Alternative Geometries

Explore board shapes beyond the current radius-2 disc/ring.

Possibilities:

- Larger radius discs.
- Rings or discs with prescribed holes.
- Hand-authored board outlines.
- Symmetric layouts chosen for aesthetics rather than by exact-cover count.
- Mixed tetrahex/penthex layouts on boards with different total cell counts.

This likely needs editor support first, because once the geometry is no longer a
fixed radius-2 board, a puzzle author will need direct control over holes,
pieces, and intended readings.

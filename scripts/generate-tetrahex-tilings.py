#!/usr/bin/env python3

from __future__ import annotations

import argparse
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
LABELS = "0123456789abcdefghijklmnopqrstuvwxyz"
NEIGHBORS = (
    (1, 0),
    (1, -1),
    (0, -1),
    (-1, 0),
    (-1, 1),
    (0, 1),
)
ORDER = 4
DEFAULT_RADIUS = 2
DEFAULT_HOLES = 3


Cell = tuple[int, int]
Shape = tuple[Cell, ...]
Placement = tuple[int, ...]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate fixed tetrahex descriptions and radius-board tilings."
    )
    parser.add_argument(
        "--radius",
        type=int,
        default=DEFAULT_RADIUS,
        help="Hex board radius. Radius 2 has 19 cells.",
    )
    parser.add_argument(
        "--holes",
        type=int,
        default=DEFAULT_HOLES,
        help="Number of board cells left empty.",
    )
    args = parser.parse_args()

    DATA_DIR.mkdir(exist_ok=True)
    fixed_shapes = fixed_polyhexes(ORDER)

    write_shapes(fixed_shapes)
    write_tilings(args.radius, args.holes, fixed_shapes)


def write_shapes(shapes: list[Shape]) -> None:
    output_path = DATA_DIR / "tetrahex-shapes.txt"

    with output_path.open("w", encoding="utf-8") as output:
        for shape in shapes:
            output.write(f"{shape_string(shape)}\n")

    print(f"Wrote {len(shapes)} fixed tetrahexes -> {output_path.relative_to(ROOT_DIR)}")


def write_tilings(radius: int, holes: int, shapes: list[Shape]) -> None:
    cells = radius_cells(radius)
    cell_count = len(cells)
    covered_cells = cell_count - holes

    if covered_cells % ORDER != 0:
        raise ValueError(
            f"Radius {radius} with {holes} holes leaves {covered_cells} cells, "
            f"which cannot be tiled by tetrahexes"
        )

    piece_count = covered_cells // ORDER

    if piece_count > len(LABELS):
        raise ValueError("Not enough labels for this board")

    output_path = DATA_DIR / f"tetrahex-tilings-radius-{radius}-holes-{holes}.txt"
    count = 0

    print(
        f"Generating radius {radius}, {holes} holes with {len(shapes)} fixed tetrahexes "
        f"-> {output_path.relative_to(ROOT_DIR)}"
    )

    with output_path.open("w", encoding="utf-8") as output:
        for tiling in generate_tilings(cells, holes, shapes):
            output.write(f"{tiling}\n")
            count += 1

    print(f"Wrote {count} tilings")


def generate_tilings(cells: list[Cell], holes: int, shapes: list[Shape]):
    index_by_cell = {cell: index for index, cell in enumerate(cells)}
    placements_by_cell = build_placements_by_cell(cells, index_by_cell, shapes)
    board = [-1] * len(cells)
    piece_count = (len(cells) - holes) // ORDER

    def search(next_label: int, holes_used: int):
        first_empty = find_first_empty(board)

        if first_empty is None:
            if holes_used == holes and next_label == piece_count:
                yield "".join("." if value == -2 else LABELS[value] for value in board)
            return

        remaining_empty = board.count(-1)
        remaining_holes = holes - holes_used
        remaining_piece_cells = (piece_count - next_label) * ORDER

        if remaining_holes < 0 or remaining_piece_cells < 0:
            return

        if remaining_empty != remaining_holes + remaining_piece_cells:
            return

        if holes_used < holes:
            board[first_empty] = -2
            yield from search(next_label, holes_used + 1)
            board[first_empty] = -1

        if next_label >= piece_count:
            return

        for placement in placements_by_cell[first_empty]:
            if any(board[cell] != -1 for cell in placement):
                continue

            for cell in placement:
                board[cell] = next_label

            yield from search(next_label + 1, holes_used)

            for cell in placement:
                board[cell] = -1

    yield from search(0, 0)


def build_placements_by_cell(
    cells: list[Cell],
    index_by_cell: dict[Cell, int],
    shapes: list[Shape],
) -> list[list[Placement]]:
    placements_by_cell: list[list[Placement]] = [[] for _ in cells]
    placements: set[Placement] = set()

    for shape in shapes:
        for anchor in cells:
            translated = tuple((q + anchor[0], r + anchor[1]) for q, r in shape)

            if not all(cell in index_by_cell for cell in translated):
                continue

            placement = tuple(sorted(index_by_cell[cell] for cell in translated))
            placements.add(placement)

    for placement in sorted(placements):
        for cell_index in placement:
            placements_by_cell[cell_index].append(placement)

    return placements_by_cell


def fixed_polyhexes(order: int) -> list[Shape]:
    return sorted({orientation for shape in free_polyhexes(order) for orientation in transforms_of(shape)})


def free_polyhexes(order: int) -> set[Shape]:
    shapes = {((0, 0),)}

    for _ in range(1, order):
        next_shapes = set()

        for shape in shapes:
            cells = set(shape)
            for q, r in shape:
                for dq, dr in NEIGHBORS:
                    neighbor = (q + dq, r + dr)

                    if neighbor in cells:
                        continue

                    next_shapes.add(canonical(tuple(cells | {neighbor})))

        shapes = next_shapes

    return shapes


def canonical(cells: Shape) -> Shape:
    return min(transforms_of(cells))


def transforms_of(cells: Shape) -> list[Shape]:
    seen = {}

    for reflected in (False, True):
        transformed = reflect(cells) if reflected else cells

        for turns in range(6):
            orientation = normalize(tuple(rotate(cell, turns) for cell in transformed))
            seen[orientation] = orientation

    return sorted(seen)


def rotate(cell: Cell, turns: int) -> Cell:
    q, r = cell
    x, y, z = q, -q - r, r

    for _ in range(turns % 6):
        x, y, z = -z, -x, -y

    return (x, z)


def reflect(cells: Shape) -> Shape:
    return tuple((r, q) for q, r in cells)


def normalize(cells: Shape) -> Shape:
    min_q = min(q for q, _ in cells)
    min_r = min(r for _, r in cells)

    return tuple(sorted((q - min_q, r - min_r) for q, r in cells))


def radius_cells(radius: int) -> list[Cell]:
    cells = []

    for q in range(-radius, radius + 1):
        for r in range(-radius, radius + 1):
            s = -q - r

            if max(abs(q), abs(r), abs(s)) <= radius:
                cells.append((q, r))

    return sorted(cells, key=lambda cell: (cell[1], cell[0]))


def shape_string(shape: Shape) -> str:
    return ";".join(f"{q},{r}" for q, r in shape)


def find_first_empty(board: list[int]) -> int | None:
    for index, value in enumerate(board):
        if value == -1:
            return index

    return None


if __name__ == "__main__":
    main()

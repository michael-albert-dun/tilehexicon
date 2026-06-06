#!/usr/bin/env python3

from __future__ import annotations

import json
from math import sqrt
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
SHAPES_PATH = DATA_DIR / "penthex-shapes.txt"
OUTPUT_PATH = DATA_DIR / "penthex-generation-orders.json"
NEIGHBORS = (
    (1, 0),
    (1, -1),
    (0, -1),
    (-1, 0),
    (-1, 1),
    (0, 1),
)
ALLOWED_MOVES = {
    (1, -1): "RU",
    (1, 0): "RH",
    (0, 1): "RD",
    (-1, 1): "LD",
}
HORIZONTAL_DOWN_MOVES = {"RH", "RD", "LD"}
DEFAULT_ORDER = "12345"
MANUAL_ORDERS = {
    4: ["12345", "12354"],
    8: ["32145", "14523"],
    9: ["12345", "12435"],
    11: ["12345", "12453"],
    16: ["12345", "13245"],
    17: ["12345", "13524"],
    18: ["13245", "12345"],
    22: ["12345", "12354"],
    23: ["12354", "12345"],
    33: ["13452"],
    37: ["12354", "12345"],
    38: ["12345", "12435"],
    40: ["12345", "12453"],
    46: ["12354", "12345"],
    52: ["41253", "41235"],
    57: ["13542", "35142"],
    58: ["31245", "13245", "31452"],
    63: ["21345"],
    64: ["21345"],
    65: ["13524", "51324", "12354"],
    69: ["12354"],
    70: ["12345"],
    71: ["31452", "14352"],
    72: ["51342", "13542"],
    73: ["12345", "21345"],
    74: ["12534", "25134"],
    75: ["12354", "21354", "21345"],
    76: ["21345", "14235"],
    78: ["12345", "24513"],
    79: ["21345", "12345"],
    81: ["21345", "12345"],
    84: ["12345", "12354"],
    87: ["12345"],
    88: ["51234", "12534"],
    90: ["12435"],
    91: ["12453"],
    92: ["12345", "12453"],
    97: ["12345"],
    98: ["12354"],
    100: ["12345"],
    101: ["12345"],
    111: ["54312", "21345"],
    112: ["54312", "21345"],
    113: ["45132", "45312"],
    117: ["23145", "23514"],
    119: ["24351"],
    120: ["13245", "24531"],
    121: ["23451", "23145"],
    122: ["23451", "23145"],
    123: ["23451", "21345"],
    126: ["12453", "42513"],
    128: ["12453", "45213", "13245"],
    131: ["12345", "12435"],
    133: ["12345"],
    134: ["12345"],
    135: ["12354", "12345"],
    137: ["12345"],
    138: ["12345"],
    141: ["12543", "34512"],
    142: ["12435"],
    143: ["12453", "12435"],
    144: ["12354", "12345", "12435"],
    146: ["12345"],
    147: ["12345"],
    148: ["12354"],
    149: ["12345"],
    157: ["23451", "23415"],
    161: ["42351", "42315"],
    162: ["54231", "13245"],
    163: ["52431", "54231"],
    170: ["12345", "43521"],
    171: ["12345"],
    172: ["12345"],
    173: ["12354"],
    174: ["12345"],
    176: ["53421", "12435"],
    177: ["45321", "12354"],
    178: ["12345"],
}
Cell = tuple[int, int]
Shape = list[Cell]
Path = tuple[int, ...]


def main() -> None:
    shapes = read_shapes()
    table = {}
    reasons = {}

    for shape_index, shape in enumerate(shapes, start=1):
        orders, reason = orders_for_shape(shape_index, shape)
        table[str(shape_index)] = orders
        reasons[reason] = reasons.get(reason, 0) + 1

    OUTPUT_PATH.write_text(json.dumps(table, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {len(table)} penthex generation-order entries -> {OUTPUT_PATH.relative_to(ROOT_DIR)}")
    for reason, count in sorted(reasons.items()):
        print(f"{reason}: {count}")


def read_shapes() -> list[Shape]:
    shapes = []

    for line in SHAPES_PATH.read_text(encoding="utf-8").splitlines():
        shape = []
        for part in line.split(";"):
            q, r = part.split(",")
            shape.append((int(q), int(r)))
        shapes.append(shape)

    return shapes


def orders_for_shape(shape_index: int, shape: Shape) -> tuple[list[str], str]:
    if shape_index in MANUAL_ORDERS:
        return MANUAL_ORDERS[shape_index], "manual"

    paths = hamiltonian_paths(shape)

    if is_single_path_shape(shape):
        return [path_string(natural_path(paths, shape))], "single-path"

    right_down_paths = [path for path in paths if is_right_down_path(shape, path)]
    if len(right_down_paths) == 1:
        return [path_string(right_down_paths[0])], "unique-right-down"

    two_move_type_paths = [path for path in paths if is_two_move_type_path(shape, path)]
    if len(two_move_type_paths) == 1:
        return [path_string(two_move_type_paths[0])], "unique-two-move-type"

    horizontal_down_paths = [path for path in paths if is_horizontal_down_legal_path(shape, path)]
    if len(horizontal_down_paths) == 1:
        return [path_string(horizontal_down_paths[0])], "unique-horizontal-down"

    legal_paths = [path for path in paths if is_legal_move_path(shape, path)]
    if len(legal_paths) == 2:
        rightward_paths = [path for path in legal_paths if first_step_direction(shape, path) == "right"]
        leftward_paths = [path for path in legal_paths if first_step_direction(shape, path) == "left"]

        if len(rightward_paths) == 1 and len(leftward_paths) == 1:
            return [path_string(rightward_paths[0])], "rightward-first-step"

    always_rightward_paths = [path for path in paths if is_always_rightward_path(shape, path)]
    if len(always_rightward_paths) == 1:
        return [path_string(always_rightward_paths[0])], "unique-always-rightward"

    if has_four_levels(shape):
        return [path_string(level_order(shape))], "height-four"

    raise ValueError(f"No generation-order rule for shape {shape_index}")


def is_single_path_shape(shape: Shape) -> bool:
    degrees = []
    cells = set(shape)

    for q, r in shape:
        degrees.append(sum((q + dq, r + dr) in cells for dq, dr in NEIGHBORS))

    return degrees.count(1) == 2 and degrees.count(2) == len(shape) - 2


def hamiltonian_paths(shape: Shape) -> list[Path]:
    adjacency = []

    for q, r in shape:
        neighbors = {(q + dq, r + dr) for dq, dr in NEIGHBORS}
        adjacency.append([index for index, cell in enumerate(shape) if cell in neighbors])

    paths = []

    def visit(path: list[int], seen: set[int]) -> None:
        if len(path) == len(shape):
            paths.append(tuple(path))
            return

        for next_cell in adjacency[path[-1]]:
            if next_cell in seen:
                continue

            seen.add(next_cell)
            path.append(next_cell)
            visit(path, seen)
            path.pop()
            seen.remove(next_cell)

    for start in range(len(shape)):
        visit([start], {start})

    return paths


def is_right_down_path(shape: Shape, path: Path) -> bool:
    for previous, current in zip(path, path[1:]):
        previous_x, previous_y = axial_to_pixel(shape[previous])
        current_x, current_y = axial_to_pixel(shape[current])

        if not (current_x > previous_x or current_y > previous_y):
            return False

    return True


def is_two_move_type_path(shape: Shape, path: Path) -> bool:
    moves = []

    for previous, current in zip(path, path[1:]):
        move_type = classify_move(shape[previous], shape[current])

        if move_type is None:
            return False

        moves.append(move_type)

    return len(set(moves)) <= 2


def is_horizontal_down_legal_path(shape: Shape, path: Path) -> bool:
    return all(
        classify_move(shape[previous], shape[current]) in HORIZONTAL_DOWN_MOVES
        for previous, current in zip(path, path[1:])
    )


def is_legal_move_path(shape: Shape, path: Path) -> bool:
    return all(
        classify_move(shape[previous], shape[current]) is not None
        for previous, current in zip(path, path[1:])
    )


def is_always_rightward_path(shape: Shape, path: Path) -> bool:
    for previous, current in zip(path, path[1:]):
        previous_x, _ = axial_to_pixel(shape[previous])
        current_x, _ = axial_to_pixel(shape[current])

        if current_x <= previous_x:
            return False

    return True


def classify_move(previous: Cell, current: Cell) -> str | None:
    return ALLOWED_MOVES.get((current[0] - previous[0], current[1] - previous[1]))


def first_step_direction(shape: Shape, path: Path) -> str:
    previous_x, _ = axial_to_pixel(shape[path[0]])
    current_x, _ = axial_to_pixel(shape[path[1]])

    if current_x > previous_x:
        return "right"

    if current_x < previous_x:
        return "left"

    return "none"


def has_four_levels(shape: Shape) -> bool:
    return len({r for _, r in shape}) == 4


def level_order(shape: Shape) -> Path:
    return tuple(
        index
        for index, _ in sorted(
            enumerate(shape),
            key=lambda item: (item[1][1], axial_to_pixel(item[1])[0]),
        )
    )


def natural_path(paths: list[Path], shape: Shape) -> Path:
    return min(paths, key=lambda path: path_position_key(path, shape))


def path_position_key(path: Path, shape: Shape) -> tuple[tuple[float, float], ...]:
    return tuple(
        (axial_to_pixel(shape[index])[1], axial_to_pixel(shape[index])[0])
        for index in path
    )


def axial_to_pixel(cell: Cell) -> tuple[float, float]:
    q, r = cell
    return (sqrt(3) * (q + r / 2), 1.5 * r)


def path_string(path: Path) -> str:
    return "".join(str(index + 1) for index in path)


if __name__ == "__main__":
    main()

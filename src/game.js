const BOARD_RADIUS = 2;
const MIN_WORD_LENGTH = 4;
const MAX_WORD_LENGTH = 5;
const FOUR_LETTER_COMMIT_DELAY = 800;
const HEX_SIZE = 45;
const SVG_CENTER = { x: 310, y: 235 };
const LOCK_COLORS = [
  "var(--locked-a)",
  "var(--locked-b)",
  "var(--locked-c)",
  "var(--locked-d)",
  "var(--locked-e)",
  "var(--locked-f)",
  "var(--locked-g)",
  "var(--locked-h)",
  "var(--locked-i)"
];
const NEIGHBORS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1]
];
const BOARD_PARAM = "b";
const SOLUTION_PARAM = "s";
const SOLUTION_CHARS = "abcde";
const TILING_GROUPS = [
  {
    penthexes: 0,
    url: "data/tetrahex-tilings-radius-2-holes-3.txt"
  },
  {
    penthexes: 1,
    url: "data/polyhex-tilings-radius-2-orders-4-4-4-5-holes-2.txt"
  },
  {
    penthexes: 2,
    url: "data/polyhex-tilings-radius-2-orders-4-4-5-5-holes-1.txt"
  },
  {
    penthexes: 3,
    url: "data/polyhex-tilings-radius-2-orders-4-5-5-5-holes-0.txt"
  }
];
const state = {
  cells: [],
  selection: [],
  moves: [],
  locked: new Map(),
  invalidSelection: false,
  pendingCommitTimer: null,
  activeMoveIndex: null,
  dragSelection: null,
  allowedWords: new Set(),
  commonWordsByLength: new Map(),
  tilingGroups: [],
  tetrahexGenerationOrders: {},
  penthexGenerationOrders: {},
  solution: [],
  qSequence: ""
};

const elements = {
  board: document.querySelector("#board"),
  status: document.querySelector("#status"),
  selectionLines: document.querySelector("#selection-lines"),
  newButton: document.querySelector("#new-button"),
  restartButton: document.querySelector("#restart-button")
};

init();

async function init() {
  elements.newButton.addEventListener("click", newPuzzle);
  elements.restartButton.addEventListener("click", restartPuzzle);
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("pointermove", handleDragMove);
  document.addEventListener("pointerup", endDragSelection);
  document.addEventListener("pointercancel", endDragSelection);

  await loadData();
  newPuzzle({ puzzle: readPuzzleKey() });
}

async function loadData() {
  const [
    commonText,
    commonFiveText,
    tetrahexOrders,
    penthexShapesText,
    penthexOrders,
    ...tilingTexts
  ] = await Promise.all([
    fetchText("data/common-words.txt"),
    fetchText("data/common-words-5.txt"),
    fetchJson("data/tetrahex-generation-orders.json"),
    fetchText("data/penthex-shapes.txt"),
    fetchJson("data/penthex-generation-orders.json"),
    ...TILING_GROUPS.map((group) => fetchText(group.url))
  ]);
  const commonWords = parseWordList(commonText);
  const commonFiveWords = parseWordList(commonFiveText, 5);

  state.allowedWords = new Set([...commonWords, ...commonFiveWords]);
  state.commonWordsByLength = new Map([
    [4, commonWords],
    [5, commonFiveWords]
  ]);
  state.tilingGroups = TILING_GROUPS.map((group, index) => ({
    ...group,
    tilings: parseTilingText(tilingTexts[index])
  }));
  state.tetrahexGenerationOrders = tetrahexOrders;
  state.penthexGenerationOrders = buildPenthexGenerationOrders(penthexShapesText, penthexOrders);
}

async function fetchText(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not load ${url}`);
  }

  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not load ${url}`);
  }

  return response.json();
}

function parseWordList(text, length = 4) {
  return text
    .split("\n")
    .map((word) => word.trim().toLowerCase())
    .filter((word) => new RegExp(`^[a-z]{${length}}$`).test(word));
}

function parseTilingText(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function newPuzzle(options = {}) {
  const boardCells = radiusCells(BOARD_RADIUS);
  const puzzle = options.puzzle || null;

  if (puzzle) {
    loadPuzzle(boardCells, puzzle);
  } else {
    makeRandomPuzzle(boardCells);
  }

  resetProgress();
  if (options.updateUrl !== false) {
    updateAddressBar();
  }
  render();
}

function makeRandomPuzzle(boardCells) {
  const group = randomItem(state.tilingGroups);
  const tiling = randomItem(group.tilings);
  const pieces = compactTilingToPieces(tiling);
  const chosenWords = new Set();
  const words = pieces.map((piece) => randomWord(piece.length, chosenWords));

  state.cells = makeEmptyCells(boardCells).filter((cell, index) => tiling[index] !== ".");
  state.solution = [];

  pieces.forEach((piece, pieceIndex) => {
    const cells = piece
      .map((index) => state.cells.find((cell) => cell.index === index))
      .filter(Boolean);
    const word = words[pieceIndex].toUpperCase();
    const reading = randomGenerationReadingOrder(cells);

    reading.forEach((cell, letterIndex) => {
      cell.letter = word[letterIndex];
      cell.pieceIndex = pieceIndex;
    });
    state.solution.push({
      cells: reading.map((cell) => cell.id),
      word
    });
  });
}

function loadPuzzle(boardCells, puzzle) {
  state.cells = makeEmptyCells(boardCells)
    .filter((cell, index) => puzzle.board[index] !== ".")
    .map((cell) => ({
      ...cell,
      letter: puzzle.board[cell.index].toUpperCase(),
      pieceIndex: puzzle.solution[cell.index] - 1
    }));
  state.solution = makeSolutionFromCells();
}

function makeEmptyCells(boardCells) {
  return boardCells.map((coord, index) => ({
    coord,
    id: coordKey(coord),
    index,
    letter: "",
    pieceIndex: null
  }));
}

function restartPuzzle() {
  resetProgress();
  render();
}

function resetProgress() {
  cancelPendingCommit();
  state.selection = [];
  state.moves = [];
  state.locked = new Map();
  state.invalidSelection = false;
  state.activeMoveIndex = null;
  state.dragSelection = null;
}

function cancelPendingCommit() {
  if (state.pendingCommitTimer !== null) {
    window.clearTimeout(state.pendingCommitTimer);
    state.pendingCommitTimer = null;
  }
}

function compactTilingToPieces(tiling) {
  const labelCount = Math.max(...[...tiling].filter((label) => label !== ".").map(Number)) + 1;
  const pieces = Array.from({ length: labelCount }, () => []);

  [...tiling].forEach((label, index) => {
    if (label === ".") {
      return;
    }

    pieces[Number(label)].push(index);
  });

  return pieces;
}

function randomWord(length, chosenWords) {
  const words = state.commonWordsByLength.get(length) || [];
  let word = randomItem(words);

  while (chosenWords.has(word)) {
    word = randomItem(words);
  }

  chosenWords.add(word);
  return word;
}

function readPuzzleKey() {
  const params = new URLSearchParams(window.location.search);
  const board = params.get(BOARD_PARAM);
  const encodedSolution = params.get(SOLUTION_PARAM);

  if (!board || !encodedSolution) {
    return null;
  }

  const solution = decodeSolutionString(encodedSolution);

  if (!isValidBoardString(board) || !isValidSolution(board, solution)) {
    return null;
  }

  return { board: board.toUpperCase(), solution };
}

function updateAddressBar() {
  const url = new URL(window.location.href);

  url.searchParams.set(BOARD_PARAM, makeBoardString());
  url.searchParams.set(SOLUTION_PARAM, makeEncodedSolutionString());
  url.searchParams.delete("k");
  url.hash = "";
  window.history.replaceState(null, "", url.toString());
}

function makeBoardString() {
  const letters = Array.from({ length: radiusCells(BOARD_RADIUS).length }, () => ".");

  state.cells.forEach((cell) => {
    letters[cell.index] = cell.letter.toLowerCase();
  });

  return letters.join("");
}

function makeEncodedSolutionString() {
  const solution = Array.from({ length: radiusCells(BOARD_RADIUS).length }, () => 0);

  state.cells.forEach((cell) => {
    solution[cell.index] = cell.pieceIndex + 1;
  });

  return encodeSolutionString(solution);
}

function encodeSolutionString(solution) {
  return solution
    .map((value, index) => SOLUTION_CHARS[(value + solutionOffset(index)) % SOLUTION_CHARS.length])
    .join("");
}

function decodeSolutionString(encodedSolution) {
  if (
    typeof encodedSolution !== "string" ||
    encodedSolution.length !== radiusCells(BOARD_RADIUS).length ||
    [...encodedSolution].some((char) => !SOLUTION_CHARS.includes(char))
  ) {
    return null;
  }

  return [...encodedSolution].map((char, index) => {
    const encoded = SOLUTION_CHARS.indexOf(char);

    return (encoded - solutionOffset(index) + SOLUTION_CHARS.length) % SOLUTION_CHARS.length;
  });
}

function solutionOffset(index) {
  return (index * 3 + 2) % SOLUTION_CHARS.length;
}

function isValidBoardString(board) {
  return typeof board === "string" &&
    board.length === radiusCells(BOARD_RADIUS).length &&
    [...board].every((char) => char === "." || /^[a-z]$/i.test(char));
}

function isValidSolution(board, solution) {
  if (!Array.isArray(solution) || solution.length !== board.length) {
    return false;
  }

  const counts = [0, 0, 0, 0, 0];

  for (let index = 0; index < board.length; index += 1) {
    const value = solution[index];

    if (!Number.isInteger(value) || value < 0 || value > 4) {
      return false;
    }

    if ((board[index] === ".") !== (value === 0)) {
      return false;
    }

    counts[value] += 1;
  }

  const pieceCounts = counts.slice(1).filter((count) => count > 0);
  const holeCount = counts[0];
  const penthexCount = pieceCounts.filter((count) => count === 5).length;

  return pieceCounts.length === 4 &&
    pieceCounts.every((count) => count === 4 || count === 5) &&
    holeCount === 3 - penthexCount;
}

function makeSolutionFromCells() {
  const pieceCount = Math.max(...state.cells.map((cell) => cell.pieceIndex)) + 1;

  return Array.from({ length: pieceCount }, (_, pieceIndex) => {
    const cells = state.cells.filter((cell) => cell.pieceIndex === pieceIndex);
    const reading = generationReadingOrder(cells);
    const word = resolveWord(cells) || reading
      .map((cell) => cell.letter)
      .join("");

    return {
      cells: reading.map((cell) => cell.id),
      word
    };
  });
}

function render() {
  renderBoard();
  renderSelectionLines();
  renderStatus();
}

function renderBoard() {
  elements.board.innerHTML = "";

  state.cells.forEach((cell) => {
    elements.board.append(makeCellGroup(cell));
  });
}

function makeCellGroup(cell) {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const face = makeHex(cell, "hex-face", HEX_SIZE - 3);
  const highlight = makeHex(cell, "hex-highlight", HEX_SIZE - 14);
  const letter = document.createElementNS("http://www.w3.org/2000/svg", "text");
  const { x, y } = axialToPixel(cell.coord);
  const lockIndex = state.locked.get(cell.id);

  group.classList.add("hex-cell");
  if (state.selection.includes(cell.id)) {
    group.classList.add("is-selected");
  }
  if (state.invalidSelection && state.selection.includes(cell.id)) {
    group.classList.add("is-invalid");
  }
  if (lockIndex !== undefined) {
    group.classList.add("is-locked");
    group.style.setProperty("--lock-color", LOCK_COLORS[lockIndex % LOCK_COLORS.length]);

    if (state.activeMoveIndex === lockIndex) {
      group.classList.add("is-active-group");
    }

    if (isDeleteAnchorCell(cell, lockIndex)) {
      group.classList.add("is-delete-anchor");
    }
  }

  group.setAttribute("role", "button");
  group.setAttribute("tabindex", "0");
  group.dataset.id = cell.id;
  group.setAttribute("aria-label", cellLabel(cell));
  group.addEventListener("click", (event) => selectCell(cell, event));
  group.addEventListener("pointerdown", (event) => startDragSelection(cell, event));
  group.addEventListener("pointerenter", () => extendDragSelection(cell));
  group.addEventListener("pointerup", (event) => endDragSelection(event));
  group.addEventListener("pointercancel", (event) => endDragSelection(event));

  letter.classList.add("hex-letter");
  letter.setAttribute("x", x);
  letter.setAttribute("y", y + 1);
  letter.textContent = cell.letter;

  group.append(face, highlight, letter);
  if (isDeleteAnchorCell(cell, lockIndex)) {
    group.append(makeDeleteBadge(cell));
  }

  return group;
}

function makeHex(cell, className, radius) {
  const { x, y } = axialToPixel(cell.coord);
  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

  polygon.setAttribute("class", className);
  polygon.setAttribute("points", hexPoints(x, y, radius));
  return polygon;
}

function makeDeleteBadge(cell) {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  const cross = document.createElementNS("http://www.w3.org/2000/svg", "text");
  const { x, y } = axialToPixel(cell.coord);

  group.classList.add("delete-badge");
  circle.classList.add("delete-badge-face");
  circle.setAttribute("cx", x - 24);
  circle.setAttribute("cy", y - 25);
  circle.setAttribute("r", 13);
  cross.classList.add("delete-badge-cross");
  cross.setAttribute("x", x - 24);
  cross.setAttribute("y", y - 25);
  cross.textContent = "x";
  group.append(circle, cross);

  return group;
}

function renderSelectionLines() {
  elements.selectionLines.innerHTML = "";
  elements.selectionLines.classList.toggle(
    "has-fourth-row",
    state.moves.length >= 4 || (state.moves.length === 3 && state.selection.length > 0)
  );

  state.moves.forEach((move, index) => {
    const row = document.createElement("div");

    row.className = "selection-row is-complete";
    if (state.activeMoveIndex === index) {
      row.classList.add("is-active");
    }
    row.style.setProperty("--lock-color", LOCK_COLORS[index % LOCK_COLORS.length]);
    row.setAttribute("aria-label", `Completed word: ${move.word}`);
    row.addEventListener("click", () => selectMoveLine(index));
    [...move.word].forEach((letter) => row.append(makeMiniTile(letter)));
    elements.selectionLines.append(row);
  });

  if (state.selection.length > 0) {
    const row = document.createElement("div");
    const word = readSelectionWord(state.selection);

    row.className = state.invalidSelection
      ? "selection-row is-current is-invalid"
      : "selection-row is-current";
    row.setAttribute("aria-label", `Current selection: ${word}`);
    [...word].forEach((letter) => row.append(makeMiniTile(letter)));
    elements.selectionLines.append(row);
  }
}

function makeMiniTile(letter) {
  const tile = document.createElement("span");

  tile.className = "mini-tile";
  tile.textContent = letter;
  return tile;
}

function renderStatus() {
  if (state.moves.length === 4) {
    elements.status.textContent = "Complete";
    return;
  }

  if (state.pendingCommitTimer !== null) {
    elements.status.textContent = "Word ready. Add a fifth tile or press Enter.";
    return;
  }

  elements.status.textContent = "Choose four or five edge-connected hexes to make a word.";
}

function selectCell(cell, event) {
  if (event && state.dragSelection) {
    state.dragSelection = null;
    return;
  }

  if (state.locked.has(cell.id)) {
    cancelPendingCommit();
    handleLockedCellTap(cell);
    return;
  }

  cancelPendingCommit();
  state.invalidSelection = false;
  state.activeMoveIndex = null;

  if (state.selection.includes(cell.id)) {
    state.selection = state.selection.filter((id) => id !== cell.id);
    render();
    return;
  }

  if (state.selection.length >= MAX_WORD_LENGTH) {
    state.selection = [];
  }

  state.selection.push(cell.id);

  if (shouldCommitSelection()) {
    return;
  }

  render();
}

function startDragSelection(cell, event) {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  state.dragSelection = {
    pointerId: event.pointerId,
    moved: false,
    handledClick: true
  };

  if (state.locked.has(cell.id)) {
    cancelPendingCommit();
    state.dragSelection = null;
    return;
  }

  cancelPendingCommit();
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);

  if (state.selection.includes(cell.id)) {
    state.selection = state.selection.filter((id) => id !== cell.id);
    render();
    return;
  }

  addCellToSelection(cell);
}

function extendDragSelection(cell) {
  if (!state.dragSelection || state.dragSelection.completed || state.locked.has(cell.id)) {
    return;
  }

  state.dragSelection.moved = true;
  addCellToSelection(cell);
}

function handleDragMove(event) {
  if (
    !state.dragSelection ||
    state.dragSelection.completed ||
    state.dragSelection.pointerId !== event.pointerId
  ) {
    return;
  }

  const cellGroup = document.elementFromPoint(event.clientX, event.clientY)?.closest(".hex-cell");
  const cell = cellGroup ? getCellById(cellGroup.dataset.id) : null;

  if (cell) {
    extendDragSelection(cell);
  }
}

function endDragSelection(event) {
  if (!state.dragSelection || state.dragSelection.pointerId !== event.pointerId) {
    return;
  }

  state.dragSelection.handledClick = true;
}

function addCellToSelection(cell) {
  if (state.locked.has(cell.id) || state.selection.includes(cell.id)) {
    return;
  }

  cancelPendingCommit();
  state.invalidSelection = false;
  state.activeMoveIndex = null;

  if (state.selection.length >= MAX_WORD_LENGTH) {
    state.selection = [];
  }

  state.selection.push(cell.id);

  if (shouldCommitSelection()) {
    return;
  }

  render();
}

function commitSelection() {
  cancelPendingCommit();
  const result = validateSelection(state.selection);

  if (!result.valid || !result.word) {
    if (state.dragSelection) {
      state.dragSelection.completed = true;
    }
    state.invalidSelection = true;
    render();
    window.setTimeout(() => {
      if (state.invalidSelection) {
        state.selection = [];
        state.invalidSelection = false;
        render();
      }
    }, 420);
    return;
  }

  const lockIndex = state.moves.length;

  state.selection.forEach((id) => state.locked.set(id, lockIndex));
  state.moves.push({
    cells: [...state.selection],
    word: result.word
  });
  state.selection = [];
  state.activeMoveIndex = null;
  if (state.dragSelection) {
    state.dragSelection.completed = true;
  }
  render();
}

function shouldCommitSelection() {
  if (state.selection.length < MIN_WORD_LENGTH) {
    render();
    return false;
  }

  const result = validateSelection(state.selection);

  if (state.selection.length === MIN_WORD_LENGTH && result.valid && result.word) {
    schedulePendingCommit();
    render();
    return true;
  }

  if (state.selection.length === MAX_WORD_LENGTH && result.valid && result.word) {
    commitSelection();
    return true;
  }

  if (state.selection.length === MAX_WORD_LENGTH) {
    commitSelection();
    return true;
  }

  render();
  return false;
}

function schedulePendingCommit() {
  cancelPendingCommit();
  state.pendingCommitTimer = window.setTimeout(() => {
    state.pendingCommitTimer = null;
    commitSelection();
  }, FOUR_LETTER_COMMIT_DELAY);
}

function commitPendingSelection() {
  if (state.pendingCommitTimer === null) {
    return false;
  }

  commitSelection();
  return true;
}

function handleLockedCellTap(cell) {
  const lockedMoveIndex = state.locked.get(cell.id);

  if (lockedMoveIndex === undefined) {
    return;
  }

  cancelPendingCommit();
  if (isDeleteAnchorCell(cell, lockedMoveIndex)) {
    deleteMove(lockedMoveIndex);
    return;
  }

  state.selection = [];
  state.invalidSelection = false;
  state.activeMoveIndex = lockedMoveIndex;
  render();
}

function selectMoveLine(index) {
  cancelPendingCommit();
  state.selection = [];
  state.invalidSelection = false;
  state.activeMoveIndex = state.activeMoveIndex === index ? null : index;
  render();
}

function deleteMove(index) {
  if (!state.moves[index]) {
    return;
  }

  cancelPendingCommit();
  state.moves.splice(index, 1);
  state.selection = [];
  state.invalidSelection = false;
  state.activeMoveIndex = null;
  rebuildLockedMap();
  render();
}

function rebuildLockedMap() {
  state.locked = new Map();
  state.moves.forEach((move, moveIndex) => {
    move.cells.forEach((id) => state.locked.set(id, moveIndex));
  });
}

function isDeleteAnchorCell(cell, lockedMoveIndex) {
  if (lockedMoveIndex === undefined || state.activeMoveIndex !== lockedMoveIndex) {
    return false;
  }

  return getMoveAnchorCellId(lockedMoveIndex) === cell.id;
}

function getMoveAnchorCellId(index) {
  const move = state.moves[index];

  if (!move) {
    return null;
  }

  const cells = move.cells
    .map(getCellById)
    .filter(Boolean);

  return generationReadingOrder(cells)[0]?.id || cells[0]?.id || null;
}

function validateSelection(selection) {
  if (
    selection.length < MIN_WORD_LENGTH ||
    selection.length > MAX_WORD_LENGTH ||
    new Set(selection).size !== selection.length
  ) {
    return { valid: false, word: null };
  }

  const cells = selection.map(getCellById);

  if (cells.some((cell) => !cell || state.locked.has(cell.id))) {
    return { valid: false, word: null };
  }

  if (!isConnected(cells)) {
    return { valid: false, word: null };
  }

  return {
    valid: true,
    word: resolveWord(cells)
  };
}

function resolveWord(cells) {
  const orderedCandidates = generationReadingOrders(cells).map((order) => {
    return order.map((cell) => cell.letter).join("");
  });
  const orderedWord = orderedCandidates.find((word) => state.allowedWords.has(word.toLowerCase()));

  if (orderedWord) {
    return orderedWord;
  }

  const anagramCandidates = anagrams(cells.map((cell) => cell.letter));

  return anagramCandidates.find((word) => state.allowedWords.has(word.toLowerCase())) || null;
}

function anagrams(letters) {
  const words = [];
  const counts = new Map();

  letters.forEach((letter) => counts.set(letter, (counts.get(letter) || 0) + 1));

  function build(prefix) {
    if (prefix.length === letters.length) {
      words.push(prefix.join(""));
      return;
    }

    [...counts.keys()].sort().forEach((letter) => {
      const count = counts.get(letter);

      if (count === 0) {
        return;
      }

      counts.set(letter, count - 1);
      prefix.push(letter);
      build(prefix);
      prefix.pop();
      counts.set(letter, count);
    });
  }

  build([]);
  return words;
}

function readSelectionWord(selection) {
  return selection
    .map(getCellById)
    .filter(Boolean)
    .map((cell) => cell.letter)
    .join("");
}

function randomGenerationReadingOrder(cells) {
  return randomItem(generationReadingOrders(cells));
}

function generationReadingOrder(cells) {
  return generationReadingOrders(cells)[0];
}

function generationReadingOrders(cells) {
  const keyedOrders = keyedGenerationOrders(cells);

  if (keyedOrders.length > 0) {
    return keyedOrders;
  }

  return [[...cells].sort(compareShapeCellOrder)];
}

function keyedGenerationOrders(cells) {
  const key = shapeKey(cells);
  const orders = cells.length === 5
    ? state.penthexGenerationOrders[key] || []
    : state.tetrahexGenerationOrders[key] || [];

  return orders
    .map((order) => cellsByShapeOffsets(cells, order))
    .filter((order) => order.length === cells.length);
}

function buildPenthexGenerationOrders(shapesText, orderTable) {
  const ordersByShapeKey = {};

  shapesText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const shape = line.split(";").map(parseCoordKey);
      const shapeIndex = String(index + 1);
      const orders = orderTable[shapeIndex] || [];

      ordersByShapeKey[line] = orders.map((order) => {
        return [...order].map((cellIndex) => coordKey(shape[Number(cellIndex) - 1]));
      });
    });

  return ordersByShapeKey;
}

function parseCoordKey(key) {
  return key.split(",").map(Number);
}

function cellsByShapeOffsets(cells, offsets) {
  const origin = shapeOrigin(cells);
  const byOffset = new Map(cells.map((cell) => [
    coordKey([cell.coord[0] - origin[0], cell.coord[1] - origin[1]]),
    cell
  ]));

  return offsets
    .map((offset) => byOffset.get(offset))
    .filter(Boolean);
}

function shapeKey(cells) {
  const origin = shapeOrigin(cells);

  return cells
    .map((cell) => [cell.coord[0] - origin[0], cell.coord[1] - origin[1]])
    .sort(compareCoords)
    .map(coordKey)
    .join(";");
}

function shapeOrigin(cells) {
  return [
    Math.min(...cells.map((cell) => cell.coord[0])),
    Math.min(...cells.map((cell) => cell.coord[1]))
  ];
}

function compareShapeCellOrder(a, b) {
  return a.coord[0] - b.coord[0] || a.coord[1] - b.coord[1];
}

function isConnected(cells) {
  const ids = new Set(cells.map((cell) => cell.id));
  const visited = new Set();
  const stack = [cells[0]];

  while (stack.length > 0) {
    const cell = stack.pop();

    if (!cell || visited.has(cell.id)) {
      continue;
    }

    visited.add(cell.id);
    neighborsOf(cell.coord)
      .map((coord) => getCellById(coordKey(coord)))
      .filter((neighbor) => neighbor && ids.has(neighbor.id))
      .forEach((neighbor) => stack.push(neighbor));
  }

  return visited.size === cells.length;
}

function handleKeyDown(event) {
  if (event.key.toLowerCase() === "q") {
    state.qSequence = `${state.qSequence}q`.slice(-3);

    if (state.qSequence === "qqq") {
      event.preventDefault();
      state.qSequence = "";
      showOriginalTiling();
    }

    return;
  }

  state.qSequence = "";

  if (event.key === "Enter") {
    if (commitPendingSelection()) {
      event.preventDefault();
      return;
    }

    if (state.selection.length >= MIN_WORD_LENGTH && validateSelection(state.selection).word) {
      event.preventDefault();
      commitSelection();
      return;
    }
  }

  if (state.activeMoveIndex !== null && event.key === "Backspace") {
    event.preventDefault();
    deleteMove(state.activeMoveIndex);
    return;
  }

  if (event.key === "Backspace") {
    event.preventDefault();
    cancelPendingCommit();
    state.selection.pop();
    state.invalidSelection = false;
    render();
  }
}

function showOriginalTiling() {
  cancelPendingCommit();
  state.selection = [];
  state.invalidSelection = false;
  state.activeMoveIndex = null;
  state.moves = state.solution.map((piece) => ({
    cells: [...piece.cells],
    word: piece.word
  }));
  state.locked = new Map();

  state.moves.forEach((move, index) => {
    move.cells.forEach((id) => state.locked.set(id, index));
  });

  render();
}

function cellLabel(cell) {
  const lockIndex = state.locked.get(cell.id);
  const position = `${cell.letter} at ${cell.coord[0]}, ${cell.coord[1]}`;

  if (lockIndex !== undefined) {
    if (isDeleteAnchorCell(cell, lockIndex)) {
      return `${position}. Remove ${state.moves[lockIndex]?.word || "completed word"}.`;
    }

    return `${position}. Locked word ${state.moves[lockIndex]?.word || ""}`;
  }

  return `${position}. Select tile.`;
}

function getCellById(id) {
  return state.cells.find((cell) => cell.id === id);
}

function radiusCells(radius) {
  const cells = [];

  for (let q = -radius; q <= radius; q += 1) {
    for (let r = -radius; r <= radius; r += 1) {
      const s = -q - r;

      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= radius) {
        cells.push([q, r]);
      }
    }
  }

  return cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

function neighborsOf([q, r]) {
  return NEIGHBORS.map(([dq, dr]) => [q + dq, r + dr]);
}

function axialToPixel([q, r]) {
  return {
    x: SVG_CENTER.x + HEX_SIZE * Math.sqrt(3) * (q + r / 2),
    y: SVG_CENTER.y + HEX_SIZE * 1.5 * r
  };
}

function hexPoints(x, y, radius) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = Math.PI / 180 * (60 * index - 30);

    return `${x + radius * Math.cos(angle)},${y + radius * Math.sin(angle)}`;
  }).join(" ");
}

function coordKey([q, r]) {
  return `${q},${r}`;
}

function compareCoords(a, b) {
  return a[0] - b[0] || a[1] - b[1];
}

function randomItem(items) {
  return items[randomIndex(items)];
}

function randomIndex(items) {
  return Math.floor(Math.random() * items.length);
}

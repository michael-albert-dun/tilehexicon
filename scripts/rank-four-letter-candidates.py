#!/usr/bin/env python3

from __future__ import annotations

from collections import Counter
from math import log
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
ALLOWED_PATH = DATA_DIR / "allowed-words.txt"
COMMON_PATH = DATA_DIR / "common-words.txt"
COMMON_FIVE_PATH = DATA_DIR / "common-words-5.txt"
OUTPUT_PATH = DATA_DIR / "allowed-words-4-review-ranked.txt"
RARE_LETTERS = set("jqxz")
VOWELS = set("aeiou")
FAMILIAR_HINTS = {
    "abut", "ache", "achy", "acme", "afar", "agar", "aged", "ague", "ahem", "ahoy",
    "akin", "alar", "alas", "alba", "alga", "alms", "amen", "amid", "ammo", "amok",
    "ante", "apex", "apse", "aria", "aver", "avid", "avow", "bail", "bait", "balk",
    "balm", "bane", "bard", "bash", "bask", "bead", "beak", "beam", "bean", "beet",
    "belt", "berg", "bias", "bile", "biro", "blip", "bloc", "boar", "bolt", "bony",
    "boon", "boot", "bore", "bout", "brag", "bran", "brat", "brew", "brim", "buck",
    "buoy", "burp", "byte", "cafe", "cage", "cane", "cape", "carp", "cart", "cask",
    "char", "chew", "chic", "chop", "clad", "clam", "clan", "claw", "clay", "clue",
    "coal", "coax", "coda", "coil", "cola", "coma", "comb", "coop", "cope", "cord",
    "cork", "cove", "crab", "cram", "crew", "crib", "cusp", "dame", "darn", "dart",
    "dash", "daze", "deaf", "dear", "deft", "dial", "dice", "dine", "dire", "dirt",
    "doll", "dome", "doom", "dove", "drag", "drip", "dual", "duel", "duke", "dusk",
    "echo", "eddy", "envy", "epic", "etch", "fade", "fang", "fare", "fate", "feat",
    "fern", "fizz", "flap", "flaw", "flea", "fled", "flee", "fret", "fume", "fury",
    "gala", "gasp", "gaze", "gear", "germ", "gist", "glad", "glee", "glow", "gnaw",
    "gown", "grid", "grin", "grit", "hail", "halo", "halt", "hare", "hazy", "heap",
    "heed", "helm", "herd", "hike", "hilt", "hive", "hoax", "hurl", "hush", "hymn",
    "icon", "idle", "idol", "itch", "jade", "jazz", "jolt", "judo", "keen", "kilo",
    "kite", "knob", "lace", "lair", "lamb", "lash", "lava", "lawn", "leak", "leap",
    "lens", "limb", "limo", "lint", "lion", "lisp", "loaf", "loom", "lore", "lure",
    "mace", "maid", "malt", "mare", "mash", "maze", "meek", "melt", "memo", "mend",
    "menu", "mild", "mink", "moan", "moat", "mold", "mole", "monk", "moss", "moth",
    "muse", "mush", "musk", "mute", "myth", "navy", "neat", "neon", "nest", "noon",
    "numb", "oath", "omen", "omit", "opal", "oval", "pace", "pact", "palm", "pang",
    "pant", "pare", "pave", "pawn", "pear", "peat", "peek", "peel", "pier", "pike",
    "pint", "ploy", "poem", "pore", "puff", "pulp", "purr", "quip", "raft", "ramp",
    "rant", "rash", "rave", "reap", "reef", "reel", "rein", "rend", "rind", "riot",
    "roam", "robe", "rode", "ruse", "rust", "ruth", "sack", "sage", "sane", "sash",
    "scar", "scum", "seam", "sear", "sect", "sham", "shin", "ship", "shun", "sift",
    "silo", "skim", "skit", "slab", "slam", "slap", "slit", "slum", "snag", "snap",
    "snob", "soak", "soar", "soda", "sofa", "solo", "soot", "sore", "spar", "sped",
    "spew", "spin", "spit", "stab", "stag", "stew", "stir", "stub", "stun", "surf",
    "swab", "swap", "swan", "sway", "tack", "tact", "tame", "tang", "tart", "taut",
    "teal", "tear", "teem", "tent", "thaw", "thee", "thud", "tidy", "tint", "toil",
    "tomb", "torn", "tram", "trek", "trim", "trot", "tuna", "tusk", "twig", "tyre",
    "unit", "unto", "vale", "veal", "veil", "vein", "vent", "verb", "vest", "veto",
    "vial", "vibe", "vile", "vine", "visa", "void", "wade", "wail", "wand", "warp",
    "wary", "watt", "wean", "weft", "weld", "wilt", "wink", "wiry", "womb", "wool",
    "worn", "writ", "yarn", "yawn", "yelp", "yoga", "yolk", "zest", "zinc", "zone",
}


def main() -> None:
    allowed = read_words(ALLOWED_PATH)
    common = read_words(COMMON_PATH)
    common_five = read_words(COMMON_FIVE_PATH)
    candidates = sorted(allowed - common)
    common_model = build_ngram_model(common | {word[:4] for word in common_five} | {word[1:] for word in common_five})

    rows = []
    for word in candidates:
      score, reasons = score_word(word, common_five, common_model)
      rows.append((score, word, reasons))

    rows.sort(key=lambda row: (-row[0], row[1]))

    with OUTPUT_PATH.open("w", encoding="utf-8") as output:
        output.write("# rank\tscore\tword\treasons\n")
        for rank, (score, word, reasons) in enumerate(rows, start=1):
            output.write(f"{rank}\t{score:.2f}\t{word}\t{','.join(reasons)}\n")

    print(f"Wrote {len(rows)} ranked candidate words -> {OUTPUT_PATH.relative_to(ROOT_DIR)}")
    for probe in ("narr", "ache", "afar", "agar", "zinc", "abut"):
        match = next((row for row in rows if row[1] == probe), None)
        if match:
            print(f"{probe}: rank {rows.index(match) + 1}, score {match[0]:.2f}, {','.join(match[2])}")


def read_words(path: Path) -> set[str]:
    return {
        word.strip().lower()
        for word in path.read_text(encoding="utf-8").splitlines()
        if word.strip() and not word.startswith("#")
    }


def build_ngram_model(words: set[str]) -> dict[str, Counter[str]]:
    model = {"letters": Counter(), "bigrams": Counter(), "trigrams": Counter()}

    for word in words:
        model["letters"].update(word)
        model["bigrams"].update(word[index:index + 2] for index in range(len(word) - 1))
        model["trigrams"].update(word[index:index + 3] for index in range(len(word) - 2))

    return model


def score_word(word: str, common_five: set[str], model: dict[str, Counter[str]]) -> tuple[float, list[str]]:
    score = 0.0
    reasons = []

    score += ngram_score(word, model)

    if word in FAMILIAR_HINTS:
        score += 7.0
        reasons.append("hint")

    if any(five.startswith(word) or five.endswith(word) for five in common_five):
        score += 3.0
        reasons.append("common5-fragment")

    if has_plain_vowel_shape(word):
        score += 1.2
        reasons.append("plain-shape")

    if word.endswith("s"):
        score += 0.8
        reasons.append("s-form")

    if any(letter in RARE_LETTERS for letter in word):
        score -= 2.4
        reasons.append("rare-letter")

    if word[-1] == word[-2]:
        score -= 2.0
        reasons.append("double-final")

    if word[:2] in {"aa", "ae", "eo", "io", "oe"} or word[-2:] in {"ae", "ii", "um", "ys"}:
        score -= 2.3
        reasons.append("specialist-pattern")

    if not any(letter in VOWELS for letter in word):
        score -= 4.5
        reasons.append("no-vowel")

    if not reasons:
        reasons.append("ngram-only")

    return score, reasons


def ngram_score(word: str, model: dict[str, Counter[str]]) -> float:
    score = 0.0
    for kind, grams in (
        ("letters", list(word)),
        ("bigrams", [word[index:index + 2] for index in range(len(word) - 1)]),
        ("trigrams", [word[index:index + 3] for index in range(len(word) - 2)]),
    ):
        counts = model[kind]
        total = sum(counts.values()) + len(counts)
        weight = {"letters": 0.35, "bigrams": 0.9, "trigrams": 1.25}[kind]
        for gram in grams:
            score += weight * log((counts[gram] + 1) / total)

    return score + 22.0


def has_plain_vowel_shape(word: str) -> bool:
    vowel_count = sum(letter in VOWELS for letter in word)
    return 1 <= vowel_count <= 2 and not any(word[index] == word[index + 1] for index in range(len(word) - 1))


if __name__ == "__main__":
    main()

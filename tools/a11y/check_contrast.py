#!/usr/bin/env python3
"""Check color pairs against WCAG 2.2 AA contrast minimums.

Usage: python3 check_contrast.py a11y-contrast.json
       python3 check_contrast.py --pair "#555555" "#ffffff" text
The JSON file is a list of {"name", "fg", "bg", "use"} where use is
"text" (4.5:1, SC 1.4.3), "large-text" (3:1, SC 1.4.3: 24px+, or 18.66px+ bold),
or "ui" (3:1, SC 1.4.11: borders, icons, focus rings, input outlines).
Colors: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(...), rgba(...). A transparent foreground is
blended onto the background first. Exit codes: 0 all pass, 1 a pair fails, 2 bad input.
"""
import argparse, json, re, sys

MIN = {"text": 4.5, "large-text": 3.0, "ui": 3.0}
SC = {"text": "1.4.3", "large-text": "1.4.3", "ui": "1.4.11"}

def parse(c):
    c = c.strip().lower()
    m = re.fullmatch(r"#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})", c)
    if m:
        h = m.group(1)
        if len(h) in (3, 4): h = "".join(x * 2 for x in h)
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return r, g, b, a
    m = re.fullmatch(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)", c)
    if m:
        r, g, b = (int(m.group(i)) for i in (1, 2, 3))
        if max(r, g, b) > 255: raise ValueError(f"channel above 255 in {c}")
        return r, g, b, float(m.group(4)) if m.group(4) else 1.0
    raise ValueError(f"unsupported color: {c}")

def blend(fg, bg):
    a = fg[3]
    return tuple(round(fg[i] * a + bg[i] * (1 - a)) for i in range(3))

def luminance(rgb):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(v) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def ratio(fg, bg):
    bgc = parse(bg)
    if bgc[3] < 1: raise ValueError(f"background must be opaque: {bg}")
    l1, l2 = luminance(blend(parse(fg), bgc)), luminance(bgc[:3])
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("file", nargs="?")
    p.add_argument("--pair", nargs=3, metavar=("FG", "BG", "USE"))
    a = p.parse_args()
    try:
        if a.pair:
            pairs = [{"name": "pair", "fg": a.pair[0], "bg": a.pair[1], "use": a.pair[2]}]
        elif a.file:
            pairs = json.load(open(a.file, encoding="utf-8"))
            assert isinstance(pairs, list) and pairs
        else:
            p.error("give a JSON file or --pair")
        rows, fails = [], 0
        for x in pairs:
            use = x.get("use", "text")
            if use not in MIN: raise ValueError(f"{x.get('name')}: use must be text, large-text, or ui")
            r = ratio(x["fg"], x["bg"])
            ok = r >= MIN[use]
            fails += not ok
            rows.append(f"| {x['name']} | {x['fg']} on {x['bg']} | {use} | {r:.2f}:1 | {MIN[use]}:1 (SC {SC[use]}) | {'PASS' if ok else 'FAIL'} |")
    except (OSError, json.JSONDecodeError, AssertionError, KeyError, ValueError) as e:
        print(f"ERROR: {e}", file=sys.stderr); return 2
    print("| Pair | Colors | Use | Ratio | Needs | Result |\n|---|---|---|---|---|---|")
    print("\n".join(rows))
    print(f"\n{'FAIL' if fails else 'PASS'}: {len(pairs) - fails}/{len(pairs)} pairs meet WCAG 2.2 AA")
    return 1 if fails else 0

if __name__ == "__main__":
    sys.exit(main())

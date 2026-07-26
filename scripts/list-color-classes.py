import re
import pathlib
from collections import Counter

root = pathlib.Path("WorkoutPlanner.Api/wwwroot")
classes = Counter()
for p in list(root.rglob("*.html")) + list(root.rglob("*.js")) + list(root.rglob("*.css")):
    t = p.read_text(encoding="utf-8", errors="replace")
    for m in re.finditer(r"""['"]([^'"]*)['"]""", t):
        for c in m.group(1).split():
            base = c.split(":")[-1]
            if re.match(r"^(text|bg|border|from|to|via)-", base):
                classes[base] += 1

for c, n in sorted(classes.items()):
    print(f"{n:4} {c}")

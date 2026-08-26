import re, subprocess

PAGE = 'src/pages/VideoDetail.tsx'
PLAYER = 'src/components/video/VideoPlayer.tsx'

for it in range(8):
    r = subprocess.run(['npx', 'tsc', '-b'], capture_output=True, text=True)
    errs = [l for l in r.stdout.split('\n') if ': error' in l]
    if not errs:
        print(f"VERDE en iteracion {it}")
        break
    changed = False
    unused = {}  # file -> [names]
    missing = {}
    for e in errs:
        m = re.search(r'([^(]+)\((\d+),(\d+)\): error TS6133: .(\w+). is declared but', e)
        if m and 'lucide-react' in open(m.group(1)).read()[:600] if False else False:
            pass
        # TS6133 sobre import lucide: comprobar que la linea esta dentro del import
        m2 = re.search(r"TS6133: '(\w+)' is declared but its value is never read", e)
        if m2:
            f = e.split('(')[0]
            name = m2.group(1)
            s = open(f).read()
            imp = re.search(r"import \{([^}]*)\} from 'lucide-react'", s, re.S)
            if imp and re.search(rf'\b{name}\b', imp.group(1)):
                unused.setdefault(f, set()).add(name)
                continue
        m3 = re.search(r"TS2304: Cannot find name '(\w+)'", e)
        if m3:
            f = e.split('(')[0]
            if f == PLAYER:
                missing.setdefault(f, set()).add(m3.group(1))
    for f, names in unused.items():
        s = open(f).read()
        imp = re.search(r"(import \{)([^}]*)(\} from 'lucide-react')", s, re.S)
        if imp:
            keep = [n.strip() for n in imp.group(2).split(',') if n.strip()]
            keep = [n for n in keep if n not in names]
            s = s.replace(imp.group(0), imp.group(1) + ', '.join(keep) + ' ' + imp.group(3))
            open(f, 'w').write(s)
            changed = True
            print(f"{f}: removidos {sorted(names)}")
    for f, names in missing.items():
        s = open(f).read()
        have = set(re.findall(r"\b(\w+)\b(?=[,\s}]* from 'lucide-react')", s.split("from 'lucide-react'")[0][-400:]))
        need = names - have
        if need:
            imp = re.search(r"(import \{)([^}]*)(\} from 'lucide-react')", s, re.S)
            add = ', '.join(sorted(need))
            s = s.replace(imp.group(0), imp.group(1) + imp.group(2) + ', ' + add + ' ' + imp.group(3))
            open(f, 'w').write(s)
            changed = True
            print(f"{PLAYER}: anadidos {sorted(need)}")
    if not changed:
        print("sin cambios automaticos; quedan:")
        print('\n'.join(errs[:10]))
        break

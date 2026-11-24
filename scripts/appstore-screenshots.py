#!/usr/bin/env python3
"""Generuje screenshoty do App Store Connect (iPhone) z surowych zrzutów w store/source/.

Zgodnie z https://developer.apple.com/app-store/asset-best-practices/ :
  - PNG, bez kanału alfa, sRGB, bez zaokrąglonych rogów całego obrazu,
  - 6.9" (1320x2868) – jedyny wymagany rozmiar; Apple skaluje go na mniejsze iPhone'y,
  - 6.5" (1284x2778) – opcjonalnie, gdyby Connect poprosił o ten rozmiar,
  - krótki, czytelny podpis nad zrzutem, treść = realny ekran appki.

Użycie:  python3 scripts/appstore-screenshots.py [--home]
  --home  najpierw odświeża zrzut strony głównej (store/source/strona-glowna.png) z uprzejmiedonosze.net (Chrome headless)
Podmiana na zrzuty natywne (np. z symulatora 6.9"): wrzuć je do store/source/ pod tymi samymi nazwami.
Pasek statusu jest zastępowany czystym (9:41, pełny zasięg/bateria), bo na zrzutach z telefonu widać
prywatne rzeczy (powiadomienia, „◀ Gmail”).
"""
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'store' / 'source'
OUT = ROOT / 'store' / 'ios'
FONT = Path.home() / 'Library/Fonts/Inter-VariableFont_slnt,wght.ttf'
FALLBACK = '/System/Library/Fonts/HelveticaNeue.ttc'

GREEN = (16, 122, 86)          # kolor nagłówka appki
BG_TOP, BG_BOTTOM = (8, 82, 58), (4, 44, 32)

# (plik, podpis w dwóch liniach)
SHOTS = [
    ('dashboard', ['Zgłoś złe parkowanie', 'w kilka chwil']),
    ('kategorie', ['Wybierz rodzaj', 'wykroczenia']),
    ('odznaki', ['Zbieraj odznaki', 'i śledź statystyki']),
]
SIZES = {'6.9': (1320, 2868), '6.5': (1284, 2778), '6.3': (1206, 2622), '6.1': (1179, 2556)}


def font(size):
    try:
        f = ImageFont.truetype(str(FONT), size)
        f.set_variation_by_name('ExtraBold')
        return f
    except Exception:
        return ImageFont.truetype(FALLBACK, size, index=1)


def clean_status_bar(img):
    """Zamalowuje pasek statusu kolorem nagłówka i rysuje neutralny: 9:41, zasięg, bateria."""
    w, _ = img.size
    d = ImageDraw.Draw(img)
    bar_h = 58
    d.rectangle([0, 0, w, bar_h], fill=GREEN)
    f = font(26)
    d.text((40, 30), '9:41', font=f, fill='white', anchor='lm')
    for i in range(4):  # zasięg
        h = 8 + i * 5
        x = w - 150 + i * 9
        d.rectangle([x, 38 - h, x + 5, 38], fill='white')
    bx = w - 90  # bateria
    d.rounded_rectangle([bx, 20, bx + 44, 40], radius=6, outline='white', width=2)
    d.rounded_rectangle([bx + 4, 24, bx + 38, 36], radius=3, fill='white')
    d.rectangle([bx + 46, 26, bx + 48, 34], fill='white')
    return img


def gradient(w, h):
    bg = Image.new('RGB', (w, h))
    px = ImageDraw.Draw(bg)
    for y in range(h):
        t = y / (h - 1)
        px.line([(0, y), (w, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)))
    return bg


def compose(name, lines, size):
    W, H = size
    k = W / 1320
    canvas = gradient(W, H)
    shot = Image.open(SRC / f'{name}.jpg').convert('RGB')
    shot = clean_status_bar(shot)

    pw = round(1040 * k)
    top = round(610 * k)
    if top + round(shot.height * pw / shot.width) < H:  # telefon ma „wyrastać” z dołu – bez paska tła
        pw = -(-(H - top) * shot.width // shot.height) + 2
    ph = round(shot.height * pw / shot.width)
    shot = shot.resize((pw, ph), Image.LANCZOS)

    # zaokrąglone górne rogi + dolna krawędź ucięta przez brzeg obrazu (telefon „wyrasta” z dołu)
    radius = round(90 * k)
    mask = Image.new('L', (pw, ph), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw, ph + radius * 2], radius=radius, fill=255)
    x = (W - pw) // 2

    # cień i jasna ramka (nagłówek appki ma ten sam kolor co tło)
    pad = round(8 * k)
    frame = Image.new('RGB', (pw + 2 * pad, ph + 2 * pad), (214, 236, 225))
    fmask = Image.new('L', frame.size, 0)
    ImageDraw.Draw(fmask).rounded_rectangle([0, 0, frame.width, frame.height + radius * 2], radius=radius + pad, fill=255)
    canvas.paste(frame, (x - pad, top - pad), fmask)
    canvas.paste(shot, (x, top), mask)

    # podpis
    d = ImageDraw.Draw(canvas)
    f = font(round(112 * k))
    y = round(150 * k)
    for line in lines:
        d.text((W // 2, y), line, font=f, fill='white', anchor='ma')
        y += round(140 * k)
    return canvas


def header_asset():
    """Uniwersalny asset 16:9, 5244x2950 PNG – App Store Connect → Product Page Information → Header / Search Results.
    Jeden taki plik wystarcza na oba miejsca (Apple: „universal”). Treść trzymamy w środkowej części (przycięcie 21:9 / 3:2)."""
    W, H = 5244, 2950
    canvas = gradient(W, H)
    d = ImageDraw.Draw(canvas)
    icon = Image.open(ROOT / 'assets' / 'icon.png').convert('RGB').resize((420, 420), Image.LANCZOS)
    m = Image.new('L', icon.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, 420, 420], radius=95, fill=255)
    canvas.paste(icon, (330, 760), m)
    d.text((330, 1280), 'Uprzejmie', font=font(250), fill='white', anchor='la')
    d.text((330, 1540), 'Donoszę', font=font(250), fill='white', anchor='la')
    d.text((330, 1880), 'Zgłoś złe parkowanie w kilka chwil', font=ImageFont.truetype(FALLBACK, 90, index=0), fill=(200, 232, 218), anchor='la')
    pw, top, radius = 900, 1000, 80
    for i, name in enumerate(['dashboard', 'kategorie', 'odznaki']):
        shot = clean_status_bar(Image.open(SRC / f'{name}.jpg').convert('RGB'))
        ph = round(shot.height * pw / shot.width)
        shot = shot.resize((pw, ph), Image.LANCZOS)
        mask = Image.new('L', (pw, ph), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw, ph + radius * 2], radius=radius, fill=255)
        x = 2150 + i * 960
        y = top - (i % 2) * 0
        frame = Image.new('RGB', (pw + 16, ph + 16), (214, 236, 225))
        fm = Image.new('L', frame.size, 0)
        ImageDraw.Draw(fm).rounded_rectangle([0, 0, frame.width, frame.height + radius * 2], radius=radius + 8, fill=255)
        canvas.paste(frame, (x - 8, y - 8), fm)
        canvas.paste(shot, (x, y), mask)
    canvas.save(OUT / 'header-universal-5244x2950.png', 'PNG', optimize=True)
    print('OK header')


SITE = 'https://uprzejmiedonosze.net'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'


def render_home():
    """Renderuje hero strony głównej (bez przycisków i dalszych sekcji) do store/source/strona-glowna.png, 4500x2286 (1500 px @3x).
    Pobiera HTML i CSS ze strony, wycina skrypty (żeby nic nie przebudowało DOM-u) i robi zrzut Chrome headless.
    Uruchamiane z --home albo gdy pliku jeszcze nie ma."""
    get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30).read().decode('utf-8')
    html = get(SITE + '/')
    css_url = re.search(r'href="(/css/index3\.css[^"]*)"', html).group(1)
    css = get(SITE + css_url).replace('url(/', f'url({SITE}/').replace('url("/', f'url("{SITE}/')
    inject = (f'<base href="{SITE}/"><style>{css}</style><style>'
              '.mpr-cta-row,header,[data-role=header],footer,.mpr-section,nav,#cookie,.cookie{display:none!important}'
              '.mpr-layout>*:not(.mpr-article){display:none!important}body{margin:0}</style>')
    html = html.replace('<head>', '<head>' + inject, 1)
    html = html.replace('<link rel="stylesheet"', '<link media="none" rel="stylesheet"')
    html = re.sub(r'<script[^>]*src[^>]*></script>', '', html)
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / 'hero.html'
        page.write_text(html, encoding='utf-8')
        out = SRC / 'strona-glowna.png'
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=3',
                        '--window-size=1500,762', '--virtual-time-budget=15000', f'--screenshot={out}', page.as_uri()],
                       check=True, capture_output=True)
    print('OK strona-glowna.png', Image.open(out).size)


def hero_assets():
    """Creative assets wg szablonu Figmy (creative_assets-templates.fig): trzy ramki + strefy bezpieczne
    (odczytane z miniatury szablonu, ±35 px). Treść = zrzut strony głównej uprzejmiedonosze.net (store/source/strona-glowna.png).
    Ramka: (nazwa, rozmiar, strefa bezpieczna x0,y0,x1,y1, kadr zrzutu x0,y0,x1,y1)."""
    src = Image.open(SRC / 'strona-glowna.png').convert('RGB')
    # zrzut 4500x2286 (Chrome headless, 1500 px CSS @3x, bez przycisków). Treść wypełnia ramkę, ale mieści się
    # w przecięciu przycięć 21:9 i 3:2 uniwersalnego assetu (x 410–4835, y 350–2600) i obejmuje strefę bezpieczną szablonu.
    specs = [
        ('universal-5244x2950', (5244, 2950), (552, 423, 4692, 2526), (0, 0, 4500, 2286)),
        ('search-3840x2560', (3840, 2560), (120, 365, 3720, 2194), (0, 0, 4500, 2286)),
        ('header-3840x1646', (3840, 1646), (270, 207, 3570, 1439), (0, 120, 4500, 1800)),
    ]
    feather = 60
    for name, size, (sx0, sy0, sx1, sy1), crop in specs:
        # tło ramki = ten sam pionowy gradient co brzeg zrzutu (jasna zieleń → biel), żeby nie było szwu
        canvas = Image.new('RGB', size)
        cd = ImageDraw.Draw(canvas)
        k = (sy1 - sy0) / (crop[3] - crop[1])
        for y in range(size[1]):
            sy = min(max(round(crop[1] + (y - sy0) / k), 0), src.height - 1)
            cd.line([(0, y), (size[0], y)], fill=src.getpixel((3, sy)))
        piece = src.crop(crop).resize((sx1 - sx0, sy1 - sy0), Image.LANCZOS)
        mask = Image.new('L', piece.size, 255)
        md = ImageDraw.Draw(mask)
        for i in range(feather):  # miękkie krawędzie, żeby tło zrzutu zlało się z białym tłem ramki
            a = round(255 * i / feather)
            md.rectangle([i, i, piece.width - 1 - i, piece.height - 1 - i], outline=a)
        canvas.paste(piece, (sx0, sy0), mask)
        canvas.save(OUT / f'creative-{name}.png', 'PNG', optimize=True)
        print('OK', name)


def main():
    if '--home' in sys.argv or not (SRC / 'strona-glowna.png').exists():
        render_home()
    hero_assets()
    for label, size in SIZES.items():
        d = OUT / label
        d.mkdir(parents=True, exist_ok=True)
        for i, (name, lines) in enumerate(SHOTS, 1):
            img = compose(name, lines, size)
            assert img.mode == 'RGB' and img.size == size
            img.save(d / f'{i}-{name}.png', 'PNG', optimize=True)
            print('OK', d / f'{i}-{name}.png')
    icon = Image.open(ROOT / 'assets' / 'icon.png')
    assert icon.size == (1024, 1024) and icon.mode == 'RGB', 'ikona: 1024x1024, bez alfa'
    icon.save(OUT / 'app-icon-1024.png', 'PNG')
    print('OK ikona')


if __name__ == '__main__':
    main()

# BM-Win

Pakiet obliczeń statyczno-wytrzymałościowych konstrukcji budowlanych wg Eurokodów z polskimi Załącznikami krajowymi.
Działa w przeglądarce oraz jako program **BM-Win.exe** (Windows, offline).

## Uruchomienie

- **Windows:** pobierz `dist/BM-Win.exe` i uruchom. Program wymaga składnika *Microsoft Edge WebView2 Runtime*, który jest wbudowany w Windows 10/11.
- **Przeglądarka:** otwórz `app/index.html` (Chrome, Edge lub Firefox). Działa bez internetu.

Pliki projektów zapisywane są na dysku (`.bms` – Statyka, `.belka` – BelkaŻB, `.json` – ObciążeniaEC1). Ostatni stan każdego modułu jest też pamiętany automatycznie.

## Moduły

| Moduł | Zakres | Stan |
|---|---|---|
| **Statyka 2D / 3D** | MES prętowy: belki, ramy, kratownice, ramy przestrzenne, ruszty; przeguby, podpory sprężyste; analiza I i II rzędu (P-Δ), wyboczenie (α<sub>cr</sub>, długości wyboczeniowe), drgania własne; kombinacje PN-EN 1990 + ZK PL; raport PDF/ODT/HTML, DXF | ✅ etap 1 |
| Obciążenia EC1 | PN-EN 1991-1-1 … 1-5: ciężary, obciążenia użytkowe, śnieg, wiatr, temperatura | ✅ (program wzorcowy) |
| Belka żelbetowa | PN-EN 1992-1-1 (BelkaŻB) | ✅ (program wzorcowy) |
| Słup żelbetowy | PN-EN 1992-1-1 | etap 3 |
| Belki i słupy stalowe | PN-EN 1993-1-1 | etap 4 |
| Belki i słupy drewniane | PN-EN 1995-1-1 | etap 4 |
| Konstrukcje murowe | PN-EN 1996-1-1 / -3 | etap 5 |
| Geotechnika | PN-EN 1997-1: fundamenty bezpośrednie i palowe, skarpy i ich zbrojenie, ściany oporowe, ścianki szczelne i berlińskie, nasypy zbrojone | etap 6 |
| Model 3D budynku | płyty i ściany (elementy powłokowe), warstwy | etap 7 |

Szczegóły w [docs/PLAN.md](docs/PLAN.md).

## Budowa repozytorium

```
app/                 aplikacja (HTML/JS, bez zależności zewnętrznych)
  index.html         ekran startowy
  shared/            wspólne: styl (z BelkaŻB), materiały, przekroje, DXF/ODT, narzędzia
  statyka/           moduł Statyka: fem.js (silnik), view.js (rysunek), ui.js, report.js
  belkazb/           BelkaŻB
  obciazenia/        ObciążeniaEC1 (z bibliotekami PDF i fontami – offline)
desktop/             program okienkowy (Go + WebView2), wbudowuje folder app/
tools/build-exe.sh   budowa dist/BM-Win.exe
tests/               testy silnika (porównanie z rozwiązaniami analitycznymi)
wzorce/              kod odczytany z programów BelkaZB, ObciazeniaEC1, Rama2D (+ pliki .exe)
```

## Testy i budowa

```bash
npm test
```

```bash
tools/build-exe.sh
```

Testy porównują wyniki silnika MES z rozwiązaniami analitycznymi: belki (momenty, ugięcia), kratownica, wspornik 3D (zginanie dwukierunkowe, skręcanie), analiza II rzędu (rozwiązanie ścisłe wspornika), siła krytyczna Eulera, częstotliwości drgań belki, kombinacje 6.10a/b. Charakterystyki profili są porównywane z katalogami producentów (zgodność do ok. 1%).

Każde wypchnięcie na GitHub uruchamia testy i buduje `BM-Win.exe` (zakładka *Actions* → artefakt).

> Program wspomaga projektanta. Wyniki należy weryfikować, a wartości z baz danych porównać z aktualnymi wydaniami norm.

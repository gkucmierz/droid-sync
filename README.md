# 📱 droid-sync // Android Screenshot & Media Runner

[![Gitea](https://img.shields.io/badge/Gitea-Repository-blue?logo=gitea)](https://gitea.7u.pl/gkucmierz/droid-sync)
[![GitHub](https://img.shields.io/badge/GitHub-Mirror-black?logo=github)](https://github.com/gkucmierz/droid-sync)
[![Web UI](https://img.shields.io/badge/Web%20UI-droid--sync.7u.pl-22d3ee)](https://droid-sync.7u.pl)
[![Tech Blog](https://img.shields.io/badge/Tech%20Blog-tech.7u.pl-purple?logo=vitepress)](https://tech.7u.pl/posts/droid-sync-android-macos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Automatyczny konsolowy runner oraz interfejs webowy (Vue 3 / Vite) do bezobsługowej synchronizacji zrzutów ekranu i multimediów z telefonów z systemem Android na komputer macOS (domyślnie: `~/Documents/Droid Sync/`), działający po kablu USB lub lokalnym Wi-Fi (ADB over TCP/IP).

* **Główne repozytorium (Gitea)**: [https://gitea.7u.pl/gkucmierz/droid-sync](https://gitea.7u.pl/gkucmierz/droid-sync)
* **Mirror (GitHub)**: [https://github.com/gkucmierz/droid-sync](https://github.com/gkucmierz/droid-sync)
* **Instancja produkcyjna Web UI**: [https://droid-sync.7u.pl](https://droid-sync.7u.pl)
* **Artykuł & Historia projektu (Tech Blog)**: [https://tech.7u.pl/posts/droid-sync-android-macos](https://tech.7u.pl/posts/droid-sync-android-macos)

---

## 🎯 Architektura & Deterministyczne Porty (`dport`)

Zgodnie ze standardem ekosystemu `7u.pl`:
* **Serwer / Runner ADB (`droid-sync-server`)**: Port **`40880`** (`dport calc droid-sync-server`)
  * Lekki demon Node.js (ES Modules), bezpośrednio wywołujący binarkę `adb`.
  * Działa w tle, sprawdza telefon co ~2.5 sekundy, automatycznie pobiera nowe screeny i zdjęcia na dysk Maca.
  * Zapisuje pobrane pliki bez pytania przeglądarki o żadne zgody (100% natywny dostęp do systemu plików).
  * Obsługuje zdalny zrzut ekranu w locie (`adb exec-out screencap -p`).
  * Bezstratna rotacja zdjęć w locie (`sips`) z zachowaniem 100% jakości i metadanych EXIF.
  * Selektywne usuwanie plików z telefonu przez ADB z odświeżaniem Android MediaScanner.
* **Interfejs Webowy (`droid-sync`)**: Port **`49278`** (`dport calc droid-sync`)
  * Aplikacja Vue 3 + Vite w stylistyce dark cyber / glassmorphism (wsparcie trybu Dark i Light).
  * Podgląd statusu telefonu (poziom baterii, interaktywny modal telemetrii baterii, specyfikacja systemu Android, model, typ połączenia USB / Wi-Fi).
  * Przyciski szybkiej akcji: **Zrób zrzut (Remote Snap)**, **Synchronizuj teraz**, **Otwórz w Finderze**, **Szybkie Wi-Fi**, **Ustawienia**.
  * Dynamiczny pasek postępu synchronizacji na żywo (Sync Progress Card).
  * Inspektor metadanych EXIF dla zdjęć aparatu (aparat, obiektyw, czas naświetlania, ISO, przesłona, wymiary oraz współrzędne GPS z linkiem do Google Maps).
  * Przeglądarka z opcją bezstratnego obracania zdjęć (`sips`) i bezpośredniego zapisu na dysku Maca.
  * Wyszukiwanie z dynamicznym podświetlaniem pasujących fragmentów nazw plików (Search Match Highlighting).
  * Nowy panel Ustawień z 2 zakładkami (**Katalogi zapisu** i **Synchronizacja & ADB**) oraz bezpośrednim routingiem z karty telefonu.
  * Dedykowany, spójny wizualnie modal potwierdzenia usuwania (ConfirmModal) z obsługą klawisza ESC.
  * Galeria zsynchronizowanych multimediów z opcją kopiowania obrazka wprost do schowka macOS (`Copy to Clipboard`) i selektywnego usuwania z pamięci telefonu.
  * Ikony PWA ze strefami bezpieczeństwa (safe-zone maskable icons), idealnie dopasowane do kafelków macOS i Androida.

---

## 📂 Struktura katalogów na Macu (Parent Directory Architecture)

Pliki multimedialne są organizowane w przejrzysty, nadrzędny katalog główny na Macu:

```text
~/Documents/Droid Sync/
├── sync-history-screenshots.jsonl    # Historia synchronizacji zrzutów ekranu
├── sync-history-photos.jsonl         # Historia synchronizacji zdjęć z aparatu
├── screenshots/                      # 100% czysty katalog wyłącznie z plikami zrzutów
│   ├── Screenshot_20260906-020915.png
│   └── ...
└── photos/                           # 100% czysty katalog wyłącznie ze zdjęciami aparatu
    ├── PXL_20260903_101159904.jpg
    └── ...
```

* **Czyste foldery multimediów**: Wewnątrz `screenshots/` oraz `photos/` znajdują się wyłącznie Twoje zdjęcia i zrzuty (żadne pliki techniczne nie zanieczyszczają folderów z mediami).
* **Jawna historia (`hideJsonlFiles: false`)**: Domyślnie pliki historii synchronizacji są widoczne bezpośrednio w folderze nadrzędnym `~/Documents/Droid Sync/`. Zaawansowany użytkownik może w każdej chwili otworzyć plik, skasować pojedynczy wpis lub usunąć plik w Finderze, co serwer natychmiast wykrywa i automatycznie od nowa synchronizuje brakujące multimedia.
* **Ukrywanie plików**: Jeśli wolisz ukryć pliki historii, włącz opcję `"hideJsonlFiles": true` w ustawieniach — serwer automatycznie przemianuje je na ukryte pliki z kropką (`.sync-history-*.jsonl`).

---

## 🛠️ Instrukcja przygotowania telefonu z Androidem

Aby komputer Mac mógł komunikować się z telefonem przez protokół ADB, musisz jednorazowo włączyć **Opcje programisty** i **Debugowanie USB**.

### Krok 1: Włączenie Opcji Programisty (Developer Options)
1. Wejdź na telefonie w **Ustawienia** (*Settings*).
2. Zjedź na sam dół i wybierz **Informacje o telefonie** (*About phone*) $\rightarrow$ **Informacje o oprogramowaniu** (*Software information*).
3. Odszukaj pole **Numer kompilacji** (*Build number*).
4. Kliknij w **Numer kompilacji 7 razy z rzędu**.
5. Telefon poprosi o podanie kodu blokady ekranu (PIN lub wzór) i wyświetli napis: *"Jesteś teraz programistą!"*.

### Krok 2: Włączenie Debugowania USB (USB Debugging)
1. Wróć do głównego menu **Ustawień**.
2. Na samym dole pojawi się nowa zakładka: **Opcje programisty** (*Developer options*).
3. Wejdź w nią i włącz przełącznik: **Debugowanie USB** (*USB debugging*).
4. *(Opcjonalnie dla Wi-Fi)*: Jeśli chcesz łączyć się bez kabla, włącz też **Bezprzewodowe debugowanie** (*Wireless debugging*).

### Krok 3: Podłączenie do Maca i Autoryzacja Klucza RSA
1. Podłącz telefon kablem USB do Maca (upewnij się, że kabel przesyła dane).
2. **Odblokuj ekran telefonu**.
3. Na ekranie telefonu pojawi się okno dialogowe:
   > *"Zezwalać na debugowanie USB z tego komputera?"* (Fingerprint klucza RSA).
4. Zaznacz pole: **"Zawsze zezwalaj z tego komputera"** i kliknij **Zezwól**.
5. W terminalu Maca możesz sprawdzić połączenie:
   ```bash
   adb devices -l
   ```
   Powinieneś zobaczyć swój telefon ze statusem `device` (np. `R58M... device`).

---

## 📶 Przełączenie na Wi-Fi (ADB over TCP/IP)

Nie musisz trzymać telefonu na kablu! `droid-sync` wspiera **automatyczne przełączenie 1-klik**:
1. Podłącz telefon kablem USB na chwilę.
2. Otwórz **Ustawienia** w aplikacji i kliknij **"✨ Połącz przez Wi-Fi (1-klik)"**.
   * Serwer automatycznie wykryje lokalny adres IP telefonu w sieci WLAN (`ip addr show wlan0`), przełączy port ADB TCP/IP na `5555` i nawiąże połączenie.
3. Odłącz kabel USB – telefon jest w pełni zsynchronizowany bezprzewodowo!

*(Dla zaawansowanych dostępny jest także tryb ręczny z wpisaniem własnego IP).*

---

## 🔄 Dual Git Push (Gitea + GitHub)

Projekt jest utrzymywany w modelu podwójnego mirrorowania. Jeśli pracujesz nad kodem lokalnie, skonfiguruj pojedyncze polecenie `git push`, aby wypychało commity jednocześnie do instancji Gitea oraz GitHub:

```bash
# Sklonuj z Gitea lub zainicjalizuj:
git remote add origin git@gitea.7u.pl:gkucmierz/droid-sync.git

# Skonfiguruj podwójny cel push:
git remote set-url --add --push origin git@gitea.7u.pl:gkucmierz/droid-sync.git
git remote set-url --add --push origin git@github.com:gkucmierz/droid-sync.git

# Teraz jedno polecenie aktualizuje oba serwery:
git push -u origin main
```

---

## 🚀 Uruchomienie

### Szybki start (z katalogu głównego):

1. **Instalacja wszystkich zależności:**
   ```bash
   npm install
   ```

2. **Uruchomienie wszystkiego na raz (Server + UI równolegle):**
   ```bash
   npm run dev
   ```
   *Podobnie jak w lolu, odpala jednocześnie serwer runnera (w kolorze magenta) oraz interfejs webowy (w kolorze cyan).*

3. **Uruchomienie SAMEGO serwera (np. gdy korzystasz z UI na `droid-sync.7u.pl`):**
   ```bash
   npm run server
   ```
   *Odpala lekki demon ADB na `http://127.0.0.1:40880`, gotowy do przyjmowania poleceń z webowej instancji aplikacji.*

4. **Uruchomienie samego UI:**
   ```bash
   npm run ui
   ```

---

## ⚙️ Dwuwarstwowa Konfiguracja (`config.default.json` vs `config.json`)

`droid-sync` stosuje bezpieczną dla gita hierarchię konfiguracyjną:
1. **`server/config.default.json`** – kanoniczny, śledzony w repozytorium plik zawierający bezpieczne ustawienia domyślne.
2. **`server/config.json`** – lokalny plik zignorowany w `.gitignore`, zawierający indywidualne ustawienia użytkownika o wyższym priorytecie.
Każda modyfikacja zapisana w panelu *Ustawienia* w aplikacji trafia wyłącznie do `config.json`, dzięki czemu lokalna konfiguracja nie zanieczyszcza statusu Gita!

Przykładowa zawartość `server/config.default.json`:

```json
{
  "destinationDir": "~/Documents/Droid Sync",
  "screenshotsPath": "./screenshots",
  "photosPath": "./photos",
  "hideJsonlFiles": false,
  "phoneScreenshotsDirs": [
    "/sdcard/Pictures/Screenshots",
    "/sdcard/DCIM/Screenshots"
  ],
  "phoneCameraDirs": [
    "/sdcard/DCIM/Camera",
    "/sdcard/DCIM/100ANDRO"
  ],
  "syncScreenshots": true,
  "syncCamera": true,
  "pollIntervalMs": 2500,
  "autoDeleteFromPhone": false,
  "autoDeleteScreenshots": false,
  "autoDeleteCamera": false,
  "wifiIp": "",
  "wifiPort": 5555,
  "notifyOnMac": true
}
```

* `destinationDir`: Główny nadrzędny folder na Twoim Macu (symbol `~` jest automatycznie rozwijany).
* `screenshotsPath`: Ścieżka podfolderu dla screenshotów (względna do folderu głównego lub bezwzględna).
* `photosPath`: Ścieżka podfolderu dla zdjęć z aparatu.
* `hideJsonlFiles`: Gdy `false`, pliki `sync-history-*.jsonl` są widoczne w Finderze (łatwe zarządzanie). Gdy `true`, są plikami ukrytymi (`.sync-history-*.jsonl`).
* `syncScreenshots` / `syncCamera`: Niezależne przełączniki włączające synchronizację danej kategorii multimediów.
* `autoDeleteScreenshots` / `autoDeleteCamera`: Gdy ustawione na `true`, pliki danej kategorii po pomyślnym pobraniu na Maca są usuwane z telefonu, oszczędzając pamięć urządzenia.
* `pollIntervalMs`: Częstotliwość sprawdzania telefonu w milisekundach (domyślnie 2500ms = 2.5s).
* `notifyOnMac`: Systemowe powiadomienia macOS (`display notification`) po pobraniu nowych zrzutów i zdjęć.

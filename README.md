# 📱 droid-sync // Android Screenshot & Media Runner

[![Gitea](https://img.shields.io/badge/Gitea-Repository-blue?logo=gitea)](https://gitea.7u.pl/gkucmierz/droid-sync)
[![GitHub](https://img.shields.io/badge/GitHub-Mirror-black?logo=github)](https://github.com/gkucmierz/droid-sync)
[![Web UI](https://img.shields.io/badge/Web%20UI-droid--sync.7u.pl-22d3ee)](https://droid-sync.7u.pl)
[![Tech Blog](https://img.shields.io/badge/Tech%20Blog-tech.7u.pl-purple?logo=vitepress)](https://tech.7u.pl/posts/droid-sync-android-macos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Automatyczny konsolowy runner oraz interfejs webowy (Vue 3 / Vite) do bezobsługowej synchronizacji zrzutów ekranu i multimediów z telefonów z systemem Android na komputer macOS (domyślnie: `~/Documents/AndroidScreenshots/`), działający po kablu USB lub lokalnym Wi-Fi (ADB over TCP/IP).

* **Główne repozytorium (Gitea)**: [https://gitea.7u.pl/gkucmierz/droid-sync](https://gitea.7u.pl/gkucmierz/droid-sync)
* **Mirror (GitHub)**: [https://github.com/gkucmierz/droid-sync](https://github.com/gkucmierz/droid-sync)
* **Instancja produkcyjna Web UI**: [https://droid-sync.7u.pl](https://droid-sync.7u.pl)
* **Artykuł & Historia projektu (Tech Blog)**: [https://tech.7u.pl/posts/droid-sync-android-macos](https://tech.7u.pl/posts/droid-sync-android-macos)

---

## 🎯 Architektura & Deterministyczne Porty (`dport`)

Zgodnie ze standardem ekosystemu `7u.pl`:
* **Serwer / Runner ADB (`droid-sync-server`)**: Port **`40880`** (`dport calc droid-sync-server`)
  * Lekki demon Node.js (ES Modules), bezpośrednio wywołujący binarkę `adb`.
  * Działa w tle, sprawdza telefon co ~2.5 sekundy, automatycznie zrzuca nowe screeny na dysk Maca.
  * Zapisuje pobrane pliki bez pytania przeglądarki o żadne zgody (100% natywny dostęp do systemu plików).
  * Obsługuje zdalny zrzut ekranu w locie (`adb exec-out screencap -p`).
* **Interfejs Webowy (`droid-sync`)**: Port **`49278`** (`dport calc droid-sync`)
  * Aplikacja Vue 3 + Vite w stylistyce dark glassmorphism.
  * Podgląd statusu telefonu (poziom baterii, model, typ połączenia USB / Wi-Fi).
  * Przyciski szybkiej akcji: **Zrób zrzut (Remote Snap)**, **Synchronizuj teraz**, **Otwórz w Finderze**.
  * Galeria zsynchronizowanych zrzutów z opcją kopiowania obrazka wprost do schowka macOS (`Copy to Clipboard`).

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

## ⚙️ Konfiguracja (`server/config.json`)

Możesz dostosować zachowanie runnera w pliku `server/config.json` lub bezpośrednio w panelu *Ustawienia* w aplikacji webowej:

```json
{
  "destinationDir": "~/Documents/AndroidScreenshots",
  "phoneScreenshotsDirs": [
    "/sdcard/Pictures/Screenshots",
    "/sdcard/DCIM/Screenshots"
  ],
  "pollIntervalMs": 2500,
  "autoDeleteFromPhone": false,
  "wifiIp": "",
  "wifiPort": 5555,
  "notifyOnMac": true
}
```

* `destinationDir`: Ścieżka docelowa na Twoim Macu (symbol `~` jest automatycznie rozwijany).
* `pollIntervalMs`: Częstotliwość sprawdzania telefonu w milisekundach (domyślnie 2500ms = 2.5s).
* `autoDeleteFromPhone`: Gdy ustawione na `true`, plik po pomyślnym zrzuceniu na Maca jest usuwany z telefonu, oszczędzając pamięć urządzenia.
* `notifyOnMac`: Systemowe powiadomienia macOS (`display notification`) po pobraniu nowych zrzutów.

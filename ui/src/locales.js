import { ref, computed, watch } from 'vue';

const STORAGE_KEY = 'droid_sync_lang';
const defaultLang = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)
  ? localStorage.getItem(STORAGE_KEY)
  : (typeof navigator !== 'undefined' && navigator.language && navigator.language.startsWith('pl') ? 'pl' : 'en');

export const currentLang = ref(defaultLang);

if (typeof window !== 'undefined') {
  watch(currentLang, (val) => {
    try {
      localStorage.setItem(STORAGE_KEY, val);
      document.documentElement.lang = val;
    } catch {
      // Ignore storage errors
    }
  }, { immediate: true });
}

export const locales = {
  pl: {
    appTitle: 'droid-sync',
    appSubtitle: 'Automatyczny runner & synchronizacja screenshotów z Androida na macOS',
    runnerPort: (port) => `RUNNER: PORT ${port}`,
    runnerDisconnected: 'RUNNER ROZŁĄCZONY',

    // Quick Actions
    actionSnap: 'Zrób zrzut (Snap)',
    actionSnapping: 'Zrzucanie ekranu...',
    actionSync: 'Synchronizuj teraz',
    actionSyncing: 'Synchronizacja...',
    actionFinder: 'Otwórz w Finderze',
    actionWifi: 'Połącz przez Wi-Fi',
    actionSettings: 'Ustawienia',

    // Device Card
    noDevice: 'Brak podłączonego telefonu',
    runnerOffline: 'Runner rozłączony',
    connectPrompt: 'Podłącz telefon kablem USB lub przez Wi-Fi',
    startRunnerPrompt: 'Uruchom runnera: npm run server',
    statusConnected: 'POŁĄCZONO',
    statusUnauthorized: 'NIEAUTORYZOWANY',
    statusWaiting: 'OCZEKIWANIE',
    statusNoRunner: 'BRAK RUNNERA',
    unauthorizedWarning: 'Telefon wymaga autoryzacji! Odblokuj ekran telefonu i kliknij "Zezwalaj na debugowanie USB".',
    batteryLabel: 'Bateria',
    charging: '(Ładowanie)',
    systemLabel: 'System',
    destinationLabel: 'Folder zapisu (Mac)',
    lastSyncLabel: 'Ostatni sync',
    noSyncYet: 'Brak (oczekiwanie)',

    // Gallery View
    galleryTitle: 'Pobrane Zrzuty Ekranu',
    screenshotsCount: (n) => `${n} ${n === 1 ? 'zrzut' : (n >= 2 && n <= 4 ? 'zrzuty' : 'zrzutów')}`,
    searchPlaceholder: 'Filtruj po nazwie pliku...',
    btnZoom: 'Powiększ',
    btnCopy: 'Kopiuj do schowka macOS',
    btnDownload: 'Pobierz plik',
    emptyTitle: 'Brak zrzutów ekranu',
    emptyDesc: 'Wykonaj zrzut ekranu na telefonie (Power + VolDown) lub kliknij "Zrób zrzut (Snap)", aby natychmiast zapisać ekran w folderze na Macu.',
    modalCopy: 'Kopiuj do schowka',
    modalDownload: 'Pobierz',

    // Settings Modal
    settingsTitle: 'Ustawienia i Konfiguracja ADB',
    destDirLabel: 'Folder zapisu zrzutów na Macu:',
    destDirHint: 'Ścieżka na Twoim Macu. Znak ~ zostanie automatycznie rozwinięty do Twojego folderu domowego.',
    intervalLabel: 'Interwał sprawdzania telefonu:',
    intervalUnit: 'sekund',
    intervalHint: 'Częstotliwość, z jaką daemon sprawdza obecność nowych screenshotów na telefonie (np. 2.5s).',
    autoDeleteLabel: 'Usuwaj z telefonu po pomyślnym pobraniu',
    autoDeleteHint: 'Oszczędza pamięć w telefonie — pliki po zrzuceniu na dysk Maca zostaną usunięte z pamięci telefonu.',
    wirelessTitle: 'Konfiguracja ADB over Wi-Fi (Bezprzewodowo)',
    wirelessDesc: 'Aby odpiąć kabel i synchronizować telefon bezprzewodowo, oba urządzenia muszą być w tej samej sieci Wi-Fi.',
    
    // Auto Wireless ADB (1-Click)
    autoWifiTitle: '✨ Automatyczne przełączenie na Wi-Fi (1-klik)',
    autoWifiDesc: 'Gdy telefon jest podłączony kablem USB, runner sam odczyta jego adres IP z sieci Wi-Fi i skonfiguruje połączenie bezprzewodowe bez szukania IP w telefonie!',
    detectedIpLabel: 'Wykryty adres IP telefonu:',
    detectedIpSearching: 'Wykrywanie adresu IP telefonu...',
    detectedIpNotFound: 'Nie wykryto IP (upewnij się, że telefon ma włączone Wi-Fi)',
    btnAutoConnect: 'Przełącz na Wi-Fi automatycznie',
    btnAutoConnecting: 'Konfigurowanie Wi-Fi...',
    autoConnectSuccess: (ip, port) => `Połączono bezprzewodowo z ${ip}:${port}! Możesz teraz odpiąć kabel USB.`,
    manualSectionTitle: 'Ręczne wprowadzanie IP (opcjonalne / zapasowe)',

    step1Title: 'Krok 1',
    step1Text: 'Przełącz telefon (podłączony po kablu) w tryb nasłuchu Wi-Fi:',
    step1Btn: (port) => `Aktywuj TCP/IP (port ${port})`,
    step2Title: 'Krok 2',
    step2Text: 'Wpisz IP telefonu (z menu Ustawienia -> Wi-Fi w telefonie):',
    step2Plh: 'np. 192.168.1.150',
    btnConnect: 'Połącz',
    btnCancel: 'Anuluj',
    btnSave: 'Zapisz Ustawienia',

    // Offline Runner Banner (for droid-sync.7u.pl and public instances)
    offlineTitle: 'Lokalny serwer runnera jest wyłączony',
    offlineDesc: 'Aplikacja webowa w chmurze potrzebuje uruchomionego lokalnego procesu runnera na Twoim Macu/PC, aby komunikować się z telefonem przez ADB (kabel USB lub Wi-Fi).',
    offlineListeningNotice: 'Wyszukiwanie serwera: aplikacja automatycznie wykryje start runnera na porcie 40880.',
    offlineCloneTitle: 'Jak uruchomić runnera na swoim komputerze:',
    tabGithub: 'GitHub (OSS)',
    tabGitea: 'Gitea',
    tabAlreadyCloned: 'Mam już pobrane repozytorium',
    offlineHttpsNotice: 'Wskazówka: Jeśli przeglądarka blokuje połączenie z localhost przez HTTPS, możesz otworzyć wersję HTTP:',
    openHttpBtn: 'Otwórz przez HTTP',
    btnCopyCmd: 'Kopiuj komendę',
    copiedCmd: 'Skopiowano!',

    // Toasts & Error Keys (Rule 3.8)
    errNoUsbDevice: 'Brak autoryzowanego telefonu podłączonego kablem USB.',
    errNoWifiIpFound: 'Nie wykryto adresu IP w sieci Wi-Fi. Upewnij się, że telefon ma włączone Wi-Fi i jest w tej samej sieci co Mac!',
    errTcpipFailed: 'Nie udało się włączyć trybu TCP/IP na telefonie.',
    errWifiConnectFailed: 'Nie udało się połączyć przez Wi-Fi. Upewnij się, że oba urządzenia są w tej samej sieci.',
    toastSyncSuccess: (n) => `Pobrano ${n} nowych zrzutów ekranu!`,
    toastSyncNone: 'Wszystkie zrzuty ekranu są już zsynchronizowane.',
    toastSyncError: 'Błąd synchronizacji',
    toastSnapSuccess: (f) => `Zrobiono zrzut ekranu: ${f}`,
    toastSnapError: 'Nie udało się wykonać zrzutu ekranu.',
    toastFinderSuccess: 'Otwarto folder zrzutów w Finderze',
    toastFinderError: 'Nie udało się otworzyć folderu w Finderze',
    toastConfigSaved: 'Zapisano konfigurację',
    toastConfigError: (msg) => `Błąd zapisu: ${msg}`,
    toastTcpipSuccess: (port) => `Aktywowano TCP/IP na porcie ${port}. Możesz odpiąć kabel!`,
    toastTcpipError: 'Nie udało się aktywować trybu bezprzewodowego.',
    toastWifiSuccess: (ip, port) => `Połączono z telefonem bezprzewodowo: ${ip}:${port}`,
    toastWifiError: 'Błąd łączenia przez Wi-Fi.',
    toastClipboardSuccess: 'Obrazek skopiowany do schowka macOS!',
    toastClipboardError: 'Nie udało się skopiować do schowka (wymagane HTTPS lub localhost).',
    toastConnError: (msg) => `Błąd połączenia: ${msg}`
  },

  en: {
    appTitle: 'droid-sync',
    appSubtitle: 'Automated Android to macOS screenshot & media runner daemon',
    runnerPort: (port) => `RUNNER: PORT ${port}`,
    runnerDisconnected: 'RUNNER DISCONNECTED',

    // Quick Actions
    actionSnap: 'Take Screenshot (Snap)',
    actionSnapping: 'Capturing screen...',
    actionSync: 'Sync Now',
    actionSyncing: 'Syncing...',
    actionFinder: 'Open in Finder',
    actionWifi: 'Connect over Wi-Fi',
    actionSettings: 'Settings',

    // Device Card
    noDevice: 'No phone connected',
    runnerOffline: 'Runner disconnected',
    connectPrompt: 'Connect phone via USB cable or over Wi-Fi',
    startRunnerPrompt: 'Start runner: npm run server',
    statusConnected: 'CONNECTED',
    statusUnauthorized: 'UNAUTHORIZED',
    statusWaiting: 'WAITING',
    statusNoRunner: 'NO RUNNER',
    unauthorizedWarning: 'Phone requires authorization! Unlock your screen and tap "Always allow USB debugging".',
    batteryLabel: 'Battery',
    charging: '(Charging)',
    systemLabel: 'OS Version',
    destinationLabel: 'Destination (Mac)',
    lastSyncLabel: 'Last Sync',
    noSyncYet: 'None yet (waiting)',

    // Gallery View
    galleryTitle: 'Synced Screenshots',
    screenshotsCount: (n) => `${n} screenshot${n === 1 ? '' : 's'}`,
    searchPlaceholder: 'Filter by filename...',
    btnZoom: 'Zoom',
    btnCopy: 'Copy to macOS clipboard',
    btnDownload: 'Download file',
    emptyTitle: 'No screenshots yet',
    emptyDesc: 'Capture a screenshot on your phone (Power + VolDown) or click "Take Screenshot (Snap)" to instantly save it to your Mac.',
    modalCopy: 'Copy to clipboard',
    modalDownload: 'Download',

    // Settings Modal
    settingsTitle: 'ADB Runner & Sync Settings',
    destDirLabel: 'Destination folder on Mac:',
    destDirHint: 'Local directory on your Mac. The ~ symbol will expand to your home folder automatically.',
    intervalLabel: 'Polling check interval:',
    intervalUnit: 'seconds',
    intervalHint: 'Frequency at which daemon queries phone for newly captured screenshots (e.g. 2.5s).',
    autoDeleteLabel: 'Delete from phone after successful sync',
    autoDeleteHint: 'Saves phone storage — files are removed from phone after being copied to local Mac disk.',
    wirelessTitle: 'ADB over Wi-Fi Configuration (Wireless)',
    wirelessDesc: 'To disconnect the USB cable and sync wirelessly, both devices must be on the same Wi-Fi network.',
    
    // Auto Wireless ADB (1-Click)
    autoWifiTitle: '✨ 1-Click Auto Switch to Wi-Fi',
    autoWifiDesc: 'When phone is connected via USB cable, the runner automatically reads its local Wi-Fi IP and configures wireless ADB — no manual lookup needed!',
    detectedIpLabel: 'Detected phone Wi-Fi IP:',
    detectedIpSearching: 'Discovering phone IP address...',
    detectedIpNotFound: 'No Wi-Fi IP found (make sure phone is connected to Wi-Fi)',
    btnAutoConnect: 'Switch to Wi-Fi automatically',
    btnAutoConnecting: 'Setting up Wi-Fi...',
    autoConnectSuccess: (ip, port) => `Wirelessly connected to ${ip}:${port}! You can now unplug the USB cable.`,
    manualSectionTitle: 'Manual IP Configuration (optional / fallback)',

    step1Title: 'Step 1',
    step1Text: 'Switch phone (connected via USB cable) into Wi-Fi listening mode:',
    step1Btn: (port) => `Activate TCP/IP (port ${port})`,
    step2Title: 'Step 2',
    step2Text: 'Enter phone IP address (found in phone Settings -> Wi-Fi):',
    step2Plh: 'e.g. 192.168.1.150',
    btnConnect: 'Connect',
    btnCancel: 'Cancel',
    btnSave: 'Save Settings',

    // Offline Runner Banner (for droid-sync.7u.pl and public instances)
    offlineTitle: 'Local Runner Daemon is Offline',
    offlineDesc: 'The cloud web application requires a local runner daemon running on your Mac/PC to communicate with your phone via ADB (USB cable or Wi-Fi).',
    offlineListeningNotice: 'Auto-detecting: app will connect automatically once runner is started on port 40880.',
    offlineCloneTitle: 'How to start the runner on your computer:',
    tabGithub: 'GitHub (OSS)',
    tabGitea: 'Gitea',
    tabAlreadyCloned: 'Already have repository',
    offlineHttpsNotice: 'Tip: If browser blocks localhost loopback connection over HTTPS, open the HTTP version:',
    openHttpBtn: 'Open via HTTP',
    btnCopyCmd: 'Copy command',
    copiedCmd: 'Copied!',

    // Toasts & Error Keys (Rule 3.8)
    errNoUsbDevice: 'No authorized phone connected via USB cable.',
    errNoWifiIpFound: 'Could not detect phone Wi-Fi IP. Ensure your phone is connected to Wi-Fi and on the same network as your Mac!',
    errTcpipFailed: 'Failed to restart ADB in TCP/IP mode.',
    errWifiConnectFailed: 'Failed to connect over Wi-Fi. Ensure your Mac and phone are on the same local network.',
    toastSyncSuccess: (n) => `Downloaded ${n} new screenshot${n === 1 ? '' : 's'}!`,
    toastSyncNone: 'All screenshots are already up to date.',
    toastSyncError: 'Sync error',
    toastSnapSuccess: (f) => `Screenshot captured: ${f}`,
    toastSnapError: 'Failed to capture screenshot.',
    toastFinderSuccess: 'Opened screenshots folder in Finder',
    toastFinderError: 'Failed to open folder in Finder',
    toastConfigSaved: 'Settings saved successfully',
    toastConfigError: (msg) => `Save error: ${msg}`,
    toastTcpipSuccess: (port) => `Activated TCP/IP on port ${port}. You can now unplug the cable!`,
    toastTcpipError: 'Failed to activate wireless mode.',
    toastWifiSuccess: (ip, port) => `Connected to phone wirelessly: ${ip}:${port}`,
    toastWifiError: 'Failed to connect over Wi-Fi.',
    toastClipboardSuccess: 'Image copied to macOS clipboard!',
    toastClipboardError: 'Failed to copy to clipboard (requires HTTPS or localhost).',
    toastConnError: (msg) => `Connection error: ${msg}`
  }
};

export function useI18n() {
  const t = computed(() => locales[currentLang.value] || locales.pl);
  const toggleLang = () => {
    currentLang.value = currentLang.value === 'pl' ? 'en' : 'pl';
  };
  const setLang = (lang) => {
    if (locales[lang]) {
      currentLang.value = lang;
    }
  };

  return {
    currentLang,
    t,
    toggleLang,
    setLang
  };
}

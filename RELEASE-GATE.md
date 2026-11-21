# FITNESS LAB · Browserprüfung auf der Testbranch

## Ausführung

Bei jedem Push auf `test/evolution-ci-meilenstein` installiert GitHub Actions die im Lockfile festgelegten Abhängigkeiten und Chromium. Der Runner startet die App auf einem lokalen HTTP-Server und führt die statischen Prüfungen und Playwright aus. Der Job hat ausschließlich Leserechte am Repository. Der HTML-Bericht und Fehlerbelege sind sieben Tage als Actions-Artefakt verfügbar.

Für einen lokalen Lauf im Repository:

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:static
npm run test:browser
```

## Geprüfte Szenarien

Jeder Test verwendet isolierten Browserspeicher. Die Neuinstallation startet ohne Bestand. Für die Tests mit Bestand wird ein künstliches Profil angelegt. Beim QA5-Upgrade schreibt die per SHA-256 geprüfte Original-App die Testdaten selbst. Service Worker sind nur bei diesem Codewechsel gezielt blockiert, um die Datenmigration unabhängig vom Worker-Update zu prüfen.

Die parallelen Speichertests kontrollieren nach jeder Runde alle bislang bestätigten Einträge mit Mengen und IDs in IndexedDB. Weitere Fälle prüfen korrekte und beschädigte Altdaten, Export und Import, vier mobile Breiten, die Tagesübersicht und die Wochenansicht während eines Trainings.

## Bekannter Befund am 21.11.2026

Beim ersten Aufruf mit leerem Speicher verwirft die Sicherungsprüfung das noch leere Altersfeld. Der Browser zeigt „Sicheres Laden fehlgeschlagen“, und der Neuinstallationstest schlägt fehl. Die App-Dateien entsprechen dem gelieferten Paket. Ein vollständiges Update einer bereits installierten PWA einschließlich Service-Worker-Wechsel ist ein eigener, noch offener Prüffall.

# FITNESS LAB · Browserprüfung auf der Testbranch

## Ausführung

Bei jedem Push auf `test/evolution-ci-meilenstein` installiert GitHub Actions die im Lockfile festgelegten Abhängigkeiten und Chromium. Der Runner startet die App auf einem lokalen HTTP-Server und führt die statischen Prüfungen und Playwright aus. Der Job hat ausschließlich Leserechte am Repository. Der HTML-Bericht, das JUnit-Protokoll und Fehlerbelege sind sieben Tage als Actions-Artefakt verfügbar.

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

## Änderungen und Fehlerbehebung

Entwicklungsaufträge starten mit einem Checkout von `test/evolution-ci-meilenstein`. Ein Commit und Push auf diese Branch lösen die Prüfung automatisch aus. Der Codex-GitHub-Zugriff kann auch Git-Objekte anlegen und die Branch per Fast-Forward aktualisieren. Ein zusätzlicher ZIP-Transfer ist dafür unnötig. Bei einer abgelehnten Aktualisierung zuerst den aktuellen Branch-Stand abrufen und die Änderungen mit ihm abgleichen.

Fehlerdetails stehen im Actions-Job und im Artefakt `fitlab-browser-evidence`. Die Layoutprüfung nennt bei einem Überlauf Viewport, Ansicht und auffällige Elemente. Playwright wiederholt Assertions nur innerhalb ihrer Wartezeit. Fehlgeschlagene Tests erhalten keine automatischen Wiederholungsversuche, damit insbesondere intermittierende Speicherfehler sichtbar bleiben. Bei einem belegten Runner- oder Downloadfehler kann derselbe Commit über GitHub Actions kontrolliert erneut geprüft werden. Korrekturen an Code und Tests werden als eigene, überprüfbare Commits auf der Testbranch ausgeführt. Die CI hat Leserechte und führt keine Änderungen oder Deployments aus.

## Grenzen

Die Browser-Suite prüft Chromium, einschließlich simulierter mobiler Viewports. Ein vollständiges Update einer bereits installierten PWA einschließlich Service-Worker-Wechsel ist ein eigener, noch offener Prüffall.

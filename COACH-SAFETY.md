# FITNESS LAB Evolution 2.3 · Grenzen des persönlichen Coachs

## Welche Entscheidung trifft die App?

Das Tagebuch bleibt zur Dokumentation verfügbar. Die App verordnet keine Diät und diagnostiziert weder Unterernährung noch REDs. Eine Bestätigung im Tagebuch bedeutet, dass der Nutzer die Dokumentation als vollständig ansieht. Sie belegt keine tatsächliche Energieaufnahme und ersetzt keine Anamnese. Ein fehlender Tag zählt niemals als Nullzufuhr.

| Signal | Reaktion | Grundlage und Grenze |
|---|---|---|
| Unvollständiges Profil, medizinischer Vorbehalt, Alter außerhalb 20–100, widersprüchliche automatische Ziele | Persönliche Zielberechnung und neuer Trainingsimpuls pausieren. Profil öffnen. | Begrenzter Anwendungsbereich der App. Die Altersgrenze 20 orientiert sich am Erwachsenen-BMI der CDC. |
| BMI unter 18,5 oder unter 20 zusammen mit Abnahmewunsch, manueller Absenkung oder rechnerischem Defizit | Kein Abnehmziel. Eingaben prüfen und individuelle fachliche Beratung empfehlen. | 18,5 ist eine Screeninggrenze. Der Puffer bis 20 ist eine konservative Produktentscheidung, keine medizinische Kategorie. BMI beschreibt weder Körperzusammensetzung noch individuelle Gesundheit. |
| Berechnetes Defizitziel bis einschließlich 1.200 kcal | Keine automatische Ausgabe dieses Defizitziels. | NICE ordnet entsprechende Diäten fachlich begleiteten Interventionen zu. 1.200 kcal sind keine allgemeine sichere Untergrenze. Die App rundet ein abgewiesenes Ziel nicht auf diesen Wert auf. |
| Heute und sieben Vortage, ein plausibler bestätigter Tag unter 800 kcal oder mindestens drei bestätigte Tage unter 50 % ihrer jeweiligen belegten Ziele | Betroffenen Tag öffnen, Vollständigkeit und Mengen prüfen. Bei zutreffenden Angaben fachliche Unterstützung empfehlen. Defizitziele, Trainingsstarts, neue Sätze und Steigerungsimpulse pausieren. Bereits dokumentierte Sätze bleiben prüfbar und abschließbar. | Produktregeln zur Prüfung auffälliger Protokolle. Relative Grenze und Zeitfenster sind keine klinischen Schwellen. Ohne verlässliche Daten zur Trainingsenergie und fettfreien Masse wird keine Energieverfügbarkeit berechnet. |
| Physiologisch widersprüchliche Einträge | Betroffenen Tag öffnen. Aus Zielquoten und Empfehlungen ausschließen. | Vorhandene kcal-/Makro-Plausibilitätsprüfung. Unsichere Angaben sind kein Nachweis geringer Zufuhr. |
| Schlechte Erholung oder mindestens sechs dokumentierte Trainingstage und 600 Minuten binnen sieben Tagen | Belastung prüfen, weitere Trainingsstarts zurückstellen. | Konservative Planungsregel. Die App kann individuelles Übertraining weder feststellen noch ausschließen. |
| Einzelner auffälliger Gewichtswert | Messung mit Datum zur Bearbeitung öffnen. Rohdaten bleiben im Tagebuch. | Fenster heute plus 14 Vortage, mindestens fünf andere Messungen. Abweichung vom Median größer als das Maximum aus 3 kg, 5 % und vier medianen absoluten Abweichungen. Produktheuristik, kein physiologischer Grenzwert. |

## Rechenweg und Testanker

Die bestehende Mifflin-St.-Jeor-Schätzung verwendet Gewicht, Größe, Alter und Rechenmerkmal. Die App ergänzt ein Aktivitätsmodell, Trainingsart, Belastung, Zielwahl und manuelle Anpassung. Das sind Schätzwerte. Protein, Fett und Kohlenhydrate bleiben für geeignete Profile dynamisch. Die Schutzentscheidung liegt zwischen Berechnung und Anzeige. Historische Zielbelege werden beim erneuten Auswerten nicht umgeschrieben.

* Weibliches synthetisches Profil, 55 Jahre, 48 kg, 160 cm, keine Trainingstage, Ziel Abnahme. BMI 18,75. Keine Ausgabe des früheren Ziels von 1.100 kcal.
* Männliches synthetisches Aufbauprofil, 38 Jahre, 80 kg, 180 cm, sitzend, viermal 60 Minuten Krafttraining, mittlere Intensität. Referenz 2.550 kcal, 144 g Protein, 309 g Kohlenhydrate, 82 g Fett.
* Fünf bestätigte Tage mit 325 kcal und 10 g Protein. Vorrang der Datenprüfung auch bei gutem Check-in am Plantag. Dieselben unbestätigten Einträge allein rechtfertigen keine Aussage über die Tageszufuhr.
* Dreizehn Werte bei 80 kg, ein Wert bei 95 kg. Der Originalwert bleibt gespeichert. Beide Wochenmediane liegen bei 80 kg. Erst eine ausdrückliche Korrektur ändert den Check-in.

Drei geeignete Gewichtswerte pro Woche erlauben einen deskriptiven Medianvergleich. Der vertiefte Vergleich verlangt mindestens vier je Woche. Ein höherer Bestsatz bei gleicher Übung und gleicher Wiederholungszahl ist ein Einzelvergleich. Messbedingungen, Technik und Tagesform bleiben mögliche Einflussgrößen.

## Quellen

* [CDC · Adult BMI Categories](https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html)
* [NICE NG246 · Physical activity and diet, Empfehlungen 1.16.8–12](https://www.nice.org.uk/guidance/ng246/chapter/Physical-activity-and-diet)
* [IOC · 2023 consensus statement on REDs](https://bjsm.bmj.com/content/57/17/1073)
* [NHS England · How to record your weight](https://www.england.nhs.uk/long-read/how-to-record-your-weight/)
* [Mifflin et al. · A new predictive equation for resting energy expenditure in healthy individuals](https://pubmed.ncbi.nlm.nih.gov/2305711/)

Diese Quellen begründen fachliche Vorsicht. Sie validieren die konkret gewählten Softwarefilter, Zeitfenster und Makroformeln nicht klinisch. Schwangerschaft, Stillzeit, Essstörungen, Erkrankungen, Medikamente und individuelle Energiebedürfnisse lassen sich aus Tagebuchdaten nicht zuverlässig erkennen. Bei besonderem Bedarf im Profil den medizinischen Vorbehalt setzen und Ziele individuell klären.

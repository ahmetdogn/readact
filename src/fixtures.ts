// Fictional test letters. Every name, number and address is invented.
import { SAMPLE_LETTER } from './sample.ts';

export interface Fixture {
  name: string;
  text: string;
  mustBeGone: string[];
  mustStay: string[];
}

export const FIXTURES: Fixture[] = [
  {
    name: 'Tax office (sample)',
    text: SAMPLE_LETTER,
    mustBeGone: [
      'Mehmet Yilmaz',
      'Yilmaz',
      'Mehmet',
      'Lindenstraße 42',
      '10969 Berlin',
      '34/567/89012',
      '12 345 678 901',
      'DE89 3704 0044 0532 0130 00',
      'poststelle@fa-mitte.example',
      '030 1234 5678',
    ],
    mustStay: [
      'Steuernummer:',
      'Identifikationsnummer:',
      'Finanzamt Berlin-Mitte',
      '1.284,00 EUR',
      '21.12.2026',
      '18.11.2026',
      '§ 4 Abs. 5',
      'Einspruch',
    ],
  },
  {
    name: 'Job centre',
    text: `Jobcenter Duisburg
Wilhelmstraße 6, 47051 Duisburg

Ayşe Demir
Kaiserstraße 118
47057 Duisburg

BG-Nummer: 33201//0045678
Kundennummer: 334D178903
Datum: 10.11.2026

Aufhebungs- und Erstattungsbescheid

Sehr geehrte Frau Demir,

die Entscheidung vom 03.06.2026 über die Bewilligung von Bürgergeld wird für die Zeit vom 01.07.2026 bis 31.08.2026 teilweise aufgehoben.
Mitglieder der Bedarfsgemeinschaft: Ayşe Demir, Emir Demir, Elif Demir
Grund: Ihr Sohn Emir hat Einkommen aus einer Ausbildung erzielt, das nicht mitgeteilt wurde.
Für diesen Zeitraum ist eine Überzahlung von 612,40 EUR entstanden, die Sie gemäß § 50 SGB X zu erstatten haben.

Gegen diesen Bescheid können Sie innerhalb eines Monats nach Bekanntgabe Widerspruch erheben.

Ihre Ansprechpartnerin: Frau Krüger, Tel. 0203 55 12 349`,
    mustBeGone: [
      'Ayşe Demir',
      'Demir',
      'Ayşe',
      'Emir',
      'Elif',
      'Kaiserstraße 118',
      '47057 Duisburg',
      '33201//0045678',
      '334D178903',
      '0203 55 12 349',
      'Krüger',
    ],
    mustStay: ['Jobcenter Duisburg', '612,40 EUR', '§ 50 SGB X', 'Widerspruch', '01.07.2026', 'Bürgergeld'],
  },
  {
    name: 'Health insurance',
    text: `Gesundheitskasse Nordost
Postfach 1234, 14402 Potsdam

Frau
Olena Kovalenko
Am Kanal 7
14467 Potsdam

Versichertennummer: K482910374
Geburtsdatum: 14.02.1979

Ihr Antrag auf Kostenübernahme einer Rehabilitationsmaßnahme

Sehr geehrte Frau Kovalenko,

Ihren Antrag vom 02.10.2026 haben wir geprüft. Diagnose: Chronische Depression mit Angststörung (ICD-10 F33.1)
Nach Prüfung durch den Medizinischen Dienst lehnen wir die beantragte stationäre Rehabilitation ab, da ambulante Maßnahmen noch nicht ausgeschöpft sind.

Sie können innerhalb eines Monats nach Bekanntgabe Widerspruch einlegen.`,
    mustBeGone: [
      'Olena Kovalenko',
      'Kovalenko',
      'Olena',
      'Am Kanal 7',
      '14467 Potsdam',
      'K482910374',
      '14.02.1979',
      'Chronische Depression mit Angststörung',
      'F33.1',
    ],
    mustStay: ['Gesundheitskasse Nordost', 'Rehabilitation', 'Widerspruch', '02.10.2026', 'Medizinischen Dienst'],
  },
  {
    name: 'Debt collector',
    text: `Inkasso Beispiel GmbH · Hafenweg 3 · 20457 Hamburg

Herrn Piotr Nowak
Rosenweg 12a
22769 Hamburg

Unser Zeichen: INK-2026-448812
Ihre Rechnungsnummer: R-77120

LETZTE MAHNUNG vor gerichtlichem Mahnverfahren

Sehr geehrter Herr Nowak,

trotz unserer Schreiben haben Sie die Forderung unserer Mandantin Muster Fitness GmbH aus dem Vertrag vom 01.01.2025 nicht beglichen.
Hauptforderung: 239,70 EUR
Inkassokosten: 87,50 EUR
Gesamt: 327,20 EUR

Bitte überweisen Sie den Betrag bis spätestens 05.12.2026 auf unser Konto DE34 2005 0550 1234 5678 90.
Erreichbar: piotr.nowak@mail.example, Mobil +49 171 2345678`,
    mustBeGone: [
      'Piotr Nowak',
      'Nowak',
      'Piotr',
      'Rosenweg 12a',
      '22769 Hamburg',
      'INK-2026-448812',
      'R-77120',
      'piotr.nowak@mail.example',
      '+49 171 2345678',
    ],
    mustStay: [
      'Inkasso Beispiel GmbH',
      '327,20 EUR',
      '87,50 EUR',
      '05.12.2026',
      'Muster Fitness GmbH',
      'Mahnverfahren',
    ],
  },
  {
    name: 'Landlord',
    text: `Hausverwaltung Sonnig & Partner
Bergstraße 40, 69120 Heidelberg

Familie Nguyen
Thi Lan Nguyen und Van Minh Nguyen
Gartenstraße 9, Whg. 3.2
69115 Heidelberg

Mieterhöhungsverlangen gemäß § 558 BGB

Liebe Familie Nguyen,

hiermit bitten wir Sie, einer Erhöhung der Nettokaltmiete von 780,00 EUR auf 850,00 EUR ab dem 01.02.2027 zuzustimmen.
Die ortsübliche Vergleichsmiete laut Mietspiegel 2026 liegt bei 11,80 EUR/m².
Bitte teilen Sie uns Ihre Zustimmung bis zum 31.01.2027 mit.

Mit freundlichen Grüßen
Jürgen Sonnig`,
    mustBeGone: [
      'Thi Lan Nguyen',
      'Van Minh Nguyen',
      'Nguyen',
      'Thi Lan',
      'Van Minh',
      'Gartenstraße 9',
      'Whg. 3.2',
      '69115 Heidelberg',
    ],
    mustStay: ['§ 558 BGB', '780,00 EUR', '850,00 EUR', '01.02.2027', '31.01.2027', 'Mietspiegel'],
  },
];

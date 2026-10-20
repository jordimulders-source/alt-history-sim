# PLAN – Alternatieve-geschiedenissimulator (start 1444)

Een simulatie die de wereld van 1444 realistisch neerzet en daarna eeuwenlang
zelf geschiedenis maakt. Jij kijkt toe en leest wat er gebeurt.

## Uitgangspunten
- **Hele wereld op de kaart**, maar het detail loopt van groot naar klein:
  Europa, het Midden-Oosten en Noord-Afrika krijgen de fijnste provincies en
  echte heersers met hun eigen eigenschappen. De rest van de wereld doet vanaf
  het begin mee, met grovere provincies en (waar Wikidata het niet weet)
  simpelere startgegevens. Zo kun je later bijschaven zonder iets om te bouwen.
- **Ongeveer 2000 provincies** in totaal (±800 in Europa/MO/NA).
- **Twee kaartstijlen, schakelbaar:** "oude atlas" (perkament, reliëfschaduw,
  sierlijke namen) en "politiek" (egale kleuren, scherpe grenzen).
- **Tijdlijn 1444–2026.** Eerst wordt 1444–1800 goed gemaakt, daarna komt de
  moderne tijd erbij (M8).
- **Seeds:** dezelfde seed geeft precies dezelfde tijdlijn. Een andere seed
  geeft een andere geschiedenis.
- **Geen AI tijdens de simulatie.** De kronieken komen pas na afloop en
  voorlopig uit tekstsjablonen. De Claude API komt erbij zodra er een sleutel is.

## Techniek (kort uitgelegd)
| Onderdeel | Keuze | Waarom |
|---|---|---|
| Simulatie | JavaScript, draait in de browser | Live kijken, pauzeren en ingrijpen zonder installatie (ook op de telefoon) |
| Kaart voorbereiden | Python (numpy, shapely, rasterio) | Eén keer de open data omzetten naar provincies en basiskaarten |
| Webpagina | `web/index.html`, canvas | Dubbelklikken om te openen, geen server nodig |
| Instellingen | `config.yaml` | Parameters aanpassen zonder in de code te zitten |
| Uitvoer zonder browser | `node cli/run.js` → `runs/seed_1234/` | Tijdlijnen naast elkaar vergelijken |
| Taal | Teksten in de simulatie in het Engels, documentatie in het Nederlands | Jordi's keuze |

## Invloed van de kijker
- Elke tijdlijn = seed + instellingen + lijst van ingrepen. Zonder seed kies je een willekeurige.
- Ingrijpen (vanaf M1): een heerser laten sterven, een erfgenaam laten geboren worden. Later: plagen,
  huwelijken, provincies overdragen, uitvindingen verplaatsen.
- "Wat als…": een ingreep in een eerder jaar herschrijft de tijdlijn vanaf dat jaar; vergelijken van
  twee tijdlijnen komt in M9.

## Open data (licentie per bron controleren vóór gebruik)
- **Grenzen 1444:** Cliopatria (Seshat, historische staatsgrenzen als GeoJSON),
  aangevuld met historical-basemaps (aourednik).
- **Kust, rivieren, meren:** Natural Earth (publiek domein).
- **Terrein:** hoogtedata (ETOPO) + Natural Earth-landbedekking → vlakte,
  heuvels, bergen, bos, moeras, woestijn, steppe.
- **Heersers en dynastieën:** met de hand samengesteld (`data/curated/rulers_1444.yaml`), omdat
  Wikidata vanuit de bouwomgeving niet bereikbaar is; later controleren tegen Wikidata.
- **Bevolking, cultuur, religie:** historische schattingen per regio
  (literatuur, plus HYDE-bevolkingsdata), met de hand ingedeeld in een
  bewerkbaar bestand.
- Niets uit commerciële games.

## Mijlpalen

### M1 – Startkaart + 100 jaar sterfte en opvolging ✅
- Data downloaden en de wereld in provincies verdelen (langs rivieren en
  bergkammen), met terrein, grondstof, bevolking, cultuur en religie.
- Staten van 1444 met hun eigen heerser, dynastie en eigenschappen (bijv.
  Murad II, Karel VII, Hendrik VI, Filips de Goede).
- Kaart tekenen en als PNG exporteren (beide stijlen).
- Simulatie per maand: veroudering, sterfte (naar leeftijd en eigenschappen),
  geboorte van kinderen, opvolging (per staat een opvolgingswet).
- Gebeurtenissenlog (`events.jsonl`) en een eenvoudige heerserslijst per staat.
- **Klaar als:** `web/index.html` toont de kaart van 1444 en 100 jaar vorsten; `node cli/run.js --seed 42`
  geeft hetzelfde zonder browser.

### M2 – Dynastieën en huwelijken ✅
- Huwelijken tussen dynastieën, erfaanspraken, personele unies, regentschap,
  opvolgingscrises (meerdere eisers → kans op burgeroorlog in M4).
- Stamboom per dynastie (als afbeelding/HTML).

### M3 – Diplomatie ✅
- Relaties (−100…+100), allianties, rivaliteiten, vazallen, garanties.
- Historische spanningen bij de start (Frankrijk–Engeland, Ottomanen–Byzantium,
  Bourgondië, Polen–Litouwen–Duitse Orde), met vrije uitkomsten.

### M4 – Oorlog ✅
- Oorlogsdoelen (claim, opvolging, religie, onafhankelijkheid), legers per
  provincie, bewegen, veldslagen (terrein, aanvoerder, tech), belegeringen.
- Vrede met provincie-overdrachten → **dan begint de kaart echt te bewegen.**

### M5 – Economie en bevolking ✅
- Belasting, productie, handelsroutes, groei, plagen, hongersnood.

### M6 – Cultuur en religie
- Verspreiding, bekering, opstanden, afsplitsingen en nieuwe staten.

### M7 – Technologie, tijdperken en grote ontwikkelingen
- Boekdrukkunst, kerkscheuring/Reformatie, ontdekkingsreizen,
  kruitrevolutie, enz. als **kansen met voorwaarden**: eerder, later, elders of
  nooit. Kolonisatie van andere continenten volgt hieruit.
- Instelbaar hoe "historisch" het verloopt (`historicity` in de config).

### M8 – De moderne tijd (±1800–2026)
- Industrialisatie (stoom, spoor, elektriciteit) als kans, net als de
  ontwikkelingen in M7: kan in Engeland beginnen, of in Bohemen, of nergens.
- Nationalisme, revoluties en nieuwe staatsvormen (republieken, grondwetten,
  ideologieën), eenwordingen en uiteenvallen van rijken.
- Grootschalige oorlogen en bondgenootschapsblokken, dekolonisatie.
- Bevolkingsgroei en verstedelijking (de bevolking groeit na 1800 enorm,
  dat moet de economie aankunnen).
- Dit is het moeilijkste tijdperk om geloofwaardig te krijgen; eerst moet
  1444–1800 goed lopen.

### M9 – De webpagina
- Kaart per jaar met schuifbalk en timelapse, wisselen tussen atlas- en
  politieke stijl, inzoomen.
- Klik op een staat → geschiedenis, heerserslijst, grenzen door de tijd.
- Klik op een personage → levensloop, stamboom.
- Twee seeds naast elkaar vergelijken.
- Een eerste, simpele kaartviewer komt al in M1/M2, zodat je vanaf het begin
  iets te zien hebt.

### M10 – Geschiedschrijving
- Eerst met sjablonen: kronieken per decennium, namen voor oorlogen,
  bijnamen voor heersers op basis van wat ze deden ("de Wrede", "de Gezegende").
- Later via de Claude API: per decennium een samenvatting van het log naar het
  model, dat een kroniek en "alternatieve Wikipedia"-pagina's schrijft. Alleen
  samenvattingen gaan naar het model, zodat het goedkoop blijft.

## Config (voorbeeld)
```yaml
seed: 42
start_year: 1444
end_year: 2026
tick: month
war_frequency: 1.0      # 0 = vredig, 2 = oorlogszuchtig
plague_chance: 1.0
historicity: 0.6        # 0 = alles vrij, 1 = volgt de echte geschiedenis nauw
detail_regions: [europe, middle_east, north_africa]
```

## Werkwijze
- Na elke mijlpaal een korte uitleg in `README.md` (wat het nu kan, hoe je
  het draait).
- Kleine stappen, elke stap getest met een vaste seed.

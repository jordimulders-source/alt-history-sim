# Atlas of Other Histories

Een simulator voor alternatieve geschiedenis, geïnspireerd op Europa Universalis. De wereld begint
realistisch op 1 januari 1444 (echte grenzen, staten, heersers en hun families) en schrijft daarna
haar eigen geschiedenis. Je speelt niet mee: je kijkt toe, leest de kroniek en grijpt eventueel in.

Zie [PLAN.md](PLAN.md) voor alle mijlpalen. De teksten in de simulatie zelf zijn Engels.

## Bekijken

Open `web/index.html` in een browser (dubbelklikken werkt). Alles draait in de browser; er is geen
server of installatie nodig.

- **Sleep** om de kaart te verschuiven, **scroll** of **knijp** om te zoomen.
- **Atlas / Political** wisselt tussen de oude perkamentkaart en de strakke politieke kaart.
- **Realms / Cultures / Faiths** kleurt de kaart naar rijk, cultuur of geloof.
- **Save image** bewaart de huidige kaart als PNG (alleen als de pagina via een lokale server draait:
  `python3 -m http.server --directory web` en dan http://localhost:8000). Een reeks kaarten in één keer:
  `python3 tools/export_maps.py --seed 42 --years 1444 1494 1544 --style atlas political`.
- **Schuifbalk** onderaan: kies een jaar. **▶** speelt de geschiedenis af als timelapse
  (pijltjestoetsen en spatie werken ook). De streepjes op de balk zijn opvolgingscrises en personele unies.
- **Klik op een land** voor de heerser, de lijst van vorsten en de kroniek van dat land.
  Klik op een naam voor het personage: ouders, kinderen, stamboom en levensloop.
- **Chronicle** opent de wereldkroniek per decennium.
- **Timeline #1444** (linksboven): kies een andere *seed*. Dezelfde seed geeft altijd dezelfde
  geschiedenis; een andere seed een andere.
- **Ingrijpen:** bij een heerser kun je "Strike down" (laten sterven) of "Grant an heir" kiezen. De
  tijdlijn wordt vanaf dat jaar opnieuw geschreven; de ingreep wordt bewaard, zodat ook die tijdlijn
  herhaalbaar is.

## Zonder browser draaien

```
node cli/run.js --seed 42 --years 100
```

Schrijft `runs/seed_42/` met `events.jsonl` (alle gebeurtenissen), `rulers.json` (vorsten per staat)
en `chronicle.txt` (de belangrijkste gebeurtenissen).

## Instellingen

`config.yaml` bevat de knoppen van de simulatie (sterfte, vruchtbaarheid, hoe vaak gekozen kronen bij
de oude dynastie blijven, …). Na een wijziging: `python3 tools/build_world.py` en de pagina herladen.

## De wereld opnieuw bouwen

Alleen nodig als je de kaartdata of de bestanden in `data/curated/` aanpast.

```
pip install numpy scipy pillow shapely rasterio pyyaml
python3 tools/fetch_data.py          # downloadt de open data naar data/raw/ (±450 MB)
python3 tools/build_world.py all     # bouwt web/data/ (±5 minuten; 'all' maakt ook de basiskaarten)
```

## Hoe het werkt (kort)

- **Kaart:** de grenzen van 1444 komen uit Cliopatria, de kust uit Natural Earth. Te grove gebieden
  (het Heilige Roomse Rijk, de Kalmarunie, Ierland, …) zijn met de hand opgesplitst in
  `data/curated/states.yaml`. Elk land is in provincies verdeeld (±2700 wereldwijd, kleiner in Europa
  en het Midden-Oosten) met terrein, bevolking, cultuur en religie.
- **Culturen en geloof:** 286 culturen en 24 religies, elk met namenlijsten en adelshuizen
  (`data/curated/cultures.yaml`, gegenereerd uit de tabellen in `tools/cultures/`).
- **Personages:** de heersers van 1444 en hun families staan in `data/curated/rulers_1444.yaml`.
  Alles daarna verzint de simulatie: geboorte, huwelijk, ziekte, dood.
- **Opvolging** volgt per land de echte regels: Salische wet (Frankrijk), voorkeur voor zonen
  (Engeland, Castilië), gekozen koningen (Polen, Bohemen, Hongarije, Scandinavië), open opvolging met
  broedermoord (Ottomanen), senioriteit (khanaten), verkiezing voor het leven (Venetië, de paus).
  Zonder erfgenaam volgt een opvolgingscrisis; erft iemand een tweede kroon, dan ontstaat een
  personele unie.
- **Seeds:** alle toeval loopt via één generator met een seed, dus seed + instellingen + ingrepen
  bepalen de hele tijdlijn.

## Mijlpalen

### Mijlpaal 1: de wereld van 1444 en een eeuw van vorsten (klaar)
De startkaart in twee stijlen, ±170 staten met hun echte heersers, en 100 jaar sterfte, geboorte,
huwelijken en opvolging, met kroniek, vorstenlijsten, stambomen en ingrepen. Grenzen veranderen nog
niet: dat komt met oorlog (mijlpaal 4).

Bekende beperkingen: provincienamen komen van moderne plaatsnamen (een aantal is teruggezet naar de
naam van rond 1444; buiten Europa staan soms dorpsnamen); de Nieuwe Wereld en Afrika ten zuiden van de
Sahara zijn grof.

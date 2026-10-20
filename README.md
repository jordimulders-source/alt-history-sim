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
- **House of …** (bij een heerser of personage) opent de stamboom van dat vorstenhuis: wie regeerde
  (♛, omrand in de kleur van het rijk), met wie ze trouwden, en wie er in het gekozen jaar op de troon zat.
- In het landenpaneel: de **erfgenaam** in het gekozen jaar, **troonpretendenten** (met de sterkte van hun
  aanspraak) en met welke rijken het vorstenhuis is **ingetrouwd**.
- **Gestreepte landen** op de kaart zijn vazallen of zitten in een personele unie: de strepen hebben de
  kleur van de leenheer of van het grootste rijk van dezelfde vorst.
- **Oorlog op de kaart:** grenzen veranderen per jaar; bezet gebied is kruislings gearceerd in de kleur van
  de bezetter, en ⚔ markeert de veldslagen van het gekozen jaar (in de kleur van de winnaar). In het
  landenpaneel staan lopende oorlogen (met een balkje voor de oorlogsscore) en gevoerde oorlogen; klik op
  een oorlog voor partijen, doel, uitkomst, gebiedsoverdrachten, het verloop van de oorlogsscore en alle
  veldslagen. De donkere streepjes op de tijdbalk zijn oorlogen tussen grote rijken.
- **Economy** (kaartlaag): hoe dichtbevolkt het land is (licht = leeg, donker = dicht), de grote
  handelsroutes van 1444 (gestippeld als een oorlog ze afknijpt) met hun handelscentra, en de provincies
  waar dat jaar de pest heerst (rood gearceerd). Het landenpaneel toont bevolking (met verloop sinds
  1444), inkomsten, schatkist, handelsgoederen en handelscentra.
- **Diplomacy** (kaartlaag): zonder selectie zie je de bondgenootschappen, elk in de kleur van het sterkste
  lid. Klik op een land voor zijn betrekkingen: lijnen naar bondgenoten (blauw), rivalen (rood) en vazallen
  (paars), de andere landen gekleurd van vijandig (oranje) tot bevriend (groen).
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
huwelijken en opvolging, met kroniek, vorstenlijsten, stambomen en ingrepen. 

### Mijlpaal 2: vorstenhuizen, huwelijkspolitiek en opvolgingscrises (klaar)
- **Vorstenhuizen** krijgen prestige door de kronen die ze dragen (groter rijk = meer prestige).
- **Huwelijken** worden gearrangeerd: kroonprinsen en vorsten trouwen bij voorkeur in grote huizen en
  grote rijken in de buurt, van hetzelfde geloof; een oud bondgenootschap wordt makkelijker hernieuwd.
  Elk koninklijk huwelijk legt een band tussen twee rijken (later belangrijk voor diplomatie).
- **Troonaanspraken:** wie bij een opvolging gepasseerd wordt (vrouwelijke lijn onder de Salische wet,
  verliezers van een verkiezing, Ottomaanse broers, afgezette vorsten) houdt een aanspraak, die één keer
  op een kind kan overgaan.
- **Opvolgingscrises en opstanden:** een sterke, ambitieuze pretendent kan in opstand komen tegen een
  zwakke vorst of een kindkoning, met winst of verlies (de echte oorlog volgt in mijlpaal 4). Regenten
  kunnen de troon grijpen; bastaarden kunnen gewettigd worden als de lijn uitsterft.
- **Personele unies** worden bijgehouden en uiteengehaald als de kronen bij de dood van de vorst andere
  erfgenamen krijgen.
- Nieuwe instellingen in `config.yaml`: `claim_risings`, `regent_coups`, `bastards`.

### Mijlpaal 3: diplomatie (klaar)
- **Startsituatie 1444** in `data/curated/diplomacy_1444.yaml`: de Auld Alliance, het Verdrag van Windsor,
  de kruistocht van Varna, de Franse leenmannen, de Ottomaanse schatplichtigen, rivaliteiten als
  Frankrijk–Engeland, Polen–Duitse Orde en Moskou–Novgorod, en de oorlogen die in 1444 woeden (die
  gebruik ik vanaf mijlpaal 4).
- **Mening** tussen rijken (−100 tot +100): geloof (vooral tussen buren), cultuur, een gedeelde grens,
  koninklijke huwelijken, hetzelfde vorstenhuis, de karakters van de vorsten, troonaanspraken op elkaars
  kroon, en herinneringen aan wat er gebeurde (die langzaam vervagen).
- **Rivaliteiten:** een rijk kiest tot drie rivalen van vergelijkbare kracht binnen bereik, en laat ze los
  als de verhoudingen veranderen.
- **Bondgenootschappen:** de vijand van mijn vijand is mijn vriend; het aantal hangt af van het
  diplomatieke talent van de vorst. Ze vallen uiteen als de verhoudingen verslechteren.
- **Vazallen** willen vrij zijn als ze een ander geloof of andere cultuur hebben, sterk zijn of hun
  leenheer zwak is; kleine bedreigde rijken zoeken bescherming bij een machtige buur.
- Kronen in personele unie volgen de buitenlandse politiek van het grootste rijk.

### Mijlpaal 4: oorlog (klaar)
- **Aanleidingen:** een troonaanspraak van de vorst ("War of the … Succession"), verovering van een rivaal
  of een gehate, zwakkere buur (bij voorkeur land met de eigen cultuur), heilige oorlogen tussen geloven
  (vooral onder vurige vorsten), en onafhankelijkheidsoorlogen van vazallen. Een vorst begint alleen als de
  kansen goed lijken; ambitieuze en krijgshaftige vorsten zijn vaker oorlogszuchtig.
- **Bondgenoten en vazallen** worden opgeroepen; wie een bondgenoot laat zitten, verliest diens vriendschap.
- **Legers** hangen af van bevolking en het militaire talent van de vorst (steppevolken hebben ruiters).
  Rijken ver van het front sturen minder.
- **Veldslagen** met terrein (bergen en moerassen helpen de verdediger) en aanvoerders; **belegeringen**
  duren maanden, hoofdsteden langer. Oversteken over smalle zeeën kan (het Kanaal, Otranto, ...).
- **Oorlogsscore** uit veldslagen en bezet land; **vrede** met gebiedsoverdracht, een troonswissel,
  onafhankelijkheid, of vazalschap. Daarna een bestand. Een rijk zonder land verdwijnt; zijn laatste vorst
  houdt een aanspraak.
- **1444:** de kruistocht van Varna, de Milanese oorlog, het beleg van Rhodos, Skanderbeg en Kazan
  tegen Moskou lopen al bij de start.
- Nieuwe instellingen: `war_frequency` en `army_size`.

### Mijlpaal 5: economie, bevolking, handel, pest en hongersnood (klaar)
- **Handelsgoederen** per provincie (`data/curated/trade.yaml`): beroemde producten op hun plek (Vlaams
  laken, Muranoglas, zilver uit Kutná Hora, koper uit Falun, Bordeauxwijn, specerijen van de Molukken,
  goud uit Mali, ...), de rest volgens terrein en klimaat.
- **Bevolking** groeit elk jaar (sneller op vruchtbaar land, trager waar het al vol is) en lijdt onder
  oorlog, hongersnood en pest.
- **Geld:** belasting (bevolking × prijs van de goederen × bestuurstalent van de vorst) en **handel**: negen
  grote routes (de Specerijenroute, de Zijderoute, de Hanzeroute, de Saharaanse goudroute, ...) leveren
  inkomsten aan wie de handelscentra bezit; oorlog langs een route knijpt de handel af. Legers kosten geld,
  in oorlog het dubbele; een schatkist diep in de schuld leidt tot **bankroet**, en dan smelten de
  legers weg.
- **Pest** breekt meestal uit in een drukke haven en verspreidt zich naar buurprovincies en langs de
  handelsroutes; wie het overleeft is een tijd immuun. **Hongersnood** treft af en toe een rijk, vaker in
  oorlogstijd.
- Nieuwe instellingen: `growth`, `plague_chance`, `plague_severity`, `famine`.

Bekende beperkingen: provincienamen komen van moderne plaatsnamen (een aantal is teruggezet naar de
naam van rond 1444; buiten Europa staan soms dorpsnamen); de Nieuwe Wereld en Afrika ten zuiden van de
Sahara zijn grof.

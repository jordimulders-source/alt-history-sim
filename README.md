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
- **Cultures / Faiths** veranderen nu per jaar: onder vreemde heersers bekeren provincies zich en nemen ze
  langzaam de cultuur van de kroon over. ⚑ markeert opstanden van het gekozen jaar (donkerrood: een volk dat
  zich wil afscheiden). Het landenpaneel toont welke volken en geloven in het rijk wonen.
- **Progress** (kaartlaag): hoe ver elk rijk is in bestuur en wapens, vergeleken met het meest
  ontwikkelde rijk van dat jaar, met in de legenda waar en wanneer de grote uitvindingen gedaan zijn.
  Onder het jaartal staat het **tijdperk** (The Age of Discovery, The Age of Reformation, ...).
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
en `chronicle.txt` (de belangrijkste gebeurtenissen), plus `summary.json` (wereldbevolking per halve eeuw,
de grootste rijken aan het eind en waar de grote uitvindingen begonnen).

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

### Mijlpaal 6: cultuur en religie (klaar)
- **Bekering:** provincies nemen langzaam het geloof van hun vorst aan, sneller onder vrome of vurige
  vorsten, dicht bij de hoofdstad en bij volken van dezelfde cultuur; heidense gebieden het snelst, een
  ander geloof (christendom ↔ islam) het langzaamst.
- **Assimilatie:** provincies nemen de cultuur van de kroon over, binnen dezelfde cultuurgroep veel sneller
  dan daarbuiten, en pas als de verovering wat langer geleden is.
- **Onrust** door een ander geloof, een andere cultuur, recente verovering, oorlog, bankroet en pest, en
  minder onder een bekwame vorst.
- **Opstanden:** onrustige boeren komen in opstand (meestal neergeslagen); een heel volk kan zich losmaken.
  Dan ontstaat een **nieuwe staat** (genoemd naar zijn hoofdstad), of **herrijst een verdwenen rijk**, met
  een levende troonpretendent als leider als die er is. Daarop volgt een onafhankelijkheidsoorlog: wint
  de oude heer, dan wordt de opstand neergeslagen en gaat het land terug.
- De simulatie draait nu in stukjes met een voortgangsbalk, zodat de pagina niet vastloopt.
- Nieuwe instellingen: `conversion`, `assimilation`, `unrest`, `revolts`.

### Mijlpaal 7: technologie, tijdperken en de grote ontwikkelingen (klaar)
- **Kennis en wapens** groeien met welvaart en bekwame vorsten, en waaien over grenzen naar achterlopende
  buren. Wie verder is, wint vaker veldslagen; met kanonnen vallen burchten sneller; beter bestuur levert
  meer belasting op.
- **Mogelijkheden, geen vaste gebeurtenissen:** de **boekdrukkunst** en **buskruitartillerie** ontstaan
  ergens als de tijd rijp is en verspreiden zich naar buren en langs handelsroutes. Een **Reformatie** kan
  uitbreken waar al gedrukt wordt, ver van Rome; het protestantisme verspreidt zich onder katholieken en
  vorsten kunnen breken met Rome (hebzuchtige en ambitieuze sneller, vrome zelden). Later kan een
  strengere gereformeerde stroming ontstaan.
- **Ontdekkingsreizen:** zeemachten aan de Atlantische kust varen langs Afrika, kunnen de **zeeweg naar
  Indië** vinden (een nieuwe handelsroute die de oude specerijenroute uitholt) en de **Nieuwe Wereld**.
  Daarna volgen **koloniën**: eerst kusten, het binnenland pas na enkele generaties; in Afrika en Azië
  alleen handelsposten. Oude-Wereldziekten treffen de inheemse bevolking naast de kolonisten.
- **historicity** in `config.yaml` (0 tot 1) trekt dit alles naar de plaatsen en jaartallen van onze
  geschiedenis (Mainz, Lissabon, Wittenberg) of laat het helemaal vrij.
- Nieuwe instellingen: `historicity`, `tech_speed`, `reformation`, `exploration`, `colonization`.

Bekende beperkingen: provincienamen komen van moderne plaatsnamen (een aantal is teruggezet naar de
naam van rond 1444; buiten Europa staan soms dorpsnamen); de Nieuwe Wereld en Afrika ten zuiden van de
Sahara zijn grof.

### Mijlpaal 8: de moderne tijd, tot 2026 (klaar)
- **De hele geschiedenis tot 2026.** De pagina schrijft eerst de eerste eeuw (een paar seconden) en
  laat je dan al kijken; de rest wordt op de achtergrond verder geschreven. Het nog onbeschreven deel van
  de tijdlijn is gearceerd, en afspelen wacht vanzelf als het de pen inhaalt. Een hele tijdlijn kost in
  de browser ongeveer een halve minuut.
- **Industrie, geneeskunde en revolutie** zijn net als de boekdrukkunst mogelijkheden, geen vaste data:
  ze ontstaan ergens waar de tijd rijp is (in tijdlijn #1444 begon de stoommachine bijvoorbeeld in
  Mongolië) en waaien uit naar buren en handelspartners. Industrie maakt legers groter en rijker, de
  geneeskunde laat mensen (ook vorsten) langer leven en de bevolking groeien.
- **Revoluties:** vorsten van grote, onrustige rijken kunnen worden onttroond of verbannen; het rijk wordt
  een **republiek** met presidenten die voor een termijn worden gekozen en herkozen. Troonpretendenten
  verdwijnen dan. Nationalisme maakt volken onder vreemd bestuur onrustiger.
- **Eenwording:** verdeelde volken (Duitsers, Italianen, …) kunnen samengaan, vreedzaam of met een
  eenwordingsoorlog.
- **Dekolonisatie:** koloniën in Amerika maken zich los rond 1800 (en heten dan bijvoorbeeld *New Castile*),
  koloniën in Afrika en Azië in de twintigste eeuw. Grote oorlogen tussen bondgenootschappen kunnen
  uitgroeien tot een **wereldoorlog**.
- **Bevolking:** groeit na 1800 sterk, maar het meest waar nog ruimte was; streken die in 1444 al vol
  zaten groeien minder, woestijn en toendra blijven dun. De wereld komt rond 2026 op 5 à 7 miljard.
- **Namen:** provincies zonder stad (Sahara, Siberië, het binnenland van Amerika) heten nu naar hun streek
  (*Western Sahel*, *Central Karakum*) in plaats van "Uncharted Land".
- Nieuwe instellingen: `revolutions`, `nationalism`, `decolonization`; `end_year` staat op 2026.

Bekende beperkingen: China (Ming) groeit vaak naar 2 miljard en meer; er zijn nog geen ideologieën,
grondwetten of steden; de wereldoorlogen zijn gewone oorlogen met een grotere naam.

### Mijlpaal 9: de webpagina (klaar)
- **Twee geschiedenissen naast elkaar:** de knop *Compare* zet een tweede tijdlijn (een andere seed) naast
  de eerste. Beide kaarten bewegen samen (slepen, zoomen, jaar, stijl, kaartlaag); op een telefoon staan
  ze onder elkaar. Boven elke kaart staat het grootste rijk van dat jaar. De link onthoudt beide seeds
  (`#s1444~77`), dus je kunt een vergelijking delen.
- **Landen door de tijd:** in het paneel van een rijk staat een grafiek met het aantal provincies van 1444
  tot nu, met het grootste bereik en wanneer het rijk ontstond of verdween. Klik in de grafiek om naar
  dat jaar te reizen.
- **Timelapse als film:** `python3 tools/export_maps.py --seed 42 --timelapse 2` maakt een mp4 (met
  ffmpeg, anders een gif) met een beeld per twee jaar en het jaartal en tijdperk in de hoek.
  `--size 1600x1000`, `--view lon0 lat0 lon1 lat1` en `--style political` werken ook.
- Wat er al was: kaart per jaar met schuifbalk en afspelen, atlas- en politieke stijl, zoomen, panelen
  voor rijken (heersers, oorlogen, diplomatie, economie, volken, kennis), personen (levensloop, familie,
  aanspraken) en stambomen.

### Mijlpaal 10: geschiedschrijving (klaar)
- **Kroniek per decennium:** de knop *Chronicle* opent nu een verhaal per tien jaar: hoe de tijd was
  (oorlogszuchtig, rustig, pest), welke grote kronen van drager wisselden, welke oorlogen eindigden en
  wie er land won, welke rijken verdwenen of ontstonden, de keerpunten uit de annalen en wie er aan het
  eind het meeste land had gewonnen of verloren. Met *Every event* zie je nog steeds elke gebeurtenis.
- **Encyclopedie:** in het paneel van een rijk staat *Read the history of …*: een artikel in de stijl
  van Wikipedia met een infokader (hoofdstad, bestuur, geloof, grootste omvang, oorlogen gewonnen/verloren),
  een inleiding en een hoofdstuk per tijdperk (vorsten, oorlogen, groei of krimp, bijzondere momenten).
  Het artikel kent alleen wat er in het gekozen jaar bekend was; namen zijn klikbaar.
- Alles komt uit sjablonen in `web/js/history.js`, zonder AI en zonder kosten. De woordkeus komt uit een
  eigen toevalsgenerator (seed + decennium), dus lezen verandert de geschiedenis niet.
- `node cli/run.js` schrijft nu ook `history.md`: de hele kroniek per decennium als tekst.
- Ook: rijken met een meervoudsnaam krijgen een meervoudig werkwoord (*the Ottomans are victorious*).

### Mijlpaal 11: de hand van het lot (klaar)
In het paneel van elk rijk staat nu **The hand of fate in (jaar)**. Elke ingreep schrijft de
geschiedenis opnieuw vanaf 1444, met jouw hand erin vanaf het gekozen jaar:
- **De vorst:** laten sterven, een erfgenaam schenken, een wijze vorst (bestuur), een groot veldheer
  (leger), een gladde tong (diplomatie), of waanzin.
- **Oorlog:** oorlog verklaren aan een buur of rivaal (kies uit de lijst), of een lopende oorlog
  beëindigen met een witte vrede.
- **Het rijk:** de schatkist vullen, de pest naar de hoofdstad sturen, een opstand ontketenen (het
  grootste vreemde volk in het rijk komt in opstand), verwante rijken laten samengaan, of (vanaf 1600)
  de kroon laten vallen in een revolutie.
- **Ideeën:** de boekdrukkunst, buskruit, de stoommachine of moderne geneeskunde eerder laten uitvinden,
  in dit rijk.
- Bovenaan staat *altered ×N*: klik erop voor de lijst van je ingrepen, met *Undo* per ingreep of alles
  tegelijk. De link in de adresbalk bewaart seed én ingrepen, dus je kunt jouw versie van de
  geschiedenis delen of later terugkomen.

### Mijlpaal 12: kantelpunten, rampen en legendes (klaar)
- **Elke tijdlijn een eigen tempo:** uitvindingen en grote ontwikkelingen kunnen decennia eerder of
  later komen dan bij ons (de boekdrukkunst tussen ±1450 en ±1530, de stoommachine tussen ±1700 en ±1800).
  Instelling: `pace_variation` (0 = zoals in onze geschiedenis).
- **Zeldzame kantelpunten** die de wereld een andere kant op sturen; elke tijdlijn krijgt er een handvol,
  nooit dezelfde: een grote pandemie (in veel havens tegelijk en dodelijker dan de gewone pest), een
  vulkaanwinter (een jaar zonder zomer op een half halfrond), een veroveraar die uit het niets opstaat,
  grote rijken die uiteenvallen in krijgsheerstaten (vaak gevolgd door een herenigingsoorlog), gouden
  eeuwen van kennis, en na de splitsing van het atoom: kernwapencrises die bijna altijd goed aflopen,
  maar soms niet. Instelling: `catastrophes`.
- **China** groeit minder hard: streken die in 1444 al vol zaten, krijgen minder ruimte. Ming komt nu
  op 1,1 à 1,7 miljard en kan uiteenvallen.
- **Nieuwe ingrepen** in *The hand of fate*: rampen (aardbeving, overstroming, grote brand,
  sprinkhanen, een pandemie, een vulkaanwinter), **een legende op de troon** (Alexander de Grote,
  Julius Caesar, Karel de Grote, Dzjengis Khan, Timur, Saladin, Cleopatra, Ashoka, Qin Shi Huang,
  Mansa Musa, Jeanne d'Arc, Elizabeth I, Süleyman, Akbar, Peter de Grote, Catharina de Grote, Napoleon),
  een veroveraar, een gouden eeuw, grote ontdekkingsreizen (ook voor rijken die anders nooit uitvaren),
  het rijk laten uiteenvallen, en de kroon bekeren tot een ander geloof.

### Mijlpaal 13: nieuwe namen, nieuwe volken, nieuwe rijken (klaar)
- **Plaatsnamen in de taal van de veroveraar:** koloniën krijgen namen van thuis (*Nieuw-Amsterdam*,
  *Fort Willem*, *San Felipe*, *Nouvelle-Rouen*, *São António*), en soms ook kleinere plaatsen die lang
  onder vreemd bestuur staan en hun taal overnamen (*Muradiye*, *Gustavsstad*, *Hasanabad*). Komt een
  plaats terug bij zijn eigen volk, dan neemt hij vaak zijn oude naam terug. De kaart, het infovak en de
  panelen tonen de naam van het gekozen jaar (de oude naam staat tussen haakjes).
- **Nieuwe volken:** kolonisten die generaties lang ver van huis over zichzelf regeren, worden een eigen
  volk (*Brazilians*, *Neo-Scots*, …), met een eigen kleur op de kaart van volken.
- **Keizerrijken:** een heel groot rijk met veel volken kan zich uitroepen tot keizerrijk (*Danish Empire*).
- **Een stad wordt een rijk:** heel af en toe staat in een stadje een stichter op die zweert dat zijn stad
  de wereld zal regeren. Meestal mislukt het; soms ook niet. Ook als ingreep: *A town rises*.
- Na een update haalt de website meteen de nieuwe versie op (geen oude versie meer uit de cache).

### Mijlpaal 14: samenleving, en de zotte kant van de geschiedenis (klaar)
- **Secularisering:** met drukpers, fabrieken, geneeskunde en republieken neemt de greep van het geloof af:
  minder bekeringen, minder religieuze onrust, minder heilige oorlogen. Vanaf ±1860 verschijnen
  **ongelovigen** (*Nonreligious*) op de kaart van geloven. Prinsbisdommen worden geseculariseerd. Hoe
  sterk dit gaat, verschilt per tijdlijn: in de ene blijft de wereld vroom, in de andere is een derde
  ongelovig. Soms keert het tij: een religieuze opleving, of na 1900 een revolutie van de gelovigen die een
  theocratie sticht. Instelling: `secularisation`. In het paneel: *Faith's hold*.
- **Monarchieën:** minder revoluties dan eerst; een koning die een grondwet aanneemt is meestal veilig
  (*Constitutional monarchy* in het paneel). Jonge republieken kunnen vallen voor een generaal of een
  teruggekeerde verbannen koning.
- **Overstrekking:** de verre uithoeken van gigantische rijken zijn onrustiger.
- **Als een veroveraar jong sterft** (zoals Alexander de Grote), verdelen zijn generaals vaak het rijk.
- **Humor:** zeldzame, gedenkwaardige doodsoorzaken (*a surfeit of lampreys*, *a fall down the palace stairs
  while fleeing a goose*, en voor gekke vorsten *trying to fly from the cathedral tower*) en curiositeiten
  in de kroniek: kometen die het einde der tijden voorspellen, dansplagen, tulpenmanie, een paard in de
  koninklijke raad, en na 1900 een oorlog tegen emoes.

### Mijlpaal 15: de eeuw van de ideologieën (klaar)
- **Socialisme** is een idee dat ontstaat waar de fabrieken staan (rond 1848, of eerder of later). Daarna
  kunnen arbeiders een **rode revolutie** maken (vooral na een verloren oorlog of een bankroet): het rijk
  wordt een *People's Republic*, soms gevolgd door een hongersnood door collectivisatie.
- **Sterke mannen:** na een vernedering of in een jonge, onrustige republiek kan een generaal de macht
  grijpen en zich *the Leader* of *the Generalissimo* laten noemen. Dictaturen en partijstaten kunnen ook
  weer vallen, waarna verkiezingen volgen.
- **Blokken en koude oorlog:** gelijkgezinde staten trekken naar elkaar toe, rivaliserende ideologieën
  wantrouwen elkaar. Na de atoombom kan er een koude oorlog ontstaan tussen de grootste rode en vrije macht,
  met kernwapencrises als gevolg.
- Elke tijdlijn heeft een eigen neiging: in de ene wordt de halve wereld rood, in de andere bijna niets.
  Instelling: `ideologies`.
- **Nieuwe kaartlaag *Politics*:** absolute en grondwettelijke monarchieën, democratieën, volksrepublieken,
  dictaturen, theocratieën en stammenrijken, met een legenda die zegt hoeveel van de wereldbevolking onder
  elke staatsvorm leeft.
- **Kleinere verbeteringen:** oorlogen met dezelfde naam krijgen een volgnummer (*Second Moldavian War of
  Independence*); nieuwe staten in Amerika heten naar hun hoofdplaats of naar het land (*Cascadia*,
  *Amazonia*) in plaats van "Free State of Cascade Range"; zeer volkrijke rijken en stammenrijken vallen
  vaker uiteen en worden minder vaak herenigd, zodat Ming en Sibir niet altijd de wereld domineren.

### Mijlpaal 16: wereldoorlogen en kleinere reparaties (klaar)
- **Echte wereldoorlogen:** een oorlog tussen grootmachten kan uitgroeien: bondgenoten komen hun
  bondgenoten te hulp, gelijkgezinde regimes en rivalen kiezen partij (*"Lithuania enters the First World War
  on the side of Hungary"*). Pas als er minstens twee grootmachten aan elke kant staan en ten minste 30% van
  de wereldbevolking meedoet, heet het een wereldoorlog; hooguit één per twintig jaar, en vaak geen enkele.
  Een wereldoorlog duurt minstens drie jaar (tenzij een kant instort), kost ook burgers het leven en eindigt
  met een vredesconferentie: elke winnaar houdt wat hij bezet, en de regimes van de verliezers vallen vaak
  (revolutie, rode revolutie of het einde van een dictatuur). Daarna richten de winnaars een *League of
  Nations* op, en is de wereld vijftien jaar wat vreedzamer.
- **Hoofdsteden:** als een rijk zijn hoofdstad verliest, verhuist het hof naar de grootste stad in de buurt,
  bij voorkeur van het eigen volk, en niet meer naar een kolonie aan de andere kant van de wereld.
- **Vazallen:** elke mislukte onafhankelijkheidsoorlog maakt een vazal banger; na de derde lijft de
  leenheer hem in.
- **Opstanden** die vaker voorkomen heten naar hun jaar (*Amaravati Revolt of 1462 against Bahmanis*).

### Testronde met een tweede agent (klaar)
Een tweede agent heeft drie tijdlijnen kritisch getest. Daaruit verbeterd:
- De kroniek per decennium en de encyclopedie gebruiken de naam die een rijk **toen** had (niet "People's
  Republic of Lan Xang" in de jaren 1440); vorsten staan er met hun rangnummer in.
- Veldslagen noemen het leger van de winnaar eerst (geen schijnbare overwinningen van 397 tegen 34.000 meer).
- Grammatica: lidwoorden (*the Golden Horde*, *the Ottomans*), meervoud (*the Ottomans defeat*), geen
  *the The First World War*, *not yet a year old* in plaats van *only 0*.
- Rijken vallen vaker en steeds anders uiteen; opvolgers heten naar een echte stad of naar hun volk
  (*Bashkir Khanate*) in plaats van naar een gebergte; Sovjetnamen (Dimitrovgrad, Kirov, …) zijn vervangen
  door oudere namen (Melekess, Khlynov, …).
- Doodsoorzaken en levensduur passen bij het tijdperk (na 1870 tuberculose, longontsteking, kanker, een
  auto-ongeluk; na 1950 worden vorsten 85 of ouder), en koninklijke huwelijken na 1850 vullen de kroniek
  niet meer.
- De koude oorlog begint pas als beide grootmachten de bom hebben; wereldoorlogen duren minstens drie jaar
  vanaf het moment dat ze wereldoorlog werden; caravels varen niet meer in 1884.
- Minder herhaling: de balans van een decennium in wisselende woorden en niet elke keer, curiositeiten niet
  twee keer in 150 jaar, "the Fox" minder vaak, twee nieuwe volken heten nooit hetzelfde.
- `chronicle.txt` (opdrachtregel) bevat alleen nog de grote rijken en de keerpunten.

### Bevolking, China en oorlogsduur (klaar)
- **Azië in 1444 klopt beter:** het dichtheidsmodel gaf de steppe en Indochina veel te veel mensen (Lan Xang
  10 miljoen, Moghulistan 15 miljoen). Nu hebben de Aziatische rijken eigen schattingen (Lan Xang 0,6, Moghulistan
  1,2, Oirats 0,8 miljoen) en is de dichtheid per regio verfijnd (steppe, Tibet, Zuidoost-Azië, de eilanden).
  De wereld telt in 1444 nu ±340 miljoen mensen (schattingen: 350–375 miljoen), in 1800 ±750–900 miljoen, in
  1900 1,2–1,6 miljard en in 2026 7–9 miljard.
- **Hoeveel mensen het land kan dragen:** een provincie kan niet onbeperkt groeien; de grens hangt af van
  hoe vruchtbaar het land is.
- **China:** een Chinees rijk dat het *Mandaat van de Hemel* verliest, valt makkelijker uiteen. Ming eindigt nu
  soms met 55 provincies en soms met 150, en soms is een afgesplitst deel even groot.
- **Langere oorlogen:** oorlogen tussen grote rijken worden zelden in een jaar beslist; serieuze oorlogen
  duren nu mediaan zo'n twee jaar, één op de tien langer dan 4,5 jaar, en af en toe sleept een oorlog zich
  tien jaar of meer voort.

### Kleine verbeteringen
- **Welkom:** wie de site voor het eerst opent, krijgt een korte uitleg (ook later via de knop **?**).
- **Nomaden vestigen zich:** stammenrijken (Sibir, de Oirats, Moghulistan…) kunnen een vaste hoofdstad, belasting
  en een staand leger krijgen en een koninkrijk worden, sneller waar kennis en handel komen.
- **Ridderorden worden hertogdommen:** na de Reformatie kan een grootmeester zijn habijt afleggen en hertog worden
  (zoals de Duitse Orde in 1525 het hertogdom Pruisen werd).

### Tweede testronde (klaar)
Een tweede agent testte vier nieuwe tijdlijnen. Daaruit verbeterd:
- **Tijdperken volgen de eigen tijdlijn:** *Absolutism* en *Enlightenment* komen eerder of later, het *Atomic Age*
  begint met de eerste bom, het *Information Age* een generatie later, en het *Age of Extremes* komt alleen na een
  wereldoorlog of rode revoluties.
- **Atoombommen** alleen voor grote, geïndustrialiseerde staten (geen atomaire Kerkelijke Staat of Bamberg meer).
- **Moderne epidemieën:** waar de moderne geneeskunde is, doodt de pest bijna niemand meer; nieuwe pandemieën
  na de ontdekking van bacteriën zijn virussen met quarantaines en vaccins, geen hopeloze middeleeuwse plagen.
  Vulkaanwinters na 1900 kosten veel minder levens.
- **De koude oorlog** begint weer, tussen de grootste rode en vrije macht die allebei de bom hebben.
- **Veldslagen** zijn minder voorspelbaar: soms wint het kleinere leger (ongeveer één op de tien).
- **Taal:** lidwoorden ook in de kroniekteksten (*victory for the Ottomans*), *the Shan States test*, geen
  *People's the Republic* meer, bankroet van een republiek zonder "kroon", geen astrologen na 1800.
- **Levensduur:** vorsten worden in de moderne tijd tachtig of negentig, maar zelden ouder dan honderd;
  vliegtuigcrashes zijn zeldzaam.
- **Encyclopedie:** neergeslagen opstanden tellen niet meer als gewonnen oorlog (apart: *Risings put down*).
- Twee levende rijken hebben nooit dezelfde naam, en de openingszin van elk decennium wisselt.

### China, uitgestrekte rijken en revoluties (klaar)
- **Dynastieën in China:** krijgt een groot Chinees rijk een nieuw vorstenhuis, dan roept dat vaak een nieuwe dynastie
  uit (*the Ming gives way to the Great Qing. The Mandate of Heaven has passed.*), en het rijk heet voortaan zo.
  Valt China uiteen, dan heten de stukken naar de oude koninkrijken van hun streek: *Shu* (Sichuan), *Wu*, *Chu*,
  *Min*, *Yue*, *Qi*, *Yan*, *Jin*, *Qin*, *Dian*, *Liao*… In 2026 heet het grootste rijk zo nu eens *Xia*, dan
  *Han* of *Da Xi*.
- **Uitgestrekte rijken** (die duizenden kilometers beslaan) vallen makkelijker uiteen.
- **Revoluties** worden op verschillende manieren verteld (*"Crowds storm the palace… flees in a borrowed coat"*).

### Hoogtepunten, snelheid en eenwording (klaar)
- **Hoogtepunten:** in de kroniek staat naast *Decennia* een knop **Highlights**: een korte lijst van de
  ±40–50 momenten die de wereld echt veranderden (uitvindingen, ontdekkingen, wereldoorlogen, ineenstortingen,
  grote veroveraars), met per regel een link naar dat jaar. Kleine gebeurtenissen tellen alleen mee als een van
  de grootste rijken van dat moment erbij betrokken is. De lijst eindigt met de grootste rijken van nu.
- **Sneller:** een hele tijdlijn (1444–2026) rekent ongeveer 20% sneller (31 i.p.v. 38 seconden in Node).
- **Eenwording van India en Duitsland:** net als Italië kunnen Indiase en Duitse staten in de moderne tijd
  samengaan (*Delhi votes to join Bengal: one more step toward a single Indian nation*).

## Delen met vrienden
- **Via claude.ai:** de pagina is privé; via het menu *Share* op de pagina kun je een link maken.
- **Als echte website (gratis, via GitHub Pages):** de map `web/` is een complete website. Zet in de
  repository op GitHub *Settings → Pages → Source* op **GitHub Actions** en zet deze branch in `main`
  (de workflow `.github/workflows/pages.yml` publiceert dan bij elke wijziging). Het adres wordt
  `https://jordimulders-source.github.io/alt-history-sim/`. Een link met `#s42` opent tijdlijn 42; de
  link bewaart ook vergelijkingen en ingrepen, dus je kunt een vriend precies jouw geschiedenis sturen.

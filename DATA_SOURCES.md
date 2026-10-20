# Data sources

All map and place data comes from open sources. No files from commercial games are used.

| What | Source | Licence |
|---|---|---|
| Borders of states in 1444 | [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria) (Seshat Global History Databank), v0.2.1 | CC BY 4.0 |
| Land, lakes, rivers, regions, seas, cities | [Natural Earth](https://www.naturalearthdata.com/) 1:10m vectors | Public domain |
| Shaded relief and land colours | Natural Earth II and Cross-Blended Hypsometric Tints, 1:50m rasters | Public domain |
| Elevation | [Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/) (Mapzen terrarium format) | Mixed open licences, attribution in the AWS registry |
| Town names | [GeoNames](https://www.geonames.org/) via [lutangar/cities.json](https://github.com/lutangar/cities.json) | CC BY 4.0 |

Changes made to Cliopatria: polities were mapped to states, coarse polities were split by hand
(`data/curated/states.yaml`: the Holy Roman Empire's minor states, the Kalmar Union, Gaelic Ireland,
Navarre, Crimea, and others), and borders were clipped to the Natural Earth coastline.

Rulers, families, cultures and population figures in `data/curated/` were written by hand from general
historical knowledge (Wikidata was not reachable from the build machine). Entries marked
`confidence: low` are best guesses and should be checked.

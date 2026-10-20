import math, sys, yaml
d = yaml.safe_load(open(sys.argv[1]))
A = [(k, lo, la) for k, c in d["cultures"].items() for lo, la in c["anchors"]]
def dist(a, b, c, e):
    a, b, c, e = map(math.radians, (a, b, c, e))
    return math.acos(min(1, math.sin(b)*math.sin(e) + math.cos(b)*math.cos(e)*math.cos(a-c)))
tests = {"Metz":(6.18,49.12),"Strasbourg":(7.75,48.58),"Lille":(3.06,50.63),"Brussels":(4.35,50.85),"Liege":(5.57,50.63),"Groningen":(6.57,53.22),
"Flensburg":(9.43,54.78),"Hamburg":(10,53.55),"Danzig":(18.65,54.35),"Torun":(18.6,53.0),"Poznan":(16.93,52.4),"Breslau":(17.03,51.11),"Krakow":(19.94,50.06),
"Lviv":(24.03,49.84),"Vilnius":(25.28,54.69),"Minsk":(27.56,53.9),"Smolensk":(32.05,54.78),"Pskov":(28.33,57.82),"Riga":(24.1,56.95),"Tallinn":(24.75,59.44),
"Vyborg":(28.75,60.7),"Kazan":(49.1,55.8),"Astrakhan":(48.03,46.35),"Kiev":(30.52,50.45),"Odessa":(30.73,46.48),"Bratislava":(17.1,48.15),"Kosice":(21.26,48.72),
"Cluj":(23.6,46.77),"Timisoara":(21.23,45.75),"Belgrade":(20.46,44.82),"Sarajevo":(18.4,43.86),"Dubrovnik":(18.09,42.65),"Skopje":(21.43,42.0),"Thessaloniki":(22.94,40.64),
"Edirne":(26.56,41.68),"Constantinople":(28.97,41.01),"Trabzon":(39.72,41.0),"Erzurum":(41.27,39.9),"Van":(43.38,38.5),"Diyarbakir":(40.23,37.91),"Mosul":(43.13,36.34),
"Aleppo":(37.16,36.2),"Baghdad":(44.36,33.31),"Tabriz":(46.29,38.08),"Tehran":(51.4,35.69),"Herat":(62.2,34.35),"Kabul":(69.17,34.53),"Samarkand":(66.97,39.65),
"Bukhara":(64.42,39.77),"Khiva":(60.36,41.38),"Granada":(-3.6,37.18),"Seville":(-5.98,37.39),"Valencia":(-0.38,39.47),"Murcia":(-1.13,37.98),"Pamplona":(-1.64,42.82),
"Bordeaux":(-0.58,44.84),"Lyon":(4.83,45.76),"Geneva":(6.14,46.2),"Turin":(7.69,45.07),"Nice":(7.26,43.7),"Trieste":(13.77,45.65),"Rome":(12.5,41.9),"Naples":(14.27,40.85),
"Tunis":(10.18,36.8),"Tripoli":(13.18,32.89),"Cairo":(31.24,30.04),"Khartoum":(32.53,15.5),"Timbuktu":(-3.0,16.77),"Kano":(8.52,12.0),"Addis":(38.74,9.03),
"Mogadishu":(45.34,2.04),"Delhi":(77.2,28.6),"Dhaka":(90.4,23.8),"Beijing":(116.4,39.9),"Nanjing":(118.8,32.06),"Shanghai":(121.47,31.23),"Hanoi":(105.85,21.03),
"Lhasa":(91.1,29.65),"Tenochtitlan":(-99.13,19.43),"Cusco":(-71.97,-13.53),"Moscow":(37.62,55.75),"Inverness":(-4.22,57.48),"Dublin":(-6.26,53.35),"Cardiff":(-3.18,51.48),
"Exeter":(-3.53,50.72),"Galway":(-9.05,53.27),"Kilkenny":(-7.25,52.65),"Bergen":(5.32,60.39),"Oulu":(25.47,65.01),"Kola":(33.0,68.9),"Arkhangelsk":(40.5,64.5),"Perm":(56.2,58.0),"Tobolsk":(68.25,58.2)}
for n,(lo,la) in tests.items():
    k = min(A, key=lambda a: dist(lo,la,a[1],a[2]))[0]
    print(f"{n}:{k}", end="  ")

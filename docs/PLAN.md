# BM-Win – plan etapów

Wspólne zasady wszystkich modułów:
- wygląd i układ jak w BelkaŻB: ciemny pasek górny z nazwą elementu i przyciskami plików, zakładki, dane w zwijanych sekcjach po lewej, rysunek po prawej, plakietki statusu warunków nad danymi;
- tylko polskie Załączniki krajowe; tam, gdzie to ma sens, wybór generacji Eurokodu (obecne PN-EN / druga generacja);
- raport pełny lub skrócony: druk/PDF, ODT, HTML; eksport DXF ostatecznej geometrii i zbrojenia;
- jeden kod dla przeglądarki i programu .exe (offline);
- testy porównawcze z przykładami obliczonymi ręcznie.

## Etap 1 – Statyka 2D/3D ✅

- Silnik MES (`app/statyka/fem.js`): element belkowy 3D (12 st. swobody), opcjonalnie Timoshenko; element kratowy; zwolnienia (przeguby); podpory sztywne i sprężyste; obciążenia węzłowe, rozłożone trapezowe i częściowe (lokalne, globalne, na rzut), skupione, momenty, temperatura (równomierna i gradient), ciężar własny.
- Analizy: liniowa (superpozycja przypadków), II rzędu P-Δ (iteracyjnie), wyboczenie liniowe (iteracja podprzestrzenna), drgania własne (macierz mas konsystentna, masy z przypadków obciążeń, udział mas efektywnych).
- Kombinacje PN-EN 1990 + ZK PL: 6.10a/6.10b (lub 6.10), EQU, SGU charakterystyczna/częsta/quasi-stała, wyjątkowa; grupy wykluczające (np. kierunki wiatru); obwiednie z kombinacją decydującą.
- Interfejs: rysowanie myszą (2D – siatka, 3D – płaszczyzna robocza), tabele węzłów/prętów/podpór/przekrojów, generatory (belka ciągła, rama, rama dwuspadowa, kratownice Pratt/Howe/Warren/trójkątna, szkielet 3D, ruszt), przesuwanie/kopiowanie, podział prętów, cofanie zmian.
- Bazy: beton C12/15–C90/105, stal zbrojeniowa (w tym historyczne A-I, A-III, A-IIIN), stal konstrukcyjna (PN-EN 10025-2/3/4, 10210/10219), drewno C14–C50, D18–D70, GL20h–GL32h, GL20c–GL32c, mury (wartości zbiorcze); profile IPE, HEA, HEB, HEM, IPN, UPN, rury okrągłe, kwadratowe i prostokątne; przekroje parametryczne.

## Etap 2 – Oddziaływania EC1 (integracja)

- Przeniesienie zestawień z ObciążeńEC1 bezpośrednio do przypadków obciążeń w Statyce (obciążenia powierzchniowe → rozłożone na pręty z szerokości pasma).
- Warstwy posadzkowe i dachowe: biblioteka warstw z ciężarami (PN-EN 1991-1-1, karty producentów).

## Etap 3 – Żelbet EC2

- Belka (BelkaŻB) – pobieranie sił z modelu Statyki.
- Słup żelbetowy (analogiczny program): ściskanie mimośrodowe jedno- i dwukierunkowe, smukłość i efekty II rzędu (metoda nominalnej sztywności / nominalnej krzywizny), krzywe interakcji, zbrojenie minimalne/maksymalne, strzemiona, odporność ogniowa, rysunek DXF.

## Etap 4 – Stal EC3 i drewno EC5

- Belka i słup stalowy: klasy przekrojów, nośności przekroju, wyboczenie, zwichrzenie (Mcr), interakcja N+M (metoda 1 i 2), stan użytkowania.
- Belka i słup drewniany: kmod, klasy użytkowania i trwania obciążenia, zginanie, ścinanie, docisk, wyboczenie, zwichrzenie, ugięcia z pełzaniem (kdef), odporność ogniowa.

## Etap 5 – Mury EC6

- Ściany obciążone pionowo (metoda uproszczona i ogólna), obciążenia skupione, ściany obciążone poziomo, ścinanie, nadproża; baza elementów murowych stosowanych w Polsce.

## Etap 6 – Geotechnika EC7 (bez norm PN-B)

- Podejścia obliczeniowe DA1, DA2, DA2*, DA3 – do wyboru w każdym module; metody obliczeń do wyboru.
- Fundamenty bezpośrednie: nośność (zał. D), przesuw, osiadanie, mimośród, wymiarowanie żelbetowe.
- Fundamenty palowe: nośność z badań (CPT, wzory empiryczne wg EC7), grupy pali, osiadanie.
- Stateczność skarp: Fellenius, Bishop, Janbu, Spencer, Morgenstern–Price; zbrojenie skarp (gwoździe, geosiatki, kotwy).
- Ściany oporowe: kątowe i grawitacyjne; ścianki szczelne i berlińskie (wspornikowe, kotwione).
- Nasypy zbrojone: stateczność wewnętrzna i zewnętrzna.

## Etap 7 – Model 3D całego budynku

- Elementy powłokowe (płyty stropowe, ściany), fundamenty na podłożu sprężystym, warstwy posadzkowe; przypisanie przekrojów i materiałów; przekazywanie sił do modułów wymiarowania.

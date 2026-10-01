# Dokumentacja Funkcjonalności Aplikacji (Ligmus)

Dokument zawiera wykaz funkcji zrealizowanych w interfejsie aplikacji oraz przewidzianych modułów komunikacji i frekwencji.

---

## 1. Nawigacja Główna (Bottom Navigation Bar)
Aplikacja wykorzystuje dolną listwę nawigacyjną z czterema głównymi sekcjami:
* Pulpit – Ekran startowy z podsumowaniem[span_0](start_span)[span_0](end_span).
* Oceny – Dziennik ocen ucznia[span_1](start_span)[span_1](end_span).
* Plan lekcji – Tygodniowy/dzienny harmonogram zajęć[span_2](start_span)[span_2](end_span).
* Ustawienia – Konfiguracja konta i aplikacji[span_3](start_span)[span_3](end_span).

---

## 2. Ekran Główny (Pulpit)
Służy do szybkiego podglądu najważniejszych informacji bieżących[span_4](start_span)[span_4](end_span):

* Nagłówek użytkownika:
  * Powitanie z imieniem i nazwiskiem użytkownika[span_5](start_span)[span_5](end_span).
  * Informacja o klasie, profilu, numerze w dzienniku oraz statusie połączenia z systemem źródłowym (Librus Synergia)[span_6](start_span)[span_6](end_span).
* Szczęśliwy Numerek:
  * Dedykowana karta prezentująca wylosowany na dany dzień Szczęśliwy Numerek[span_7](start_span)[span_7](end_span).
* Najbliższa lekcja:
  * Podgląd nadchodzącej/trwającej godziny lekcyjnej[span_8](start_span)[span_8](end_span).
  * Wyświetlanie numeru lekcji, przedziału godzinowego, nazwy przedmiotu, sali oraz nazwiska nauczyciela[span_9](start_span)[span_9](end_span).
  * Przycisk skrótu do pełnego planu lekcji[span_10](start_span)[span_10](end_span).
* Ostatnie oceny:
  * Lista niedawno wpisanych ocen z podziałem na przedmiot, wagę, opis (np. kartkówka, zadanie) i datę[span_11](start_span)[span_11](end_span).
  * Przycisk skrótu do pełnej listy ocen[span_12](start_span)[span_12](end_span).

---

## 3. Ekran Ocen (Oceny)
Umożliwia szczegółowe przeglądanie ocen ucznia[span_13](start_span)[span_13](end_span):

* Podsumowanie:
  * Wyświetlanie obliczonej średniej ocen w prawym górnym rogu[span_14](start_span)[span_14](end_span).
* Filtrowanie i Okresy:
  * Przełącznik widoku między Semestrem 1 a Semestrem 2[span_15](start_span)[span_15](end_span).
* Lista Przedmiotów:
  * Zwijane/rozwijane karty dla poszczególnych przedmiotów (np. *Język angielski*, *Matematyka*, *Informatyka stosowana*)[span_16](start_span)[span_16](end_span).
  * Licznik ocen przypisanych do danego przedmiotu w wybranym semestrze[span_17](start_span)[span_17](end_span).
  * Średnia cząstkowa dla danego przedmiotu[span_18](start_span)[span_18](end_span).
  * Wyświetlanie plakietek z ocenami (np. oceny wysokie wyróżnione kolorem zielonym, niższe czerwonym/pomarańczowym)[span_19](start_span)[span_19](end_span).
  * Informacja o braku ocen w danym semestrze[span_20](start_span)[span_20](end_span).

---

## 4. Ekran Planu Lekcji (Plan lekcji)
Prezentuje harmonogram zajęć ucznia[span_21](start_span)[span_21](end_span):

* Nawigacja po dniach tygodnia:
  * Pasek wyboru dnia (Pon, Wt, Śr, Czw, Pt) z podglądem liczby lekcji w danym dniu[span_22](start_span)[span_22](end_span).
  * Wyświetlanie aktualnej daty (np. *10 marca*)[span_23](start_span)[span_23](end_span).
* Lista Zajęć:
  * Chronologiczna lista lekcji w wybranym dniu z numeracją[span_24](start_span)[span_24](end_span).
  * Przedziały czasowe trwania lekcji[span_25](start_span)[span_25](end_span).
  * Nazwa przedmiotu[span_26](start_span)[span_26](end_span).
  * Numer sali oraz dane nauczyciela prowadzącego[span_27](start_span)[span_27](end_span).

---

## 5. Komunikacja i Wiadomości (Wiadomości)
Służy do dwukierunkowej korespondencji z nauczycielami i wychowawcą:

* Skrzynka odbiorcza / nadawcza:
  * Podział na wiadomości odebrane, wysłane i robocze.
  * Lista konwersacji z widocznym nadawcą/odbiorcą, tytułem, fragmentem treści oraz datą.
  * * Tworzenie nowej wiadomości:
  * Wybór odbiorcy z gotowej listy nauczycieli/wychowawców.
  * Wprowadzanie tytułu oraz treści wiadomości.
  * Opcja dołączania załączników.
* Wyszukiwanie i filtrowanie:
  * Wyszukiwarka wiadomości po tytule, nadawcy lub treści.

---

## 6. Obsługa Frekwencji i Usprawiedliwień (e-Usprawiedliwienia)
Umożliwia zarządzenie nieobecnościami oraz wysyłanie wniosków o ich usprawiedliwienie:

* Podgląd nieobecności:
  * Lista godzin/dni z odnotowaną nieobecnością, spóźnieniem lub zwolnieniem.
* Składanie wniosku o usprawiedliwienie:
  * Wybór trybu: usprawiedliwienie całych dni lub wybranych godzin/lekcji.
  * Określenie zakresu dat/godzin absencji.
  * Pole tekstowe do podania powodu nieobecności.
  * Opcja dołączenia załącznika (np. skanu/zdjęcia zaświadczenia lekarskiego).
  * Informowanie o planowanej w przyszłości nieobecności.
* Statusy wniosków:
  * Śledzenie stanu wysłanych wniosków (np. *Oczekujące*, *Zaakceptowane*, *Odrzucone*).

---

## 7. Ekran Ustawień (Ustawienia)
Pozwala na zarządzanie profilem, połączeniem i aplikacją[span_28](start_span)[span_28](end_span):

* Profil Użytkownika:
  * Wyświetlanie imienia i nazwiska, klasy oraz danych wychowawcy[span_29](start_span)[span_29](end_span).
  * Awatar użytkownika[span_30](start_span)[span_30](end_span).
* Konto i Połączenie:
  * Status połączenia z systemem zewnętrznym (np. *Połączono z Librus Synergia*)[span_31](start_span)[span_31](end_span).
  * Przycisk Zmień konto / Zaloguj ponownie[span_32](start_span)[span_32](end_span).
  * Przycisk Wymuś odświeżenie danych do natychmiastowej synchronizacji[span_33](start_span)[span_33](end_span).
* Informacje o Aplikacji:
  * Wyświetlanie nazwy aplikacji (*LIGMUS*) oraz wersji oprogramowania (*0.1.0*)[span_34](start_span)[span_34](end_span).
* Bezpieczeństwo / Sesja:
  * Przycisk Wyczyść sesję i zresetuj do usunięcia lokalnych danych i resetu aplikacji[span_35](start_span)[span_35](end_span).

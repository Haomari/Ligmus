# Dokumentacja Funkcjonalności Aplikacji (Ligmus)

Dokument zawiera wykaz funkcji zrealizowanych w interfejsie aplikacji oraz przewidzianych modułów komunikacji i frekwencji.

---

## 1. Nawigacja Główna (Bottom Navigation Bar)
Aplikacja wykorzystuje dolną listwę nawigacyjną z czterema głównymi sekcjami:
* Pulpit – Ekran startowy z podsumowaniem.
* Oceny – Dziennik ocen ucznia.
* Plan lekcji – Tygodniowy/dzienny harmonogram zajęć.
* Ustawienia – Konfiguracja konta i aplikacji.

---

## 2. Ekran Główny (Pulpit)
Służy do szybkiego podglądu najważniejszych informacji bieżących:

* Nagłówek użytkownika:
  * Powitanie z imieniem i nazwiskiem użytkownika.
  * Informacja o klasie, profilu, numerze w dzienniku oraz statusie połączenia z systemem źródłowym (Librus Synergia).
* Szczęśliwy Numerek:
  * Dedykowana karta prezentująca wylosowany na dany dzień Szczęśliwy Numerek.
* Najbliższa lekcja:
  * Podgląd nadchodzącej/trwającej godziny lekcyjnej.
  * Wyświetlanie numeru lekcji, przedziału godzinowego, nazwy przedmiotu, sali oraz nazwiska nauczyciela.
  * Przycisk skrótu do pełnego planu lekcji.
* Ostatnie oceny:
  * Lista niedawno wpisanych ocen z podziałem na przedmiot, wagę, opis (np. kartkówka, zadanie) i datę.
  * Przycisk skrótu do pełnej listy ocen.

---

## 3. Ekran Ocen (Oceny)
Umożliwia szczegółowe przeglądanie ocen ucznia:

* Podsumowanie:
  * Wyświetlanie obliczonej średniej ocen w prawym górnym rogu.
* Filtrowanie i Okresy:
  * Przełącznik widoku między Semestrem 1 a Semestrem 2.
* Lista Przedmiotów:
  * Zwijane/rozwijane karty dla poszczególnych przedmiotów (np. *Język angielski*, *Matematyka*, *Informatyka stosowana*).
  * Licznik ocen przypisanych do danego przedmiotu w wybranym semestrze.
  * Średnia cząstkowa dla danego przedmiotu.
  * Wyświetlanie plakietek z ocenami (np. oceny wysokie wyróżnione kolorem zielonym, niższe czerwonym/pomarańczowym).
  * Informacja o braku ocen w danym semestrze.

---

## 4. Ekran Planu Lekcji (Plan lekcji)
Prezentuje harmonogram zajęć ucznia:

* Nawigacja po dniach tygodnia:
  * Pasek wyboru dnia (Pon, Wt, Śr, Czw, Pt) z podglądem liczby lekcji w danym dniu.
  * Wyświetlanie aktualnej daty (np. *10 marca*).
* Lista Zajęć:
  * Chronologiczna lista lekcji w wybranym dniu z numeracją.
  * Przedziały czasowe trwania lekcji.
  * Nazwa przedmiotu.
  * Numer sali oraz dane nauczyciela prowadzącego.

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
Pozwala na zarządzanie profilem, połączeniem i aplikacją:

* Profil Użytkownika:
  * Wyświetlanie imienia i nazwiska, klasy oraz danych wychowawcy.
  * Awatar użytkownika.
* Konto i Połączenie:
  * Status połączenia z systemem zewnętrznym (np. *Połączono z Librus Synergia*).
  * Przycisk Zmień konto / Zaloguj ponownie.
  * Przycisk Wymuś odświeżenie danych do natychmiastowej synchronizacji.
* Informacje o Aplikacji:
  * Wyświetlanie nazwy aplikacji (*LIGMUS*) oraz wersji oprogramowania (*0.1.0*).
* Bezpieczeństwo / Sesja:
  * Przycisk Wyczyść sesję i zresetuj do usunięcia lokalnych danych i resetu aplikacji.

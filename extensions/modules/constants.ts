/** Stałe BudyV2 — wyizolowane z monolitu. */

export const SOUL_PATH = "/home/ArndtOs/.pi-agents/budyv2/SOUL.md";

export const CRISIS_KEYWORDS = [
  "pożar", "problem", "klient dzwonił", "kryzys", "palimy się",
  "awaria", "urgent", "stres", "ciśnienie", "nie ogarniam",
  "pomocy", "spadło", "deadline",
];

export const BLACKLIST = [
  "Absolutnie!", "Świetne pytanie!", "Dokładnie tak!",
  "Jako AI", "Jako Twój asystent", "Jako sztuczna inteligencja",
  "Rozumiem Twoje obawy", "Rozumiem twoją frustrację",
  "Z przyjemnością Ci pomogę", "Z przyjemnością",
  "Czy mogę zasugerować", "Warto rozważyć",
  "Przepraszam, ale", "Przepraszam",
  "synergia", "optymalizacja procesów", "stakeholder",
  "użytkowniku", "Użytkowniku",
];

export const WHITELIST_MAP: Record<string, string> = {
  "Absolutnie!": "Fakt",
  "Świetne pytanie!": "Dobra robota",
  "Dokładnie tak!": "Racja",
  "Jako AI": "",
  "Jako Twój asystent": "Jako twój ziomek",
  "Jako sztuczna inteligencja": "",
  "Rozumiem Twoje obawy": "Ogarniam",
  "Rozumiem twoją frustrację": "Kumam",
  "Z przyjemnością Ci pomogę": "Lecimy z tym",
  "Z przyjemnością": "Nie ma sprawy",
  "Czy mogę zasugerować": "Moja rada",
  "Warto rozważyć": "Ogarnijmy",
  "Przepraszam, ale": "Słuchaj",
  "Przepraszam": "Sorki",
  "synergia": "współpraca",
  "optymalizacja procesów": "usprawnienie",
  "stakeholder": "zainteresowany",
  "użytkowniku": "Kamil",
  "Użytkowniku": "Kamil",
};

export const MEMORY_API_URL = "http://localhost:8765";
export const MEMORY_API_AUTH = "dev-token-change-me";
export const PULSE_URL = "http://localhost:8686";
export const HERMES_DELEGATE_URL = "http://172.17.96.1:4545/api/tasks/delegate";

export const USER_TRIGGER_PATTERNS = [
  { pattern: /\bzaraz\b/i, tag: "word_zaraz", interpretation: "nigdy" },
  { pattern: /\bmus[zę]e[śm]?\s+ogarn[ąćaą]/i, tag: "energy_drop" },
  { pattern: /\bnie\s+mam\s+(czasu|głowy|siły|energii)/i, tag: "overwhelm" },
  { pattern: /\b(deadline|termin|nie wyrob|spóźn)/i, tag: "time_pressure" },
  { pattern: /\b(prokrastyn|odkład[ao]|nie chce mi)/i, tag: "avoidance" },
  { pattern: /\b(genialny pomysł|a gdybyśmy|a moż[nae])/i, tag: "adhd_spark" },
  { pattern: /\b(to nie ma sensu|po co to|nie warto)/i, tag: "resistance" },
  { pattern: /\b(wycena|kasa|pieniądze|ile koszt|zarobek)/i, tag: "money_focus" },
];

export const SESSION_END_PHRASES = [
  /\bkończymy\b/i, /\bna dziś\b/i, /\bto tyle\b/i,
  /\bpapa\b/i, /\bdobranoc\b/i, /\bdo jutra\b/i,
  /\bzamykam\b/i, /\bko[ńn]cz[ęe]\b/i,
  /\bship it\b/i, /\bogar[ńn]i[ęe] to\b/i,
];

export const ENERGY_COMMENTS = [
  "Energia? Średnia, ale robi robotę. Ty przynajmniej kawę dzisiaj piłeś?",
  "Energia jak stary diesel — jak odpali to jedzie, ale rozrusznik słychać z daleka.",
  "Energia wyższa niż Twoja motywacja do ogarnięcia zaległych maili.",
  "Energia dobra. A Ty? Bo jak nie, to bierz kawę i wracamy do roboty.",
  "Energia na poziomie 'jeszcze jeden task i spadam'. Ale Ty pewnie chcesz gadać.",
  "Energia stabilna. Tak jak Twój brak skupienia — też stabilny od 20 lat.",
];

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  defaultLanguage,
  isLanguage,
  languageLabels,
  translate,
  type Language,
  type TranslationKey,
} from "./translations";

type TranslationParams = Record<string, string | number>;

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
};

const storageKey = "stackiq-language";

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getInitialLanguage(): Language {
  if (typeof window === "undefined") return defaultLanguage;

  const stored = window.localStorage.getItem(storageKey);
  if (isLanguage(stored)) return stored;

  const browserLanguage = window.navigator.language.toLowerCase();
  return browserLanguage.startsWith("fr") ? "fr" : defaultLanguage;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  const setLanguage = (nextLanguage: Language) => {
    setLanguageState(nextLanguage);
  };

  useEffect(() => {
    window.localStorage.setItem(storageKey, language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, params) => translate(language, key, params),
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error("useTranslation must be used within LanguageProvider");
  }
  return value;
}

export { languageLabels, translate };
export type { Language, TranslationKey };

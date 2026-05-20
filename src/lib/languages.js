import { GO_SECTION, PYTHON_SECTION, SECTION_SWITCH_OPTIONS } from '@/lib/section-config';

export const LANGUAGE_CONFIG = {
  go: {
    slug: GO_SECTION.key,
    label: GO_SECTION.label,
    basePath: GO_SECTION.basePath,
    summaryHeading: GO_SECTION.summaryLabel,
    siteTitle: `Intentional Code with ${GO_SECTION.label}`,
    homeTitle: GO_SECTION.homeTitle,
    homeDescription: GO_SECTION.homeDescription,
    philosophyDescription: GO_SECTION.philosophyDescription,
    themeStorageKey: GO_SECTION.themeStorageKey,
  },
  python: {
    slug: PYTHON_SECTION.key,
    label: PYTHON_SECTION.label,
    basePath: PYTHON_SECTION.basePath,
    summaryHeading: PYTHON_SECTION.summaryLabel,
    siteTitle: `Intentional Code with ${PYTHON_SECTION.label}`,
    homeTitle: PYTHON_SECTION.homeTitle,
    homeDescription: PYTHON_SECTION.homeDescription,
    philosophyDescription: PYTHON_SECTION.philosophyDescription,
    themeStorageKey: PYTHON_SECTION.themeStorageKey,
  },
};

export const COLLECTION_NAMES = {
  go: GO_SECTION.collections,
  python: PYTHON_SECTION.collections,
};

export const SWITCHABLE_LANGUAGES = SECTION_SWITCH_OPTIONS;

export function getLanguageConfig(language = 'go') {
  return LANGUAGE_CONFIG[language] ?? LANGUAGE_CONFIG.go;
}

export function getCollectionNames(language = 'go') {
  return COLLECTION_NAMES[language] ?? COLLECTION_NAMES.go;
}

export function switchLanguagePath(pathname = '/', targetLanguage = 'go') {
  const target = getLanguageConfig(targetLanguage);
  const parts = pathname.split('/').filter(Boolean);
  const currentLanguage = parts[0];
  if (!LANGUAGE_CONFIG[currentLanguage]) {
    return target.basePath;
  }
  parts[0] = target.slug;
  return `/${parts.join('/')}`;
}

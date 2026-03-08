export type SutraForForm = {
  id: string;
  title: string;
  subtitle?: string | null;
  language: string;
  category: string;
  translator: string;
  cbeta: string;
  children?: { id: string; title: string; subtitle?: string | null; language: string } | null;
};

export type RollForForm = {
  id: string;
  title: string;
  subtitle: string;
  children?: { id: string; title: string; subtitle: string } | null;
};

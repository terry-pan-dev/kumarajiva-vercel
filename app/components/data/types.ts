export type ContributorForForm = {
  id: string;
  name: string;
  role: string;
};

export type DocumentForForm = {
  id: string;
  workId: string;
  title: string;
  subtitle: string;
  language: string;
  contributors: ContributorForForm[];
};

export type ProjectForForm = {
  id: string;
  sourceDocument: DocumentForForm;
  targetDocument: DocumentForForm | null;
};

export type SectionForForm = {
  id: string;
  title: string;
  children?: { id: string; title: string } | null;
};

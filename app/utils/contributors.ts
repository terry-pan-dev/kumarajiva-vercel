import { CONTRIBUTOR_ROLE_VALUES, type ContributorRole } from '~/utils/constants';

// Reads the contributor rows encoded by DocumentForm (contributorCount +
// contributorName_i / contributorRole_i) out of a submitted FormData. Shared by
// every route that hosts a DocumentForm so the wire format lives in one place.
export function parseContributors(formData: FormData) {
  const count = parseInt(formData.get('contributorCount') as string, 10) || 0;
  const contributors: { name: string; role: ContributorRole }[] = [];
  for (let i = 0; i < count; i++) {
    const name = (formData.get(`contributorName_${i}`) as string)?.trim();
    const role = formData.get(`contributorRole_${i}`) as string;
    if (name && CONTRIBUTOR_ROLE_VALUES.includes(role as ContributorRole)) {
      contributors.push({ name, role: role as ContributorRole });
    }
  }
  return contributors;
}

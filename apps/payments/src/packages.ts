export interface ElmStarsPackage {
  id: string;
  starsAmount: number;
  elmAmount: number;
  title: string;
  description: string;
}

export const ELM_STARS_PACKAGES = [
  {
    id: 'stars_1',
    starsAmount: 1,
    elmAmount: 100,
    title: '100 ELM',
    description: '100 paid ELM for Elmental PvP',
  },
  {
    id: 'stars_5',
    starsAmount: 5,
    elmAmount: 600,
    title: '600 ELM',
    description: '600 paid ELM for Elmental PvP',
  },
  {
    id: 'stars_10',
    starsAmount: 10,
    elmAmount: 1300,
    title: '1300 ELM',
    description: '1300 paid ELM for Elmental PvP',
  },
] as const satisfies readonly ElmStarsPackage[];

export type ElmStarsPackageId = (typeof ELM_STARS_PACKAGES)[number]['id'];

export function findElmStarsPackage(packageId: string): ElmStarsPackage | undefined {
  return ELM_STARS_PACKAGES.find(pkg => pkg.id === packageId);
}

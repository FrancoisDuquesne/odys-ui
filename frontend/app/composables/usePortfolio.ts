import type { Asset, PortfolioVersion } from "~/types";

export function usePortfolio() {
  const listPortfolioVersions = (projectId: number | string) =>
    apiFetch<PortfolioVersion[]>(`/projects/${projectId}/portfolios`);

  const getPortfolioVersion = (id: number | string) => apiFetch<PortfolioVersion>(`/portfolio-versions/${id}`);

  const createPortfolioVersion = (projectId: number | string, name: string, assets: Asset[]) =>
    apiFetch<PortfolioVersion>(`/projects/${projectId}/portfolios`, {
      method: "POST",
      body: { name, assets },
    });

  return { listPortfolioVersions, getPortfolioVersion, createPortfolioVersion };
}

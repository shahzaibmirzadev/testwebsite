import { POSTED_WITHIN_OPTIONS } from "./filterConfig";
import { getSectorLabel } from "./sectorLogic";

/**
 * @param {import('./filterConfig').createInitialFilterState extends () => infer R ? R : never} state
 * @returns {{ id: string, label: string, onRemove: () => void }[]}
 */
export function buildResultChips(state, removeHandlers) {
  const chips = [];

  if (state.keyword.trim()) {
    chips.push({
      id: "kw",
      label: state.keyword.trim(),
      onRemove: removeHandlers.clearKeyword,
    });
  }
  if (state.location.trim()) {
    chips.push({
      id: "loc",
      label: state.location.trim(),
      onRemove: removeHandlers.clearLocation,
    });
  }
  if (state.sector) {
    chips.push({
      id: `sec:${state.sector}`,
      label: getSectorLabel(state.sector),
      onRemove: removeHandlers.clearSector,
    });
  }

  state.jobFamilies.forEach((v) =>
    chips.push({
      id: `jf:${v}`,
      label: v,
      onRemove: () => removeHandlers.toggleJobFamily(v),
    })
  );
  state.remote.forEach((v) =>
    chips.push({
      id: `rem:${v}`,
      label: v,
      onRemove: () => removeHandlers.toggleRemote(v),
    })
  );
  state.seniority.forEach((v) =>
    chips.push({
      id: `sen:${v}`,
      label: v,
      onRemove: () => removeHandlers.toggleSeniority(v),
    })
  );
  state.employmentTypes.forEach((v) =>
    chips.push({
      id: `et:${v}`,
      label: v,
      onRemove: () => removeHandlers.toggleEmployment(v),
    })
  );
  state.tags.forEach((v) =>
    chips.push({
      id: `tag:${v}`,
      label: v,
      onRemove: () => removeHandlers.toggleTag(v),
    })
  );
  state.regions.forEach((v) =>
    chips.push({
      id: `reg:${v}`,
      label: v,
      onRemove: () => removeHandlers.toggleRegion(v),
    })
  );
  state.companies.forEach((v) =>
    chips.push({
      id: `co:${v}`,
      label: v,
      onRemove: () => removeHandlers.toggleCompany(v),
    })
  );

  if (state.postedWithin != null) {
    const opt = POSTED_WITHIN_OPTIONS.find((o) => o.value === state.postedWithin);
    chips.push({
      id: "posted",
      label: opt ? opt.label : `${state.postedWithin}d`,
      onRemove: removeHandlers.clearPosted,
    });
  }

  return chips;
}

export type Diff = { files: string[] };

// loading, diff and error can contradict each other.
export type DiffState = { loading: boolean; diff?: Diff; error?: string };

export function describe(state: DiffState): string {
  if (state.loading) return "loading";
  if (state.error) return `failed: ${state.error}`;
  return `${(state.diff as Diff).files.length} files`;
}

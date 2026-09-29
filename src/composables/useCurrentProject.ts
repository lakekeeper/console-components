import { useFunctions } from '@/plugins/functions';
import { useVisualStore } from '@/stores/visual';

/**
 * Names the project a reader is in when the project listing refuses to say.
 *
 * `loadProjectList` is what normally fills `projectSelected`: it selects the
 * first project the moment the list arrives. Under an authorizer that refuses
 * the listing — the usual answer for a reader granted exactly one project on a
 * server that holds several — the list never arrives, so nothing was ever
 * selected and every surface that prints the selection had nothing to print.
 *
 * The reader is in a project all the same: it is the one `x-project-id` already
 * carries on every request, and `/management/v1/project` answers for exactly
 * that one. So it is asked directly, and the answer becomes the selection.
 */
export function useCurrentProject() {
  const visual = useVisualStore();
  const functions = useFunctions();

  /**
   * Resolves and stores the current project, unless one is already selected —
   * a selection carried over from a previous session is the answer, and
   * re-asking would only risk overwriting it.
   *
   * Refusal is an outcome, not a failure: a reader whose project is not the
   * one the request falls back to cannot be named, and the surfaces say "no
   * project" rather than naming a guess. So this never throws and never
   * snackbars — the caller is already handling a refusal.
   */
  async function ensureProjectSelected(): Promise<boolean> {
    if (visual.projectSelected['project-id']) return true;
    try {
      const project = await functions.getProject(
        visual.getServerInfo()['default-project-id'] || '',
        false,
      );
      if (!project?.['project-id']) return false;
      visual.setProjectSelected(project);
      return true;
    } catch {
      return false;
    }
  }

  return { ensureProjectSelected };
}

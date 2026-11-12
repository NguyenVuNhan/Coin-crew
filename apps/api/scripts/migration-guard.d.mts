export declare const DEPLOY_BRANCHES: string[];
export declare function findMigrationProblems(input: {
  applied: string[];
  files: string[];
  branch: string | null;
}): string[];

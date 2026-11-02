const SECRET_PATTERN =
  /(?:sk-[A-Za-z0-9]|ghp_|github_pat_|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-)/;

export function findSecretText(value: string | null | undefined): boolean {
  return Boolean(value && SECRET_PATTERN.test(value));
}

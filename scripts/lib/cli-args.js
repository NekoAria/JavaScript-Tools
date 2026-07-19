/**
 * Read the value following a command-line flag.
 *
 * @param {string[]} args
 * @param {string} flag
 * @returns {{ hasError: boolean, value: string | null }}
 */
export function getArgValue(args, flag) {
  const index = args.indexOf(flag);

  if (index === -1) {
    return { hasError: false, value: null };
  }

  const value = args[index + 1];

  if (value && !value.startsWith('--')) {
    return { hasError: false, value };
  }

  console.error(`${flag} requires a value.`);
  process.exitCode = 1;

  return { hasError: true, value: null };
}

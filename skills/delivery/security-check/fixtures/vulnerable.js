import child_process from 'node:child_process';

export function run(input) {
  return child_process.exec(input);
}

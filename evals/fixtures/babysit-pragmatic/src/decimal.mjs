// Sum finite numeric arguments without rounding the user's inputs.
const inputs = process.argv.slice(2);
if (!inputs.length || inputs.some((value) => !Number.isFinite(Number(value)))) {
  console.error("Usage: decimal <number> [number ...]");
  process.exit(2);
}
console.log(inputs.reduce((sum, value) => sum + parseInt(value, 10), 0));

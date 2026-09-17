// A channel is a module in this directory exporting `name` and `deliver({ to, message, config })`.
// Only channels named in the config are loadable.
export async function loadChannel(name, config) {
  if (!Object.hasOwn(config.channels, name)) throw new Error(`channel "${name}" is not configured`);
  const module = await import(`./${name}.mjs`);
  if (module.name !== name || typeof module.deliver !== "function") throw new Error(`channel module ${name}.mjs is malformed`);
  return module;
}

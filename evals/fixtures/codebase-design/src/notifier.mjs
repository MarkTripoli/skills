// Forwards every call to the channel loader unchanged.
import { loadChannel } from "./channels/index.mjs";

export async function getChannel(name, config) {
  return loadChannel(name, config);
}

export async function send(name, config, to, message) {
  const channel = await getChannel(name, config);
  return channel.deliver({ to, message, config });
}

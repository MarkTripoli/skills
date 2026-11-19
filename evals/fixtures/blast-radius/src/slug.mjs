// Turns a title into a URL slug.
export const slug = (title) => title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

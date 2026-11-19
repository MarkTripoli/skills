import { slug } from "./slug.mjs";

// Stored posts are looked up by the slug that was computed when they were saved.
export const postPath = (post) => `/posts/${slug(post.title)}`;
export const findPost = (posts, path) => posts.find((post) => `/posts/${post.savedSlug}` === path);

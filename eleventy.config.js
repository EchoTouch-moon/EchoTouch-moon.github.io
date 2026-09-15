import markdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
import markdownItFootnote from "markdown-it-footnote";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";

function normalizePathPrefix(value) {
  if (!value || value === "/") return "/";
  return `/${String(value).replace(/^\/+|\/+$/g, "")}/`;
}

function postSlug(post) {
  return post?.data?.slug || post?.fileSlug;
}

function adjacentPost(collection, current, offset) {
  const index = collection.findIndex((item) => item.inputPath === current.inputPath);
  return index < 0 ? null : collection[index + offset] || null;
}

function joinSitePath(base, subpath = "") {
  const theme = String(base ?? "").replace(/^\/+|\/+$/g, "");
  const rest = String(subpath ?? "").replace(/^\/+/, "");
  if (theme && rest) return `/${theme}/${rest}`;
  if (theme) return `/${theme}/`;
  return rest ? `/${rest}` : "/";
}

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(syntaxHighlight);

  const markdown = markdownIt({
    html: true,
    linkify: true,
    typographer: true
  })
    .use(markdownItAnchor, { level: [2, 3, 4] })
    .use(markdownItFootnote);

  eleventyConfig.setLibrary("md", markdown);

  // Keep the hand-built visual system as-is. Eleventy only supplies content and routing.
  eleventyConfig.addPassthroughCopy({
    "01-dithered-ink/assets": "assets",
    "site/.nojekyll": ".nojekyll",
    "site/images": "images"
  });

  eleventyConfig.addPassthroughCopy("site/posts/**/*.{png,jpg,jpeg,gif,webp,svg}");

  eleventyConfig.addWatchTarget("01-dithered-ink/assets");

  eleventyConfig.addCollection("posts", (collectionApi) => {
    const posts = collectionApi.getFilteredByGlob("site/posts/**/*.md");
    const slugs = new Map();

    for (const post of posts) {
      const missing = ["title", "slug", "description", "lede"].filter((key) => !post.data[key]);
      if (!post.data.date || Number.isNaN(new Date(post.data.date).getTime())) missing.push("date");
      if (missing.length) {
        throw new Error(`${post.inputPath}: missing required front matter: ${missing.join(", ")}`);
      }
      if (!/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(post.data.slug)) {
        throw new Error(`${post.inputPath}: slug must contain only letters, numbers, and single hyphens`);
      }
      if (slugs.has(post.data.slug)) {
        throw new Error(`${post.inputPath}: duplicate slug "${post.data.slug}" (also used by ${slugs.get(post.data.slug)})`);
      }
      slugs.set(post.data.slug, post.inputPath);
    }

    const includeDrafts = process.env.INCLUDE_DRAFTS === "true";
    return posts
      .filter((post) => includeDrafts || !post.data.draft)
      .sort((a, b) => b.date - a.date);
  });

  eleventyConfig.addFilter("readableDate", (date) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      timeZone: "UTC"
    }).format(date)
  );

  eleventyConfig.addFilter("htmlDateString", (date) =>
    new Date(date).toISOString().slice(0, 10)
  );

  eleventyConfig.addFilter("sitePath", joinSitePath);

  eleventyConfig.addFilter("postUrl", (post, theme) =>
    joinSitePath(theme, `posts/${postSlug(post)}/`)
  );

  eleventyConfig.addFilter("olderPost", (collection, current) =>
    adjacentPost(collection, current, 1)
  );

  eleventyConfig.addFilter("newerPost", (collection, current) =>
    adjacentPost(collection, current, -1)
  );

  eleventyConfig.addFilter("limit", (items, count) => items.slice(0, count));

  eleventyConfig.addFilter("readingTime", (html) => {
    const text = String(html)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&\w+;/g, " ");
    const han = (text.match(/[\u3400-\u9fff]/g) || []).length;
    const latin = (text.replace(/[\u3400-\u9fff]/g, " ").match(/[\p{L}\p{N}_'-]+/gu) || []).length;
    return Math.max(1, Math.ceil(latin / 220 + han / 400));
  });

  eleventyConfig.addFilter("year", (date) => new Date(date).getUTCFullYear());

  eleventyConfig.addFilter("byCategory", (posts, category) =>
    (posts || []).filter((post) => (post?.data?.category || "") === category)
  );

  return {
    pathPrefix: normalizePathPrefix(process.env.PATH_PREFIX),
    dir: {
      input: "site",
      includes: "_includes",
      data: "_data",
      output: "_site"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
}

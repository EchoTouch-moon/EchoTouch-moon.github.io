import { readFileSync } from "node:fs";

function withoutFrontMatter(markdown) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
}

export default class PublishedMarkdownSources {
  data() {
    return {
      pagination: {
        data: "collections.posts",
        size: 1,
        alias: "post"
      },
      permalink: (data) => `post-sources/${data.post.data.slug}.md`,
      eleventyExcludeFromCollections: true
    };
  }

  render({ post }) {
    const markdown = readFileSync(post.inputPath, "utf8");
    return `# ${post.data.title}\n\n${withoutFrontMatter(markdown)}\n`;
  }
}

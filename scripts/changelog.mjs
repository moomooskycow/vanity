import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const escape = (value) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

// Only the generator's headings, bullets and GitHub links become markup.
// Escape first; raw HTML and non-GitHub URLs remain inert text.
export function notesHtml(markdown) {
  return markdown.split("\n").map((line) => {
    if (line === "# Changelog") return "";
    const text = escape(line).replace(
      /\[([^\]]+)\]\((https:\/\/github\.com\/moomooskycow\/vanity\/[A-Za-z0-9_./%#?=&;-]+)\)/g,
      '<a href="$2">$1</a>',
    ).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    const heading = /^(#{2,3}) (.*)$/.exec(text);
    if (heading) return `<h${heading[1].length}>${heading[2]}</h${heading[1].length}>`;
    if (text.startsWith('* ')) return `<p class="change">${text.slice(2)}</p>`;
    return text ? `<p>${text}</p>` : "";
  }).join("\n");
}

export function changelog(revision) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("A full Git revision is required");
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const read = (path) => git("show", `${revision}:${path}`);
  const version = JSON.parse(read("package.json")).version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("A generated SemVer is required");
  const template = read("changelog.html");
  const hasNotes = git("ls-tree", "--name-only", revision, "CHANGELOG.md").trim();
  const notes = hasNotes ? read("CHANGELOG.md") : "No releases have been published yet.";
  return Buffer.from(template.replace("<!-- release -->", `Version ${version} · Source <a href="https://github.com/moomooskycow/vanity/commit/${revision}"><code>${revision}</code></a>`)
    .replace("<!-- notes -->", () => notesHtml(notes)));
}

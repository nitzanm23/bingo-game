import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const html = read("index.html");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);

test("HTML ids are unique and every id the scripts use exists", () => {
  assert.equal(new Set(ids).size, ids.length, "duplicate id in index.html");
  for (const file of ["scripts/game.js", "scripts/index.js"]) {
    for (const [, id] of read(file).matchAll(
      /(?:\$|getElementById)\("([^"]+)"\)/g,
    )) {
      assert.ok(ids.includes(id), `${file} uses a missing id: ${id}`);
    }
    for (const [, id] of read(file).matchAll(/^\s+"([a-z-]+-button)": /gm)) {
      assert.ok(ids.includes(id), `${file} wires a missing button: ${id}`);
    }
  }
});

test("ARIA references point to existing ids", () => {
  for (const [, value] of html.matchAll(
    /aria-(?:labelledby|describedby|controls)="([^"]+)"/g,
  )) {
    for (const id of value.split(" "))
      assert.ok(ids.includes(id), `broken ARIA reference: ${id}`);
  }
});

test("local files referenced by the HTML, CSS, and manifest exist", () => {
  for (const [, path] of html.matchAll(/(?:src|href)="(\.\/[^"#]+)/g)) {
    assert.ok(
      existsSync(resolve(root, path)),
      `missing HTML resource: ${path}`,
    );
  }
  for (const name of readdirSync(resolve(root, "styles"))) {
    const path = resolve(root, "styles", name);
    for (const [, url] of read(`styles/${name}`).matchAll(
      /url\(["']?([^)"'\s]+)["']?\)/g,
    )) {
      assert.ok(
        existsSync(resolve(dirname(path), url)),
        `missing CSS resource: ${url}`,
      );
    }
  }
  const manifest = JSON.parse(read("manifest.webmanifest"));
  for (const icon of manifest.icons) {
    assert.ok(
      existsSync(resolve(root, icon.src)),
      `missing manifest icon: ${icon.src}`,
    );
  }
});

test("every sound the game plays is included", () => {
  const names = new Set(["background-music"]);
  for (const file of ["scripts/game.js", "scripts/audio.js"]) {
    for (const [, name] of read(file).matchAll(
      /\b(?:play|prepare)\(\[?"([a-z-]+)"/g,
    ))
      names.add(name);
  }
  for (const [, list] of read("scripts/game.js").matchAll(
    /prepare\(\[([^\]]+)\]/g,
  )) {
    for (const [, name] of list.matchAll(/"([a-z-]+)"/g)) names.add(name);
  }
  for (const name of [
    ...names,
    "bingo",
    "lose",
    "hit",
    "miss",
    "error",
    "number-drawn",
  ]) {
    assert.ok(
      existsSync(resolve(root, `assets/audio/${name}.mp3`)),
      `missing sound: ${name}`,
    );
  }
});

test("every icon used in the HTML exists in the sprite", () => {
  const sprite = read("assets/icons/icons.svg");
  for (const [, name] of html.matchAll(/icons\.svg#([a-z-]+)/g)) {
    assert.ok(sprite.includes(`id="${name}"`), `missing icon: ${name}`);
  }
});

test("asset names are lowercase kebab-case with no case-only clashes", () => {
  const seen = new Set();
  (function check(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      assert.ok(!seen.has(path.toLowerCase()), `case-only clash: ${path}`);
      seen.add(path.toLowerCase());
      const pattern = entry.isDirectory()
        ? /^[a-z0-9]+(?:-[a-z0-9]+)*$/
        : /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+$/;
      assert.match(entry.name, pattern);
      if (entry.isDirectory()) check(path);
    }
  })(resolve(root, "assets"));
});

test("README links and images point to included files", () => {
  const readme = read("README.md");
  const links = [
    ...[...readme.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]),
    ...[...readme.matchAll(/src="([^"]+)"/g)].map((match) => match[1]),
  ];
  for (const link of links) {
    if (/^[a-z]+:/i.test(link) || link.startsWith("#")) continue;
    assert.ok(
      existsSync(resolve(root, link.split("#")[0])),
      `broken README link: ${link}`,
    );
  }
});

test("relative module imports resolve with exact case", () => {
  for (const folder of ["scripts", "tests"]) {
    for (const entry of readdirSync(resolve(root, folder), {
      recursive: true,
    })) {
      if (!entry.endsWith(".js")) continue;
      const path = resolve(root, folder, entry);
      for (const [, relative] of read(`${folder}/${entry}`).matchAll(
        /from "(\.[^"]+)"/g,
      )) {
        const target = resolve(dirname(path), relative);
        assert.ok(existsSync(target), `${folder}/${entry}: ${relative}`);
        const name = target.split("/").pop();
        assert.ok(
          readdirSync(dirname(target)).includes(name),
          `case mismatch: ${relative}`,
        );
      }
    }
  }
});

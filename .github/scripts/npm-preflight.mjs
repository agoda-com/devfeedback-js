// Verifies that NPM_TOKEN can actually publish every publishable workspace
// package, so a broken/expired/wrong-account token fails the PR instead of
// only surfacing as an E403 during the master publish.
//
// Checks, for the token's identity:
//   - the token is valid (npm whoami succeeds)
//   - for each already-published package: identity has read-write access
//   - for packages not yet on npm: a valid token is enough (first publish)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REGISTRY = "https://registry.npmjs.org";
const token = process.env.NPM_TOKEN;

if (!token) {
  console.log(
    "npm_token secret is not available (e.g. a fork PR). Skipping npm publish preflight.",
  );
  process.exit(0);
}

// Point npm at the registry with the token, without touching the repo tree.
fs.writeFileSync(
  path.join(os.homedir(), ".npmrc"),
  `//registry.npmjs.org/:_authToken=${token}\n`,
);

const npm = (args) =>
  execFileSync("npm", [...args, "--registry", REGISTRY], {
    encoding: "utf8",
  }).trim();

let whoami;
try {
  whoami = npm(["whoami"]);
} catch {
  console.error(
    "::error::npm_token is invalid or expired (npm whoami failed). Publish on master will 403.",
  );
  process.exit(1);
}
console.log(`npm identity: ${whoami}`);

const publishable = fs
  .readdirSync("packages")
  .map((dir) => path.join("packages", dir, "package.json"))
  .filter((file) => fs.existsSync(file))
  .map((file) => JSON.parse(fs.readFileSync(file, "utf8")))
  .filter((pkg) => pkg && !pkg.private && pkg.name)
  .map((pkg) => pkg.name);

const existsOnNpm = async (name) => {
  const res = await fetch(`${REGISTRY}/${encodeURIComponent(name)}`, {
    method: "HEAD",
  });
  return res.status === 200;
};

// Per-package collaborator check. Unlike `npm access list packages` (which only
// works for org accounts and 403s for a personal account), this works whether
// the packages are owned by a user or an org.
let failed = false;
for (const name of publishable) {
  let collaborators;
  try {
    collaborators = JSON.parse(
      npm(["access", "list", "collaborators", name, "--json"]),
    );
  } catch {
    // Couldn't read collaborators: fine if the package doesn't exist yet
    // (first publish), otherwise the token genuinely can't see/access it.
    if (await existsOnNpm(name)) {
      console.log(
        `FAIL  ${name}: '${whoami}' cannot read collaborators (token lacks access)`,
      );
      failed = true;
    } else {
      console.log(`ok    ${name}: not yet on npm, valid token can first-publish`);
    }
    continue;
  }

  const perm = collaborators[whoami];
  if (perm && perm.includes("write")) {
    console.log(`ok    ${name}: ${whoami} has ${perm}`);
  } else if (perm) {
    console.log(`FAIL  ${name}: ${whoami} has ${perm} (need read-write)`);
    failed = true;
  } else {
    console.log(`FAIL  ${name}: ${whoami} is not a collaborator`);
    failed = true;
  }
}

if (failed) {
  console.error(
    `\n::error::npm token '${whoami}' cannot publish one or more packages. ` +
      `Fix the token account/ownership before merging to master.`,
  );
  process.exit(1);
}

console.log("\nAll publishable packages are writable by this token.");

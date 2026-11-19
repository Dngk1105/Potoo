import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";
import prettier from "eslint-config-prettier/flat";

// Folder boundaries: see the "Thư mục" table in docs/architecture.md.
// Another element may be imported only through its index.ts.
const ENTRY = "index.{ts,tsx}";
const CORE_SHARED = ["core-ui", "core-auth", "core-config", "core-db"];
const CORE_ALL = ["core-contracts", "core-adapters", ...CORE_SHARED];

const viaEntry = (types) => ({ to: { element: { types, fileInternalPath: ENTRY } } });

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: { alwaysTryTypes: true } },
      "boundaries/elements": [
        { type: "app", pattern: "app" },
        { type: "core-contracts", pattern: "core/contracts" },
        { type: "core-adapters", pattern: "core/adapters" },
        { type: "core-ui", pattern: "core/ui" },
        { type: "core-auth", pattern: "core/auth" },
        { type: "core-config", pattern: "core/config" },
        { type: "core-db", pattern: "core/db" },
        { type: "module", pattern: "modules/*", capture: ["name"] },
      ],
    },
    rules: {
      ...boundaries.configs.recommended.rules,
      "boundaries/dependencies": [
        2,
        {
          default: "disallow",
          message:
            "{{ from.element.types.[0] }} must not import {{ to.element.types.[0] }} here. See the folder table in docs/architecture.md; import other elements only through their index.ts.",
          policies: [
            { from: { element: { type: "app" } }, allow: viaEntry([...CORE_ALL, "module"]) },
            { from: { element: { type: "module" } }, allow: viaEntry([...CORE_ALL, "module"]) },
            {
              from: { element: { type: "core-adapters" } },
              allow: viaEntry(["core-contracts", "core-db", "core-config"]),
            },
            { from: { element: { types: CORE_SHARED } }, allow: viaEntry(["core-contracts"]) },
          ],
        },
      ],
    },
  },
  // Must stay last: turns off rules that conflict with Prettier.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

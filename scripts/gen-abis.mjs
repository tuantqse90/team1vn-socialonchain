// Sinh ABI có kiểu (as const) từ artifact Foundry vào packages/protocol/src/abis.ts
// Thay cho @wagmi/cli: ít dependency hơn, kết quả giống nhau (xem Decision log).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contracts = ["IdentityRegistry", "SocialGraph", "Posts", "TestUSD", "PlanPayments"];
let out = "// AUTO-GENERATED bởi scripts/gen-abis.mjs từ contracts/out. Không sửa tay.\n\n";
for (const name of contracts) {
  const artifact = JSON.parse(readFileSync(join(root, `contracts/out/${name}.sol/${name}.json`), "utf8"));
  const varName = `${name[0].toLowerCase()}${name.slice(1)}Abi`;
  out += `export const ${varName} = ${JSON.stringify(artifact.abi, null, 2)} as const;\n\n`;
}
writeFileSync(join(root, "packages/protocol/src/abis.ts"), out);
console.log(`Wrote ABIs for ${contracts.join(", ")}`);

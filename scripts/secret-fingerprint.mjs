/**
 * 비밀값의 지문(SHA-256 앞 8자리)을 뽑는다. 값 자체는 화면에 안 보인다.
 *
 * 포트원 콘솔의 시크릿과 Vercel 에 들어간 시크릿이 같은지 보려고 만들었다.
 * 서버는 /api/version 에 같은 방식의 지문을 보여준다. 두 지문이 같으면 값이
 * 맞게 들어간 것이다. 지문으로는 원래 값을 알아낼 수 없다.
 *
 *   node scripts/secret-fingerprint.mjs
 */
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
process.stdout.write("시크릿을 붙여넣고 Enter (화면에 안 보입니다): ");
rl._writeToOutput = () => {}; // 입력을 화면에 찍지 않는다
rl.question("", (value) => {
  rl.close();
  const print = createHash("sha256").update(value.trim()).digest("hex").slice(0, 8);
  console.log(`\n지문: ${print}`);
});

/**
 * 비밀값의 지문(SHA-256 앞 8자리)을 뽑는다. 값 자체는 화면에 안 보인다.
 *
 * 포트원 콘솔의 시크릿과 Vercel 에 들어간 시크릿이 같은지 보려고 만들었다.
 * 서버는 /api/version 에 같은 방식의 지문을 보여준다. 두 지문이 같으면 값이
 * 맞게 들어간 것이다. 지문으로는 원래 값을 알아낼 수 없다.
 *
 *   node scripts/secret-fingerprint.mjs
 *
 * 값을 명령줄 인자로 받지 않는다 — 셸 기록에 그대로 남는다.
 */
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

/*
  빈 입력은 다시 묻는다. 명령을 붙여넣을 때 Enter 가 딸려 들어가면 스크립트가
  빈 값의 지문(e3b0c442)을 내고 끝나 버리고, 그 뒤에 붙인 시크릿은 셸이
  명령어로 받아 화면과 기록에 그대로 남았다. 실제로 그렇게 새었다.
*/
function ask() {
  process.stdout.write("시크릿을 붙여넣고 Enter (화면에 안 보입니다): ");
  rl.question("", (value) => {
    const secret = value.trim();
    if (secret === "") {
      process.stdout.write("\n아무것도 안 들어왔어요. 다시 붙여넣어 주세요.\n");
      ask();
      return;
    }
    rl.close();
    const print = createHash("sha256").update(secret).digest("hex").slice(0, 8);
    console.log(`\n지문: ${print}`);
  });
}

rl._writeToOutput = () => {}; // 입력을 화면에 찍지 않는다
ask();

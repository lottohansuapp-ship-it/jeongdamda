"use client";

import { useState } from "react";
import { createCategory, deleteCategory, renameCategory } from "@/lib/actions";
import type { Category, ProductWithCategory } from "@/types/database";

const INPUT =
  "h-12 w-full rounded-card border border-line bg-canvas px-4 text-[15px] placeholder:text-ink-faint focus:border-olive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive";

/**
 * 카테고리 이름 바꾸기·지우기·추가. 예전엔 반찬을 추가할 때 만들기만 할 수 있어서
 * 오타가 난 카테고리도, 안 쓰는 카테고리도 손님 화면에 그대로 남았다.
 *
 * 반찬이 든 카테고리는 지울 수 없다(DB 가 막는다). 몇 가지가 들어 있는지 보여 주고,
 * 먼저 반찬의 「수정 → 카테고리」 에서 옮기도록 안내한다.
 */
export function CategoryManager({
  categories,
  products,
  onNotice,
  onError,
  onDeleted,
}: {
  categories: Category[];
  products: ProductWithCategory[];
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  /** 지금 걸러 보던 카테고리가 지워지면 목록 필터를 풀어야 한다 */
  onDeleted: (slug: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const counts = new Map<string, number>();
  for (const product of products) {
    counts.set(product.category_id, (counts.get(product.category_id) ?? 0) + 1);
  }

  async function run(
    key: string,
    task: () => Promise<{ ok: boolean; error?: string }>,
    done: string,
  ): Promise<boolean> {
    setBusy(key);
    const result = await task().catch(() => ({
      ok: false,
      error: "연결이 끊겼어요. 다시 해 주세요.",
    }));
    setBusy(null);
    if (result.ok) onNotice(done);
    else onError(result.error ?? "저장하지 못했어요");
    return result.ok;
  }

  function rename(category: Category, value: string) {
    const next = value.trim();
    if (!next || next === category.name) return;
    void run(category.id, () => renameCategory(category.id, next), `「${next}」(으)로 바꿨어요`);
  }

  async function remove(category: Category) {
    const count = counts.get(category.id) ?? 0;
    if (count > 0) {
      onError(
        `「${category.name}」에 반찬 ${count}가지가 있어요. 반찬의 「수정 → 카테고리」에서 옮긴 뒤 지워 주세요.`,
      );
      return;
    }
    if (!confirm(`「${category.name}」 카테고리를 지울까요?`)) return;
    const ok = await run(category.id, () => deleteCategory(category.id), "카테고리를 지웠어요");
    if (ok) onDeleted(category.slug);
  }

  async function add() {
    const ok = await run(
      "new",
      () => createCategory(newName, categories.length + 1),
      "카테고리를 만들었어요",
    );
    if (ok) setNewName("");
  }

  return (
    <section
      className="mb-4 rounded-card bg-white p-4 shadow-soft"
      aria-labelledby="category-heading"
    >
      <h2 id="category-heading" className="text-[15px]">
        카테고리 관리
      </h2>
      <p className="pt-1 text-[13.5px] leading-relaxed text-ink-soft">
        이름을 고치고 칸 밖을 누르면 바로 저장돼요. 손님 화면 카테고리 줄에 그대로 보여요.
      </p>

      <ul className="mt-3 space-y-2">
        {categories.map((category) => {
          const count = counts.get(category.id) ?? 0;
          return (
            <li key={category.id} className="flex items-center gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">{category.name} 카테고리 이름</span>
                <input
                  // 이름이 바뀌면 칸을 새로 그려 저장된 값을 보여 준다
                  key={category.name}
                  defaultValue={category.name}
                  maxLength={20}
                  disabled={busy === category.id}
                  onBlur={(event) => rename(category, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  className={INPUT}
                />
              </label>
              <span className="w-14 shrink-0 text-center text-[13px] tabular-nums text-ink-soft">
                {count}가지
              </span>
              <button
                type="button"
                onClick={() => void remove(category)}
                disabled={busy === category.id}
                aria-disabled={count > 0}
                aria-label={`${category.name} 카테고리 지우기`}
                className={`h-12 shrink-0 rounded-card px-3.5 text-[14px] transition-colors duration-200 disabled:opacity-40 ${
                  count > 0 ? "text-ink-faint" : "text-danger hover:bg-danger/5"
                }`}
              >
                지우기
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex gap-2 border-t border-line pt-3">
        <label className="min-w-0 flex-1">
          <span className="sr-only">새 카테고리 이름</span>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            maxLength={20}
            placeholder="새 카테고리 이름"
            className={INPUT}
          />
        </label>
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy === "new" || !newName.trim()}
          className="h-12 shrink-0 rounded-card bg-olive px-4 text-[14px] text-white transition-colors duration-200 hover:bg-olive-deep disabled:opacity-40"
        >
          추가
        </button>
      </div>
    </section>
  );
}

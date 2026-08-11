/**
 * 매장 PC 주문 알림.
 *
 * 사장님은 관리자 화면을 하루 종일 켜 두신다. 주문이 들어와도 화면을 보고
 * 있지 않으면 모른다. 소리로 알린다.
 *
 * 소리는 두 겹이다.
 *   · 삐 소리 — 브라우저가 직접 만든다. 어느 PC 에서나 난다.
 *   · "주문, 주문" 음성 — 한국어 목소리가 깔린 PC 에서만 난다.
 *
 * 음성 하나만 쓰면 목소리가 없는 PC 에서 아무 소리도 안 난다. 그러면
 * 사장님은 알림이 켜진 줄 알고 주문을 놓친다. 삐 소리가 진짜 알림이고
 * 음성은 그 위에 얹는 것이다.
 */

/** 몇 번 울릴지. 매장 안에서 다른 일 하다가 들어야 한다. */
const REPEATS = 3;
const GAP_SEC = 1.2;

/** 두 음. 한 음만 쓰면 냉장고·전자레인지 소리와 구분이 안 된다. */
const TONES_HZ = [880, 1175];
const TONE_SEC = 0.18;

export interface AlarmCheck {
  /** 이번에 새로 들어온 주문 수. 0 이면 소리를 내지 않는다. */
  count: number;
  /** 다음 비교에 쓸 기준 시각 (epoch ms). */
  watermark: number;
}

/**
 * 새 주문이 몇 건인지 센다.
 *
 * id 를 모아 두고 비교하면 안 된다. 기간을 "오늘"에서 "7일"로 바꾸는 순간
 * 지난 며칠 주문이 통째로 처음 보는 id 로 들어와서 서른 번 울린다.
 * 시각을 기준으로 보면 기간을 넓혀도 들어오는 건 전부 기준보다 과거라
 * 저절로 조용하다.
 *
 * watermark 가 null 이면 첫 화면이다. 그때 있던 주문은 새 주문이 아니다.
 */
export function checkNewOrders(
  createdAts: readonly string[],
  watermark: number | null,
): AlarmCheck {
  const times = createdAts.map((at) => Date.parse(at)).filter(Number.isFinite);
  const newest = times.length > 0 ? Math.max(...times) : 0;

  if (watermark === null) return { count: 0, watermark: newest };

  return {
    count: times.filter((at) => at > watermark).length,
    watermark: Math.max(watermark, newest),
  };
}

let audio: AudioContext | null = null;
let pending: ReturnType<typeof setTimeout>[] = [];

/**
 * 소리를 켠다. 반드시 사장님이 버튼을 누른 그 순간에 불러야 한다 —
 * 브라우저는 사람이 누르지 않은 소리를 막는다. 새로고침하면 다시 눌러야 한다.
 */
export function armAlarm(): boolean {
  if (typeof window === "undefined") return false;
  if (!window.AudioContext) return false;

  audio ??= new AudioContext();
  // 탭이 뒤로 갔다 오면 멈춰 있을 때가 있다.
  void audio.resume();
  return true;
}

/** 사장님이 확인을 누르면 남은 울림을 끊는다. */
export function stopAlarm(): void {
  for (const id of pending) clearTimeout(id);
  pending = [];
  window.speechSynthesis?.cancel();
}

export function playOrderAlarm(count = 1): void {
  if (!audio) return;
  void audio.resume();

  stopAlarm();
  for (let i = 0; i < REPEATS; i += 1) {
    beep(audio.currentTime + i * GAP_SEC);
  }
  speak(count);
}

function beep(at: number): void {
  const ctx = audio;
  if (!ctx) return;

  TONES_HZ.forEach((hz, index) => {
    const start = at + index * TONE_SEC;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = hz;

    // 소리를 뚝 끊으면 "딱" 하는 잡음이 섞인다. 여닫이를 부드럽게 한다.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
    gain.gain.linearRampToValueAtTime(0, start + TONE_SEC);

    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + TONE_SEC + 0.02);
  });
}

function speak(count: number): void {
  const tts = window.speechSynthesis;
  if (!tts) return;

  const say = (text: string, delayMs: number) => {
    pending.push(
      setTimeout(() => {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = "ko-KR";
        // 목록이 늦게 채워지는 브라우저가 있다. 없으면 lang 만 보고 고르게 둔다.
        const korean = tts.getVoices().find((v) => v.lang.startsWith("ko"));
        if (korean) utter.voice = korean;
        tts.speak(utter);
      }, delayMs),
    );
  };

  say("주문, 주문", 200);
  if (count > 1) say(`새 주문 ${count}건`, 2200);
}

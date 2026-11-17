"use client";
import { useState, useTransition } from "react";
import { gradeCard } from "../actions";

interface Card { id: string; kind: string; prompt: string; choices: string[]; answerIndex: number; explanation: string; isIllustrative: boolean }

export function Quiz({ cards }: { cards: Card[] }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [, start] = useTransition();
  if (cards.length === 0) return <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-mute">今は復習するカードがありません。Day を選んで学習しましょう。</p>;
  if (i >= cards.length) return <div className="card text-center" data-testid="quiz-done"><p className="text-2xl font-light">{score} / {cards.length}</p><p className="mt-1 text-sm text-mute">間違えたカードは優先的に再出題されます。</p><button className="btn mt-3" onClick={() => { setI(0); setScore(0); setPicked(null); }}>もう一度</button></div>;
  const c = cards[i];
  const answered = picked !== null;
  const choose = (k: number) => {
    if (answered) return;
    setPicked(k);
    const correct = k === c.answerIndex;
    if (correct) setScore((x) => x + 1);
    start(() => gradeCard(c.id, correct ? 1 : 0));
  };
  return (
    <div className="card">
      <p className="h-label">{i + 1} / {cards.length}{c.isIllustrative ? " · 教材用の仮想例" : ""}{c.kind === "IMAGE" ? " · 写真クイズ" : ""}</p>
      {c.prompt.startsWith("image:") ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/image/${c.prompt.slice(6).split("|")[0]}`} alt="出題の商品写真（自分で撮影）" className="mt-2 max-h-72 w-full rounded-lg border border-line object-contain" />
          <p className="mt-2 text-lg">{c.prompt.split("|")[1]}</p>
        </>
      ) : <p className="mt-2 text-lg leading-relaxed">{c.prompt}</p>}
      <ul className="mt-3 space-y-2">
        {c.choices.map((ch, k) => {
          const state = !answered ? "border-line" : k === c.answerIndex ? "border-buy bg-buy/10" : k === picked ? "border-pass bg-pass/10" : "border-line opacity-60";
          return <li key={k}><button onClick={() => choose(k)} aria-pressed={picked === k} className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${state}`}>{ch}{answered && k === c.answerIndex ? " ✓" : answered && k === picked ? " ✕" : ""}</button></li>;
        })}
      </ul>
      {answered && (
        <div className="mt-3">
          <p className="text-sm text-silver">{c.explanation}</p>
          <button className="btn-primary mt-3 w-full" onClick={() => { setI(i + 1); setPicked(null); }}>次へ</button>
        </div>
      )}
    </div>
  );
}

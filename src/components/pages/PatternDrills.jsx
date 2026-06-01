import React, { useState, useEffect } from "react";
import { Eye, Flame, Trophy, Check, X, ArrowRight, RotateCcw, Compass } from "lucide-react";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import { getBestStreak, recordStreak } from "@/lib/drills";

const ROUND_SIZE = 10;

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Three wrong answers for one question. In a single-category deck every option
// is from that category. In the "all" deck we keep one same-category near-miss
// (the genuinely hard distinction) but draw the rest from anywhere, so the deck
// still tests whether you can place the category at all.
function pickOptions(bank, answer, scope) {
  const others = bank.filter((p) => p.slug !== answer.slug);
  const sameCat = shuffle(others.filter((p) => p.category === answer.category));

  let distractors;
  if (scope === "all") {
    const near = sameCat.slice(0, 1);
    const rest = shuffle(others.filter((p) => !near.includes(p)));
    distractors = [...near, ...rest].slice(0, 3);
  } else {
    distractors = sameCat.slice(0, 3);
  }
  return shuffle([answer, ...distractors]);
}

function buildRound(bank, scope, count) {
  const pool = scope === "all" ? bank : bank.filter((p) => p.category === scope);
  return shuffle(pool)
    .slice(0, count)
    .map((answer) => ({ answer, options: pickOptions(bank, answer, scope) }));
}

export default function PatternDrills({ bank = [], categoryOrder = [], basePath = "/go", pathname = "/go/drills" }) {
  const [phase, setPhase] = useState("start"); // start | playing | done
  const [scope, setScope] = useState("all");
  const [round, setRound] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [newRecord, setNewRecord] = useState(false);

  useEffect(() => {
    setBestStreak(getBestStreak());
  }, []);

  const current = round[qIndex];

  const decks = [
    { key: "all", label: "All patterns", count: bank.length },
    ...categoryOrder.map((slug) => ({
      key: slug,
      label: titleCase(slug),
      count: bank.filter((p) => p.category === slug).length,
    })),
  ];

  const start = (deckScope) => {
    setScope(deckScope);
    setRound(buildRound(bank, deckScope, ROUND_SIZE));
    setQIndex(0);
    setSelected(null);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setNewRecord(false);
    setPhase("playing");
  };

  const answer = (slug) => {
    if (selected) return;
    setSelected(slug);
    if (slug === current.answer.slug) {
      setScore((s) => s + 1);
      const next = streak + 1;
      setStreak(next);
      if (next > maxStreak) setMaxStreak(next);
    } else {
      setStreak(0);
    }
  };

  const advance = () => {
    if (qIndex + 1 >= round.length) {
      const prevBest = bestStreak;
      setBestStreak(recordStreak(maxStreak));
      setNewRecord(maxStreak > prevBest && maxStreak > 0);
      setPhase("done");
    } else {
      setQIndex((i) => i + 1);
      setSelected(null);
    }
  };

  useEffect(() => {
    if (phase !== "playing" || !current) return;
    const onKey = (e) => {
      if (!selected) {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= current.options.length) {
          answer(current.options[n - 1].slug);
        }
      } else if (e.key === "Enter" || e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, selected, qIndex, round, streak, maxStreak, bestStreak]);

  const isCorrect = selected && selected === current?.answer.slug;
  const isLast = qIndex + 1 >= round.length;
  const answeredFraction = round.length ? (qIndex + (selected ? 1 : 0)) / round.length : 0;

  const optionClass = (option) => {
    if (!selected) return "border-border hover:border-primary/60 hover:bg-accent/20 cursor-pointer";
    if (option.slug === current.answer.slug) return "border-emerald-500/60 bg-emerald-500/10 cursor-default";
    if (option.slug === selected) return "border-red-500/60 bg-red-500/10 cursor-default";
    return "border-border opacity-50 cursor-default";
  };

  const badgeClass = (option, isAnswer, isPicked) => {
    if (!selected) return "bg-muted text-muted-foreground";
    if (isAnswer) return "bg-emerald-500 text-white";
    if (isPicked) return "bg-red-500 text-white";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
      <Breadcrumbs pathname={pathname} />

      {/* ── Start ── */}
      {phase === "start" && (
        <div>
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-3 flex items-center gap-2.5">
              <Eye className="h-7 w-7 text-primary" />
              Spot the Pattern
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              You get a real-world symptom — the kind of thing you'd notice in a code review. Name the
              pattern it calls for. The Finder helps when you already have a problem; this builds the
              instinct to recognise it without one.
            </p>
          </div>

          {bestStreak > 0 && (
            <div className="mb-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card text-sm">
              <Trophy className="h-4 w-4 text-amber-500" />
              <span className="text-muted-foreground">Best streak</span>
              <span className="font-semibold text-foreground tabular-nums">{bestStreak}</span>
            </div>
          )}

          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Pick a deck</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {decks.map((deck) => (
              <button
                key={deck.key}
                onClick={() => start(deck.key)}
                className="group text-left p-4 rounded-lg border border-border hover:border-primary/60 hover:bg-accent/20 transition-all flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-medium text-foreground group-hover:text-primary transition-colors">{deck.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {Math.min(ROUND_SIZE, deck.count)} questions · {deck.count} patterns
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Playing ── */}
      {phase === "playing" && current && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setPhase("start")}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Change deck
            </button>
            <div className="flex items-center gap-4 text-sm">
              <span className="inline-flex items-center gap-1.5" title="Current streak">
                <Flame className={`h-4 w-4 ${streak > 0 ? "text-orange-500" : "text-muted-foreground"}`} />
                <span className="tabular-nums font-medium text-foreground">{streak}</span>
              </span>
              <span className="text-muted-foreground tabular-nums">{score} correct</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Question {qIndex + 1} of {round.length}</span>
            <span className="capitalize">{scope === "all" ? "All patterns" : titleCase(scope)}</span>
          </div>
          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mb-8">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${answeredFraction * 100}%` }} />
          </div>

          <div className="mb-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">The symptom</div>
            <div className="p-4 rounded-lg border-l-2 border-primary bg-card">
              <p className="text-lg text-foreground leading-relaxed">{current.answer.hook}</p>
            </div>
            <p className="text-sm text-muted-foreground mt-3">Which pattern does this call for?</p>
          </div>

          <div className="grid gap-3">
            {current.options.map((option, i) => {
              const isAnswer = option.slug === current.answer.slug;
              const isPicked = option.slug === selected;
              return (
                <button
                  key={option.slug}
                  onClick={() => answer(option.slug)}
                  disabled={!!selected}
                  className={`w-full text-left p-4 rounded-lg border transition-all flex items-center gap-3 ${optionClass(option)}`}
                >
                  <span className={`flex items-center justify-center w-6 h-6 rounded shrink-0 text-xs font-semibold tabular-nums ${badgeClass(option, isAnswer, isPicked)}`}>
                    {selected && isAnswer ? <Check className="h-4 w-4" /> : selected && isPicked ? <X className="h-4 w-4" /> : i + 1}
                  </span>
                  <span className="font-medium text-foreground">{option.title}</span>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="mt-6 p-5 rounded-lg border border-border bg-card">
              <div className={`text-sm font-semibold mb-2 ${isCorrect ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                {isCorrect ? "Correct" : `Not quite — that's ${current.options.find((o) => o.slug === selected)?.title}`}
              </div>
              <div className="text-sm text-foreground font-medium mb-1">{current.answer.title}</div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">{current.answer.intent}</p>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <a
                  href={current.answer.path}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  Read the pattern <ArrowRight className="h-3.5 w-3.5" />
                </a>
                <button
                  onClick={advance}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  {isLast ? "See results" : "Next"} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Done ── */}
      {phase === "done" && (
        <div>
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
              <Trophy className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-1">Round complete</h1>
            <p className="text-muted-foreground">
              You scored <span className="font-semibold text-foreground">{score}</span> of {round.length}.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-8">
            <div className="p-5 rounded-lg border border-border bg-card text-center">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Longest streak</div>
              <div className="text-3xl font-bold text-foreground tabular-nums">{maxStreak}</div>
            </div>
            <div className="p-5 rounded-lg border border-border bg-card text-center">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Best ever</div>
              <div className="text-3xl font-bold text-foreground tabular-nums flex items-center justify-center gap-2">
                {bestStreak}
                {newRecord && <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">New!</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 justify-center flex-wrap">
            <button
              onClick={() => start(scope)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <RotateCcw className="h-4 w-4" /> Play again
            </button>
            <button
              onClick={() => setPhase("start")}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Change deck
            </button>
          </div>

          <p className="text-sm text-muted-foreground text-center mt-8">
            Faced with a real problem instead?{" "}
            <a href={`${basePath}/finder`} className="text-primary hover:underline inline-flex items-center gap-1">
              <Compass className="h-3.5 w-3.5" /> Use the Finder
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

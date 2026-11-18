import { describe, expect, it } from "vitest";
import { buildAskAnswer } from "@/lib/ai/askAnswer";

const articles = [
  { id: "a", title: "A", url: "https://a" },
  { id: "b", title: "B", url: "https://b" },
  { id: "c", title: "C", url: "https://c" },
];

describe("buildAskAnswer", () => {
  it("numbers markers after the sources list", () => {
    const result = buildAskAnswer(
      { intro: "Intro.", points: [{ text: "About C.", index: 3 }, { text: "About A.", index: 1 }] },
      articles,
    );
    expect(result.answer).toBe("Intro.\n\n1. About C. [1]\n\n2. About A. [2]");
    expect(result.sources.map((s) => s.id)).toEqual(["c", "a"]);
    expect(result.grounded).toBe(true);
  });

  it("drops points citing a number that isn't on the list, without shifting markers", () => {
    const result = buildAskAnswer(
      {
        intro: "",
        points: [
          { text: "Made up.", index: 9 },
          { text: "About B.", index: 2 },
          { text: "More on B.", index: 2 },
        ],
      },
      articles,
    );
    expect(result.answer).toBe("1. About B. [1]\n\n2. More on B. [1]");
    expect(result.sources.map((s) => s.id)).toEqual(["b"]);
  });

  it("is ungrounded when no point cites a real article", () => {
    const nothing = buildAskAnswer({ intro: "Nothing matches.", points: [] }, articles);
    expect(nothing).toEqual({ answer: "Nothing matches.", sources: [], grounded: false });

    const onlyBad = buildAskAnswer({ intro: "", points: [{ text: "x", index: 0 }] }, articles);
    expect(onlyBad).toEqual({ answer: "", sources: [], grounded: false });
  });
});

import { destroy, types, unprotect } from "mobx-state-tree";

describe("VideoRectangleRegion.getMergedSequence", () => {
  let TestRoot;
  let roots = [];

  const kf = (frame, enabled, x = frame) => ({ x, y: 0, width: 10, height: 10, rotation: 0, frame, enabled });

  const create = (first, second) => {
    const root = TestRoot.create({
      video: { id: "vid1", name: "vid1", framerate: "24" },
      a: { id: "a", pid: "a", object: "vid1", sequence: first },
      b: { id: "b", pid: "b", object: "vid1", sequence: second },
    });
    unprotect(root);
    root.video.length = 100;
    roots.push(root);
    return root;
  };

  beforeAll(() => {
    require("../../stores/RegionStore");
    const { VideoModel } = require("../../tags/object/Video");
    const { VideoRectangleRegionModel } = require("../VideoRectangleRegion");

    TestRoot = types.model("TestRoot", {
      video: VideoModel,
      a: VideoRectangleRegionModel,
      b: VideoRectangleRegionModel,
    });
  });

  afterEach(() => {
    roots.forEach((root) => destroy(root));
    roots = [];
  });

  it("joins adjacent tracks", () => {
    const { a, b } = create([kf(0, true), kf(10, false)], [kf(11, true), kf(20, false)]);

    expect(a.getMergedSequence(b)).toEqual([kf(0, true), kf(10, false), kf(11, true), kf(20, false)]);
  });

  it("is symmetric", () => {
    const { a, b } = create([kf(0, true), kf(10, false)], [kf(11, true), kf(20, false)]);

    expect(b.getMergedSequence(a)).toEqual(a.getMergedSequence(b));
  });

  it("keeps the gap between tracks hidden", () => {
    const { a, b } = create([kf(0, true), kf(10, false)], [kf(30, true), kf(40, false)]);

    a.replaceSequence(a.getMergedSequence(b));

    expect(a.isInLifespan(10)).toBe(true);
    expect(a.isInLifespan(11)).toBe(false);
    expect(a.isInLifespan(29)).toBe(false);
    expect(a.isInLifespan(30)).toBe(true);
  });

  it("ends an open-ended track at its last keyframe when the other track continues after it", () => {
    const { a, b } = create([kf(0, true), kf(10, true)], [kf(30, true)]);

    expect(a.getMergedSequence(b)).toEqual([kf(0, true), kf(10, false), kf(30, true)]);
  });

  it("keeps the later track open-ended", () => {
    const { a, b } = create([kf(0, true), kf(10, false)], [kf(30, true)]);

    expect(a.getMergedSequence(b).at(-1)).toEqual(kf(30, true));
  });

  it("ends an open-ended track that starts inside a hidden gap of the other", () => {
    const { a, b } = create([kf(0, true), kf(10, false), kf(50, true)], [kf(20, true)]);

    expect(a.getMergedSequence(b)).toEqual([kf(0, true), kf(10, false), kf(20, false), kf(50, true)]);
  });

  it("merges a track that fits into a hidden gap of the other", () => {
    const { a, b } = create([kf(0, true), kf(10, false), kf(50, true), kf(60, false)], [kf(20, true), kf(30, false)]);

    expect(a.getMergedSequence(b).map(({ frame }) => frame)).toEqual([0, 10, 20, 30, 50, 60]);
  });

  it.each([
    ["overlapping ranges", [kf(0, true), kf(20, false)], [kf(10, true), kf(30, false)]],
    ["shared boundary frame", [kf(0, true), kf(10, false)], [kf(10, true), kf(20, false)]],
    ["same start frame", [kf(0, true), kf(10, false)], [kf(0, true), kf(5, false)]],
    ["track inside visible interpolation", [kf(0, true), kf(50, false)], [kf(20, true), kf(30, false)]],
  ])("returns null for %s", (_, first, second) => {
    const { a, b } = create(first, second);

    expect(a.getMergedSequence(b)).toBeNull();
  });

  it("returns null when merging a track with itself", () => {
    const { a } = create([kf(0, true), kf(10, false)], [kf(20, true)]);

    expect(a.getMergedSequence(a)).toBeNull();
  });

  it("restores the original track after a split", () => {
    const original = [kf(0, true, 0), kf(20, true, 40), kf(40, false, 0)];
    const reference = create(original, [kf(99, false)]).a;
    const { a, b } = create(original, [kf(99, false)]);
    const { head, tail } = a.getSplitSequences(13);

    a.replaceSequence(head);
    b.replaceSequence(tail);
    a.replaceSequence(a.getMergedSequence(b));

    for (let frame = 0; frame < 100; frame++) {
      expect(a.isInLifespan(frame)).toBe(reference.isInLifespan(frame));
      if (!reference.isInLifespan(frame)) continue;

      const expected = reference.getShape(frame);
      const actual = a.getShape(frame);

      for (const prop of Object.keys(expected)) expect(actual[prop]).toBeCloseTo(expected[prop]);
    }
  });
});

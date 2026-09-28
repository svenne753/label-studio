import { types } from "mobx-state-tree";

import NormalizationMixin from "../mixins/Normalization";
import RegionsMixin from "../mixins/Regions";
import Registry from "../core/Registry";
import { AreaMixin } from "../mixins/AreaMixin";
import { onlyProps, VideoRegion } from "./VideoRegion";
import { interpolateProp } from "../utils/props";

/**
 * An open-ended track (last keyframe interpolating) ends its lifespan at its last keyframe
 * if the other track has keyframes after it.
 */
const closeOpenEnd = (sequence, other) => {
  const last = sequence.at(-1);

  if (!last?.enabled || !(other.at(-1)?.frame > last.frame)) return sequence;

  return [...sequence.slice(0, -1), { ...last, enabled: false }];
};

// [start, end] frame ranges in which the track is visible, sorted and disjoint
const visibleRanges = (sequence) =>
  sequence.map((kp, i) => {
    if (!kp.enabled) return [kp.frame, kp.frame];

    const next = sequence[i + 1];

    return [kp.frame, next ? next.frame - 1 : Number.POSITIVE_INFINITY];
  });

const rangesOverlap = (a, b) => {
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    const [aStart, aEnd] = a[i];
    const [bStart, bEnd] = b[j];

    if (aStart <= bEnd && bStart <= aEnd) return true;
    if (aEnd < bEnd) i++;
    else j++;
  }

  return false;
};

const Model = types
  .model("VideoRectangleRegionModel", {
    type: "videorectangleregion",
  })
  .volatile(() => ({
    props: ["x", "y", "width", "height", "rotation"],
  }))
  .views((self) => ({
    getShape(frame) {
      let prev;
      let next;

      for (const item of self.sequence) {
        if (item.frame === frame) {
          return onlyProps(self.props, item);
        }

        if (item.frame > frame) {
          next = item;
          break;
        }
        prev = item;
      }

      if (!prev) return null;
      if (!next) return onlyProps(self.props, prev);

      return Object.fromEntries(self.props.map((prop) => [prop, interpolateProp(prev, next, frame, prop)]));
    },

    getVisibility() {
      return true;
    },

    /**
     * Track can be split at `frame` when the region is visible at `frame`
     * and has at least one visible frame after it.
     */
    canSplitAt(frame) {
      const prev = self.closestKeypoint(frame, true);

      if (!prev) return false;
      if (!prev.enabled && prev.frame !== frame) return false;

      return self.sequence.some((kp) => kp.frame > frame) || (prev.enabled && frame < self.object.length);
    },

    /**
     * Split keyframe sequence at `frame`:
     * - `head` keeps everything up to and including `frame`, ending the lifespan there;
     * - `tail` contains everything after `frame`, starting at `frame + 1` if the track was continuous.
     * Interpolated shapes at the boundary are materialized as keyframes, so both parts
     * look exactly as the original track did.
     */
    getSplitSequences(frame) {
      if (!self.canSplitAt(frame)) return null;

      const prev = self.closestKeypoint(frame, true);
      const current = self.sequence.find((kp) => kp.frame === frame);
      const head = [
        ...self.sequence.filter((kp) => kp.frame < frame),
        { ...(current ?? self.getShape(frame)), frame, enabled: false },
      ];
      const tail = self.sequence.filter((kp) => kp.frame > frame);

      if (prev.enabled && tail[0]?.frame !== frame + 1) {
        tail.unshift({ ...self.getShape(frame + 1), frame: frame + 1, enabled: true });
      }

      return { head, tail };
    },

    /**
     * Combined keyframe sequence of this track and `other`, or null if they can't be merged:
     * both must be tracks of the same type on the same video that are never visible on the same frame.
     * Hidden gaps between the tracks stay hidden.
     */
    getMergedSequence(other) {
      if (!other || other === self || other.type !== self.type || other.object !== self.object) return null;
      if (!self.sequence.length || !other.sequence.length) return null;

      const own = closeOpenEnd(self.sequence, other.sequence);
      const others = closeOpenEnd(other.sequence, self.sequence);

      if (rangesOverlap(visibleRanges(own), visibleRanges(others))) return null;

      return [...own, ...others].sort((a, b) => a.frame - b.frame);
    },
  }))
  .actions((self) => ({
    updateShape(data, frame) {
      const newItem = {
        ...data,
        frame,
        enabled: true,
      };

      const kp = self.closestKeypoint(frame);
      const index = self.sequence.findIndex((item) => item.frame >= frame);

      if (index < 0) {
        self.sequence = [...self.sequence, newItem];
      } else {
        const keypoint = {
          ...(self.sequence[index] ?? {}),
          ...data,
          enabled: kp?.enabled ?? true,
          frame,
        };

        self.sequence = [
          ...self.sequence.slice(0, index),
          keypoint,
          ...self.sequence.slice(index + (self.sequence[index].frame === frame)),
        ];
      }
    },
  }));

const VideoRectangleRegionModel = types.compose(
  "VideoRectangleRegionModel",
  RegionsMixin,
  VideoRegion,
  AreaMixin,
  NormalizationMixin,
  Model,
);

Registry.addRegionType(VideoRectangleRegionModel, "video");

export { VideoRectangleRegionModel };

import { types } from "mobx-state-tree";

import NormalizationMixin from "../mixins/Normalization";
import RegionsMixin from "../mixins/Regions";
import Registry from "../core/Registry";
import { AreaMixin } from "../mixins/AreaMixin";
import { onlyProps, VideoRegion } from "./VideoRegion";
import { interpolateProp } from "../utils/props";

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

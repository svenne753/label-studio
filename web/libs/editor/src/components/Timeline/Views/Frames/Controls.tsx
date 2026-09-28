import { type FC, type MouseEvent, useCallback, useContext, useMemo } from "react";
import {
  IconInterpolationAdd,
  IconInterpolationRemove,
  IconKeypointAdd,
  IconKeypointDelete,
  IconTrackSplit,
} from "@humansignal/icons";
import { TimelineContext } from "../../Context";
import { ControlButton } from "../../Controls";
import type { TimelineExtraControls } from "../../Types";

type Actions = "keypoint_add" | "keypoint_remove" | "lifespan_add" | "lifespan_remove" | "track_split";
type DataType = {
  frame: number;
};

export const Controls: FC<TimelineExtraControls<Actions, DataType>> = ({ onAction }) => {
  const { position, regions, readonly } = useContext(TimelineContext);
  const hasSelectedRegion = regions.some(({ selected, timeline }) => selected && !timeline);
  const closestKeypoint = useMemo(() => {
    const region = regions.find((r) => r.selected && !r.timeline);

    return region?.sequence.filter(({ frame }) => frame <= position).slice(-1)[0];
  }, [regions, position]);

  const canAddKeypoint = closestKeypoint?.frame !== position;
  const canAddLifespan = closestKeypoint?.enabled === false;

  const selectedRegions = regions.filter(({ selected }) => selected);
  const canSplit = !readonly && selectedRegions.length === 1 && !!selectedRegions[0].canSplit;

  const onKeypointToggle = useCallback(
    (e: MouseEvent) => {
      if (canAddKeypoint) {
        onAction?.(e, "keypoint_add", {
          frame: position,
        });
      } else {
        onAction?.(e, "keypoint_remove", {
          frame: closestKeypoint!.frame,
        });
      }
    },
    [onAction, canAddKeypoint, position, closestKeypoint?.frame],
  );

  const onLifespanToggle = useCallback(
    (e: MouseEvent) => {
      if (canAddLifespan) {
        onAction?.(e, "lifespan_add", {
          frame: closestKeypoint!.frame,
        });
      } else {
        onAction?.(e, "lifespan_remove", {
          frame: closestKeypoint!.frame,
        });
      }
    },
    [onAction, canAddLifespan, closestKeypoint?.frame],
  );

  const onTrackSplit = useCallback(
    (e: MouseEvent) => {
      // hotkey triggers the handler even if the button is disabled
      if (!canSplit) return;

      e?.preventDefault?.();
      onAction?.(e, "track_split", {
        frame: position,
      });
    },
    [onAction, canSplit, position],
  );

  const keypointIcon = useMemo(() => {
    if (canAddKeypoint) {
      return <IconKeypointAdd />;
    }

    return <IconKeypointDelete />;
  }, [canAddKeypoint, closestKeypoint]);

  const interpolationIcon = useMemo(() => {
    if (canAddLifespan) {
      return <IconInterpolationAdd />;
    }

    return <IconInterpolationRemove />;
  }, [closestKeypoint, canAddLifespan]);

  return (
    <>
      <ControlButton onClick={onKeypointToggle} disabled={!hasSelectedRegion || readonly} tooltip="Toggle Keypoint">
        {keypointIcon}
      </ControlButton>

      <ControlButton onClick={onLifespanToggle} disabled={!closestKeypoint || readonly} tooltip="Toggle Interpolation">
        {interpolationIcon}
      </ControlButton>

      <ControlButton
        onClick={onTrackSplit}
        disabled={!canSplit}
        tooltip="Split Track at Current Frame"
        hotkey="video:split-track"
      >
        <IconTrackSplit />
      </ControlButton>
    </>
  );
};
